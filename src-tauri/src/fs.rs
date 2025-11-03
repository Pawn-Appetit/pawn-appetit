use std::{
    fs::create_dir_all,
    io::{Cursor, Write},
    path::{Path, PathBuf},
};

use log::{info, warn};
use reqwest::{Client, Url};
use specta::Type;
use tauri_specta::Event;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use futures_util::StreamExt;

use crate::error::Error;

const MAX_DOWNLOAD_SIZE: u64 = 10 * 1024 * 1024 * 1024;

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
    total_size: Option<f64>,
) -> Result<(), Error> {
    let finalize = finalize.unwrap_or(true);
    
    // Convert f64 to u64 if total_size is provided
    let total_size_u64 = total_size.and_then(|size| {
        if size >= 0.0 && size <= u64::MAX as f64 {
            Some(size as u64)
        } else {
            None
        }
    });
    
    let parsed_url = Url::parse(&url).map_err(|e| {
        Error::PackageManager(format!("Invalid URL: {}", e))
    })?;
    
    if parsed_url.scheme() != "https" && parsed_url.scheme() != "http" {
        return Err(Error::PackageManager(format!(
            "Only HTTP/HTTPS allowed, got: {}",
            parsed_url.scheme()
        )));
    }
    
    if let Some(host) = parsed_url.host_str() {
        if is_private_or_localhost(host) {
            return Err(Error::PackageManager(format!(
                "Cannot access private/local addresses: {}",
                host
            )));
        }
    }
    
    info!("Downloading file from {} to {}", url, path.display());
    
    validate_destination_path(&path)?;
    
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()?;

    let mut req = client.get(&url);
    
    if let Some(token) = token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }
    
    let res = req.send().await?;
    
    if !res.status().is_success() {
        return Err(Error::PackageManager(format!(
            "Download failed: {}",
            res.status()
        )));
    }
    
    let content_length = total_size_u64.or_else(|| res.content_length());
    
    if let Some(size) = content_length {
        if size > MAX_DOWNLOAD_SIZE {
            return Err(Error::PackageManager(format!(
                "File too large: {} bytes (max {})",
                size, MAX_DOWNLOAD_SIZE
            )));
        }
    }

    let is_archive = url.ends_with(".zip") || url.ends_with(".tar") || url.ends_with(".tar.gz");
    
    if is_archive {
        download_and_extract(res, content_length, &path, &url, &id, &app, finalize).await?;
    } else {
        download_to_file(res, content_length, &path, &id, &app, finalize).await?;
    }
    
    Ok(())
}

async fn download_to_file(
    res: reqwest::Response,
    content_length: Option<u64>,
    path: &Path,
    id: &str,
    app: &tauri::AppHandle,
    finalize: bool,
) -> Result<(), Error> {
    if let Some(parent) = path.parent() {
        create_dir_all(parent)?;
    }
    
    let mut file = std::fs::File::create(path)?;
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item?;
        
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > MAX_DOWNLOAD_SIZE {
            return Err(Error::PackageManager(
                "Download size limit exceeded".to_string()
            ));
        }
        
        file.write_all(&chunk)?;
        
        let progress = content_length
            .map(|total| ((downloaded as f64 / total as f64) * 100.0).min(100.0) as f32)
            .unwrap_or(-1.0);

        DownloadProgress {
            progress,
            id: id.to_string(),
            finished: false,
        }
        .emit(app)?;
    }
    
    file.sync_all()?;

    info!("Downloaded file to {}", path.display());

    if finalize {
        DownloadProgress {
            progress: 100.0,
            id: id.to_string(),
            finished: true,
        }
        .emit(app)?;
    }
    
    Ok(())
}

async fn download_and_extract(
    res: reqwest::Response,
    content_length: Option<u64>,
    path: &Path,
    url: &str,
    id: &str,
    app: &tauri::AppHandle,
    finalize: bool,
) -> Result<(), Error> {
    let mut file_data: Vec<u8> = if let Some(size) = content_length {
        Vec::with_capacity(size.min(MAX_DOWNLOAD_SIZE) as usize)
    } else {
        Vec::new()
    };
    
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item?;
        
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > MAX_DOWNLOAD_SIZE {
            return Err(Error::PackageManager(
                "Download size limit exceeded".to_string()
            ));
        }
        
        file_data.extend_from_slice(&chunk);
        
        // Progress for download phase (0-50%)
        let progress = content_length
            .map(|total| ((downloaded as f64 / total as f64) * 50.0).min(50.0) as f32)
            .unwrap_or(-1.0);

        DownloadProgress {
            progress,
            id: id.to_string(),
            finished: false,
        }
        .emit(app)?;
    }

    info!("Downloaded {} bytes, starting extraction to {}", downloaded, path.display());
    
    DownloadProgress {
        progress: 50.0,
        id: id.to_string(),
        finished: false,
    }
    .emit(app)?;

    if url.ends_with(".zip") {
        unzip_file(path, file_data)?;
    } else if url.ends_with(".tar") || url.ends_with(".tar.gz") {
        extract_tar_file(path, file_data)?;
    } else {
        std::fs::write(path, file_data)?;
    }
    
    info!("Extraction complete");

    if finalize {
        DownloadProgress {
            progress: 100.0,
            id: id.to_string(),
            finished: true,
        }
        .emit(app)?;
    }
    
    Ok(())
}

fn validate_destination_path(path: &Path) -> Result<(), Error> {
    let canonical = path.canonicalize().or_else(|_| {
        if let Some(parent) = path.parent() {
            if parent.exists() {
                parent.canonicalize().map(|p| p.join(path.file_name().unwrap()))
            } else {
                Err(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "Parent directory does not exist",
                ))
            }
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Invalid path",
            ))
        }
    })?;

    let path_str = canonical.to_string_lossy();
    if path_str.contains("..") {
        return Err(Error::PackageManager(
            "Path contains '..'".to_string(),
        ));
    }

    Ok(())
}

fn is_private_or_localhost(host: &str) -> bool {
    use std::net::IpAddr;
    
    if host == "localhost" || host == "::1" {
        return true;
    }
    
    // Try parsing as IP address
    if let Ok(ip) = host.parse::<IpAddr>() {
        match ip {
            IpAddr::V4(ipv4) => {
                let octets = ipv4.octets();
                // 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 0.0.0.0/8
                octets[0] == 127 
                    || octets[0] == 10 
                    || octets[0] == 0
                    || (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31)
                    || (octets[0] == 192 && octets[1] == 168)
            }
            IpAddr::V6(ipv6) => {
                ipv6.is_loopback() || ipv6.is_unspecified()
            }
        }
    } else {
        false
    }
}

pub fn unzip_file(path: &Path, file: Vec<u8>) -> Result<(), Error> {
    let mut archive = zip::ZipArchive::new(Cursor::new(file))?;
    
    create_dir_all(path)?;
    let base_path = path.canonicalize()?;
    let archive_len = archive.len();
    
    for i in 0..archive_len {
        let mut file = archive.by_index(i)?;
        
        let file_path = file.enclosed_name().ok_or_else(|| {
            Error::PackageManager(format!(
                "Invalid file path in archive at index {}: {:?}",
                i,
                file.name()
            ))
        })?;
        
        let outpath = base_path.join(file_path);
        
        if !outpath.starts_with(&base_path) {
            warn!(
                "Skipping potentially malicious file path: {:?}",
                file.name()
            );
            continue;
        }
        
        if file.is_dir() {
            info!(
                "Creating directory from archive: \"{}\"",
                outpath.display()
            );
            create_dir_all(&outpath)?;
        } else {
            let file_size = file.size();
            info!(
                "Extracting file {} of {}: \"{}\" ({} bytes)",
                i + 1,
                archive_len,
                outpath.display(),
                file_size
            );
            
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    create_dir_all(p)?;
                }
            }
            
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
            outfile.sync_all()?;
            
            #[cfg(unix)]
            {
                if let Some(mode) = file.unix_mode() {
                    use std::fs::Permissions;
                    std::fs::set_permissions(&outpath, Permissions::from_mode(mode))?;
                }
            }
        }
    }
    
    Ok(())
}

fn extract_tar_file(path: &Path, file: Vec<u8>) -> Result<(), Error> {
    let mut archive = tar::Archive::new(Cursor::new(file));
    
    create_dir_all(path)?;
    let base_path = path.canonicalize()?;
    
    archive.set_overwrite(true);
    archive.set_preserve_permissions(true);
    
    for entry in archive.entries()? {
        let mut entry = entry?;
        let entry_path = entry.path()?;
        let full_path = base_path.join(&*entry_path);
        
        if !full_path.starts_with(&base_path) {
            warn!(
                "Skipping malicious tar path: {:?}",
                entry_path
            );
            continue;
        }
        
        info!(
            "Extracting from tar: \"{}\" ({} bytes)",
            full_path.display(),
            entry.size()
        );
        
        entry.unpack(&full_path)?;
    }
    
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_file_as_executable(path: String) -> Result<(), Error> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(Error::PackageManager(format!(
            "File does not exist: {}",
            path.display()
        )));
    }
    
    if !path.is_file() {
        return Err(Error::PackageManager(format!(
            "Not a file: {}",
            path.display()
        )));
    }
    
    #[cfg(unix)]
    {
        let metadata = std::fs::metadata(path)?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions)?;
        info!("Set file as executable: {}", path.display());
    }
    
    #[cfg(not(unix))]
    {
        warn!(
            "set_file_as_executable called on Windows for: {}",
            path.display()
        );
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
    pub last_modified: u64,
    pub size: u64,
    pub is_dir: bool,
    pub is_readonly: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn get_file_metadata(path: String) -> Result<FileMetadata, Error> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(Error::PackageManager(format!(
            "File does not exist: {}",
            path.display()
        )));
    }
    
    let metadata = std::fs::metadata(path)?;
    let last_modified = metadata
        .modified()?
        .duration_since(std::time::SystemTime::UNIX_EPOCH)?;
    
    Ok(FileMetadata {
        last_modified: last_modified.as_secs(),
        size: metadata.len(),
        is_dir: metadata.is_dir(),
        is_readonly: metadata.permissions().readonly(),
    })
}