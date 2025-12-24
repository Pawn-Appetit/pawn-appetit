use std::path::{Path, PathBuf};

use log::{info, warn};
use reqwest::{Client, Url};
use specta::Type;
use tauri_specta::Event;
use tokio::io::AsyncWriteExt;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use futures_util::StreamExt;
use tauri::Manager;

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
    
    validate_destination_path(&app, &path)?;
    
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::limited(10)) // Follow up to 10 redirects
        .build()?;

    let mut req = client.get(&url);
    
    // Add User-Agent to mimic a browser
    req = req.header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    
    // Add Accept header for better compatibility
    req = req.header("Accept", "*/*");
    
    if let Some(ref token_val) = token {
        req = req.header("Authorization", format!("Bearer {}", token_val));
    }
    
    let res = req.send().await?;
    
    if !res.status().is_success() {
        let status = res.status();
        let error_msg = if status == 403 {
            "Download failed: Access denied (403). The server refused to authorize the request."
        } else if status == 404 {
            "Download failed: File not found (404). The file may have been moved or deleted."
        } else {
            &format!("Download failed: {}", status)
        };
        
        return Err(Error::PackageManager(error_msg.to_string()));
    }
    
    let response_to_use = res;
    let final_url = url.clone();
    
    let content_length = total_size_u64.or_else(|| response_to_use.content_length());
    
    if let Some(size) = content_length {
        if size > MAX_DOWNLOAD_SIZE {
            return Err(Error::PackageManager(format!(
                "File too large: {} bytes (max {})",
                size, MAX_DOWNLOAD_SIZE
            )));
        }
    }

    let is_archive = final_url.ends_with(".zip") || final_url.ends_with(".tar") || final_url.ends_with(".tar.gz");
    
    if is_archive {
        download_and_extract(response_to_use, content_length, &path, &final_url, &id, &app, finalize).await?;
    } else {
        download_to_file(response_to_use, content_length, &path, &id, &app, finalize).await?;
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
        tokio::fs::create_dir_all(parent).await?;
    }
    
    let mut file = tokio::fs::File::create(path).await?;
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
        
        file.write_all(&chunk).await?;
        
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
    
    file.sync_all().await?;

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
    // Production-grade: never load the full archive into RAM.
    // Stream into a temp file, then extract on a blocking thread.
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    let (tmp_file, tmp_path) = tokio::task::spawn_blocking(|| {
        let tmp = tempfile::NamedTempFile::new()?;
        let (file, path) = tmp.keep().map_err(|e| e.error)?;
        Ok::<_, std::io::Error>((file, path))
    })
    .await
    .map_err(|e| Error::PackageManager(format!("Failed to create temp file: {}", e)))??;

    let mut tmp_file = tokio::fs::File::from_std(tmp_file);

    while let Some(item) = stream.next().await {
        let chunk = item?;
        
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > MAX_DOWNLOAD_SIZE {
            return Err(Error::PackageManager(
                "Download size limit exceeded".to_string()
            ));
        }

        tmp_file.write_all(&chunk).await?;
        
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

    tmp_file.sync_all().await?;
    drop(tmp_file);

    let dest = path.to_path_buf();
    let tmp_path_clone = tmp_path.clone();
    let url = url.to_string();
    tokio::task::spawn_blocking(move || -> Result<(), Error> {
        if url.ends_with(".zip") {
            unzip_file_from_path(&dest, &tmp_path_clone)?;
        } else if url.ends_with(".tar") || url.ends_with(".tar.gz") {
            extract_tar_file_from_path(&dest, &tmp_path_clone, url.ends_with(".tar.gz"))?;
        } else {
            std::fs::create_dir_all(dest.parent().unwrap_or(Path::new(".")))?;
            std::fs::copy(&tmp_path_clone, &dest)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| Error::PackageManager(format!("Extraction task failed: {}", e)))??;

    let _ = std::fs::remove_file(&tmp_path);
    
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

fn validate_destination_path(app: &tauri::AppHandle, path: &Path) -> Result<(), Error> {
    if !path.is_absolute() {
        return Err(Error::PackageManager("Destination path must be absolute".to_string()));
    }

    // Reject any parent-dir traversal segments outright.
    if path.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(Error::PackageManager("Destination path contains '..'".to_string()));
    }

    // Only allow writes under app-specific directories.
    let allowed_roots = [
        app.path().app_data_dir(),
        app.path().app_cache_dir(),
        app.path().config_dir(),
    ];

    let mut allowed = false;
    for root in allowed_roots.into_iter().flatten() {
        if path.starts_with(&root) {
            allowed = true;
            break;
        }
    }

    if !allowed {
        return Err(Error::PackageManager(
            "Destination must be inside the app data/cache/config directories".to_string(),
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

fn unzip_file_from_path(dest_dir: &Path, archive_path: &Path) -> Result<(), Error> {
    let file = std::fs::File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    std::fs::create_dir_all(dest_dir)?;
    let base_path = dest_dir.canonicalize()?;
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
            warn!("Skipping potentially malicious file path: {:?}", file.name());
            continue;
        }

        if file.is_dir() {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p)?;
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

fn extract_tar_file_from_path(dest_dir: &Path, archive_path: &Path, is_gz: bool) -> Result<(), Error> {
    use flate2::read::GzDecoder;
    use std::io::Read;

    std::fs::create_dir_all(dest_dir)?;
    let base_path = dest_dir.canonicalize()?;

    let file = std::fs::File::open(archive_path)?;
    let reader: Box<dyn Read> = if is_gz {
        Box::new(GzDecoder::new(file))
    } else {
        Box::new(file)
    };

    let mut archive = tar::Archive::new(reader);
    archive.set_overwrite(true);
    archive.set_preserve_permissions(true);

    // Extract safely: `Entry::unpack_in` prevents path traversal.
    for entry in archive.entries()? {
        let mut entry = entry?;
        entry.unpack_in(&base_path)?;
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