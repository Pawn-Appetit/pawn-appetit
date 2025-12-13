
pub mod windows;
pub mod macos;
pub mod linux;
pub mod migration;

/// Desktop-specific plugin setup
#[cfg(desktop)]
pub fn setup_desktop_plugins(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
}

/// Desktop-specific initialization that runs on all desktop platforms
#[cfg(desktop)]
pub fn init_desktop_platform(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Initializing desktop platform");
    
    migration::migrate_from_legacy_apps(&app.handle())
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

    #[cfg(target_os = "windows")]
    windows::init_windows_platform()?;
    
    #[cfg(target_os = "macos")]
    macos::init_macos_platform()?;
    
    #[cfg(target_os = "linux")]
    linux::init_linux_platform()?;
    
    Ok(())
}


/// Gets the platform-specific legacy app data path for migration
#[cfg(desktop)]
pub fn get_legacy_app_data_path(identifier: &str) -> Result<std::path::PathBuf, Box<dyn std::error::Error + Send + Sync>> {
    #[cfg(target_os = "windows")]
    return windows::get_legacy_app_data_path(identifier).map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>);
    
    #[cfg(target_os = "macos")]
    return macos::get_legacy_app_data_path(identifier).map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>);
    
    #[cfg(target_os = "linux")]
    return linux::get_legacy_app_data_path(identifier).map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>);
    
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    Err(Box::new(std::io::Error::new(std::io::ErrorKind::Unsupported, "Unsupported desktop platform")) as Box<dyn std::error::Error + Send + Sync>)
}
