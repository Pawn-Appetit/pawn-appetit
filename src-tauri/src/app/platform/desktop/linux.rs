
#[cfg(target_os = "linux")]
#[derive(Debug, thiserror::Error)]
pub enum LinuxError {
    #[error("Failed to resolve environment variable {var}: {source}")]
    EnvironmentVariableNotFound { var: String, source: Box<dyn std::error::Error + Send + Sync> },
}

/// Linux-specific platform initialization and configuration
#[cfg(target_os = "linux")]
pub fn init_linux_platform() -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Initializing Linux-specific features");
    Ok(())
}

/// Gets the Linux-specific app data path for legacy app migration
#[cfg(target_os = "linux")]
pub fn get_legacy_app_data_path(identifier: &str) -> Result<std::path::PathBuf, LinuxError> {
    let home = std::env::var("HOME")
        .map_err(|e| LinuxError::EnvironmentVariableNotFound { 
            var: "HOME".to_string(), 
            source: Box::new(e) 
        })?;
    let config_dir = std::env::var("XDG_CONFIG_HOME")
        .unwrap_or_else(|_| format!("{}/.config", home));
    Ok(std::path::PathBuf::from(config_dir).join(identifier))
}
