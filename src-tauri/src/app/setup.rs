use tauri::App;

use crate::telemetry::handle_initial_run_telemetry;
use crate::app::platform;

/// Shared app setup logic for both desktop and mobile
pub fn setup_tauri_app(app: &App, specta_builder: &tauri_specta::Builder) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Setting up tauri application");

    platform::init_platform(app)?;

    specta_builder.mount_events(app);

    let _ = log::info!("Finished tauri application initialization");
    let _ = handle_initial_run_telemetry(&app.handle());
    Ok(())
}
