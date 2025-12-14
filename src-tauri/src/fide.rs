use std::{
    fs::{remove_file, File},
    io::{BufReader, BufWriter},
};

use bincode::{config, Decode, Encode};
use quick_xml::de::from_reader;
use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;
use strsim::{jaro_winkler, sorensen_dice};
use tauri::{path::BaseDirectory, Manager};
use tauri_specta::Event;

use crate::{error::Error, fs::DownloadProgress};
use crate::{fs::download_file, AppState};

#[derive(Debug, Deserialize, Serialize, Type, Clone, Decode, Encode)]
pub struct FidePlayer {
    pub fideid: u32,
    pub name: String,
    pub country: String,
    pub sex: String,
    #[serde(deserialize_with = "empty_string_is_none")]
    pub title: Option<String>,
    #[serde(deserialize_with = "empty_string_is_none")]
    pub w_title: Option<String>,
    #[serde(deserialize_with = "empty_string_is_none")]
    pub o_title: Option<String>,
    #[serde(deserialize_with = "empty_string_is_none")]
    pub foa_title: Option<String>,
    #[serde(deserialize_with = "deserialize_option_u16")]
    pub rating: Option<u16>,
    #[serde(deserialize_with = "deserialize_option_u16")]
    pub games: Option<u16>,
    #[serde(deserialize_with = "deserialize_option_u16")]
    pub k: Option<u16>,
    #[serde(deserialize_with = "deserialize_option_u16")]
    pub rapid_rating: Option<u16>,
    #[serde(deserialize_with = "deserialize_option_u16")]
    pub rapid_games: Option<u16>,
    #[serde(deserialize_with = "deserialize_option_u16")]
    pub rapid_k: Option<u16>,
    #[serde(deserialize_with = "deserialize_option_u16")]
    pub blitz_rating: Option<u16>,
    #[serde(deserialize_with = "deserialize_option_u16")]
    pub blitz_games: Option<u16>,
    #[serde(deserialize_with = "deserialize_option_u16")]
    pub blitz_k: Option<u16>,
    #[serde(deserialize_with = "deserialize_option_u16")]
    pub birthday: Option<u16>,
    #[serde(deserialize_with = "empty_string_is_none")]
    pub flag: Option<String>,
}

fn empty_string_is_none<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    if s.is_empty() {
        Ok(None)
    } else {
        Ok(Some(s))
    }
}

fn deserialize_option_u16<'de, D>(deserializer: D) -> Result<Option<u16>, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(Option::deserialize(deserializer).unwrap_or(None))
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PlayersList {
    #[serde(rename = "player")]
    pub players: Vec<FidePlayer>,
}

#[tauri::command]
#[specta::specta]
pub async fn download_fide_db(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), Error> {
    let fide_path = app.path().resolve("fide.bin", BaseDirectory::AppData)?;

    download_file(
        "fide_db".to_string(),
        "http://ratings.fide.com/download/players_list_xml.zip".to_string(),
        app.path().config_dir().unwrap(),
        app.clone(),
        None,
        Some(false),
        None,
    )
    .await?;

    let xml_path = app
        .path()
        .resolve("players_list_xml_foa.xml", BaseDirectory::AppData)?;

    let reader = BufReader::new(File::open(&xml_path)?);
    let players_list: PlayersList = from_reader(reader)?;

    let mut out_file = BufWriter::new(File::create(&fide_path)?);
    bincode::encode_into_std_write(&players_list.players, &mut out_file, config::standard())?;

    let mut fide_players = state.fide_players.write().await;
    *fide_players = players_list.players;

    DownloadProgress {
        progress: 100.0,
        id: "fide_db".to_string(),
        finished: true,
    }
    .emit(&app)?;

    remove_file(&xml_path)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn find_fide_player(
    player: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<FidePlayer>, Error> {
    let fide_players = state.fide_players.read().await;

    if fide_players.is_empty() {
        drop(fide_players);
        let config = config::standard();
        let fide_path = app.path().resolve("fide.bin", BaseDirectory::AppData)?;

        if let Ok(f) = File::open(&fide_path) {
            let mut fide_players = state.fide_players.write().await;
            *fide_players = bincode::decode_from_reader(BufReader::new(f), config)?;
        }
    }

    let fide_players = state.fide_players.read().await;
    let mut best_match = None;
    let mut best_match_score = 0.0;

    for fide_player in (*fide_players).iter() {
        let sorenson_score = sorensen_dice(&player, &fide_player.name);
        let jaro_score = jaro_winkler(&player, &fide_player.name);
        let score = sorenson_score.max(jaro_score);
        if score > best_match_score {
            best_match = Some(fide_player);
            best_match_score = score;
        }
    }

    if best_match_score > 0.8 {
        Ok(best_match.cloned())
    } else {
        Err(Error::NoMatchFound)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_fide_profile_html(fide_id: String) -> Result<String, String> {
    let url = format!("https://ratings.fide.com/profile/{}", fide_id);
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch FIDE profile: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    
    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    Ok(html)
}

/// Save a FIDE profile photo (either from URL or base64 data) to local storage
/// Returns the local file path
#[tauri::command]
#[specta::specta]
pub async fn save_fide_photo(fide_id: String, photo_data: String, app: tauri::AppHandle) -> Result<String, String> {
    use std::fs;
    use base64::{Engine as _, engine::general_purpose};
    use log::error;
    
    // Get app data directory
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| {
            let err_msg = format!("Failed to get app data directory: {}", e);
            error!("save_fide_photo: {}", err_msg);
            err_msg
        })?;
    
    // Create fide-photos directory
    let photos_dir = app_data_dir.join("fide-photos");
    
    fs::create_dir_all(&photos_dir)
        .map_err(|e| {
            let err_msg = format!("Failed to create photos directory: {}", e);
            error!("save_fide_photo: {}", err_msg);
            err_msg
        })?;
    
    let photo_path = photos_dir.join(format!("{}.jpg", fide_id));
    
    // Check if photo_data is a data URI (base64) or a URL
    if photo_data.starts_with("data:image") {
        // Extract base64 data
        let base64_data = photo_data
            .split(',')
            .nth(1)
            .ok_or_else(|| {
                let err_msg = "Invalid base64 data URI - no comma found".to_string();
                error!("save_fide_photo: {}", err_msg);
                err_msg
            })?;
        
        // Decode base64
        let image_bytes = general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| {
                let err_msg = format!("Failed to decode base64: {}", e);
                error!("save_fide_photo: {}", err_msg);
                err_msg
            })?;
        
        // Write to file
        fs::write(&photo_path, image_bytes)
            .map_err(|e| {
                let err_msg = format!("Failed to write photo file: {}", e);
                error!("save_fide_photo: {}", err_msg);
                err_msg
            })?;
    } else if photo_data.starts_with("http") {
        
        // Download from URL
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| {
                let err_msg = format!("Failed to create HTTP client: {}", e);
                error!("save_fide_photo: {}", err_msg);
                err_msg
            })?;
        
        let response = client
            .get(&photo_data)
            .send()
            .await
            .map_err(|e| {
                let err_msg = format!("Failed to download photo: {}", e);
                error!("save_fide_photo: {}", err_msg);
                err_msg
            })?;
        
        if !response.status().is_success() {
            let err_msg = format!("Photo download failed with status: {}", response.status());
            error!("save_fide_photo: {}", err_msg);
            return Err(err_msg);
        }
        
        let bytes = response
            .bytes()
            .await
            .map_err(|e| {
                let err_msg = format!("Failed to read photo bytes: {}", e);
                error!("save_fide_photo: {}", err_msg);
                err_msg
            })?;
        
        fs::write(&photo_path, bytes)
            .map_err(|e| {
                let err_msg = format!("Failed to write photo file: {}", e);
                error!("save_fide_photo: {}", err_msg);
                err_msg
            })?;
    } else {
        let err_msg = format!("Invalid photo data format. Starts with: {}", &photo_data[..photo_data.len().min(50)]);
        error!("save_fide_photo: {}", err_msg);
        return Err(err_msg);
    }
    
    // Return the path as a string
    let path_str = photo_path
        .to_str()
        .ok_or_else(|| {
            let err_msg = "Failed to convert path to string".to_string();
            error!("save_fide_photo: {}", err_msg);
            err_msg
        })?
        .to_string();
    
    Ok(path_str)
}
