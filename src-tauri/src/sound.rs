#[cfg(target_os = "linux")]
use once_cell::sync::OnceCell;

#[cfg(target_os = "linux")]
static SOUND_SERVER_PORT: OnceCell<u16> = OnceCell::new();

#[cfg(target_os = "linux")]
pub fn start_sound_server(
    resource_dir: std::path::PathBuf,
) -> Result<u16, Box<dyn std::error::Error>> {
    use axum::{extract, routing::get, Router};
    use std::sync::Arc;

    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    SOUND_SERVER_PORT
        .set(port)
        .map_err(|_| "Sound server port already set")?;

    let sound_dir = Arc::new(resource_dir.join("sound"));

    let app = Router::new()
        .route("/sound/*path", get(serve_sound))
        .layer(extract::Extension(sound_dir));

    tokio::spawn(async move {
        let server = axum::Server::from_tcp(listener)
            .expect("Failed to create sound server from TCP listener")
            .serve(app.into_make_service());
        if let Err(e) = server.await {
            log::error!("Sound server error: {}", e);
        }
    });

    log::info!("Sound server started on port {}", port);
    Ok(port)
}

#[cfg(target_os = "linux")]
async fn serve_sound(
    axum::extract::Extension(sound_dir): axum::extract::Extension<
        std::sync::Arc<std::path::PathBuf>,
    >,
    axum::extract::Path(path): axum::extract::Path<String>,
    headers: axum::http::HeaderMap,
) -> axum::response::Response {
    use axum::http::{header, StatusCode};
    use axum::response::IntoResponse;

    let path = path.strip_prefix('/').unwrap_or(&path);

    if path.contains("..") {
        return StatusCode::FORBIDDEN.into_response();
    }

    let file_path = sound_dir.join(path);

    if let (Ok(canonical_file), Ok(canonical_dir)) =
        (file_path.canonicalize(), sound_dir.canonicalize())
    {
        if !canonical_file.starts_with(&canonical_dir) {
            return StatusCode::FORBIDDEN.into_response();
        }
    }

    let data = match tokio::fs::read(&file_path).await {
        Ok(d) => d,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };

    let total_size = data.len();
    let content_type = if path.ends_with(".mp3") {
        "audio/mpeg"
    } else if path.ends_with(".ogg") {
        "audio/ogg"
    } else if path.ends_with(".wav") {
        "audio/wav"
    } else if path.ends_with(".flac") {
        "audio/flac"
    } else {
        "application/octet-stream"
    };

    if let Some(range_value) = headers.get(header::RANGE) {
        if let Ok(range_str) = range_value.to_str() {
            if let Some((start, end)) = parse_range(range_str, total_size) {
                let chunk = data[start..=end].to_vec();
                let mut h = axum::http::HeaderMap::new();
                h.insert(header::CONTENT_TYPE, content_type.parse().unwrap());
                h.insert(header::ACCEPT_RANGES, "bytes".parse().unwrap());
                h.insert(
                    header::CONTENT_RANGE,
                    format!("bytes {}-{}/{}", start, end, total_size)
                        .parse()
                        .unwrap(),
                );
                h.insert(
                    header::CONTENT_LENGTH,
                    chunk.len().to_string().parse().unwrap(),
                );
                return (StatusCode::PARTIAL_CONTENT, h, chunk).into_response();
            }
        }
    }

    let mut h = axum::http::HeaderMap::new();
    h.insert(header::CONTENT_TYPE, content_type.parse().unwrap());
    h.insert(header::ACCEPT_RANGES, "bytes".parse().unwrap());
    h.insert(
        header::CONTENT_LENGTH,
        total_size.to_string().parse().unwrap(),
    );
    (StatusCode::OK, h, data).into_response()
}

#[cfg(target_os = "linux")]
fn parse_range(range: &str, total_size: usize) -> Option<(usize, usize)> {
    let range = range.strip_prefix("bytes=")?;
    let mut parts = range.splitn(2, '-');
    let start: usize = parts.next()?.parse().ok()?;
    let end_str = parts.next()?;
    let end: usize = if end_str.is_empty() {
        total_size.checked_sub(1)?
    } else {
        end_str.parse().ok()?
    };
    if start > end || end >= total_size {
        return None;
    }
    Some((start, end))
}

#[tauri::command]
#[specta::specta]
pub fn get_sound_server_port() -> u16 {
    #[cfg(target_os = "linux")]
    {
        *SOUND_SERVER_PORT.get().unwrap_or(&0)
    }
    #[cfg(not(target_os = "linux"))]
    {
        0
    }
}
