pub mod android;
pub mod ios;

/// Mobile-specific plugin setup
#[cfg(mobile)]
pub fn setup_mobile_plugins(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
        // Partial support plugins with limited mobile functionality
        // Note: shell, opener, and process plugins have limited functionality on mobile
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
}

/// Mobile-specific initialization that runs on all mobile platforms
#[cfg(mobile)]
pub fn init_mobile_platform() -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Initializing mobile platform");
    
    // Platform-specific initialization
    #[cfg(target_os = "android")]
    android::init_android_platform()?;
    
    #[cfg(target_os = "ios")]
    ios::init_ios_platform()?;
    
    Ok(())
}
