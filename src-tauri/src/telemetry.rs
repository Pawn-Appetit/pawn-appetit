use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri::path::BaseDirectory;
use uuid::Uuid;
use sysinfo::{System, SystemExt};
use once_cell::sync::Lazy;
use tokio::sync::Semaphore;

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct TelemetryConfig {
    pub enabled: bool,
    pub initial_run_completed: bool,
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            // Production-grade privacy: opt-in by default.
            enabled: false,
            initial_run_completed: false,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum TelemetryError {
    #[error("Failed to resolve config path: {0}")]
    PathError(String),
    #[error("Failed to read config file: {0}")]
    ReadError(#[from] std::io::Error),
    #[error("Failed to parse config: {0}")]
    ParseError(#[from] serde_json::Error),
    #[error("Failed to send telemetry: {0}")]
    NetworkError(#[from] reqwest::Error),
}

#[derive(Debug, Serialize, Deserialize)]
struct TelemetryEvent {
    id: String,
    event_type: String,
    app_version: String,
    timestamp: String,
    platform: String,
    user_id: String,
    country: Option<String>,
}

impl TelemetryConfig {
    fn get_config_path(app: &AppHandle) -> Result<PathBuf, TelemetryError> {
        app.path()
            .resolve("telemetry_config.json", BaseDirectory::AppConfig)
            .map_err(|e| TelemetryError::PathError(e.to_string()))
    }

    pub fn load(app: &AppHandle) -> Result<Self, TelemetryError> {
        let config_path = Self::get_config_path(app)?;
        
        if !config_path.exists() {
            log::info!("Telemetry config not found, creating default");
            let default_config = Self::default();
            default_config.save(app)?;
            return Ok(default_config);
        }

        let config_content = fs::read_to_string(&config_path)?;
        let config: Self = serde_json::from_str(&config_content)?;
        
        log::info!("Loaded telemetry config: enabled={}, initial_run_completed={}", 
                  config.enabled, config.initial_run_completed);
        
        Ok(config)
    }

    pub fn save(&self, app: &AppHandle) -> Result<(), TelemetryError> {
        let config_path = Self::get_config_path(app)?;
        
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let config_json = serde_json::to_string_pretty(self)?;
        fs::write(&config_path, config_json)?;
        
        log::info!("Saved telemetry config to: {}", config_path.display());
        Ok(())
    }

    pub fn set_enabled(&mut self, app: &AppHandle, enabled: bool) -> Result<(), TelemetryError> {
        self.enabled = enabled;
        self.save(app)?;
        log::info!("Telemetry enabled state updated to: {}", enabled);
        Ok(())
    }

    pub fn mark_initial_run_completed(&mut self, app: &AppHandle) -> Result<(), TelemetryError> {
        self.initial_run_completed = true;
        self.save(app)?;
        log::info!("Initial run marked as completed");
        Ok(())
    }
}

fn get_user_id(app: &AppHandle) -> String {
    let user_id_path = app.path()
        .resolve("user_id.txt", BaseDirectory::AppConfig)
        .unwrap_or_default();
    
    if let Ok(existing_id) = fs::read_to_string(&user_id_path) {
        existing_id.trim().to_string()
    } else {
        let new_id = Uuid::new_v4().to_string();
        if let Some(parent) = user_id_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&user_id_path, &new_id);
        new_id
    }
}

fn get_platform_info() -> String {
    let mut sys = System::new();
    sys.refresh_system();
    
    let os_name = std::env::consts::OS;
    let os_version = sys.os_version().unwrap_or_else(|| "unknown".to_string());
    let arch = std::env::consts::ARCH;
    
    format!("{} {} ({})", os_name, os_version, arch)
}

static TELEMETRY_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("failed to build telemetry http client")
});

static TELEMETRY_SEMAPHORE: Lazy<Semaphore> = Lazy::new(|| Semaphore::new(2));

async fn get_user_country_from_api() -> Option<String> {
    // Use HTTPS-only endpoint (avoids plaintext leakage + plays better with enterprise environments).
    // ipapi.co returns the ISO country code as plain text at /country/
    let api_url = "https://ipapi.co/country/";

    if let Ok(response) = TELEMETRY_CLIENT.get(api_url).send().await {
        if response.status().is_success() {
            if let Ok(text) = response.text().await {
                let country = text.trim().to_uppercase();
                if country.len() == 2 && country.chars().all(|c| c.is_ascii_uppercase()) {
                    log::info!("Retrieved country from IP API: {}", country);
                    return Some(country);
                }
            }
        }
    }

    log::warn!("Failed to get country from IP API, falling back to locale detection");
    None
}

fn get_user_country_from_locale() -> Option<String> {
    std::env::var("LC_ALL")
        .or_else(|_| std::env::var("LC_CTYPE"))
        .or_else(|_| std::env::var("LANG"))
        .ok()
        .and_then(|locale| {
            if let Some(country_part) = locale.split('.').next() {
                if let Some(country) = country_part.split('_').nth(1) {
                    if country.len() == 2 && country.chars().all(|c| c.is_ascii_uppercase()) {
                        return Some(country.to_string());
                    }
                }
            }
            None
        })
        .or_else(|| {
            #[cfg(target_os = "windows")]
            {
                use std::process::Command;
                if let Ok(output) = Command::new("powershell")
                    .args(&["-Command", "(Get-Culture).TwoLetterISOLanguageName"])
                    .output()
                {
                    let country = String::from_utf8_lossy(&output.stdout).trim().to_uppercase();
                    if country.len() == 2 && country.chars().all(|c| c.is_ascii_uppercase()) {
                        return Some(country);
                    }
                }
            }
            
            #[cfg(target_os = "macos")]
            {
                use std::process::Command;
                if let Ok(output) = Command::new("defaults")
                    .args(&["read", "-g", "AppleLocale"])
                    .output()
                {
                    let locale = String::from_utf8_lossy(&output.stdout);
                    let locale = locale.trim();
                    if let Some(country) = locale.split('_').nth(1) {
                        let country = country.to_uppercase();
                        if country.len() == 2 && country.chars().all(|c| c.is_ascii_uppercase()) {
                            return Some(country);
                        }
                    }
                }
            }
            
            None
        })
}

async fn get_user_country() -> Option<String> {
    if let Some(country) = get_user_country_from_api().await {
        return Some(country);
    }
    
    if let Some(country) = get_user_country_from_locale() {
        log::info!("Retrieved country from locale: {}", country);
        return Some(country);
    }
    
    log::warn!("Could not determine user country from API or locale");
    None
}

async fn track_event_to_supabase(event_name: &str, app: &AppHandle) -> Result<(), TelemetryError> {
    // Allow runtime override for production deployments.
    let supabase_url = std::env::var("PAWN_APPETIT_SUPABASE_URL")
        .unwrap_or_else(|_| "https://jklxpooswizrhfdghcog.supabase.co".to_string());
    let supabase_key = std::env::var("PAWN_APPETIT_SUPABASE_ANON_KEY")
        .unwrap_or_else(|_| "sb_publishable_sLNbFdo6jEh5JYYiT9XgmQ_P8jx7z2V".to_string());

    let country = get_user_country().await;

    let event = TelemetryEvent {
        id: Uuid::new_v4().to_string(),
        event_type: event_name.to_string(),
        app_version: app.package_info().version.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        platform: get_platform_info(),
        user_id: get_user_id(app),
        country,
    };

    let supabase_key_header = supabase_key.clone();
    let response = TELEMETRY_CLIENT
        .post(&format!("{}/rest/v1/telemetry_events", supabase_url))
        .header("apikey", supabase_key_header)
        .header("Authorization", format!("Bearer {}", supabase_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&event)
        .send()
        .await?;

    if response.status().is_success() {
        log::info!("Successfully tracked '{}' event to Supabase", event_name);
    } else {
        log::warn!("Failed to track '{}' event to Supabase: {}", event_name, response.status());
    }

    Ok(())
}

fn track_event_safe(app: &AppHandle, event_name: &str) {
    let app_handle = app.clone();
    let event_name = event_name.to_string();
    
    tokio::spawn(async move {
        let _permit = match TELEMETRY_SEMAPHORE.acquire().await {
            Ok(p) => p,
            Err(_) => return,
        };
        if let Err(e) = track_event_to_supabase(&event_name, &app_handle).await {
            log::warn!("Failed to track '{}' event: {}. This is normal if analytics are disabled or not configured.", event_name, e);
        }
    });
}

pub fn handle_initial_run_telemetry(app: &AppHandle) -> Result<(), String> {
    let mut config = TelemetryConfig::load(app)
        .map_err(|e| format!("Failed to load telemetry config: {}", e))?;

    if config.enabled && !config.initial_run_completed {
        log::info!("Initial run detected and telemetry enabled. Tracking 'initial_run' event.");

        track_event_safe(app, "initial_run");

        config.mark_initial_run_completed(app)
            .map_err(|e| format!("Failed to mark initial run as completed: {}", e))?;
    } else if !config.enabled {
        log::info!("Telemetry disabled, skipping initial_run tracking");
        if !config.initial_run_completed {
            config.mark_initial_run_completed(app)
                .map_err(|e| format!("Failed to mark initial run as completed: {}", e))?;
        }
    } else {
        log::info!("Initial run already completed, skipping tracking");
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_telemetry_enabled(app: AppHandle) -> Result<bool, String> {
    let config = TelemetryConfig::load(&app)
        .map_err(|e| format!("Failed to load telemetry config: {}", e))?;
    
    Ok(config.enabled)
}

#[tauri::command]
#[specta::specta]
pub fn set_telemetry_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut config = TelemetryConfig::load(&app)
        .map_err(|e| format!("Failed to load telemetry config: {}", e))?;
    
    config.set_enabled(&app, enabled)
        .map_err(|e| format!("Failed to update telemetry setting: {}", e))?;
    
    log::info!("Telemetry preference updated: enabled={}", enabled);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_telemetry_config(app: AppHandle) -> Result<TelemetryConfig, String> {
    TelemetryConfig::load(&app)
        .map_err(|e| format!("Failed to load telemetry config: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn get_user_country_api() -> Result<Option<String>, String> {
    Ok(get_user_country().await)
}

#[tauri::command]
#[specta::specta]
pub fn get_user_country_locale() -> Result<Option<String>, String> {
    Ok(get_user_country_from_locale())
}

#[tauri::command]
#[specta::specta]
pub fn get_user_id_command(app: AppHandle) -> Result<String, String> {
    Ok(get_user_id(&app))
}

#[tauri::command]
#[specta::specta]
pub fn get_platform_info_command() -> Result<String, String> {
    Ok(get_platform_info())
}
