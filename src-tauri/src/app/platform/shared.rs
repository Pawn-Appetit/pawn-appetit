use std::fs::create_dir_all;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

#[derive(Debug, thiserror::Error)]
pub enum PlatformError {
    #[error("Failed to resolve path {path}: {source}")]
    PathResolutionFailed { path: String, source: tauri::Error },
    #[error("Failed to create directory {path}: {source}")]
    DirectoryCreationFailed { path: String, source: std::io::Error },
    #[error("Failed to create file {path}: {source}")]
    FileCreationFailed { path: String, source: std::io::Error },
}

// Common platform utilities and shared functionality

const REQUIRED_DIRS: &[(BaseDirectory, &str)] = &[
    (BaseDirectory::AppData, "engines"),
    (BaseDirectory::AppData, "db"),
    (BaseDirectory::AppData, "presets"),
    (BaseDirectory::AppData, "puzzles"),
    (BaseDirectory::AppData, "documents"),
    (BaseDirectory::AppData, "logs"),
];

const REQUIRED_FILES: &[(BaseDirectory, &str, &str)] = &[
    (BaseDirectory::AppData, "engines/engines.json", "[]"),
    (BaseDirectory::AppData, "settings.json", "{}"),
    (BaseDirectory::AppData, "telemetry.json", "{\"enabled\":true,\"last_sent\":null}"),
];

/// Ensures that all required directories exist, creating them if necessary
///
/// # Arguments
/// * `app` - The Tauri app handle used to resolve paths
///
/// # Returns
/// * `Ok(())` if all directories were created or already exist
/// * `Err(PlatformError)` if there was an error creating a directory
pub fn ensure_required_directories(app: &AppHandle) -> Result<(), PlatformError> {
    log::info!("Checking for required directories");
    for &(dir, path) in REQUIRED_DIRS {
        let resolved_path = app.path().resolve(path, dir)
            .map_err(|e| PlatformError::PathResolutionFailed { 
                path: path.to_string(), 
                source: e 
            })?;
        
        if !resolved_path.exists() {
            log::info!("Creating directory {}", resolved_path.display());
            create_dir_all(&resolved_path).map_err(|e| {
                PlatformError::DirectoryCreationFailed { 
                    path: resolved_path.display().to_string(), 
                    source: e 
                }
            })?;
        } else {
            log::info!("Directory already exists: {}", resolved_path.display());
        }
    }
    Ok(())
}

/// Ensures that all required files exist, creating them with default content if necessary
///
/// # Arguments
/// * `app` - The Tauri app handle used to resolve paths
///
/// # Returns
/// * `Ok(())` if all files were created or already exist
/// * `Err(PlatformError)` if there was an error creating a file
pub fn ensure_required_files(app: &AppHandle) -> Result<(), PlatformError> {
    log::info!("Checking for required files");
    for &(dir, path, contents) in REQUIRED_FILES {
        let resolved_path = app
            .path()
            .resolve(path, dir)
            .map_err(|e| PlatformError::PathResolutionFailed { 
                path: path.to_string(), 
                source: e 
            })?;

        if !resolved_path.exists() {
            log::info!("Creating file {}", resolved_path.display());
            std::fs::write(&resolved_path, contents).map_err(|e| {
                PlatformError::FileCreationFailed { 
                    path: resolved_path.display().to_string(), 
                    source: e 
                }
            })?;
        } else {
            log::info!("File already exists: {}", resolved_path.display());
        }
    }
    Ok(())
}
