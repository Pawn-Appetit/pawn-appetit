use std::{path::PathBuf, sync::Arc, time::Duration};

use dashmap::DashMap;
use log::{debug, error, info, warn};
use tauri::AppHandle;
use tauri_specta::Event;
use tokio::{
    io::{AsyncBufReadExt, BufReader, Lines},
    process::ChildStdout,
    sync::Mutex,
    time::timeout,
};
use vampirc_uci::UciMessage;

use super::{
    communication::{AnalysisHandler, UciCommunicator, calculate_progress},
    events::{EventManager, create_best_moves_payload, EmissionStrategy, EventPriority, PriorityEventManager},
    process::EngineProcess,
    types::{
        AnalysisOptions, BestMoves, EngineError, EngineLog, EngineOptions, EngineResult, 
        EngineState, GoMode, MoveAnalysis,
    },
};

/// High-level engine management
/// 
/// This manager provides the main interface for:
/// - Managing multiple engine instances
/// - Coordinating analysis requests
/// - Resource management and cleanup
/// - Event emission and communication loops
pub struct EngineManager {
    /// Active engine processes indexed by (tab, engine_path)
    processes: DashMap<(String, String), Arc<Mutex<EngineProcess>>>,
    
    /// Analysis handlers indexed by same key
    analysis_handlers: DashMap<(String, String), Arc<Mutex<AnalysisHandler>>>,
    
    /// Communication loop handles for cleanup
    communication_handles: DashMap<(String, String), tokio::task::JoinHandle<EngineResult<()>>>,
}

impl EngineManager {
    /// Create a new engine manager
    pub fn new() -> Self {
        Self {
            processes: DashMap::new(),
            analysis_handlers: DashMap::new(),
            communication_handles: DashMap::new(),
        }
    }

    /// Start analysis with the specified engine and parameters
    pub async fn start_analysis(
        &self,
        id: String,
        engine_path: String,
        tab: String,
        go_mode: GoMode,
        options: EngineOptions,
        app: AppHandle,
    ) -> EngineResult<Option<(f32, Vec<BestMoves>)>> {
        let path = PathBuf::from(&engine_path);
        let key = (tab.clone(), engine_path.clone());

        info!("Starting analysis: id={}, engine={}, tab={}", id, engine_path, tab);
        debug!("Analysis options: FEN={}, moves={}", options.fen, options.moves.len());

        // First check if we need to clean up any existing engine completely
        if self.processes.contains_key(&key) {
            info!("Engine exists at key {:?}, performing clean shutdown", key);
            
            // Clean shutdown of existing engine and all resources
            if let Err(e) = self.kill_engine(engine_path.clone(), tab.clone()).await {
                warn!("Failed to clean up existing engine: {}", e);
            }
            
            // Wait a bit for cleanup to complete
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        // Create new engine process with retry logic
        info!("Creating new engine process");
        let mut retry_count = 0;
        let max_retries = 3;
        
        let (mut process, reader) = loop {
            match EngineProcess::new(path.clone()).await {
                Ok(result) => break result,
                Err(e) => {
                    retry_count += 1;
                    if retry_count >= max_retries {
                        error!("Failed to create engine after {} retries: {}", max_retries, e);
                        return Err(e);
                    }
                    warn!("Engine creation failed (attempt {}), retrying: {}", retry_count, e);
                    tokio::time::sleep(Duration::from_millis(500 * retry_count)).await;
                }
            }
        };

        // Configure engine with retry logic
        for attempt in 1..=3 {
            match process.configure(options.clone()).await {
                Ok(_) => {
                    debug!("Engine configured successfully on attempt {}", attempt);
                    break;
                }
                Err(e) => {
                    if attempt == 3 {
                        error!("Failed to configure engine after 3 attempts: {}", e);
                        return Err(e);
                    }
                    warn!("Engine configuration failed (attempt {}), retrying: {}", attempt, e);
                    tokio::time::sleep(Duration::from_millis(200 * attempt as u64)).await;
                }
            }
        }

        // Start analysis with retry logic
        for attempt in 1..=3 {
            match process.start_analysis(go_mode.clone()).await {
                Ok(_) => {
                    debug!("Engine analysis started successfully on attempt {}", attempt);
                    break;
                }
                Err(e) => {
                    if attempt == 3 {
                        error!("Failed to start engine analysis after 3 attempts: {}", e);
                        return Err(e);
                    }
                    warn!("Engine analysis start failed (attempt {}), retrying: {}", attempt, e);
                    tokio::time::sleep(Duration::from_millis(200 * attempt as u64)).await;
                }
            }
        }

        // Create analysis handler and set effective MultiPV
        let mut analysis_handler = AnalysisHandler::new();
        
        // Calculate and set effective MultiPV based on engine options
        let effective_multipv = Self::calculate_effective_multipv(&options)?;
        analysis_handler.set_multipv(effective_multipv);
        debug!("Set analysis handler MultiPV to: {}", effective_multipv);
        
        // Debug MultiPV configuration
        super::debug::UciDebugger::log_multipv_config(&options, effective_multipv);
        
        let analysis_handler = Arc::new(Mutex::new(analysis_handler));
        
        // Store process and handler
        let process = Arc::new(Mutex::new(process));
        self.processes.insert(key.clone(), process.clone());
        self.analysis_handlers.insert(key.clone(), analysis_handler.clone());

        // Start communication loop
        let key_clone = key.clone(); // Clone key for the async move  
        let handle = tokio::spawn(Self::run_communication_loop(
            process,
            analysis_handler,
            reader,
            key_clone,
            id,
            tab.clone(),
            app,
        ));
        
        self.communication_handles.insert(key, handle);

        Ok(None)
    }

    /// Stop analysis for specific engine
    pub async fn stop_engine(&self, engine: String, tab: String) -> EngineResult<()> {
        let key = (tab.clone(), engine.clone());
        debug!("Stopping engine: tab={}, engine={}", tab, engine);
        
        if let Some(process_guard) = self.processes.get(&key) {
            let mut process = process_guard.lock().await;
            if let Err(e) = process.stop().await {
                warn!("Failed to stop engine {:?}: {}", key, e);
                return Err(e);
            }
        } else {
            debug!("Engine not found: {:?}", key);
        }
        
        Ok(())
    }

    /// Kill and remove specific engine
    pub async fn kill_engine(&self, engine: String, tab: String) -> EngineResult<()> {
        let key = (tab.clone(), engine.clone());
        info!("Killing engine: tab={}, engine={}", tab, engine);
        
        // Cancel communication loop first to prevent new messages
        if let Some((_, handle)) = self.communication_handles.remove(&key) {
            debug!("Aborting communication loop for: {:?}", key);
            handle.abort();
            
            // Give the loop time to abort
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        
        // Then stop the engine process
        if let Some(process_guard) = self.processes.get(&key) {
            let mut process = process_guard.lock().await;
            
            // First try graceful stop
            if let Err(e) = process.stop().await {
                warn!("Graceful stop failed for engine {:?}: {}, trying kill", key, e);
            }
            
            // Then force kill
            if let Err(e) = process.kill().await {
                warn!("Failed to kill engine {:?}: {}", key, e);
            }
        }
        
        // Clean up all resources
        self.cleanup_engine(&key).await;
        Ok(())
    }

    /// Kill all engines for a specific tab
    pub async fn kill_engines_for_tab(&self, tab: String) -> EngineResult<()> {
        info!("Killing all engines for tab: {}", tab);
        
        let keys: Vec<_> = self.processes
            .iter()
            .filter(|entry| entry.key().0 == tab)
            .map(|entry| entry.key().clone())
            .collect();

        debug!("Found {} engines to kill for tab: {}", keys.len(), tab);
        
        for key in keys {
            if let Some(process_guard) = self.processes.get(&key) {
                let mut process = process_guard.lock().await;
                if let Err(e) = process.kill().await {
                    warn!("Failed to kill engine {:?}: {}", key, e);
                }
            }
            self.cleanup_engine(&key).await;
        }
        
        info!("Completed killing engines for tab: {}", tab);
        Ok(())
    }

    /// Get engine logs
    pub async fn get_engine_logs(&self, engine: String, tab: String) -> Vec<EngineLog> {
        let key = (tab, engine);
        if let Some(process_guard) = self.processes.get(&key) {
            let process = process_guard.lock().await;
            process.logs().to_vec()
        } else {
            Vec::new()
        }
    }

    /// Clean up all resources
    async fn cleanup_engine(&self, key: &(String, String)) {
        debug!("Cleaning up engine resources for: {:?}", key);
        
        // Cancel communication loop if still running
        if let Some((_, handle)) = self.communication_handles.remove(key) {
            if !handle.is_finished() {
                debug!("Aborting still-running communication loop for: {:?}", key);
                handle.abort();
                
                // Wait for abort to complete
                let _ = tokio::time::timeout(Duration::from_millis(500), handle).await;
            }
        }
        
        // Remove process and handler with logging
        if self.processes.remove(key).is_some() {
            debug!("Removed process for: {:?}", key);
        }
        if self.analysis_handlers.remove(key).is_some() {
            debug!("Removed analysis handler for: {:?}", key);
        }
        
        debug!("Engine cleanup completed for: {:?}", key);
    }

    /// Calculate effective MultiPV from engine options
    fn calculate_effective_multipv(options: &EngineOptions) -> EngineResult<u16> {
        // Find MultiPV option value
        let requested_multipv = options.extra_options.iter()
            .find(|opt| opt.name == "MultiPV")
            .and_then(|opt| opt.value.parse::<u16>().ok())
            .unwrap_or(1);

        if requested_multipv <= 1 {
            return Ok(1);
        }

        // Calculate effective MultiPV based on position
        super::communication::calculate_effective_multipv(
            requested_multipv, 
            &options.fen, 
            &options.moves
        )
    }

    /// Run communication loop (static version for spawn)
    async fn run_communication_loop(
        process: Arc<Mutex<EngineProcess>>,
        analysis_handler: Arc<Mutex<AnalysisHandler>>,
        reader: Lines<BufReader<ChildStdout>>,
        key: (String, String),
        id: String,
        tab: String,
        app: AppHandle,
    ) -> EngineResult<()> {
        info!("Starting engine communication loop for: {:?}", key);
        
        let mut communicator = UciCommunicator::new(reader);
        let mut event_manager = PriorityEventManager::new(EmissionStrategy::RateLimited);
        let mut first_result_sent = false;
        let mut consecutive_errors = 0;
        const MAX_CONSECUTIVE_ERRORS: u32 = 5;

        let result: Result<(), EngineError> = async {
            loop {
                // Check if we should abort the loop
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                    error!("Too many consecutive errors ({}), aborting communication loop", consecutive_errors);
                    return Err(EngineError::TooManyFailures);
                }

                // Try to flush any pending events
                if let Err(e) = event_manager.flush_all(&app).await {
                    debug!("Could not flush pending events: {}", e);
                }

                // Read from engine with timeout and error handling
                match communicator.read_line(Duration::from_millis(100)).await {
                    Ok(Some(line)) => {
                        consecutive_errors = 0; // Reset error counter on successful read
                        debug!("Raw engine output: {}", line);
                        
                        // Add to logs
                        {
                            let mut proc = process.lock().await;
                            proc.add_log(super::types::EngineLog::Engine(line.clone()));
                        }
                        
                        // Parse and handle message
                        let message = communicator.parse_message(&line);
                        
                        // Debug logging for UCI messages
                        super::debug::UciDebugger::log_response(&line, &message);
                        
                        match message {
                            UciMessage::Info(attrs) => {
                                if let Err(e) = Self::handle_info_message(
                                    &process,
                                    &analysis_handler,
                                    &mut event_manager,
                                    &mut first_result_sent,
                                    attrs,
                                    &id,
                                    &tab,
                                    &app
                                ).await {
                                    warn!("Failed to handle info message: {}", e);
                                    consecutive_errors += 1;
                                }
                            }
                            UciMessage::BestMove { .. } => {
                                debug!("Received bestmove, analysis complete");
                                
                                // Update process state
                                {
                                    let mut proc = process.lock().await;
                                    if let Err(e) = proc.handle_bestmove() {
                                        warn!("Failed to handle bestmove state transition: {}", e);
                                    }
                                }
                                
                                // Emit final result
                                if let Err(e) = Self::emit_final_result(&process, &analysis_handler, &id, &tab, &app).await {
                                    warn!("Failed to emit final result: {}", e);
                                }
                                
                                info!("Analysis complete, engine now idle");
                                break; // Exit the loop cleanly
                            }
                            _ => {
                                debug!("Unhandled UCI message: {}", line);
                            }
                        }
                    }
                    Ok(None) => {
                        // Timeout occurred, continue loop to check for pending events
                        consecutive_errors = 0; // Timeout is not an error
                        continue;
                    }
                    Err(e) => {
                        consecutive_errors += 1;
                        match e {
                            EngineError::BrokenPipe => {
                                warn!("Broken pipe detected for engine {:?} (error {} of {})", 
                                      key, consecutive_errors, MAX_CONSECUTIVE_ERRORS);
                                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                                    error!("Engine communication lost, terminating loop");
                                    return Err(e);
                                }
                                // Brief pause before retry
                                tokio::time::sleep(Duration::from_millis(100)).await;
                            }
                            EngineError::Timeout => {
                                debug!("Read timeout for engine {:?}", key);
                                // Don't count timeouts as consecutive errors
                                consecutive_errors = consecutive_errors.saturating_sub(1);
                            }
                            _ => {
                                warn!("Communication error for engine {:?}: {} (error {} of {})", 
                                      key, e, consecutive_errors, MAX_CONSECUTIVE_ERRORS);
                                tokio::time::sleep(Duration::from_millis(50 * consecutive_errors as u64)).await;
                            }
                        }
                    }
                }
            }
            Ok(())
        }.await;

        if let Err(ref e) = result {
            error!("Engine communication loop error for {:?}: {}", key, e);
        }

        info!("Engine communication loop finished for: {:?}", key);
        result
    }

    /// Handle UCI info message
    async fn handle_info_message(
        process: &Arc<Mutex<EngineProcess>>,
        analysis_handler: &Arc<Mutex<AnalysisHandler>>,
        event_manager: &mut PriorityEventManager,
        first_result_sent: &mut bool,
        attrs: Vec<vampirc_uci::UciInfoAttribute>,
        id: &str,
        tab: &str,
        app: &AppHandle,
    ) -> EngineResult<()> {
        let (fen, moves, go_mode, start_time) = {
            let proc = process.lock().await;
            (
                proc.options().fen.clone(),
                proc.options().moves.clone(),
                proc.go_mode().clone(),
                proc.start_time(),
            )
        };

        let mut handler = analysis_handler.lock().await;
        
        if let Some(complete_moves) = handler.process_info_message(attrs, &fen, &moves)? {
            let cur_depth = complete_moves.first().map_or(0, |m| m.depth);
            let cur_nodes = complete_moves.first().map_or(0, |m| m.nodes);
            
            let progress = calculate_progress(&go_mode, cur_depth, cur_nodes, start_time.elapsed());
            handler.set_progress(progress as f32);
            
            let payload = create_best_moves_payload(
                complete_moves,
                id.to_string(),
                tab.to_string(),
                fen,
                moves,
                progress,
            );
            
            let should_emit_immediately = !*first_result_sent 
                || cur_depth > handler.state().last_depth
                || handler.should_emit_based_on_timing();
            
            let priority = if !*first_result_sent {
                EventPriority::High
            } else if cur_depth > handler.state().last_depth {
                EventPriority::Normal
            } else {
                EventPriority::Low
            };
            
            if event_manager.emit_with_priority(payload, priority, app).await? {
                *first_result_sent = true;
                handler.mark_event_sent();
                debug!("Analysis result emitted: depth={}, progress={:.2}%", cur_depth, progress);
            }
        }
        
        Ok(())
    }

    /// Emit final analysis result
    async fn emit_final_result(
        process: &Arc<Mutex<EngineProcess>>,
        analysis_handler: &Arc<Mutex<AnalysisHandler>>,
        id: &str,
        tab: &str,
        app: &AppHandle,
    ) -> EngineResult<()> {
        let handler = analysis_handler.lock().await;
        let best_moves = handler.last_best_moves().to_vec();
        drop(handler); // Release lock early
        
        // Get the actual FEN and moves from the process
        let (fen, moves) = {
            let proc = process.lock().await;
            (
                proc.options().fen.clone(),
                proc.options().moves.clone(),
            )
        };
        
        // Debug analysis of final results
        let analysis = super::debug::UciDebugger::analyze_multipv_responses(&best_moves);
        super::debug::UciDebugger::log_multipv_analysis(&analysis);
        
        if analysis.total_lines == 0 {
            warn!("No analysis results to emit for engine {} on tab {}", id, tab);
            return Ok(());
        }
        
        debug!("Final result context: FEN={}, moves={:?}", fen, moves);
        
        let payload = create_best_moves_payload(
            best_moves,
            id.to_string(),
            tab.to_string(),
            fen,
            moves,
            100.0,
        );

        info!("Emitting final bestmove payload for engine {} on tab {} with {} variations", 
              id, tab, analysis.total_lines);

        // Try to serialize the payload to check for issues
        match serde_json::to_string(&payload) {
            Ok(json_str) => {
                println!("🔍 Payload JSON (first 200 chars): {}", 
                         if json_str.len() > 200 { &json_str[..200] } else { &json_str });
            }
            Err(e) => {
                error!("🚨 SERIALIZATION FAILED: {:?}", e);
                return Err(EngineError::EventEmissionFailed);
            }
        }

        match payload.emit(app) {
            Ok(_) => {
                debug!("Successfully emitted final bestmove payload");
                Ok(())
            }
            Err(e) => {
                error!("Failed to emit final bestmove payload: {:?}", e);
                Err(EngineError::EventEmissionFailed)
            }
        }
    }
}

impl Default for EngineManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Extended engine manager with additional capabilities
pub struct ExtendedEngineManager {
    base_manager: EngineManager,
    analysis_cache: DashMap<String, MoveAnalysis>,
}

impl ExtendedEngineManager {
    /// Create new extended manager
    pub fn new() -> Self {
        Self {
            base_manager: EngineManager::new(),
            analysis_cache: DashMap::new(),
        }
    }

    /// Analyze complete game
    pub async fn analyze_game(
        &self,
        id: String,
        engine: String,
        go_mode: GoMode,
        options: AnalysisOptions,
        uci_options: Vec<super::types::EngineOption>,
        app: AppHandle,
    ) -> EngineResult<Vec<MoveAnalysis>> {
        info!("Starting game analysis: id={}, engine={}", id, engine);
        debug!("Analysis options: FEN={}, moves={}, novelties={}", 
               options.fen, options.moves.len(), options.annotate_novelties);
        
        // This would be a more complex implementation
        // For now, return empty analysis
        Ok(Vec::new())
    }

    /// Delegate to base manager
    pub async fn start_analysis(
        &self,
        id: String,
        engine_path: String,
        tab: String,
        go_mode: GoMode,
        options: EngineOptions,
        app: AppHandle,
    ) -> EngineResult<Option<(f32, Vec<BestMoves>)>> {
        self.base_manager.start_analysis(id, engine_path, tab, go_mode, options, app).await
    }

    /// Delegate to base manager
    pub async fn stop_engine(&self, engine: String, tab: String) -> EngineResult<()> {
        self.base_manager.stop_engine(engine, tab).await
    }

    /// Delegate to base manager
    pub async fn kill_engine(&self, engine: String, tab: String) -> EngineResult<()> {
        self.base_manager.kill_engine(engine, tab).await
    }

    /// Delegate to base manager
    pub async fn kill_engines_for_tab(&self, tab: String) -> EngineResult<()> {
        self.base_manager.kill_engines_for_tab(tab).await
    }

    /// Delegate to base manager
    pub async fn get_engine_logs(&self, engine: String, tab: String) -> Vec<EngineLog> {
        self.base_manager.get_engine_logs(engine, tab).await
    }
}

impl Default for ExtendedEngineManager {
    fn default() -> Self {
        Self::new()
    }
}
