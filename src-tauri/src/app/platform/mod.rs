use log::LevelFilter;
use tauri::{App, Manager, Window};

use crate::AppState;

pub mod desktop;
pub mod mobile;
pub mod shared;

#[tauri::command]
#[specta::specta]
pub async fn screen_capture(window: Window) -> Result<(), String> {
    #[cfg(desktop)]
    {    
        let main_window = window
            .get_webview_window("main")
            .ok_or_else(|| {
                let error_msg = "No window labeled 'main' found";
                log::error!("{}", error_msg);
                String::from(error_msg)
            })?;

        log::info!("Showing main window");

        main_window
            .show()
            .map_err(|e| {
                let error_msg = format!("Failed to show main window: {}", e);
                log::error!("{}", error_msg);
                error_msg
            })?;

        if let Err(e) = main_window.set_focus() {
            log::warn!("Failed to focus main window: {}", e);
        }
    }

    #[cfg(mobile)]
    {
        // Mobile platforms handle window visibility automatically
    }

    Ok(())
}

/// Gets the log level from environment variable or defaults to Info
fn get_log_level() -> LevelFilter {
    match std::env::var("RUST_LOG").as_deref() {
        Ok("trace") => LevelFilter::Trace,
        Ok("debug") => LevelFilter::Debug,
        Ok("info") => LevelFilter::Info,
        Ok("warn") => LevelFilter::Warn,
        Ok("error") => LevelFilter::Error,
        Ok("off") => LevelFilter::Off,
        _ => {
            if let Ok(rust_log) = std::env::var("RUST_LOG") {
                if rust_log.contains("debug") {
                    return LevelFilter::Debug;
                } else if rust_log.contains("trace") {
                    return LevelFilter::Trace;
                } else if rust_log.contains("warn") {
                    return LevelFilter::Warn;
                } else if rust_log.contains("error") {
                    return LevelFilter::Error;
                }
            }
            #[cfg(debug_assertions)]
            return LevelFilter::Debug;
            #[cfg(not(debug_assertions))]
            return LevelFilter::Info;
        }
    }
}

pub fn setup_tauri_plugins(
    builder: tauri::Builder<tauri::Wry>,
    specta_builder: &tauri_specta::Builder,
) -> tauri::Builder<tauri::Wry> {
    let builder = builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("pawn-appetit".to_string()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                ])
                .level(get_log_level())
                .build(),
        );

    #[cfg(desktop)]
    let builder = desktop::setup_desktop_plugins(builder);

    #[cfg(mobile)]
    let builder = mobile::setup_mobile_plugins(builder);

    let builder = builder
        .invoke_handler(specta_builder.invoke_handler())
        .manage(AppState::default());

    builder
}

pub fn init_platform(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Initializing platform-specific features");

    #[cfg(desktop)]
    desktop::init_desktop_platform(app)?;

    #[cfg(mobile)]
    mobile::init_mobile_platform()?;

    shared::ensure_required_directories(&app.handle())
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
    shared::ensure_required_files(&app.handle())
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

    Ok(())
}
