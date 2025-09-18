
#[cfg(target_os = "windows")]
#[derive(Debug, thiserror::Error)]
pub enum WindowsError {
    #[error("Failed to resolve environment variable {var}: {source}")]
    EnvironmentVariableNotFound { var: String, source: Box<dyn std::error::Error + Send + Sync> },
}

/// Windows-specific platform initialization and configuration
#[cfg(target_os = "windows")]
pub fn init_windows_platform() -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Initializing Windows-specific features");
    Ok(())
}

/// Gets the Windows-specific app data path for legacy app migration
#[cfg(target_os = "windows")]
pub fn get_legacy_app_data_path(identifier: &str) -> Result<std::path::PathBuf, WindowsError> {
    let appdata = std::env::var("APPDATA")
        .map_err(|e| WindowsError::EnvironmentVariableNotFound { 
            var: "APPDATA".to_string(), 
            source: Box::new(e) 
        })?;
    Ok(std::path::PathBuf::from(appdata).join(identifier))
}
