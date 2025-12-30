use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, path::BaseDirectory};

use crate::error::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct VariantPosition {
    pub fen: String,
    pub engine: String,
    pub recommended_move: String,
    pub ms: i64,
}

fn get_variant_positions_db(app: &AppHandle) -> Result<Connection> {
    let db_path = app
        .path()
        .resolve("VariantPositions.db3", BaseDirectory::AppData)
        .map_err(|e| Error::PackageManager(format!("Failed to resolve VariantPositions DB path: {}", e)))?;

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            Error::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create VariantPositions directory: {}", e),
            ))
        })?;
    }

    let conn = Connection::open(&db_path)?;
    init_variant_positions_schema(&conn)?;
    Ok(conn)
}

fn init_variant_positions_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS variant_positions (
            fen TEXT NOT NULL,
            fen_key TEXT,
            engine TEXT NOT NULL,
            recommended_move TEXT NOT NULL,
            ms INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (fen, engine)
        );
        "#,
    )?;

    // Migration: older databases may not have fen_key.
    // SQLite does not support "ADD COLUMN IF NOT EXISTS", so we ignore the duplicate-column error.
    if let Err(err) = conn.execute("ALTER TABLE variant_positions ADD COLUMN fen_key TEXT", []) {
        let msg = err.to_string();
        if !msg.contains("duplicate column name") {
            return Err(err.into());
        }
    }

    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_variant_positions_fen_key
            ON variant_positions(fen_key);

        CREATE UNIQUE INDEX IF NOT EXISTS uniq_variant_positions_fen_key_engine
            ON variant_positions(fen_key, engine);

        CREATE INDEX IF NOT EXISTS idx_variant_positions_engine
            ON variant_positions(engine);
        "#,
    )?;

    // Backfill fen_key for older rows (if any).
    let mut stmt = conn.prepare("SELECT fen, engine FROM variant_positions WHERE fen_key IS NULL")?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<std::result::Result<Vec<(String, String)>, _>>()?;

    for (fen, engine) in rows {
        if let Some(key) = fen_identity_key(&fen) {
            conn.execute(
                "UPDATE variant_positions SET fen_key = ?1 WHERE fen = ?2 AND engine = ?3",
                params![key, fen, engine],
            )?;
        }
    }

    Ok(())
}

fn fen_identity_key(fen: &str) -> Option<String> {
    let parts: Vec<&str> = fen.split_whitespace().collect();
    if parts.len() < 4 {
        return None;
    }
    Some(parts[..4].join(" "))
}

fn fetch_variant_position(app: &AppHandle, fen: &str, engine: &str) -> Result<Option<VariantPosition>> {
    let conn = get_variant_positions_db(app)?;
    let fen_key = fen_identity_key(fen);
    let fen_key = match fen_key {
        Some(key) => key,
        None => return Ok(None),
    };

    let mut stmt = conn.prepare(
        r#"
        SELECT fen, engine, recommended_move, ms
        FROM variant_positions
        WHERE engine = ?1 AND fen_key = ?2
        ORDER BY ms DESC
        LIMIT 1
        "#,
    )?;

    let entry = stmt
        .query_row(params![engine, fen_key], |row| {
            Ok(VariantPosition {
                fen: row.get(0)?,
                engine: row.get(1)?,
                recommended_move: row.get(2)?,
                ms: row.get(3)?,
            })
        })
        .optional()?;

    Ok(entry)
}

fn upsert_variant_position_entry(
    app: &AppHandle,
    fen: &str,
    engine: &str,
    recommended_move: &str,
    ms: i64,
) -> Result<()> {
    let conn = get_variant_positions_db(app)?;
    let fen_key = match fen_identity_key(fen) {
        Some(key) => key,
        None => return Ok(()),
    };
    let safe_ms = ms.max(0);

    conn.execute(
        r#"
        INSERT INTO variant_positions (fen, fen_key, engine, recommended_move, ms, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(fen_key, engine) DO UPDATE SET
            fen = excluded.fen,
            recommended_move = excluded.recommended_move,
            ms = excluded.ms,
            updated_at = CURRENT_TIMESTAMP
        WHERE excluded.ms > variant_positions.ms
        "#,
        params![fen, fen_key, engine, recommended_move, safe_ms],
    )?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_variant_position(app: AppHandle, fen: String, engine: String) -> Result<Option<VariantPosition>> {
    let fen = fen.trim();
    let engine = engine.trim();
    if fen.is_empty() || engine.is_empty() {
        return Ok(None);
    }
    fetch_variant_position(&app, fen, engine)
}

#[tauri::command]
#[specta::specta]
pub fn upsert_variant_position(
    app: AppHandle,
    fen: String,
    engine: String,
    recommended_move: String,
    ms: i64,
) -> Result<()> {
    let fen = fen.trim();
    let engine = engine.trim();
    let recommended_move = recommended_move.trim();
    if fen.is_empty() || engine.is_empty() || recommended_move.is_empty() {
        return Ok(());
    }
    upsert_variant_position_entry(&app, fen, engine, recommended_move, ms)
}
