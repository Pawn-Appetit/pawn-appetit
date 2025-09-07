#[cfg(desktop)]
use std::fs::create_dir_all;
#[cfg(desktop)]
use fs_extra::dir::{copy, CopyOptions};
#[cfg(desktop)]
use tauri::{AppHandle, Manager};

#[cfg(desktop)]
#[derive(Debug, thiserror::Error)]
pub enum MigrationError {
    #[error("Failed to migrate from legacy app {identifier}: {source}")]
    LegacyMigrationFailed { identifier: String, source: Box<dyn std::error::Error + Send + Sync> },
    #[error("Failed to copy legacy data from {from} to {to}: {source}")]
    LegacyDataCopyFailed { from: String, to: String, source: Box<dyn std::error::Error + Send + Sync> },
    #[error("Failed to get app data directory: {source}")]
    AppDataDirectoryFailed { source: tauri::Error },
    #[error("Failed to create parent directory {path}: {source}")]
    DirectoryCreationFailed { path: String, source: std::io::Error },
}

#[cfg(desktop)]
/// Legacy app identifiers that we need to migrate from
const LEGACY_IDENTIFIERS: &[&str] = &[
    "org.encroissant.app",
];

#[cfg(desktop)]
/// Migrates user data from old app directories to the new one
///
/// This function checks for existing data directories from previous app identifiers
/// and copies all their contents to the new app data directory. It only runs if
/// the new directory doesn't already exist (first run).
///
/// # Arguments
/// * `app` - The Tauri app handle used to resolve paths
///
/// # Returns
/// * `Ok(())` if migration completed successfully or was skipped
/// * `Err(MigrationError)` if there was an error during migration
pub fn migrate_from_legacy_apps(app: &AppHandle) -> Result<(), MigrationError> {
    #[cfg(desktop)]
    {
        log::info!("Checking for legacy app data migration");
        
        // Get the current app data directory
        let current_app_data = app.path().app_data_dir()
            .map_err(|e| MigrationError::AppDataDirectoryFailed { source: e })?;
        
        // Skip migration if current directory already exists and has content
        if current_app_data.exists() && current_app_data.read_dir().map_or(false, |mut dir| dir.next().is_some()) {
            log::info!("Current app data directory already exists with content, skipping migration");
            return Ok(());
        }
        
        // Look for legacy app directories to migrate from
        for &legacy_identifier in LEGACY_IDENTIFIERS {
            let legacy_path = super::get_legacy_app_data_path(legacy_identifier)
                .map_err(|e| MigrationError::LegacyMigrationFailed { 
                    identifier: legacy_identifier.to_string(), 
                    source: e
                })?;
            
            if legacy_path.exists() && legacy_path.is_dir() {
                log::info!("Found legacy app data at: {}", legacy_path.display());
                log::info!("Migrating to: {}", current_app_data.display());
                
                // Ensure the parent directory of the current app data exists
                if let Some(parent) = current_app_data.parent() {
                    create_dir_all(parent).map_err(|e| {
                        MigrationError::DirectoryCreationFailed { 
                            path: parent.display().to_string(), 
                            source: e 
                        }
                    })?;
                }
                
                // Copy options for fs_extra
                let mut options = CopyOptions::new();
                options.overwrite = true;
                options.copy_inside = true;
                
                // Copy all contents from legacy directory to new directory
                copy(&legacy_path, &current_app_data, &options).map_err(|e| {
                    MigrationError::LegacyDataCopyFailed { 
                        from: legacy_path.display().to_string(), 
                        to: current_app_data.display().to_string(), 
                        source: Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
                    }
                })?;
                
                log::info!("Successfully migrated data from {}", legacy_identifier);
                return Ok(());
            } else {
                log::info!("No legacy data found for identifier: {}", legacy_identifier);
            }
        }
        
        log::info!("No legacy app data found to migrate");
        Ok(())
    }
    
    #[cfg(not(desktop))]
    {
        // On non-desktop platforms, migration is not needed
        Ok(())
    }
}
