
#[cfg(target_os = "macos")]
#[derive(Debug, thiserror::Error)]
pub enum MacOSError {
    #[error("Failed to resolve environment variable {var}: {source}")]
    EnvironmentVariableNotFound { var: String, source: Box<dyn std::error::Error + Send + Sync> },
}

/// macOS-specific platform initialization and configuration
#[cfg(target_os = "macos")]
pub fn init_macos_platform() -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Initializing macOS-specific features");
    Ok(())
}

/// Gets the macOS-specific app data path for legacy app migration
#[cfg(target_os = "macos")]
pub fn get_legacy_app_data_path(identifier: &str) -> Result<std::path::PathBuf, MacOSError> {
    let home = std::env::var("HOME")
        .map_err(|e| MacOSError::EnvironmentVariableNotFound { 
            var: "HOME".to_string(), 
            source: Box::new(e) 
        })?;
    Ok(std::path::PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join(identifier))
}
