use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel::connection::SimpleConnection;
use std::path::{PathBuf, Path};
use tauri::{path::BaseDirectory, AppHandle, Manager};
use log::{info, debug};

use crate::error::Error;
use crate::db::PositionStats;

/// Normalize database path for consistent comparison
/// Attempts to canonicalize the path, falls back to normalizing separators
pub fn normalize_db_path(path: &Path) -> String {
    // Try to canonicalize first (resolves symlinks, absolute paths, etc.)
    if let Ok(canonical) = path.canonicalize() {
        canonical.to_string_lossy().to_string()
    } else {
        // Fallback: normalize separators and convert to string
        // Replace backslashes with forward slashes for consistency
        path.to_string_lossy().replace('\\', "/")
    }
}

diesel::table! {
    position_cache (id) {
        id -> Integer,
        fen -> Text,
        database_path -> Text,
        created_at -> Text,
    }
}

diesel::table! {
    position_stats (id) {
        id -> Integer,
        position_id -> Integer,
        #[sql_name = "move"]
        move_ -> Text,
        white -> Integer,
        draw -> Integer,
        black -> Integer,
        total -> Integer,
    }
}

diesel::table! {
    position_games (id) {
        id -> Integer,
        position_id -> Integer,
        game_id -> Integer,
        game_order -> Integer,
    }
}

diesel::joinable!(position_stats -> position_cache (position_id));
diesel::joinable!(position_games -> position_cache (position_id));

diesel::allow_tables_to_appear_in_same_query!(position_cache, position_stats, position_games);

/// Get or create the position cache database connection
fn get_cache_db(app: &AppHandle) -> Result<SqliteConnection, Error> {
    let db_path = app.path()
        .resolve("position_cache.db3", BaseDirectory::AppData)
        .map_err(|e| Error::PackageManager(format!("Failed to resolve cache DB path: {}", e)))?;
    
    // Ensure parent directory exists
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| Error::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create cache directory: {}", e)
            )))?;
    }
    
    let mut conn = SqliteConnection::establish(
        db_path.to_str().ok_or_else(|| Error::PackageManager("Invalid cache DB path".to_string()))?
    )?;
    
    // Initialize schema if needed
    init_cache_schema(&mut conn)?;
    
    Ok(conn)
}

/// Initialize the cache database schema
fn init_cache_schema(conn: &mut SqliteConnection) -> Result<(), Error> {
    conn.batch_execute(
        r#"
        CREATE TABLE IF NOT EXISTS position_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fen TEXT NOT NULL,
            database_path TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(fen, database_path)
        );
        
        CREATE INDEX IF NOT EXISTS idx_position_cache_fen_db 
            ON position_cache(fen, database_path);
        
        CREATE TABLE IF NOT EXISTS position_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id INTEGER NOT NULL,
            "move" TEXT NOT NULL,
            white INTEGER NOT NULL DEFAULT 0,
            draw INTEGER NOT NULL DEFAULT 0,
            black INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (position_id) REFERENCES position_cache(id) ON DELETE CASCADE,
            UNIQUE(position_id, "move")
        );
        
        CREATE INDEX IF NOT EXISTS idx_position_stats_position_id 
            ON position_stats(position_id);
        
        CREATE TABLE IF NOT EXISTS position_games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id INTEGER NOT NULL,
            game_id INTEGER NOT NULL,
            game_order INTEGER NOT NULL,
            FOREIGN KEY (position_id) REFERENCES position_cache(id) ON DELETE CASCADE,
            UNIQUE(position_id, game_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_position_games_position_id 
            ON position_games(position_id);
        
        CREATE INDEX IF NOT EXISTS idx_position_games_game_id 
            ON position_games(game_id);
        "#
    )?;
    
    Ok(())
}

/// Check if a position is cached for a given database
pub fn is_position_cached(
    app: &AppHandle,
    fen: &str,
    database_path: &PathBuf,
) -> Result<bool, Error> {
    let mut conn = get_cache_db(app)?;
    let db_path_str = normalize_db_path(database_path);
    
    debug!("Checking cache for FEN: {} in DB: {}", fen, db_path_str);
    
    let count: i64 = position_cache::table
        .filter(position_cache::fen.eq(fen))
        .filter(position_cache::database_path.eq(&db_path_str))
        .count()
        .get_result(&mut conn)?;
    
    let cached = count > 0;
    debug!("Cache check result: {} (count: {})", cached, count);
    
    Ok(cached)
}

/// Get cached position data
pub fn get_cached_position(
    app: &AppHandle,
    fen: &str,
    database_path: &PathBuf,
) -> Result<Option<(Vec<PositionStats>, Vec<i32>)>, Error> {
    let mut conn = get_cache_db(app)?;
    let db_path_str = normalize_db_path(database_path);
    
    debug!("Loading cached data for FEN: {} in DB: {}", fen, db_path_str);
    
    // Find the position cache entry
    let cache_entry: Option<i32> = position_cache::table
        .select(position_cache::id)
        .filter(position_cache::fen.eq(fen))
        .filter(position_cache::database_path.eq(&db_path_str))
        .first(&mut conn)
        .optional()?;
    
    let position_id = match cache_entry {
        Some(id) => id,
        None => return Ok(None),
    };
    
    // Load stats
    let stats_rows: Vec<(String, i32, i32, i32, i32)> = position_stats::table
        .select((
            position_stats::move_,
            position_stats::white,
            position_stats::draw,
            position_stats::black,
            position_stats::total,
        ))
        .filter(position_stats::position_id.eq(position_id))
        .load(&mut conn)?;
    
    let stats: Vec<PositionStats> = stats_rows
        .into_iter()
        .map(|(move_, white, draw, black, _total)| PositionStats {
            move_,
            white,
            draw,
            black,
        })
        .collect();
    
    // Load game IDs (ordered by game_order)
    let game_ids: Vec<i32> = position_games::table
        .select(position_games::game_id)
        .filter(position_games::position_id.eq(position_id))
        .order(position_games::game_order.asc())
        .load(&mut conn)?;
    
    debug!("Loaded {} stats and {} game IDs from cache", stats.len(), game_ids.len());
    
    Ok(Some((stats, game_ids)))
}

/// Save position data to cache
pub fn save_position_cache(
    app: &AppHandle,
    fen: &str,
    database_path: &PathBuf,
    stats: &[PositionStats],
    game_ids: &[i32],
) -> Result<(), Error> {
    let mut conn = get_cache_db(app)?;
    let db_path_str = normalize_db_path(database_path);
    
    debug!("Saving cache for FEN: {} in DB: {} ({} stats, {} games)", 
           fen, db_path_str, stats.len(), game_ids.len());
    
    conn.transaction::<_, Error, _>(|conn| {
        // Insert or get position cache entry
        let position_id: i32 = {
            // Try to get existing entry
            let existing: Option<i32> = position_cache::table
                .select(position_cache::id)
                .filter(position_cache::fen.eq(fen))
                .filter(position_cache::database_path.eq(&db_path_str))
                .first(conn)
                .optional()?;
            
            if let Some(cache_id) = existing {
                // Delete old stats and games
                diesel::delete(
                    position_stats::table
                        .filter(position_stats::position_id.eq(cache_id))
                ).execute(conn)?;
                diesel::delete(
                    position_games::table
                        .filter(position_games::position_id.eq(cache_id))
                ).execute(conn)?;
                cache_id
            } else {
                // Insert new entry
                diesel::insert_into(position_cache::table)
                    .values((
                        position_cache::fen.eq(fen),
                        position_cache::database_path.eq(&db_path_str),
                    ))
                    .execute(conn)?;
                
                // Get the inserted ID
                position_cache::table
                    .select(position_cache::id)
                    .filter(position_cache::fen.eq(fen))
                    .filter(position_cache::database_path.eq(&db_path_str))
                    .first(conn)?
            }
        };
        
        // Insert stats
        for stat in stats {
            let total = stat.white + stat.draw + stat.black;
            diesel::insert_into(position_stats::table)
                .values((
                    position_stats::position_id.eq(position_id),
                    position_stats::move_.eq(&stat.move_),
                    position_stats::white.eq(stat.white),
                    position_stats::draw.eq(stat.draw),
                    position_stats::black.eq(stat.black),
                    position_stats::total.eq(total),
                ))
                .execute(conn)?;
        }
        
        // Insert game IDs (limit to 1000)
        let games_to_save = game_ids.iter().take(1000).enumerate();
        for (order, &game_id) in games_to_save {
            diesel::insert_into(position_games::table)
                .values((
                    position_games::position_id.eq(position_id),
                    position_games::game_id.eq(game_id),
                    position_games::game_order.eq(order as i32),
                ))
                .execute(conn)?;
        }
        
        Ok(())
    })?;
    
    info!("Cached position data for FEN: {} ({} stats, {} games)", fen, stats.len(), game_ids.len().min(1000));
    
    Ok(())
}

/// Clear cache for a specific database (when database is deleted)
pub fn clear_cache_for_database(
    app: &AppHandle,
    database_path: &PathBuf,
) -> Result<(), Error> {
    let mut conn = get_cache_db(app)?;
    let db_path_str = normalize_db_path(database_path);
    
    // Find all position IDs for this database
    let position_ids: Vec<i32> = position_cache::table
        .select(position_cache::id)
        .filter(position_cache::database_path.eq(&db_path_str))
        .load(&mut conn)?;
    
    if position_ids.is_empty() {
        return Ok(());
    }
    
    conn.transaction::<_, Error, _>(|conn| {
        // Delete stats and games (cascade should handle this, but explicit is safer)
        for pos_id in &position_ids {
            diesel::delete(
                position_stats::table
                    .filter(position_stats::position_id.eq(*pos_id))
            ).execute(conn)?;
            diesel::delete(
                position_games::table
                    .filter(position_games::position_id.eq(*pos_id))
            ).execute(conn)?;
        }
        
        // Delete cache entries
        diesel::delete(
            position_cache::table
                .filter(position_cache::database_path.eq(&db_path_str))
        ).execute(conn)?;
        
        Ok(())
    })?;
    
    info!("Cleared cache for database: {}", db_path_str);
    
    Ok(())
}

