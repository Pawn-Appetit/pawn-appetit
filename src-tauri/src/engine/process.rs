use std::{path::PathBuf, time::{Duration, Instant}};

use log::{debug, error, info, trace, warn};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::oneshot,
    time::timeout,
};

use super::types::{
    AnalysisState, EngineError, EngineLog, EngineOptions, EngineResult, EngineState, GoMode,
    ENGINE_INIT_TIMEOUT, ENGINE_STATE_TRANSITION_TIMEOUT, ENGINE_STOP_TIMEOUT,
    ENGINE_QUICK_STOP_TIMEOUT, STOP_RETRY_DELAY, MAX_STOP_RETRIES,
};

#[cfg(target_os = "windows")]
use super::types::CREATE_NO_WINDOW;

/// Core engine process management
/// 
/// This struct handles the low-level aspects of managing a chess engine process:
/// - Process lifecycle (spawn, initialize, terminate)
/// - UCI communication 
/// - State transitions
/// - Basic command sending
/// 
/// Analysis state is managed separately to maintain clear separation of concerns.
#[derive(Debug)]
pub struct EngineProcess {
    stdin: ChildStdin,
    child: Option<Child>,
    state: EngineState,
    options: EngineOptions,
    go_mode: GoMode,
    logs: Vec<EngineLog>,
    start_time: Instant,
    state_change_notify: Option<oneshot::Sender<EngineState>>,
}

impl EngineProcess {
    /// Create and initialize a new engine process
    pub async fn new(path: PathBuf) -> EngineResult<(Self, Lines<BufReader<ChildStdout>>)> {
        info!("Initializing engine from path: {:?}", path);
        
        let mut child = Self::spawn_engine_process(&path)?;
        let (mut stdin, mut lines) = Self::get_io_handles(&mut child)?;
        
        let mut logs = Vec::new();
        
        // Initialize UCI communication with timeout
        match timeout(ENGINE_INIT_TIMEOUT, Self::initialize_uci(&mut stdin, &mut lines, &mut logs)).await {
            Ok(Ok(())) => {
                info!("Engine initialized successfully: {:?}", path);
            }
            Ok(Err(e)) => {
                error!("Failed to initialize engine {:?}: {}", path, e);
                let _ = child.kill().await;
                return Err(e);
            }
            Err(_) => {
                error!("Engine initialization timeout: {:?}", path);
                let _ = child.kill().await;
                return Err(EngineError::InitTimeout);
            }
        }

        // Spawn stderr handler
        Self::spawn_stderr_handler(child.stderr.take());

        Ok((
            Self {
                stdin,
                child: Some(child),
                state: EngineState::Idle,
                logs,
                options: EngineOptions::default(),
                go_mode: GoMode::Infinite,
                start_time: Instant::now(),
                state_change_notify: None,
            },
            lines,
        ))
    }

    /// Check if engine is currently analyzing
    pub fn is_running(&self) -> bool {
        matches!(self.state, EngineState::Analyzing)
    }

    /// Check if engine is idle and ready for commands
    pub fn is_idle(&self) -> bool {
        matches!(self.state, EngineState::Idle)
    }

    /// Get current engine state
    pub fn state(&self) -> &EngineState {
        &self.state
    }

    /// Get current engine options
    pub fn options(&self) -> &EngineOptions {
        &self.options
    }

    /// Get current go mode
    pub fn go_mode(&self) -> &GoMode {
        &self.go_mode
    }

    /// Get engine logs
    pub fn logs(&self) -> &[EngineLog] {
        &self.logs
    }

    /// Get engine start time
    pub fn start_time(&self) -> Instant {
        self.start_time
    }

    /// Configure engine with new options
    pub async fn configure(&mut self, options: EngineOptions) -> EngineResult<()> {
        debug!("Configuring engine with options for position: {}", options.fen);
        
        // Parse and validate position
        self.validate_position(&options)?;
        
        // Set options that have changed
        self.apply_changed_options(&options).await?;
        
        // Update position if needed
        if options.fen != self.options.fen || options.moves != self.options.moves {
            self.set_position(&options.fen, &options.moves).await?;
        }
        
        self.options = options;
        
        debug!("Engine configuration completed successfully");
        Ok(())
    }

    /// Start analysis with specified mode
    pub async fn start_analysis(&mut self, mode: GoMode) -> EngineResult<()> {
        if !self.is_idle() {
            return Err(EngineError::InvalidState {
                expected: EngineState::Idle,
                actual: self.state.clone(),
            });
        }

        self.go_mode = mode.clone();
        let command = self.format_go_command(&mode);
        
        // Debug log the go command
        super::debug::UciDebugger::log_command(&command, "start_analysis");
        
        // Transition to analyzing state before sending command
        self.transition_state(EngineState::Analyzing)?;
        
        info!("Starting engine analysis: {}", command.trim());
        self.send_command(&command).await?;
        
        self.start_time = Instant::now();
        Ok(())
    }

    /// Stop current analysis
    pub async fn stop(&mut self) -> EngineResult<()> {
        if !self.is_running() {
            debug!("Engine not running, stop request ignored");
            return Ok(());
        }

        info!("Stopping engine analysis");
        
        // Check if process is still alive before attempting to stop
        if !self.is_process_alive() {
            warn!("Engine process appears to be dead, transitioning to idle state");
            self.transition_state(EngineState::Idle)?;
            return Ok(());
        }
        
        // Transition to stopping state
        self.transition_state(EngineState::Stopping)?;
        
        // Use progressive timeout strategy with fallback
        match self.wait_for_stop_with_fallback().await {
            Ok(()) => {
                info!("Engine stopped successfully");
                Ok(())
            }
            Err(e) => {
                warn!("Engine stop encountered issues: {}", e);
                // Always ensure we transition to idle, even on timeout
                if !matches!(self.state, EngineState::Idle) {
                    info!("Force transitioning to idle state after stop timeout");
                    self.transition_state(EngineState::Idle)?;
                }
                // Return Ok instead of propagating timeout errors for graceful degradation
                Ok(())
            }
        }
    }

    /// Check if the engine process is still alive
    fn is_process_alive(&mut self) -> bool {
        if let Some(ref mut child) = self.child {
            match child.try_wait() {
                Ok(Some(exit_status)) => {
                    debug!("Engine process has exited with status: {:?}", exit_status);
                    false
                }
                Ok(None) => {
                    // Process is still running
                    true
                }
                Err(e) => {
                    warn!("Error checking process status: {}", e);
                    // Assume alive if we can't determine
                    true
                }
            }
        } else {
            debug!("No child process handle available");
            false
        }
    }

    /// Progressive timeout strategy for stopping the engine
    async fn wait_for_stop_with_fallback(&mut self) -> EngineResult<()> {
        let start_time = Instant::now();
        
        // First attempt: quick stop with short timeout
        debug!("Attempting quick stop ({}ms timeout)", ENGINE_QUICK_STOP_TIMEOUT.as_millis());
        
        if let Err(e) = self.send_stop_command_with_retry().await {
            warn!("Failed to send stop command: {}", e);
            // If we can't send the command, check if process is dead
            if !self.is_process_alive() {
                debug!("Process is dead, no need to wait for stop");
                self.transition_state(EngineState::Idle)?;
                return Ok(());
            }
        }
        
        // Wait for quick stop response
        match timeout(ENGINE_QUICK_STOP_TIMEOUT, self.wait_for_state(EngineState::Idle, ENGINE_QUICK_STOP_TIMEOUT)).await {
            Ok(Ok(())) => {
                let elapsed = start_time.elapsed();
                info!("Engine stopped quickly in {:?}", elapsed);
                return Ok(());
            }
            Ok(Err(e)) => {
                debug!("Quick stop state wait failed: {}", e);
            }
            Err(_) => {
                debug!("Quick stop timeout, trying fallback approach");
            }
        }
        
        // Second attempt: send stop command again for stubborn engines
        debug!("Quick stop failed, retrying with fallback approach");
        
        if self.is_process_alive() {
            if let Err(e) = self.send_stop_command_with_retry().await {
                warn!("Fallback stop command also failed: {}", e);
            }
        } else {
            debug!("Process died during quick stop attempt");
            self.transition_state(EngineState::Idle)?;
            return Ok(());
        }
        
        // Wait for remaining timeout duration
        let remaining_timeout = ENGINE_STOP_TIMEOUT.saturating_sub(start_time.elapsed());
        debug!("Waiting for stop with remaining timeout: {:?}", remaining_timeout);
        
        match timeout(remaining_timeout, self.wait_for_state(EngineState::Idle, remaining_timeout)).await {
            Ok(Ok(())) => {
                let elapsed = start_time.elapsed();
                info!("Engine stopped after fallback in {:?}", elapsed);
                Ok(())
            }
            Ok(Err(e)) => {
                warn!("Engine stop state wait failed after fallback: {}", e);
                Err(EngineError::StopTimeout)
            }
            Err(_) => {
                let elapsed = start_time.elapsed();
                warn!("Engine stop timeout after {:?} (max: {:?})", elapsed, ENGINE_STOP_TIMEOUT);
                Err(EngineError::StopTimeout)
            }
        }
    }

    /// Send stop command with retry logic for better reliability
    async fn send_stop_command_with_retry(&mut self) -> EngineResult<()> {
        let mut last_error = None;
        
        for attempt in 1..=MAX_STOP_RETRIES {
            debug!("Sending stop command (attempt {}/{})", attempt, MAX_STOP_RETRIES);
            
            match self.send_command("stop\n").await {
                Ok(()) => {
                    debug!("Stop command sent successfully on attempt {}", attempt);
                    return Ok(());
                }
                Err(EngineError::BrokenPipe) => {
                    warn!("Broken pipe while sending stop command (attempt {}), engine may have died", attempt);
                    // For broken pipe, don't retry - the process is likely dead
                    return Err(EngineError::BrokenPipe);
                }
                Err(e) => {
                    warn!("Failed to send stop command (attempt {}): {}", attempt, e);
                    last_error = Some(e);
                    
                    // Check if process is still alive before retrying
                    if !self.is_process_alive() {
                        warn!("Process died during stop command retry");
                        return Err(EngineError::BrokenPipe);
                    }
                    
                    // Small delay before retry (except on last attempt)
                    if attempt < MAX_STOP_RETRIES {
                        tokio::time::sleep(STOP_RETRY_DELAY).await;
                    }
                }
            }
        }
        
        // All retries failed
        error!("All {} stop command attempts failed", MAX_STOP_RETRIES);
        Err(last_error.unwrap_or(EngineError::Timeout))
    }

    /// Terminate the engine process
    pub async fn kill(&mut self) -> EngineResult<()> {
        info!("Terminating engine process");
        
        // Transition to terminated state first
        if let Err(e) = self.transition_state(EngineState::Terminated) {
            warn!("Failed to transition to terminated state: {}", e);
            // Continue with kill anyway
        }
        
        // Try to send quit command gracefully first
        match self.send_command("quit\n").await {
            Ok(()) => {
                debug!("Quit command sent successfully");
                // Give engine a moment to shut down gracefully
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err(EngineError::BrokenPipe) => {
                debug!("Broken pipe while sending quit command, engine already dead");
            }
            Err(e) => {
                warn!("Failed to send quit command: {}, will force kill", e);
            }
        }
        
        // Force kill the child process if it's still running
        if let Some(mut child) = self.child.take() {
            match child.kill().await {
                Ok(()) => debug!("Engine process killed successfully"),
                Err(e) => warn!("Failed to kill engine process: {}", e),
            }
            
            // Wait for the process to actually die
            if let Err(e) = child.wait().await {
                warn!("Error waiting for engine process to die: {}", e);
            }
        }
        
        Ok(())
    }

    /// Add log entry
    pub fn add_log(&mut self, log: EngineLog) {
        self.logs.push(log);
    }

    /// Transition to bestmove received (analysis complete)
    pub fn handle_bestmove(&mut self) -> EngineResult<()> {
        debug!("Received bestmove, analysis complete");
        self.transition_state(EngineState::Idle)
    }

    // =============================================================================
    // Private Implementation
    // =============================================================================

    fn spawn_engine_process(path: &PathBuf) -> EngineResult<Child> {
        debug!("Spawning engine process: {:?}", path);
        
        let mut command = Command::new(path);
        command.current_dir(path.parent().unwrap_or_else(|| std::path::Path::new(".")));
        command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .env("TERM", "dumb"); // Prevent terminal feature usage

        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);

        let child = command.spawn()
            .map_err(|e| {
                error!("Failed to spawn engine process {:?}: {}", path, e);
                EngineError::Io(e)
            })?;

        debug!("Engine process spawned successfully");
        Ok(child)
    }

    fn get_io_handles(child: &mut Child) -> EngineResult<(ChildStdin, Lines<BufReader<ChildStdout>>)> {
        let stdin = child.stdin.take().ok_or_else(|| {
            error!("Failed to get stdin handle from engine process");
            EngineError::NoStdin
        })?;
        
        let stdout = child.stdout.take().ok_or_else(|| {
            error!("Failed to get stdout handle from engine process");
            EngineError::NoStdout
        })?;
        
        // Use a smaller buffer for more responsive reading
        let reader = BufReader::with_capacity(1024, stdout);
        let lines = reader.lines();
        Ok((stdin, lines))
    }

    async fn initialize_uci(
        stdin: &mut ChildStdin,
        lines: &mut Lines<BufReader<ChildStdout>>,
        logs: &mut Vec<EngineLog>
    ) -> EngineResult<()> {
        debug!("Starting UCI initialization");
        
        // Send UCI command
        Self::send_command_with_log(stdin, "uci\n", logs).await?;
        
        // Wait for uciok
        while let Some(line) = lines.next_line().await? {
            trace!("Engine response: {}", line);
            logs.push(EngineLog::Engine(line.clone()));
            
            if line == "uciok" {
                debug!("Received uciok, sending isready");
                Self::send_command_with_log(stdin, "isready\n", logs).await?;
                
                // Wait for readyok
                while let Some(ready_line) = lines.next_line().await? {
                    trace!("Engine ready response: {}", ready_line);
                    logs.push(EngineLog::Engine(ready_line.clone()));
                    
                    if ready_line == "readyok" {
                        debug!("Engine is ready");
                        return Ok(());
                    }
                }
                break;
            }
        }
        
        Err(EngineError::Timeout)
    }

    fn spawn_stderr_handler(stderr: Option<tokio::process::ChildStderr>) {
        if let Some(stderr) = stderr {
            tokio::spawn(async move {
                let mut stderr_lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = stderr_lines.next_line().await {
                    warn!("Engine stderr: {}", line);
                }
            });
        }
    }

    async fn send_command(&mut self, command: &str) -> EngineResult<()> {
        Self::send_command_with_log(&mut self.stdin, command, &mut self.logs).await
    }

    async fn send_command_with_log(
        stdin: &mut ChildStdin,
        command: &str,
        logs: &mut Vec<EngineLog>
    ) -> EngineResult<()> {
        debug!("Sending UCI command: {}", command.trim());
        
        let write_result = stdin.write_all(command.as_bytes()).await;
        if let Err(e) = write_result {
            error!("Failed to send command '{}': {}", command.trim(), e);
            
            // Check for broken pipe specifically
            if let Some(os_error) = e.raw_os_error() {
                if os_error == 32 { // EPIPE on Unix systems
                    warn!("Broken pipe while sending command: {}", command.trim());
                    return Err(EngineError::BrokenPipe);
                }
            }
            
            // Check error kind for connection issues
            match e.kind() {
                std::io::ErrorKind::BrokenPipe => {
                    warn!("Broken pipe detected while sending command: {}", command.trim());
                    return Err(EngineError::BrokenPipe);
                }
                std::io::ErrorKind::ConnectionAborted | 
                std::io::ErrorKind::ConnectionReset => {
                    warn!("Connection issue while sending command '{}': {:?}", command.trim(), e.kind());
                    return Err(EngineError::BrokenPipe);
                }
                _ => {
                    return Err(EngineError::Io(e));
                }
            }
        }
        
        // Flush stdin immediately to ensure command is sent to engine without delay
        let flush_result = stdin.flush().await;
        if let Err(e) = flush_result {
            error!("Failed to flush command '{}': {}", command.trim(), e);
            
            // Check for broken pipe specifically
            if let Some(os_error) = e.raw_os_error() {
                if os_error == 32 { // EPIPE on Unix systems
                    warn!("Broken pipe while flushing command: {}", command.trim());
                    return Err(EngineError::BrokenPipe);
                }
            }
            
            // Check error kind for connection issues
            match e.kind() {
                std::io::ErrorKind::BrokenPipe => {
                    warn!("Broken pipe detected while flushing command: {}", command.trim());
                    return Err(EngineError::BrokenPipe);
                }
                std::io::ErrorKind::ConnectionAborted | 
                std::io::ErrorKind::ConnectionReset => {
                    warn!("Connection issue while flushing command '{}': {:?}", command.trim(), e.kind());
                    return Err(EngineError::BrokenPipe);
                }
                _ => {
                    return Err(EngineError::Io(e));
                }
            }
        }
        
        info!("UCI command sent successfully: {}", command.trim());
        logs.push(EngineLog::Gui(command.to_string()));
        Ok(())
    }

    async fn set_option<T>(&mut self, name: &str, value: T) -> EngineResult<()>
    where
        T: std::fmt::Display,
    {
        let command = format!("setoption name {} value {}\n", name, value);
        debug!("Setting engine option: {} = {}", name, value);
        self.send_command(&command).await
    }

    fn validate_position(&self, options: &EngineOptions) -> EngineResult<()> {
        use shakmaty::{fen::Fen, CastlingMode, Chess, Position};
        use shakmaty::uci::UciMove;

        // Parse and validate position
        let fen: Fen = options.fen.parse()?;
        
        let mut pos: Chess = match fen.into_position(CastlingMode::Chess960) {
            Ok(p) => p,
            Err(e) => {
                warn!("Position error, attempting to ignore extra material: {}", e);
                e.ignore_too_much_material()?
            }
        };
        
        // Apply moves and validate
        for (i, move_str) in options.moves.iter().enumerate() {
            let uci = UciMove::from_ascii(move_str.as_bytes())
                .map_err(|e| {
                    error!("Invalid UCI move at index {}: {}", i, move_str);
                    e
                })?;
            
            let mv = uci.to_move(&pos)
                .map_err(|e| {
                    error!("Illegal move at index {}: {} in position {}", i, move_str, pos.board());
                    e
                })?;
            
            pos.play_unchecked(&mv);
        }

        Ok(())
    }

    async fn apply_changed_options(&mut self, options: &EngineOptions) -> EngineResult<()> {
        // Create a mutable copy of options for processing
        let mut processed_options = options.extra_options.clone();
        
        // Ensure MultiPV option is set if requested and not already present
        self.ensure_multipv_option(&mut processed_options, &options.fen, &options.moves)?;
        
        // Set options that have changed
        let changed_options: Vec<_> = processed_options.iter()
            .filter(|new_opt| {
                self.options.extra_options.iter()
                    .find(|current_opt| current_opt.name == new_opt.name)
                    .map_or(true, |current_opt| current_opt.value != new_opt.value)
            })
            .collect();

        for option in changed_options {
            debug!("Setting UCI option: {} = {}", option.name, option.value);
            
            // Debug log the UCI command
            super::debug::UciDebugger::log_command(
                &format!("setoption name {} value {}", option.name, option.value),
                "set_option"
            );
            
            self.set_option(&option.name, &option.value).await?;
        }

        Ok(())
    }

    async fn set_position(&mut self, fen: &str, moves: &[String]) -> EngineResult<()> {
        let command = if moves.is_empty() {
            format!("position fen {fen}\n")
        } else {
            format!("position fen {fen} moves {}\n", moves.join(" "))
        };

        debug!("Setting position: FEN={}, moves={}", fen, moves.len());
        self.send_command(&command).await?;
        Ok(())
    }

    fn format_go_command(&self, mode: &GoMode) -> String {
        match mode {
            GoMode::Depth(depth) => format!("go depth {depth}\n"),
            GoMode::Time(time) => format!("go movetime {time}\n"),
            GoMode::Nodes(nodes) => format!("go nodes {nodes}\n"),
            GoMode::PlayersTime(super::types::PlayersTime { white, black, winc, binc }) => {
                format!("go wtime {white} btime {black} winc {winc} binc {binc} movetime 1000\n")
            }
            GoMode::Infinite => "go infinite\n".to_string(),
        }
    }

    /// Ensure MultiPV option is properly set for analysis
    fn ensure_multipv_option(
        &self, 
        options: &mut Vec<super::types::EngineOption>, 
        fen: &str, 
        moves: &[String]
    ) -> EngineResult<()> {
        // Find if MultiPV is already in options
        let multipv_option = options.iter().find(|opt| opt.name == "MultiPV");
        
        if let Some(multipv_opt) = multipv_option {
            // Parse the requested MultiPV value
            let requested_multipv: u16 = multipv_opt.value.parse().unwrap_or(1);
            if requested_multipv <= 1 {
                debug!("MultiPV requested is 1 or invalid, skipping validation");
                return Ok(()); // No MultiPV needed
            }
            
            // Calculate effective MultiPV based on legal moves
            let effective_multipv = super::communication::calculate_effective_multipv(
                requested_multipv, fen, moves
            )?;
            
            info!("MultiPV analysis: requested={}, effective={}", requested_multipv, effective_multipv);
            
            // Update the option with effective value if different
            if effective_multipv != requested_multipv {
                if let Some(opt) = options.iter_mut().find(|opt| opt.name == "MultiPV") {
                    opt.value = effective_multipv.to_string();
                    info!("Updated MultiPV option from {} to effective value: {}", 
                          requested_multipv, effective_multipv);
                }
            }
        } else {
            debug!("No MultiPV option found in engine options");
        }
        
        Ok(())
    }

    async fn wait_for_state(&mut self, expected_state: EngineState, timeout_duration: std::time::Duration) -> EngineResult<()> {
        if self.state == expected_state {
            return Ok(());
        }

        let start = Instant::now();
        while start.elapsed() < timeout_duration {
            if self.state == expected_state {
                return Ok(());
            }
            
            // Small delay to prevent busy waiting
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }

        Err(EngineError::InvalidState {
            expected: expected_state,
            actual: self.state.clone(),
        })
    }

    fn transition_state(&mut self, new_state: EngineState) -> EngineResult<()> {
        let valid_transition = match (&self.state, &new_state) {
            (EngineState::Idle, EngineState::Analyzing) => true,
            (EngineState::Analyzing, EngineState::Stopping) => true,
            (EngineState::Stopping, EngineState::Idle) => true,
            (EngineState::Analyzing, EngineState::Idle) => true, // Direct stop
            (_, EngineState::Terminated) => true,
            _ => false,
        };

        if !valid_transition {
            return Err(EngineError::InvalidTransition {
                from: self.state.clone(),
                to: new_state,
            });
        }

        debug!("Engine state transition: {:?} -> {:?}", self.state, new_state);
        self.state = new_state.clone();
        
        // Notify waiting tasks of state change
        if let Some(tx) = self.state_change_notify.take() {
            let _ = tx.send(new_state);
        }

        Ok(())
    }
}
