use std::{path::PathBuf, time::Duration};

use log::{debug, error, info, warn};
use sysinfo::{System, SystemExt};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{Child, ChildStdin, ChildStdout, Command},
    time::timeout,
};
use vampirc_uci::{parse_one, UciMessage, UciOptionConfig};

use super::types::{EngineConfig, EngineError, EngineResult, ENGINE_INIT_TIMEOUT};

#[cfg(target_os = "windows")]
use super::types::CREATE_NO_WINDOW;

/// Engine configuration discovery and management
/// 
/// This configurator handles:
/// - Engine process spawning for configuration
/// - UCI option discovery
/// - Engine capability detection
/// - Configuration validation
pub struct EngineConfigurator;

impl EngineConfigurator {
    /// Get complete engine configuration including UCI options
    pub async fn get_engine_config(path: PathBuf) -> EngineResult<EngineConfig> {
        info!("Getting engine configuration from: {:?}", path);
        
        let mut child = Self::spawn_engine_process(&path)?;
        let (mut stdin, mut stdout) = Self::get_engine_io_handles(&mut child)?;

        let mut config = EngineConfig::default();
        
        // Send UCI command with timeout
        match timeout(ENGINE_INIT_TIMEOUT, Self::get_uci_config(&mut stdin, &mut stdout, &mut config)).await {
            Ok(Ok(())) => {
                info!("Successfully retrieved engine config: name={}, options={}", 
                      config.name, config.options.len());
            }
            Ok(Err(e)) => {
                warn!("Failed to get engine config: {}", e);
            }
            Err(_) => {
                warn!("Timeout getting engine config from: {:?}", path);
            }
        }
        
        // Ensure child process is terminated
        let _ = child.kill().await;
        
        // Fallback name if not provided
        if config.name.is_empty() {
            config.name = path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown Engine")
                .to_string();
        }
        
        // Log MultiPV capability for debugging
        if let Some(multipv_opt) = config.options.iter().find(|opt| {
            match opt {
                UciOptionConfig::Spin { name, .. } => name == "MultiPV",
                _ => false,
            }
        }) {
            info!("Engine supports MultiPV: {:?}", multipv_opt);
        } else {
            warn!("Engine does not support MultiPV option");
        }
        
        debug!("Engine config result: name='{}', options={}", config.name, config.options.len());
        Ok(config)
    }

    /// Check if engine supports MultiPV
    pub fn supports_multipv(config: &EngineConfig) -> bool {
        config.options.iter().any(|opt| {
            match opt {
                UciOptionConfig::Spin { name, .. } => name == "MultiPV",
                _ => false,
            }
        })
    }

    /// Get maximum MultiPV value supported by engine
    pub fn get_max_multipv(config: &EngineConfig) -> Option<u16> {
        config.options.iter()
            .find_map(|opt| {
                if let UciOptionConfig::Spin { name, max, .. } = opt {
                    if name == "MultiPV" {
                        max.map(|v| v as u16)
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
    }

    /// Validate engine configuration
    pub fn validate_config(config: &EngineConfig) -> EngineResult<ValidationReport> {
        let mut report = ValidationReport::new();

        // Check for required options
        report.check_option_present(config, "Hash", OptionType::Spin);
        report.check_option_present(config, "Threads", OptionType::Spin);
        
        // Check for common analysis options
        report.check_option_present(config, "MultiPV", OptionType::Spin);
        report.check_option_present(config, "Ponder", OptionType::Check);
        
        // Check for engine-specific features
        if config.options.iter().any(|opt| matches!(opt, UciOptionConfig::Spin { name, .. } if name.contains("Skill"))) {
            report.features.push("Skill Level Control".to_string());
        }
        
        if config.options.iter().any(|opt| matches!(opt, UciOptionConfig::Check { name, .. } if name.contains("Book"))) {
            report.features.push("Opening Book".to_string());
        }

        if config.options.iter().any(|opt| matches!(opt, UciOptionConfig::String { name, .. } if name.contains("SyzygyPath"))) {
            report.features.push("Syzygy Tablebase".to_string());
        }

        report.is_valid = report.errors.is_empty();
        
        info!("Engine validation completed: valid={}, features={}, errors={}", 
              report.is_valid, report.features.len(), report.errors.len());
        
        Ok(report)
    }

    /// Get recommended settings for an engine
    pub fn get_recommended_settings(config: &EngineConfig) -> RecommendedSettings {
        let mut settings = RecommendedSettings::new();

        // Set hash based on available memory (simplified)
        let recommended_hash = Self::calculate_recommended_hash();
        settings.add_option("Hash".to_string(), recommended_hash.to_string());

        // Set threads based on CPU cores
        let recommended_threads = Self::calculate_recommended_threads();
        settings.add_option("Threads".to_string(), recommended_threads.to_string());

        // Enable useful features if available
        if Self::has_option(config, "Ponder") {
            settings.add_option("Ponder".to_string(), "false".to_string()); // Usually better off for analysis
        }

        if Self::has_option(config, "MultiPV") {
            settings.add_option("MultiPV".to_string(), "1".to_string()); // Start with single line
        }

        // Engine-specific optimizations
        if config.name.to_lowercase().contains("stockfish") {
            Self::configure_stockfish(&mut settings, config);
        } else if config.name.to_lowercase().contains("komodo") {
            Self::configure_komodo(&mut settings, config);
        } else if config.name.to_lowercase().contains("leela") || config.name.to_lowercase().contains("lc0") {
            Self::configure_leela(&mut settings, config);
        }

        info!("Generated {} recommended settings for engine: {}", 
              settings.options.len(), config.name);
        
        settings
    }

    /// Test engine responsiveness
    pub async fn test_engine_responsiveness(path: PathBuf, timeout_ms: u64) -> EngineResult<ResponsivenessReport> {
        let start_time = std::time::Instant::now();
        
        let mut child = Self::spawn_engine_process(&path)?;
        let (mut stdin, mut stdout) = Self::get_engine_io_handles(&mut child)?;

        let spawn_time = start_time.elapsed();
        
        // Test UCI communication
        let uci_start = std::time::Instant::now();
        Self::send_engine_command(&mut stdin, "uci\n").await?;
        
        let mut uci_response_time = None;
        let timeout_duration = Duration::from_millis(timeout_ms);
        
        match timeout(timeout_duration, Self::wait_for_uciok(&mut stdout)).await {
            Ok(Ok(())) => {
                uci_response_time = Some(uci_start.elapsed());
            }
            Ok(Err(e)) => {
                error!("UCI communication failed: {}", e);
                let _ = child.kill().await;
                return Err(e);
            }
            Err(_) => {
                warn!("UCI communication timeout");
                let _ = child.kill().await;
                return Err(EngineError::Timeout);
            }
        }

        // Test isready command
        let ready_start = std::time::Instant::now();
        Self::send_engine_command(&mut stdin, "isready\n").await?;
        
        let mut ready_response_time = None;
        match timeout(timeout_duration, Self::wait_for_readyok(&mut stdout)).await {
            Ok(Ok(())) => {
                ready_response_time = Some(ready_start.elapsed());
            }
            Ok(Err(e)) => {
                warn!("Isready command failed: {}", e);
            }
            Err(_) => {
                warn!("Isready command timeout");
            }
        }

        let _ = child.kill().await;

        let total_time = start_time.elapsed();
        
        Ok(ResponsivenessReport {
            spawn_time,
            uci_response_time,
            ready_response_time,
            total_time,
            is_responsive: uci_response_time.is_some() && ready_response_time.is_some(),
        })
    }

    // =============================================================================
    // Private Implementation
    // =============================================================================

    fn spawn_engine_process(path: &PathBuf) -> EngineResult<Child> {
        debug!("Spawning engine process: {:?}", path);
        
        let mut command = Command::new(path);
        
        // Set working directory intelligently
        if let Some(parent) = path.parent() {
            command.current_dir(parent);
        } else if let Some(home_dir) = std::env::var_os("HOME") {
            // Fallback for Homebrew engines
            command.current_dir(home_dir);
        }
        
        command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .env("TERM", "dumb"); // Prevent terminal features

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

    fn get_engine_io_handles(child: &mut Child) -> EngineResult<(ChildStdin, Lines<BufReader<ChildStdout>>)> {
        let stdin = child.stdin.take().ok_or(EngineError::NoStdin)?;
        let stdout = child.stdout.take().ok_or(EngineError::NoStdout)?;
        // Use smaller buffer for more responsive reading
        let stdout = BufReader::with_capacity(1024, stdout).lines();
        Ok((stdin, stdout))
    }

    async fn send_engine_command(stdin: &mut ChildStdin, command: &str) -> EngineResult<()> {
        debug!("Sending command: {}", command.trim());
        stdin
            .write_all(command.as_bytes())
            .await
            .map_err(EngineError::Io)?;
        
        // Flush stdin immediately for real-time communication
        stdin
            .flush()
            .await
            .map_err(EngineError::Io)?;
            
        debug!("Command sent and flushed: {}", command.trim());
        Ok(())
    }

    async fn get_uci_config(
        stdin: &mut ChildStdin,
        stdout: &mut Lines<BufReader<ChildStdout>>,
        config: &mut EngineConfig
    ) -> EngineResult<()> {
        debug!("Requesting UCI configuration");
        Self::send_engine_command(stdin, "uci\n").await?;

        while let Some(line) = stdout.next_line().await? {
            debug!("Config line: {}", line);
            
            match parse_one(&line) {
                UciMessage::Id { name: Some(name), .. } => {
                    debug!("Engine name: {}", name);
                    config.name = name;
                }
                UciMessage::Option(opt) => {
                    debug!("Engine option: {:?}", opt);
                    config.options.push(opt);
                }
                UciMessage::UciOk => {
                    debug!("UCI configuration complete");
                    break;
                }
                _ => {}
            }
        }
        
        Ok(())
    }

    async fn wait_for_uciok(stdout: &mut Lines<BufReader<ChildStdout>>) -> EngineResult<()> {
        while let Some(line) = stdout.next_line().await? {
            if line == "uciok" {
                return Ok(());
            }
        }
        Err(EngineError::Timeout)
    }

    async fn wait_for_readyok(stdout: &mut Lines<BufReader<ChildStdout>>) -> EngineResult<()> {
        while let Some(line) = stdout.next_line().await? {
            if line == "readyok" {
                return Ok(());
            }
        }
        Err(EngineError::Timeout)
    }

    fn has_option(config: &EngineConfig, option_name: &str) -> bool {
        config.options.iter().any(|opt| {
            match opt {
                UciOptionConfig::Check { name, .. } => name == option_name,
                UciOptionConfig::Spin { name, .. } => name == option_name,
                UciOptionConfig::Combo { name, .. } => name == option_name,
                UciOptionConfig::Button { name } => name == option_name,
                UciOptionConfig::String { name, .. } => name == option_name,
            }
        })
    }

    fn calculate_recommended_hash() -> u32 {
        // Simple heuristic: use 1/8 of available RAM, capped at 2GB
        let total_memory_mb = sysinfo::System::new_all().total_memory() / (1024 * 1024);
        let recommended = (total_memory_mb as u32 / 8).min(2048).max(16);
        debug!("Recommended hash: {}MB (total memory: {}MB)", recommended, total_memory_mb);
        recommended
    }

    fn calculate_recommended_threads() -> u32 {
        // Use a simple thread detection approach
        let cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4) as u32;
        let recommended = cores.min(16).max(1);
        debug!("Recommended threads: {} (detected cores: {})", recommended, cores);
        recommended
    }

    fn configure_stockfish(settings: &mut RecommendedSettings, config: &EngineConfig) {
        debug!("Applying Stockfish-specific configuration");
        
        if Self::has_option(config, "Use NNUE") {
            settings.add_option("Use NNUE".to_string(), "true".to_string());
        }
        
        if Self::has_option(config, "EvalFile") {
            // Leave default NNUE file
        }
        
        if Self::has_option(config, "Skill Level") {
            settings.add_option("Skill Level".to_string(), "20".to_string()); // Maximum strength
        }
    }

    fn configure_komodo(settings: &mut RecommendedSettings, config: &EngineConfig) {
        debug!("Applying Komodo-specific configuration");
        
        if Self::has_option(config, "Personalities") {
            settings.add_option("Personalities".to_string(), "Default".to_string());
        }
        
        if Self::has_option(config, "Aggressive") {
            settings.add_option("Aggressive".to_string(), "0".to_string());
        }
    }

    fn configure_leela(settings: &mut RecommendedSettings, config: &EngineConfig) {
        debug!("Applying Leela/Lc0-specific configuration");
        
        if Self::has_option(config, "Backend") {
            settings.add_option("Backend".to_string(), "auto".to_string());
        }
        
        if Self::has_option(config, "Threads") {
            // Leela often benefits from fewer threads than CPU cores
            let threads = Self::calculate_recommended_threads() / 2;
            settings.add_option("Threads".to_string(), threads.max(1).to_string());
        }
    }
}

/// Engine validation report
#[derive(Debug, Clone)]
pub struct ValidationReport {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub features: Vec<String>,
}

impl ValidationReport {
    fn new() -> Self {
        Self {
            is_valid: false,
            errors: Vec::new(),
            warnings: Vec::new(),
            features: Vec::new(),
        }
    }

    fn check_option_present(&mut self, config: &EngineConfig, option_name: &str, expected_type: OptionType) {
        if let Some(option) = config.options.iter().find(|opt| {
            match opt {
                UciOptionConfig::Check { name, .. } => name == option_name,
                UciOptionConfig::Spin { name, .. } => name == option_name,
                UciOptionConfig::Combo { name, .. } => name == option_name,
                UciOptionConfig::Button { name } => name == option_name,
                UciOptionConfig::String { name, .. } => name == option_name,
            }
        }) {
            // Validate type
            let actual_type = match option {
                UciOptionConfig::Check { .. } => OptionType::Check,
                UciOptionConfig::Spin { .. } => OptionType::Spin,
                UciOptionConfig::Combo { .. } => OptionType::Combo,
                UciOptionConfig::Button { .. } => OptionType::Button,
                UciOptionConfig::String { .. } => OptionType::String,
            };
            
            if actual_type != expected_type {
                self.warnings.push(format!("Option '{}' has type {:?}, expected {:?}", 
                                         option_name, actual_type, expected_type));
            }
        } else {
            self.warnings.push(format!("Recommended option '{}' not found", option_name));
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OptionType {
    Check,
    Spin,
    Combo,
    Button,
    String,
}

/// Recommended engine settings
#[derive(Debug, Clone)]
pub struct RecommendedSettings {
    pub options: Vec<(String, String)>,
}

impl RecommendedSettings {
    fn new() -> Self {
        Self {
            options: Vec::new(),
        }
    }

    fn add_option(&mut self, name: String, value: String) {
        self.options.push((name, value));
    }

    pub fn get_option(&self, name: &str) -> Option<&str> {
        self.options.iter()
            .find(|(opt_name, _)| opt_name == name)
            .map(|(_, value)| value.as_str())
    }
}

/// Engine responsiveness test results
#[derive(Debug, Clone)]
pub struct ResponsivenessReport {
    pub spawn_time: Duration,
    pub uci_response_time: Option<Duration>,
    pub ready_response_time: Option<Duration>,
    pub total_time: Duration,
    pub is_responsive: bool,
}

impl ResponsivenessReport {
    pub fn summary(&self) -> String {
        format!(
            "Spawn: {:?}, UCI: {:?}, Ready: {:?}, Total: {:?}, Responsive: {}",
            self.spawn_time,
            self.uci_response_time.map_or("timeout".to_string(), |d| format!("{:?}", d)),
            self.ready_response_time.map_or("timeout".to_string(), |d| format!("{:?}", d)),
            self.total_time,
            self.is_responsive
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validation_report() {
        let mut report = ValidationReport::new();
        assert!(!report.is_valid);
        assert!(report.errors.is_empty());
        assert!(report.warnings.is_empty());
    }

    #[test]
    fn test_recommended_settings() {
        let mut settings = RecommendedSettings::new();
        settings.add_option("Hash".to_string(), "128".to_string());
        
        assert_eq!(settings.get_option("Hash"), Some("128"));
        assert_eq!(settings.get_option("Threads"), None);
    }

    #[test]
    fn test_calculate_threads() {
        let threads = EngineConfigurator::calculate_recommended_threads();
        assert!(threads >= 1);
        assert!(threads <= 16);
    }
}
