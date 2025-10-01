use std::{
    fs::create_dir_all,
    io::Cursor,
    path::{Path, PathBuf},
};

use log::info;
use reqwest::{header::HeaderMap, Client};
use specta::Type;
use tauri_specta::Event;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use futures_util::StreamExt;

use crate::error::Error;

#[derive(Clone, Type, serde::Serialize, Event)]
pub struct DownloadProgress {
    pub progress: f32,
    pub id: String,
    pub finished: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn download_file(
    id: String,
    url: String,
    path: PathBuf,
    app: tauri::AppHandle,
    token: Option<String>,
    finalize: Option<bool>,
    total_size: Option<u32>,
) -> Result<(), Error> {
    let finalize = finalize.unwrap_or(true);
    info!("Downloading file from {}", url);
    
    let client = Client::new();

    let mut req = client.get(&url);
    // Add Bearer token if present
    if let Some(token) = token {
        let mut header_map = HeaderMap::new();
        header_map.insert("Authorization", format!("Bearer {token}").parse().unwrap());
        req = req.headers(header_map);
    }
    
    let res = req.send().await?;
    let total_size = total_size.map(|s| s as u64).or_else(|| res.content_length());

    let mut file_data: Vec<u8> = Vec::new();
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item?;
        file_data.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;
        
        // Calculate progress
        let progress = total_size
            .map(|total| ((downloaded as f32 / total as f32) * 100.0).min(100.0))
            .unwrap_or(-1.0); // Indeterminate progress if total size is unknown

        DownloadProgress {
            progress,
            id: id.clone(),
            finished: false,
        }
        .emit(&app)?;
    }

    info!("Downloaded file to {}", path.display());

    // Handle different file types
    if url.ends_with(".zip") {
        unzip_file(&path, file_data).await?;
    } else if url.ends_with(".tar") {
        let mut archive = tar::Archive::new(Cursor::new(file_data));
        archive.unpack(&path)?;
    } else {
        std::fs::write(&path, file_data)?;
    }

    if finalize {
        DownloadProgress {
            progress: 100.0,
            id,
            finished: true,
        }
        .emit(&app)?;
    }
    
    Ok(())
}

pub async fn unzip_file(path: &Path, file: Vec<u8>) -> Result<(), Error> {
    let mut archive = zip::ZipArchive::new(Cursor::new(file))?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = path.join(file.mangled_name());
        if (*file.name()).ends_with('/') {
            info!(
                "File {} extracted to \"{}\"",
                i,
                outpath.as_path().display()
            );
            create_dir_all(&outpath)?;
        } else {
            info!(
                "File {} extracted to \"{}\" ({} bytes)",
                i,
                outpath.as_path().display(),
                file.size()
            );
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    create_dir_all(p)?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_file_as_executable(_path: String) -> Result<(), Error> {
    #[cfg(unix)]
    {
        let path = Path::new(&_path);
        let metadata = std::fs::metadata(path)?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions)?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn file_exists(path: String) -> Result<bool, Error> {
    Ok(Path::new(&path).exists())
}

#[derive(Debug, Type, serde::Serialize)]
pub struct FileMetadata {
    pub last_modified: u32,
}

#[tauri::command]
#[specta::specta]
pub async fn get_file_metadata(path: String) -> Result<FileMetadata, Error> {
    let metadata = std::fs::metadata(path)?;
    let last_modified = metadata
        .modified()?
        .duration_since(std::time::SystemTime::UNIX_EPOCH)?;
    Ok(FileMetadata {
        last_modified: last_modified.as_secs() as u32,
    })
}
