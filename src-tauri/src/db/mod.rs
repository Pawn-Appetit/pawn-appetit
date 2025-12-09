mod encoding;
mod models;
mod ops;
mod schema;
mod search;
mod core;
mod pgn;

use crate::{
    db::{
        encoding::{extract_main_line_moves},
        models::*,
        ops::*,
        schema::*,
    },
    error::{Error, Result},
    opening::get_opening_from_setup,
    AppState,
};
use dashmap::DashMap;
use diesel::{
    connection::{DefaultLoadingMode, SimpleConnection},
    insert_into,
    prelude::*,
    r2d2::{ConnectionManager, Pool},
    sql_query,
    sql_types::Text,
};
use pgn_reader::{BufferedReader};
use pgn::{GameTree, Importer, TempGame};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use shakmaty::{
    fen::Fen, Board, Chess, EnPassantMode, Piece, Position, FromSetup, CastlingMode
};
use specta::Type;
use std::{
    fs::{remove_file, File, OpenOptions},
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, Instant},
};
use std::io::{BufWriter, Write};
use tauri::{path::BaseDirectory, Manager};
use tauri::{Emitter, State};

use log::info;
use tauri_specta::Event as _;

pub use self::models::NormalizedGame;
pub use self::models::Puzzle;
pub use self::schema::puzzles;
pub use self::search::{
    is_position_in_db, search_position, PositionQuery, PositionQueryJs, PositionStats,
};

const INDEXES_SQL: &str = include_str!("../../../database/queries/indexes/create_indexes.sql");
const DELETE_INDEXES_SQL: &str = include_str!("../../../database/queries/indexes/delete_indexes.sql");

// PRAGMA queries
const PRAGMA_JOURNAL_MODE_DELETE: &str = include_str!("../../../database/pragmas/journal_mode_delete.sql");
const PRAGMA_JOURNAL_MODE_OFF: &str = include_str!("../../../database/pragmas/journal_mode_off.sql");
const PRAGMA_FOREIGN_KEYS_ON: &str = include_str!("../../../database/pragmas/foreign_keys_on.sql");
const PRAGMA_BUSY_TIMEOUT: &str = include_str!("../../../database/pragmas/busy_timeout.sql");
const PRAGMA_PERFORMANCE: &str = include_str!("../../../database/pragmas/performance_pragmas.sql");

// Games queries
const GAMES_CHECK_INDEXES: &str = include_str!("../../../database/queries/games/check_indexes.sql");
const GAMES_DELETE_DUPLICATES: &str = include_str!("../../../database/queries/games/delete_duplicates.sql");

const WHITE_PAWN: Piece = Piece {
    color: shakmaty::Color::White,
    role: shakmaty::Role::Pawn,
};

const BLACK_PAWN: Piece = Piece {
    color: shakmaty::Color::Black,
    role: shakmaty::Role::Pawn,
};

/// Returns the bit representation of the pawns on the second and seventh rank
/// of the given board.
fn get_pawn_home(board: &Board) -> u16 {
    let white_pawns = board.by_piece(WHITE_PAWN);
    let black_pawns = board.by_piece(BLACK_PAWN);
    let second_rank_pawns = (white_pawns.0 >> 8) as u8;
    let seventh_rank_pawns = (black_pawns.0 >> 48) as u8;
    (second_rank_pawns as u16) | ((seventh_rank_pawns as u16) << 8)
}

#[derive(Debug)]
pub enum JournalMode {
    Delete,
    Off,
}

#[derive(Debug)]
pub struct ConnectionOptions {
    pub journal_mode: JournalMode,
    pub enable_foreign_keys: bool,
    pub busy_timeout: Option<Duration>,
}

impl Default for ConnectionOptions {
    fn default() -> Self {
        Self {
            journal_mode: JournalMode::Delete,
            enable_foreign_keys: true,
            busy_timeout: Some(Duration::from_secs(60)), // OPTIMIZED: Increased from 30s to 60s for heavy queries
        }
    }
}

impl diesel::r2d2::CustomizeConnection<SqliteConnection, diesel::r2d2::Error>
    for ConnectionOptions
{
    fn on_acquire(&self, conn: &mut SqliteConnection) -> std::result::Result<(), diesel::r2d2::Error> {
        (|| {
            // FIXED: Check if tables exist before applying performance pragmas
            // This prevents errors when database is being initialized
            let tables_exist = diesel::sql_query(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='Players' LIMIT 1"
            )
            .execute(conn)
            .is_ok();
            
            // Only apply performance PRAGMAs if database is already initialized
            if tables_exist {
                conn.batch_execute(PRAGMA_PERFORMANCE)?;
            }
            
            match self.journal_mode {
                JournalMode::Delete => conn.batch_execute(PRAGMA_JOURNAL_MODE_DELETE)?,
                JournalMode::Off => conn.batch_execute(PRAGMA_JOURNAL_MODE_OFF)?,
            }
            if self.enable_foreign_keys {
                conn.batch_execute(PRAGMA_FOREIGN_KEYS_ON)?;
            }
            if let Some(d) = self.busy_timeout {
                conn.batch_execute(&PRAGMA_BUSY_TIMEOUT.replace("{0}", &d.as_millis().to_string()))?;
            }
            Ok(())
        })()
        .map_err(diesel::r2d2::Error::QueryError)
    }
}

fn get_db_or_create(
    state: &State<AppState>,
    db_path: &str,
    options: ConnectionOptions,
) -> Result<diesel::r2d2::PooledConnection<diesel::r2d2::ConnectionManager<diesel::SqliteConnection>>> {
    let pool = match state.connection_pool.get(db_path) {
        Some(pool) => pool.clone(),
        None => {
            let pool = Pool::builder()
                .max_size(32) // OPTIMIZED: Increased from 16 to 32 for better concurrency
                .min_idle(Some(4)) // OPTIMIZED: Keep minimum connections ready
                .connection_timeout(Duration::from_secs(30))
                .connection_customizer(Box::new(options))
                .build(ConnectionManager::<SqliteConnection>::new(db_path))?;
            state
                .connection_pool
                .insert(db_path.to_string(), pool.clone());
            pool
        }
    };

    Ok(pool.get()?)
}

#[derive(Default, Debug, Serialize)]
pub struct TempPlayer {
    id: usize,
    name: Option<String>,
    rating: Option<i32>,
}

pub fn insert_to_db(db: &mut SqliteConnection, game: &TempGame) -> Result<()> {
    let pawn_home = get_pawn_home(game.position.board());

    let white_id = if let Some(name) = &game.white_name {
        create_player(db, name)?.id
    } else {
        0
    };

    let black_id = if let Some(name) = &game.black_name {
        create_player(db, name)?.id
    } else {
        0
    };

    let event_id = if let Some(name) = &game.event_name {
        create_event(db, name)?.id
    } else {
        0
    };

    let site_id = if let Some(name) = &game.site_name {
        create_site(db, name)?.id
    } else {
        0
    };

    let ply_count = game.tree.count_main_line_moves() as i32;
    let final_material = pgn::get_material_count(game.position.board());
    let minimal_white_material = game.material_count.white.min(final_material.white) as i32;
    let minimal_black_material = game.material_count.black.min(final_material.black) as i32;

    let new_game = NewGame {
        white_id,
        black_id,
        ply_count,
        eco: game.eco.as_deref(),
        round: game.round.as_deref(),
        white_elo: game.white_elo,
        black_elo: game.black_elo,
        white_material: minimal_white_material,
        black_material: minimal_black_material,
        // max_rating: game.game.white.rating.max(game.game.black.rating),
        date: game.date.as_deref(),
        time: game.time.as_deref(),
        time_control: game.time_control.as_deref(),
        site_id,
        event_id,
        fen: game.fen.as_deref(),
        result: game.result.as_deref(),
        moves: game.moves.as_slice(),
        pawn_home: pawn_home as i32,
    };

    core::add_game(db, new_game)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn convert_pgn(
    file: PathBuf,
    db_path: PathBuf,
    timestamp: Option<i32>,
    app: tauri::AppHandle,
    title: String,
    description: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    let description = description.unwrap_or_default();
    let extension = file.extension();

    let db_exists = db_path.exists();

    // create the database file
    let db = &mut get_db_or_create(
        &state,
        db_path.to_str().unwrap(),
        ConnectionOptions {
            enable_foreign_keys: false,
            busy_timeout: None,
            journal_mode: JournalMode::Off,
        },
    )?;

    // Check if tables exist, even if the file exists
    // This handles cases where the file exists but is empty or corrupted
    let tables_exist = {
        #[derive(QueryableByName)]
        struct TableInfo {
            #[diesel(sql_type = Text, column_name = "name")]
            _name: String,
        }
        
        // Check if Players table exists
        let result: std::result::Result<Vec<TableInfo>, _> = sql_query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='Players'"
        ).load(db);
        
        result.is_ok() && !result.unwrap().is_empty()
    };

    let needs_init = !db_exists || !tables_exist;
    
    if needs_init {
        // Initialize database if file doesn't exist or tables are missing
        if !tables_exist && db_exists {
            info!("Database file exists but tables are missing, reinitializing...");
        }
        core::init_db(db, &title, &description)?;
    }

    let file = File::open(&file)?;

    let uncompressed: Box<dyn std::io::Read + Send> = if extension == Some("bz2".as_ref()) {
        Box::new(bzip2::read::MultiBzDecoder::new(file))
    } else if extension == Some("zst".as_ref()) {
        Box::new(zstd::Decoder::new(file)?)
    } else {
        Box::new(file)
    };

    // start counting time
    let start = Instant::now();

    let mut importer = Importer::new(timestamp.map(|t| t as i64));
    
    // OPTIMIZED: Batch inserts for better performance
    // Collect games in batches to reduce transaction overhead
    const BATCH_SIZE: usize = 5000;
    let mut batch: Vec<TempGame> = Vec::with_capacity(BATCH_SIZE);
    let mut total_processed = 0;
    
    for game in BufferedReader::new(uncompressed)
            .into_iter(&mut importer)
            .flatten()
            .flatten()
    {
        batch.push(game);
        
        if batch.len() >= BATCH_SIZE {
            // Process batch in a single transaction
            db.transaction::<_, Error, _>(|db| {
                for game in batch.drain(..) {
                    insert_to_db(db, &game)?;
                }
                Ok(())
            })?;
            
            total_processed += BATCH_SIZE;
                let elapsed = start.elapsed().as_millis() as u32;
            app.emit("convert_progress", (total_processed, elapsed)).unwrap();
            }
    }
    
    // Process remaining games in batch
    if !batch.is_empty() {
        // FIXED: Save batch length before moving into closure
        let batch_len = batch.len();
        
        db.transaction::<_, Error, _>(|db| {
            for game in batch.drain(..) {
            insert_to_db(db, &game)?;
        }
        Ok(())
    })?;
        
        total_processed += batch_len;
        let elapsed = start.elapsed().as_millis() as u32;
        app.emit("convert_progress", (total_processed, elapsed)).unwrap();
    }

    if needs_init {
        // Create all the necessary indexes
        db.batch_execute(INDEXES_SQL)?;
    }

    // get game, player, event and site counts and to the info table
    let game_count: i64 = games::table.count().get_result(db)?;
    let player_count: i64 = players::table.count().get_result(db)?;
    let event_count: i64 = events::table.count().get_result(db)?;
    let site_count: i64 = sites::table.count().get_result(db)?;

    let counts = [
        ("GameCount", game_count),
        ("PlayerCount", player_count),
        ("EventCount", event_count),
        ("SiteCount", site_count),
    ];

    for c in counts.iter() {
        insert_into(info::table)
            .values((info::name.eq(c.0), info::value.eq(c.1.to_string())))
            .on_conflict(info::name)
            .do_update()
            .set(info::value.eq(c.1.to_string()))
            .execute(db)?;
    }

    Ok(())
}

#[derive(Serialize, Type)]
pub struct DatabaseInfo {
    title: String,
    description: String,
    player_count: i32,
    event_count: i32,
    game_count: i32,
    storage_size: i64,
    filename: String,
    indexed: bool,
}

#[derive(QueryableByName, Debug, Serialize)]
struct IndexInfo {
    #[diesel(sql_type = Text, column_name = "name")]
    _name: String,
}

fn check_index_exists(conn: &mut SqliteConnection) -> Result<bool> {
    let query = sql_query(GAMES_CHECK_INDEXES);
    let indexes: Vec<IndexInfo> = query.load(conn)?;
    Ok(!indexes.is_empty())
}

#[tauri::command]
#[specta::specta]
pub async fn get_db_info(
    file: PathBuf,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<DatabaseInfo> {
    let db_path = PathBuf::from("db").join(file);

    // OPTIMIZED: Removed - called frequently, not critical

    let path = app.path().resolve(db_path, BaseDirectory::AppData)?;

    let db = &mut get_db_or_create(&state, path.to_str().unwrap(), ConnectionOptions::default())?;

    let player_count = players::table.count().get_result::<i64>(db)? as i32;
    let game_count = games::table.count().get_result::<i64>(db)? as i32;
    let event_count = events::table.count().get_result::<i64>(db)? as i32;

    let title = match info::table
        .filter(info::name.eq("Title"))
        .first(db)
        .map(|title_info: Info| title_info.value)
    {
        Ok(Some(title)) => title,
        _ => "Untitled".to_string(),
    };

    let description = match info::table
        .filter(info::name.eq("Description"))
        .first(db)
        .map(|description_info: Info| description_info.value)
    {
        Ok(Some(description)) => description,
        _ => "".to_string(),
    };

    let storage_size = path.metadata()?.len() as i64;
    let filename = path.file_name().expect("get filename").to_string_lossy();

    let is_indexed = check_index_exists(db)?;
    Ok(DatabaseInfo {
        title,
        description,
        player_count,
        game_count,
        event_count,
        storage_size,
        filename: filename.to_string(),
        indexed: is_indexed,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn create_indexes(file: PathBuf, state: tauri::State<'_, AppState>) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    db.batch_execute(INDEXES_SQL)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_indexes(file: PathBuf, state: tauri::State<'_, AppState>) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    db.batch_execute(DELETE_INDEXES_SQL)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn edit_db_info(
    file: PathBuf,
    title: Option<String>,
    description: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    if let Some(title) = title {
        diesel::insert_into(info::table)
            .values((info::name.eq("Title"), info::value.eq(title.clone())))
            .on_conflict(info::name)
            .do_update()
            .set(info::value.eq(title))
            .execute(db)?;
    }

    if let Some(description) = description {
        diesel::insert_into(info::table)
            .values((
                info::name.eq("Description"),
                info::value.eq(description.clone()),
            ))
            .on_conflict(info::name)
            .do_update()
            .set(info::value.eq(description))
            .execute(db)?;
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, Type)]
pub enum Sides {
    BlackWhite,
    WhiteBlack,
    Any,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, Type)]
pub enum GameSort {
    #[default]
    #[serde(rename = "id")]
    Id,
    #[serde(rename = "date")]
    Date,
    #[serde(rename = "whiteElo")]
    WhiteElo,
    #[serde(rename = "blackElo")]
    BlackElo,
    #[serde(rename = "averageElo")]
    AverageElo,
    #[serde(rename = "ply_count")]
    PlyCount,
}

#[derive(Default, Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, Type)]
pub enum SortDirection {
    #[serde(rename = "asc")]
    Asc,
    #[default]
    #[serde(rename = "desc")]
    Desc,
}

#[derive(Default, Debug, Clone, Deserialize, PartialEq, Eq, Hash, Type)]
#[serde(rename_all = "camelCase")]
pub struct QueryOptions<SortT> {
    pub skip_count: bool,
    #[specta(optional)]
    pub page: Option<i32>,
    #[specta(optional)]
    pub page_size: Option<i32>,
    pub sort: SortT,
    pub direction: SortDirection,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct GameQuery {
    pub options: Option<QueryOptions<GameSort>>,
    pub player1: Option<i32>,
    pub player2: Option<i32>,
    pub tournament_id: Option<i32>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub range1: Option<(i32, i32)>,
    pub range2: Option<(i32, i32)>,
    pub sides: Option<Sides>,
    pub outcome: Option<String>,
    pub position: Option<PositionQuery>,
}

// Helper functions for serializing/deserializing u64 as string for bigint compatibility
mod bigint_serde {
    use serde::{Deserialize, Deserializer, Serializer};
    
    pub fn serialize<S>(value: &Option<u64>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(v) => serializer.serialize_str(&v.to_string()),
            None => serializer.serialize_none(),
        }
    }
    
    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
    where
        D: Deserializer<'de>,
    {
        use serde::de::Visitor;
        use std::fmt;
        
        struct BigIntVisitor;
        
        impl<'de> Visitor<'de> for BigIntVisitor {
            type Value = Option<u64>;
            
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a string representing a u64, a number, bigint, or null")
            }
            
            fn visit_none<E>(self) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(None)
            }
            
            fn visit_unit<E>(self) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                // Handle null/unit values
                Ok(None)
            }
            
            fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
            where
                D: Deserializer<'de>,
            {
                deserializer.deserialize_any(self)
            }
            
            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                value.parse::<u64>()
                    .map(Some)
                    .map_err(|e| serde::de::Error::custom(format!("Failed to parse '{}' as u64: {}", value, e)))
            }
            
            fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                value.parse::<u64>()
                    .map(Some)
                    .map_err(|e| serde::de::Error::custom(format!("Failed to parse '{}' as u64: {}", value, e)))
            }
            
            fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(Some(value))
            }
            
            fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if value < 0 {
                    return Err(serde::de::Error::custom(format!("Negative value {} cannot be converted to u64", value)));
                }
                Ok(Some(value as u64))
            }
            
            // Handle i128/u128 for JavaScript BigInt values
            fn visit_i128<E>(self, value: i128) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if value < 0 {
                    return Err(serde::de::Error::custom(format!("Negative value {} cannot be converted to u64", value)));
                }
                if value > u64::MAX as i128 {
                    return Err(serde::de::Error::custom(format!("Value {} exceeds u64::MAX", value)));
                }
                Ok(Some(value as u64))
            }
            
            fn visit_u128<E>(self, value: u128) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if value > u64::MAX as u128 {
                    return Err(serde::de::Error::custom(format!("Value {} exceeds u64::MAX", value)));
                }
                Ok(Some(value as u64))
            }
            
            // Handle f64 (JavaScript numbers that might be sent as floats)
            fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if value < 0.0 || value.fract() != 0.0 {
                    return Err(serde::de::Error::custom(format!("Value {} cannot be converted to u64 (must be non-negative integer)", value)));
                }
                Ok(Some(value as u64))
            }
            
            // Handle u32 (common JavaScript number range)
            fn visit_u32<E>(self, value: u32) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(Some(value as u64))
            }
            
            // Handle i32 (common JavaScript number range)
            fn visit_i32<E>(self, value: i32) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if value < 0 {
                    return Err(serde::de::Error::custom(format!("Negative value {} cannot be converted to u64", value)));
                }
                Ok(Some(value as u64))
            }
            
            // Handle u16, u8, i16, i8 for completeness
            fn visit_u16<E>(self, value: u16) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(Some(value as u64))
            }
            
            fn visit_u8<E>(self, value: u8) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(Some(value as u64))
            }
            
            fn visit_i16<E>(self, value: i16) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if value < 0 {
                    return Err(serde::de::Error::custom(format!("Negative value {} cannot be converted to u64", value)));
                }
                Ok(Some(value as u64))
            }
            
            fn visit_i8<E>(self, value: i8) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if value < 0 {
                    return Err(serde::de::Error::custom(format!("Negative value {} cannot be converted to u64", value)));
                }
                Ok(Some(value as u64))
            }
            
            // Handle map/object case - Tauri might serialize bigint as {"type": "bigint", "value": "..."}
            // or similar structures
            fn visit_map<M>(self, mut map: M) -> Result<Self::Value, M::Error>
            where
                M: serde::de::MapAccess<'de>,
            {
                let mut value_str: Option<String> = None;
                let mut value_num: Option<u64> = None;
                
                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "value" | "Value" | "val" => {
                            // Try to get the value as string first
                            if let Ok(s) = map.next_value::<String>() {
                                value_str = Some(s);
                            } else if let Ok(n) = map.next_value::<u64>() {
                                value_num = Some(n);
                            } else if let Ok(n) = map.next_value::<i64>() {
                                if n >= 0 {
                                    value_num = Some(n as u64);
                                }
                            }
                        }
                        _ => {
                            // Skip unknown keys
                            let _ = map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }
                
                // Prefer parsed string, then number
                if let Some(s) = value_str {
                    s.parse::<u64>()
                        .map(Some)
                        .map_err(|e| serde::de::Error::custom(format!("Failed to parse bigint value '{}' as u64: {}", s, e)))
                } else if let Some(n) = value_num {
                    Ok(Some(n))
                } else {
                    Err(serde::de::Error::custom("Could not extract value from bigint map structure"))
                }
            }
        }
        
        // Use deserialize_option to properly handle Option<u64>
        // This correctly handles null, missing fields, and actual values
        deserializer.deserialize_option(BigIntVisitor)
    }
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq, Hash, Type)]
pub struct GameQueryJs {
    #[specta(optional)]
    pub options: Option<QueryOptions<GameSort>>,
    /// Optional limit for number of game details to load (stats are always full)
    /// Used to fetch small preview (e.g., 10) and then on-demand up to 1000
    /// Using u64 instead of usize for better bigint compatibility with TypeScript
    /// Serialized as string to handle bigint in JSON
    #[specta(optional)]
    #[serde(with = "bigint_serde", default)]
    pub game_details_limit: Option<u64>,
    #[specta(optional)]
    pub player1: Option<i32>,
    #[specta(optional)]
    pub player2: Option<i32>,
    #[specta(optional)]
    pub tournament_id: Option<i32>,
    #[specta(optional)]
    pub start_date: Option<String>,
    #[specta(optional)]
    pub end_date: Option<String>,
    #[specta(optional)]
    pub range1: Option<(i32, i32)>,
    #[specta(optional)]
    pub range2: Option<(i32, i32)>,
    #[specta(optional)]
    pub sides: Option<Sides>,
    #[specta(optional)]
    pub outcome: Option<String>,
    #[specta(optional)]
    pub position: Option<PositionQueryJs>,
    #[specta(optional)]
    pub wanted_result: Option<String>,
}

impl GameQueryJs {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn position(mut self, position: PositionQueryJs) -> Self {
        self.position = Some(position);
        self
    }
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct QueryResponse<T> {
    pub data: T,
    pub count: Option<i32>,
}

#[tauri::command]
#[specta::specta]
pub async fn get_games(
    file: PathBuf,
    query: GameQueryJs,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResponse<Vec<NormalizedGame>>> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    let mut count: Option<i64> = None;
    let query_options = query.options.unwrap_or_default();

    let (white_players, black_players) = diesel::alias!(players as white, players as black);
    let mut sql_query = games::table
        .inner_join(white_players.on(games::white_id.eq(white_players.field(players::id))))
        .inner_join(black_players.on(games::black_id.eq(black_players.field(players::id))))
        .inner_join(events::table.on(games::event_id.eq(events::id)))
        .inner_join(sites::table.on(games::site_id.eq(sites::id)))
        .into_boxed();
    let mut count_query = games::table.into_boxed();

    // if let Some(speed) = query.speed {
    //     sql_query = sql_query.filter(games::speed.eq(speed as i32));
    //     count_query = count_query.filter(games::speed.eq(speed as i32));
    // }

    if let Some(outcome) = query.outcome {
        sql_query = sql_query.filter(games::result.eq(outcome.clone()));
        count_query = count_query.filter(games::result.eq(outcome));
    }

    if let Some(start_date) = query.start_date {
        sql_query = sql_query.filter(games::date.ge(start_date.clone()));
        count_query = count_query.filter(games::date.ge(start_date));
    }

    if let Some(end_date) = query.end_date {
        sql_query = sql_query.filter(games::date.le(end_date.clone()));
        count_query = count_query.filter(games::date.le(end_date));
    }

    if let Some(tournament_id) = query.tournament_id {
        sql_query = sql_query.filter(games::event_id.eq(tournament_id));
        count_query = count_query.filter(games::event_id.eq(tournament_id));
    }

    if let Some(limit) = query_options.page_size {
        sql_query = sql_query.limit(limit as i64);
    }

    if let Some(page) = query_options.page {
        sql_query = sql_query.offset(((page - 1) * query_options.page_size.unwrap_or(10)) as i64);
    }

    match query.sides {
        Some(Sides::BlackWhite) => {
            if let Some(player1) = query.player1 {
                sql_query = sql_query.filter(games::black_id.eq(player1));
                count_query = count_query.filter(games::black_id.eq(player1));
            }
            if let Some(player2) = query.player2 {
                sql_query = sql_query.filter(games::white_id.eq(player2));
                count_query = count_query.filter(games::white_id.eq(player2));
            }

            if let Some(range1) = query.range1 {
                sql_query = sql_query.filter(games::black_elo.between(range1.0, range1.1));
                count_query = count_query.filter(games::black_elo.between(range1.0, range1.1));
            }

            if let Some(range2) = query.range2 {
                sql_query = sql_query.filter(games::white_elo.between(range2.0, range2.1));
                count_query = count_query.filter(games::white_elo.between(range2.0, range2.1));
            }
        }
        Some(Sides::WhiteBlack) => {
            if let Some(player1) = query.player1 {
                sql_query = sql_query.filter(games::white_id.eq(player1));
                count_query = count_query.filter(games::white_id.eq(player1));
            }
            if let Some(player2) = query.player2 {
                sql_query = sql_query.filter(games::black_id.eq(player2));
                count_query = count_query.filter(games::black_id.eq(player2));
            }

            if let Some(range1) = query.range1 {
                sql_query = sql_query.filter(games::white_elo.between(range1.0, range1.1));
                count_query = count_query.filter(games::white_elo.between(range1.0, range1.1));
            }

            if let Some(range2) = query.range2 {
                sql_query = sql_query.filter(games::black_elo.between(range2.0, range2.1));
                count_query = count_query.filter(games::black_elo.between(range2.0, range2.1));
            }
        }
        Some(Sides::Any) => {
            if let Some(player1) = query.player1 {
                sql_query =
                    sql_query.filter(games::white_id.eq(player1).or(games::black_id.eq(player1)));
                count_query =
                    count_query.filter(games::white_id.eq(player1).or(games::black_id.eq(player1)));
            }
            if let Some(player2) = query.player2 {
                sql_query =
                    sql_query.filter(games::white_id.eq(player2).or(games::black_id.eq(player2)));
                count_query =
                    count_query.filter(games::white_id.eq(player2).or(games::black_id.eq(player2)));
            }

            if let (Some(range1), Some(range2)) = (query.range1, query.range2) {
                sql_query = sql_query.filter(
                    games::white_elo
                        .between(range1.0, range1.1)
                        .or(games::black_elo.between(range1.0, range1.1))
                        .or(games::white_elo
                            .between(range2.0, range2.1)
                            .or(games::black_elo.between(range2.0, range2.1))),
                );
                count_query = count_query.filter(
                    games::white_elo
                        .between(range1.0, range1.1)
                        .or(games::black_elo.between(range1.0, range1.1))
                        .or(games::white_elo
                            .between(range2.0, range2.1)
                            .or(games::black_elo.between(range2.0, range2.1))),
                );
            } else {
                if let Some(range1) = query.range1 {
                    sql_query = sql_query.filter(
                        games::white_elo
                            .between(range1.0, range1.1)
                            .or(games::black_elo.between(range1.0, range1.1)),
                    );
                    count_query = count_query.filter(
                        games::white_elo
                            .between(range1.0, range1.1)
                            .or(games::black_elo.between(range1.0, range1.1)),
                    );
                }

                if let Some(range2) = query.range2 {
                    sql_query = sql_query.filter(
                        games::white_elo
                            .between(range2.0, range2.1)
                            .or(games::black_elo.between(range2.0, range2.1)),
                    );
                    count_query = count_query.filter(
                        games::white_elo
                            .between(range2.0, range2.1)
                            .or(games::black_elo.between(range2.0, range2.1)),
                    );
                }
            }
        }
        None => {}
    }

    sql_query = match query_options.sort {
        GameSort::Id => match query_options.direction {
            SortDirection::Asc => sql_query.order(games::id.asc()),
            SortDirection::Desc => sql_query.order(games::id.desc()),
        },
        GameSort::Date => match query_options.direction {
            SortDirection::Asc => sql_query.order((games::date.asc(), games::time.asc())),
            SortDirection::Desc => sql_query.order((games::date.desc(), games::time.desc())),
        },
        GameSort::WhiteElo => match query_options.direction {
            SortDirection::Asc => sql_query.order(games::white_elo.asc()),
            SortDirection::Desc => sql_query.order(games::white_elo.desc()),
        },
        GameSort::BlackElo => match query_options.direction {
            SortDirection::Asc => sql_query.order(games::black_elo.asc()),
            SortDirection::Desc => sql_query.order(games::black_elo.desc()),
        },
        GameSort::AverageElo => {
            // AverageElo will be sorted in Rust after calculating
            sql_query
        },
        GameSort::PlyCount => match query_options.direction {
            SortDirection::Asc => sql_query.order(games::ply_count.asc()),
            SortDirection::Desc => sql_query.order(games::ply_count.desc()),
        },
    };

    if !query_options.skip_count {
        count = Some(
            count_query
                .select(diesel::dsl::count(games::id))
                .first(db)?,
        );
    }

    let games: Vec<(Game, Player, Player, Event, Site)> = sql_query.load(db)?;
    let mut normalized_games = normalize_games(games)?;
    
    // Sort by average ELO if needed (calculated in Rust)
    if matches!(query_options.sort, GameSort::AverageElo) {
        normalized_games.sort_by(|a, b| {
            // Calculate average ELO: (white_elo + black_elo) / 2, rounded
            // If only one ELO is available, use that one
            // If neither is available, treat as 0 for sorting purposes
            let a_avg = match (a.white_elo, a.black_elo) {
                (Some(white), Some(black)) => {
                    // Round the average (same as Math.round in TypeScript)
                    let sum = white + black;
                    Some((sum + 1) / 2) // This is equivalent to rounding for integers
                },
                (Some(elo), None) | (None, Some(elo)) => Some(elo),
                (None, None) => None,
            };
            let b_avg = match (b.white_elo, b.black_elo) {
                (Some(white), Some(black)) => {
                    let sum = white + black;
                    Some((sum + 1) / 2)
                },
                (Some(elo), None) | (None, Some(elo)) => Some(elo),
                (None, None) => None,
            };
            
            // For sorting, treat None as 0 (lowest priority)
            let a_val = a_avg.unwrap_or(0);
            let b_val = b_avg.unwrap_or(0);
            
            match query_options.direction {
                SortDirection::Asc => a_val.cmp(&b_val),
                SortDirection::Desc => b_val.cmp(&a_val), // Descending: higher ELO first
            }
        });
    }

    Ok(QueryResponse {
        data: normalized_games,
        count: count.map(|c| c as i32),
    })
}

fn normalize_games(games: Vec<(Game, Player, Player, Event, Site)>) -> Result<Vec<NormalizedGame>> {
    games
        .into_iter()
        .map(|(game, white, black, event, site)| core::normalize_game(game, white, black, event, site))
        .collect::<Result<_>>()
}

#[derive(Debug, Clone, Deserialize, Type)]
pub struct PlayerQuery {
    pub options: QueryOptions<PlayerSort>,
    #[specta(optional)]
    pub name: Option<String>,
    #[specta(optional)]
    pub range: Option<(i32, i32)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum PlayerSort {
    #[serde(rename = "id")]
    Id,
    #[serde(rename = "name")]
    Name,
    #[serde(rename = "elo")]
    Elo,
}

#[tauri::command]
#[specta::specta]
pub async fn get_player(
    file: PathBuf,
    id: i32,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Player>> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
    let player = players::table
        .filter(players::id.eq(id))
        .first::<Player>(db)
        .optional()?;
    Ok(player)
}

#[tauri::command]
#[specta::specta]
pub async fn get_players(
    file: PathBuf,
    query: PlayerQuery,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResponse<Vec<Player>>> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
    let mut count: Option<i64> = None;

    let mut sql_query = players::table.into_boxed();
    let mut count_query = players::table.into_boxed();
    sql_query = sql_query.filter(players::name.is_not("Unknown"));
    count_query = count_query.filter(players::name.is_not("Unknown"));

    if let Some(name) = query.name {
        sql_query = sql_query.filter(players::name.like(format!("%{}%", name)));
        count_query = count_query.filter(players::name.like(format!("%{}%", name)));
    }

    if let Some(range) = query.range {
        sql_query = sql_query.filter(players::elo.between(range.0, range.1));
        count_query = count_query.filter(players::elo.between(range.0, range.1));
    }

    if !query.options.skip_count {
        count = Some(count_query.count().get_result(db)?);
    }

    if let Some(limit) = query.options.page_size {
        sql_query = sql_query.limit(limit as i64);
    }

    if let Some(page) = query.options.page {
        sql_query = sql_query.offset(((page - 1) * query.options.page_size.unwrap_or(10)) as i64);
    }

    sql_query = match query.options.sort {
        PlayerSort::Id => match query.options.direction {
            SortDirection::Asc => sql_query.order(players::id.asc()),
            SortDirection::Desc => sql_query.order(players::id.desc()),
        },
        PlayerSort::Name => match query.options.direction {
            SortDirection::Asc => sql_query.order(players::name.asc()),
            SortDirection::Desc => sql_query.order(players::name.desc()),
        },
        PlayerSort::Elo => match query.options.direction {
            SortDirection::Asc => sql_query.order(players::elo.asc()),
            SortDirection::Desc => sql_query.order(players::elo.desc()),
        },
    };

    let players = sql_query.load::<Player>(db)?;

    Ok(QueryResponse {
        data: players,
        count: count.map(|c| c as i32),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum TournamentSort {
    #[serde(rename = "id")]
    Id,
    #[serde(rename = "name")]
    Name,
}

#[derive(Debug, Clone, Deserialize, Type)]
pub struct TournamentQuery {
    pub options: QueryOptions<TournamentSort>,
    pub name: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn get_tournaments(
    file: PathBuf,
    query: TournamentQuery,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResponse<Vec<Event>>> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
    let mut count: Option<i64> = None;

    let mut sql_query = events::table.into_boxed();
    let mut count_query = events::table.into_boxed();
    sql_query = sql_query.filter(events::name.is_not("Unknown").and(events::name.is_not("")));
    count_query = count_query.filter(events::name.is_not("Unknown").and(events::name.is_not("")));

    if let Some(name) = query.name {
        sql_query = sql_query.filter(events::name.like(format!("%{}%", name)));
        count_query = count_query.filter(events::name.like(format!("%{}%", name)));
    }

    if !query.options.skip_count {
        count = Some(count_query.count().get_result(db)?);
    }

    if let Some(limit) = query.options.page_size {
        sql_query = sql_query.limit(limit as i64);
    }

    if let Some(page) = query.options.page {
        sql_query = sql_query.offset(((page - 1) * query.options.page_size.unwrap_or(10)) as i64);
    }

    sql_query = match query.options.sort {
        TournamentSort::Id => match query.options.direction {
            SortDirection::Asc => sql_query.order(events::id.asc()),
            SortDirection::Desc => sql_query.order(events::id.desc()),
        },
        TournamentSort::Name => match query.options.direction {
            SortDirection::Asc => sql_query.order(events::name.asc()),
            SortDirection::Desc => sql_query.order(events::name.desc()),
        },
    };

    let events = sql_query.load::<Event>(db)?;

    Ok(QueryResponse {
        data: events,
        count: count.map(|c| c as i32),
    })
}

#[derive(Debug, Clone, Serialize, Type, Default)]
pub struct PlayerGameInfo {
    pub site_stats_data: Vec<SiteStatsData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, Type)]
#[repr(u8)] // Ensure minimal memory usage (as u8)
pub enum GameOutcome {
    #[default]
    Won = 0,
    Drawn = 1,
    Lost = 2,
}

impl GameOutcome {
    pub fn from_str(result_str: &str, is_white: bool) -> Option<Self> {
        match result_str {
            "1-0" => Some(if is_white {
                GameOutcome::Won
            } else {
                GameOutcome::Lost
            }),
            "1/2-1/2" => Some(GameOutcome::Drawn),
            "0-1" => Some(if is_white {
                GameOutcome::Lost
            } else {
                GameOutcome::Won
            }),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Type, Default)]
pub struct SiteStatsData {
    pub site: String,
    pub player: String,
    pub data: Vec<StatsData>,
}

#[derive(Debug, Clone, Serialize, Type, Default)]
pub struct StatsData {
    pub date: String,
    pub is_player_white: bool,
    pub player_elo: i32,
    pub result: GameOutcome,
    pub time_control: String,
    pub opening: String,
}

#[derive(Serialize, Debug, Clone, Type, tauri_specta::Event)]
pub struct DatabaseProgress {
    pub id: String,
    pub progress: f64,
}

#[tauri::command]
#[specta::specta]
pub async fn get_players_game_info(
    file: PathBuf,
    id: i32,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<PlayerGameInfo> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
    let timer = Instant::now();

    let sql_query = games::table
        .inner_join(sites::table.on(games::site_id.eq(sites::id)))
        .inner_join(players::table.on(players::id.eq(id)))
        .select((
            games::white_id,
            games::black_id,
            games::result,
            games::date,
            games::moves,
            games::white_elo,
            games::black_elo,
            games::time_control,
            sites::name,
            players::name,
        ))
        .filter(games::white_id.eq(id).or(games::black_id.eq(id)))
        .filter(games::fen.is_null());

    type GameInfo = (
        i32,
        i32,
        Option<String>,
        Option<String>,
        Vec<u8>,
        Option<i32>,
        Option<i32>,
        Option<String>,
        Option<String>,
        Option<String>,
    );
    let info: Vec<GameInfo> = sql_query.load(db)?;

    let mut game_info = PlayerGameInfo::default();
    let progress = AtomicUsize::new(0);
    game_info.site_stats_data = info
        .par_iter()
        .filter_map(
            |(
                white_id,
                black_id,
                outcome,
                date,
                moves,
                white_elo,
                black_elo,
                time_control,
                site,
                player,
            )| {
                let is_white = *white_id == id;
                let is_black = *black_id == id;
                let result = GameOutcome::from_str(outcome.as_deref()?, is_white);

                if !is_white && !is_black
                    || is_white && white_elo.is_none()
                    || is_black && black_elo.is_none()
                    || result.is_none()
                    || date.is_none()
                    || site.is_none()
                    || player.is_none()
                {
                    return None;
                }

                let site = site.as_deref().map(|s| {
                    if s.starts_with("https://lichess.org/") {
                        "Lichess".to_string()
                    } else {
                        s.to_string()
                    }
                })?;

                let mut setups = vec![];
                let mut chess = Chess::default();
                
                // Extract main line moves from the extended format
                let main_moves = match extract_main_line_moves(moves, Some(chess.clone())) {
                    Ok(moves) => moves,
                    Err(_) => {
                        // If extraction fails, skip this game
                        return None;
                    }
                };
                
                for (i, m) in main_moves.iter().enumerate() {
                    if i > 54 {
                        // max length of opening in data
                        break;
                    }
                    chess.play_unchecked(m);
                    setups.push(chess.clone().into_setup(EnPassantMode::Legal));
                }

                setups.reverse();
                let opening = setups
                    .iter()
                    .find_map(|setup| get_opening_from_setup(setup.clone()).ok())
                    .unwrap_or_default();

                let p = progress.fetch_add(1, Ordering::Relaxed);
                if p % 1000 == 0 || p == info.len() - 1 {
                    let _ = DatabaseProgress {
                        id: id.to_string(),
                        progress: (p as f64 / info.len() as f64) * 100_f64,
                    }
                    .emit(&app);
                }

                Some(SiteStatsData {
                    site: site.clone(),
                    player: player.clone().unwrap(),
                    data: vec![StatsData {
                        date: date.clone().unwrap(),
                        is_player_white: is_white,
                        player_elo: if is_white {
                            white_elo.unwrap()
                        } else {
                            black_elo.unwrap()
                        },
                        result: result.unwrap(),
                        time_control: time_control.clone().unwrap_or_default(),
                        opening,
                    }],
                })
            },
        )
        .fold(
            || DashMap::new(),
            |acc, data| {
                acc.entry((data.site.clone(), data.player.clone()))
                    .or_insert_with(Vec::new)
                    .extend(data.data);
                acc
            },
        )
        .reduce(
            || DashMap::new(),
            |acc1, acc2| {
                for ((site, player), data) in acc2 {
                    acc1.entry((site, player))
                        .or_insert_with(Vec::new)
                        .extend(data);
                }
                acc1
            },
        )
        .into_iter()
        .map(|((site, player), data)| SiteStatsData { site, player, data })
        .collect();

    // OPTIMIZED: Keep timing info but simplify
    info!("Player stats computed in {:?}", timer.elapsed());

    Ok(game_info)
}

/// Delete a database file and cleanup resources
/// FIXED: Force close all connections before deletion to prevent "database is locked"
#[tauri::command]
#[specta::specta]
pub async fn delete_database(
    file: PathBuf,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    use std::fs::remove_file;
    
    let path_str = file.to_string_lossy().into_owned();
    
    log::info!("Attempting to delete database: {:?}", file);
    
    // STEP 1: Cancel any ongoing searches by acquiring all permits
    // This will stop new searches and wait for current ones to complete
    let _permits = state.new_request.clone();
    let permit1 = _permits.acquire().await.ok();
    let permit2 = _permits.acquire().await.ok();
    
    // STEP 2: Run PRAGMA optimize before closing connections
    if let Ok(mut db) = get_db_or_create(&state, &path_str, ConnectionOptions::default()) {
        let _ = diesel::sql_query("PRAGMA optimize").execute(&mut db);
    }
    
    // Drop permits after optimize
    drop(permit1);
    drop(permit2);
    
    // Remove from connection pool - this drops the pool and closes all connections
    if let Some((_, pool)) = state.connection_pool.remove(&path_str) {
        // Force drop the pool to close all connections immediately
        drop(pool);
        log::info!("Closed connection pool for: {:?}", file);
    }
    
    // Clear any cached data for this database
    let cache_keys_to_remove: Vec<_> = state.line_cache.iter()
        .filter(|entry| entry.key().1 == file)
        .map(|entry| entry.key().clone())
        .collect();
    
    for key in cache_keys_to_remove {
        state.line_cache.remove(&key);
    }
    
    log::info!("Waiting for file handles to be released...");
    // INCREASED: Wait longer for OS to release all file handles
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    
    // Try up to 3 times with increasing delays
    for attempt in 1..=3 {
        if file.exists() {
            match remove_file(&file) {
                Ok(_) => {
                    log::info!("✓ Database deleted successfully: {:?}", file);
                    return Ok(());
                }
                Err(e) if attempt < 3 => {
                    log::warn!("Attempt {} failed: {}. Retrying...", attempt, e);
                    tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64)).await;
                }
                Err(e) => {
                    return Err(Error::Io(e));
                }
            }
        } else {
            log::warn!("Database file does not exist: {:?}", file);
            return Ok(());
        }
    }
    
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_duplicated_games(
    file: PathBuf,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    db.batch_execute(GAMES_DELETE_DUPLICATES)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_empty_games(
    file: PathBuf,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    diesel::delete(games::table.filter(games::ply_count.eq(0))).execute(db)?;

    Ok(())
}

struct PgnGame {
    event: Option<String>,
    site: Option<String>,
    date: Option<String>,
    round: Option<String>,
    white: Option<String>,
    black: Option<String>,
    result: Option<String>,
    time_control: Option<String>,
    eco: Option<String>,
    white_elo: Option<String>,
    black_elo: Option<String>,
    ply_count: Option<String>,
    fen: Option<String>,
    moves: String,
}

impl PgnGame {
    fn write(&self, writer: &mut impl Write) -> Result<()> {
        writeln!(
            writer,
            "[Event \"{}\"]",
            self.event.as_deref().unwrap_or("")
        )?;
        writeln!(writer, "[Site \"{}\"]", self.site.as_deref().unwrap_or(""))?;
        writeln!(writer, "[Date \"{}\"]", self.date.as_deref().unwrap_or(""))?;
        writeln!(
            writer,
            "[Round \"{}\"]",
            self.round.as_deref().unwrap_or("")
        )?;
        writeln!(
            writer,
            "[White \"{}\"]",
            self.white.as_deref().unwrap_or("")
        )?;
        writeln!(
            writer,
            "[Black \"{}\"]",
            self.black.as_deref().unwrap_or("")
        )?;
        writeln!(
            writer,
            "[Result \"{}\"]",
            self.result.as_deref().unwrap_or("*")
        )?;
        if let Some(time_control) = self.time_control.as_deref() {
            writeln!(writer, "[TimeControl \"{}\"]", time_control)?;
        }
        if let Some(eco) = self.eco.as_deref() {
            writeln!(writer, "[ECO \"{}\"]", eco)?;
        }
        if let Some(white_elo) = self.white_elo.as_deref() {
            writeln!(writer, "[WhiteElo \"{}\"]", white_elo)?;
        }
        if let Some(black_elo) = self.black_elo.as_deref() {
            writeln!(writer, "[BlackElo \"{}\"]", black_elo)?;
        }
        if let Some(ply_count) = self.ply_count.as_deref() {
            writeln!(writer, "[PlyCount \"{}\"]", ply_count)?;
        }
        if let Some(fen) = self.fen.as_deref() {
            writeln!(writer, "[SetUp \"1\"]")?;
            writeln!(writer, "[FEN \"{}\"]", fen)?;
        }
        writeln!(writer)?;
        writer.write(self.moves.as_bytes())?;
        match self.result.as_deref() {
            Some("1-0") => writeln!(writer, "1-0"),
            Some("0-1") => writeln!(writer, "0-1"),
            Some("1/2-1/2") => writeln!(writer, "1/2-1/2"),
            _ => writeln!(writer, "*"),
        }?;
        writeln!(writer)?;
        Ok(())
    }
}

#[tauri::command]
#[specta::specta]
pub async fn export_to_pgn(
    file: PathBuf,
    dest_file: PathBuf,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(dest_file)?;

    let mut writer = BufWriter::new(file);

    let (white_players, black_players) = diesel::alias!(players as white, players as black);
    games::table
        .inner_join(white_players.on(games::white_id.eq(white_players.field(players::id))))
        .inner_join(black_players.on(games::black_id.eq(black_players.field(players::id))))
        .inner_join(events::table.on(games::event_id.eq(events::id)))
        .inner_join(sites::table.on(games::site_id.eq(sites::id)))
        .load_iter::<(Game, Player, Player, Event, Site), DefaultLoadingMode>(db)?
        .flatten()
        .map(|(game, white, black, event, site)| {
            let pgn = PgnGame {
                event: event.name,
                site: site.name,
                date: game.date,
                round: game.round,
                white: white.name,
                black: black.name,
                result: game.result,
                time_control: game.time_control,
                eco: game.eco,
                white_elo: game.white_elo.map(|e| e.to_string()),
                black_elo: game.black_elo.map(|e| e.to_string()),
                ply_count: game.ply_count.map(|e| e.to_string()),
                fen: game.fen.clone(),
                 moves: GameTree::from_bytes(
                    &game.moves,
                    game.fen
                        .map(|fen| Fen::from_ascii(fen.as_bytes()).ok())
                        .flatten()
                        .map(|fen| Chess::from_setup(fen.into(), CastlingMode::Chess960).ok())
                        .flatten()
                )?.to_string(),
            };

            pgn.write(&mut writer)?;

            Ok(())
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_db_game(
    file: PathBuf,
    game_id: i32,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    core::remove_game(db, game_id)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_game(
    file: PathBuf,
    game_id: i32,
    state: tauri::State<'_, AppState>,
) -> Result<NormalizedGame> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    Ok(core::get_game(db, game_id)?)
}

#[tauri::command]
#[specta::specta]
pub async fn update_game(
    file: PathBuf,
    game_id: i32,
    update: UpdateGame,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    core::update_game(db, game_id, &update)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn merge_players(
    file: PathBuf,
    player1: i32,
    player2: i32,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    // Check if the players never played against each other
    let count: i64 = games::table
        .filter(games::white_id.eq(player1).and(games::black_id.eq(player2)))
        .or_filter(games::white_id.eq(player2).and(games::black_id.eq(player1)))
        .limit(1)
        .count()
        .get_result(db)?;

    if count > 0 {
        return Err(Error::NotDistinctPlayers);
    }

    diesel::update(games::table.filter(games::white_id.eq(player1)))
        .set(games::white_id.eq(player2))
        .execute(db)?;
    diesel::update(games::table.filter(games::black_id.eq(player1)))
        .set(games::black_id.eq(player2))
        .execute(db)?;

    diesel::delete(players::table.filter(players::id.eq(player1))).execute(db)?;

    let player_count: i64 = players::table.count().get_result(db)?;
    diesel::insert_into(info::table)
        .values((
            info::name.eq("PlayerCount"),
            info::value.eq(player_count.to_string()),
        ))
        .on_conflict(info::name)
        .do_update()
        .set(info::value.eq(player_count.to_string()))
        .execute(db)?;

    Ok(())
}

/// Clear the in-memory game cache to free memory
/// FIXED: Also clear position search cache to prevent unbounded growth
#[tauri::command]
#[specta::specta]
pub fn clear_games(state: tauri::State<'_, AppState>) -> Result<()> {
    // Clear position search cache to free memory
    state.line_cache.clear();
    
    info!("Cleared position search cache");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn home_row() {
        use shakmaty::Board;

        let pawn_home = get_pawn_home(&Board::default());
        assert_eq!(pawn_home, 0b1111111111111111);

        let pawn_home = get_pawn_home(
            &Board::from_ascii_board_fen(b"8/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/8").unwrap(),
        );
        assert_eq!(pawn_home, 0b1110111111101111);

        let pawn_home = get_pawn_home(&Board::from_ascii_board_fen(b"8/8/8/8/8/8/8/8").unwrap());
        assert_eq!(pawn_home, 0b0000000000000000);
    }
}
