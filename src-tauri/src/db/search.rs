//! Position search functionality
//!
//! This module handles searching for chess positions in game databases.
//! It supports both exact position matching and partial position matching.
//!
//! Now supports two database families:
//! - LOCAL: preinstalled/system databases
//! - ONLINE: downloaded Lichess/Chess.com databases:
//!   {username}_lichess.db3 or {username}_chesscom.db3
//!
//! The ONLINE path avoids using `state.db_cache` and uses reachability
//! checks based on the initial position derived from each game's FEN,
//! to prevent false negatives when online DB material/pawn_home metadata
//! is absent or unreliable.

use dashmap::{mapref::entry::Entry, DashMap};
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use shakmaty::ByColor;
use shakmaty::{
    fen::Fen, san::SanPlus, Bitboard, Chess, Color, EnPassantMode, FromSetup, Position, Setup,
};
use specta::Type;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use tauri::Emitter;

use crate::{
    db::{
        get_db_or_create, get_pawn_home,
        models::*,
        normalize_games,
        pgn::{get_material_count, MaterialCount},
        schema::*,
        ConnectionOptions, GameSort, SortDirection,
    },
    error::Error,
    AppState,
};

use super::GameQueryJs;

/// ============================================================================
/// Performance switches
/// ============================================================================

/// If your `games.white_material/black_material` are reliable upper bounds
/// enable this to prefilter in SQL. Otherwise keep false to avoid false negatives.
const ENABLE_MATERIAL_SQL_PREFILTER: bool = true;

/// Create minimal + material indexes automatically.
const ENABLE_AUX_INDEXES: bool = true;

/// Enable checkpoint schema auto-creation.
const ENABLE_CHECKPOINT_TABLE_SCHEMA: bool = true;

/// Checkpoint stride (every N plies).
#[allow(dead_code)]
const CHECKPOINT_STRIDE: usize = 8;

/// ============================================================================
/// ONLINE database detection
/// ============================================================================

/// Returns true if this file looks like an ONLINE DB:
/// `{username}_lichess.db3` or `{username}_chesscom.db3`
#[inline]
fn is_online_database(file: &PathBuf) -> bool {
    // Get filename from path (handles both full paths and just filenames)
    let filename = file
        .file_name()
        .and_then(|n| n.to_str())
        .or_else(|| file.to_str());

    if let Some(name) = filename {
        let name_lower = name.to_lowercase();
        name_lower.ends_with("_lichess.db3") || name_lower.ends_with("_chesscom.db3")
    } else {
        false
    }
}

/// ============================================================================
/// Aux indexes (minimal + material)
/// ============================================================================

#[inline]
fn ensure_aux_indexes(db: &mut SqliteConnection) {
    let _ = diesel::sql_query(
        r#"
        -- Basic filters
        CREATE INDEX IF NOT EXISTS idx_games_white_id ON games(white_id);
        CREATE INDEX IF NOT EXISTS idx_games_black_id ON games(black_id);
        CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
        CREATE INDEX IF NOT EXISTS idx_games_result ON games(result);

        -- Combined filters
        CREATE INDEX IF NOT EXISTS idx_games_white_black ON games(white_id, black_id);
        CREATE INDEX IF NOT EXISTS idx_games_white_date ON games(white_id, date);
        CREATE INDEX IF NOT EXISTS idx_games_black_date ON games(black_id, date);
        CREATE INDEX IF NOT EXISTS idx_games_white_result ON games(white_id, result);
        CREATE INDEX IF NOT EXISTS idx_games_black_result ON games(black_id, result);

        -- Wide combo when multiple filters are used
        CREATE INDEX IF NOT EXISTS idx_games_filters_combo
        ON games(white_id, black_id, date, result);

        -- Material/pawn_home
        CREATE INDEX IF NOT EXISTS idx_games_white_material ON games(white_material);
        CREATE INDEX IF NOT EXISTS idx_games_black_material ON games(black_material);
        CREATE INDEX IF NOT EXISTS idx_games_pawn_home ON games(pawn_home);

        CREATE INDEX IF NOT EXISTS idx_games_material_combo
        ON games(white_material, black_material, pawn_home);
        "#,
    )
    .execute(db);
}

/// ============================================================================
/// Checkpoint schema
/// ============================================================================

#[inline]
fn ensure_checkpoint_table(db: &mut SqliteConnection) {
    let _ = diesel::sql_query(
        r#"
        CREATE TABLE IF NOT EXISTS game_position_checkpoints (
            game_id INTEGER NOT NULL,
            ply INTEGER NOT NULL,
            board_hash INTEGER NOT NULL,
            turn INTEGER NOT NULL,
            PRIMARY KEY (game_id, ply)
        );

        CREATE INDEX IF NOT EXISTS idx_gpc_board_turn
        ON game_position_checkpoints(board_hash, turn);

        CREATE INDEX IF NOT EXISTS idx_gpc_board
        ON game_position_checkpoints(board_hash);
        "#,
    )
    .execute(db);
}

/// ============================================================================
/// Hashing utilities (no external deps)
/// ============================================================================

#[inline(always)]
fn mix64(state: &mut u64, v: u64) {
    // simple high-diffusion mix
    *state = state.wrapping_add(v.wrapping_mul(0x9E3779B97F4A7C15));
    *state ^= *state >> 30;
    *state = state.wrapping_mul(0xBF58476D1CE4E5B9);
    *state ^= *state >> 27;
    *state = state.wrapping_mul(0x94D049BB133111EB);
    *state ^= *state >> 31;
}

#[inline(always)]
fn bb_u64(bb: Bitboard) -> u64 {
    // shakmaty Bitboard implements Into<u64> in stable versions
    // If this ever fails in your build, replace with an explicit method available in your version.
    bb.into()
}

#[inline(always)]
fn board_hash(board: &shakmaty::Board) -> u64 {
    let white = board.white();
    let black = board.black();

    let pawns = board.pawns();
    let knights = board.knights();
    let bishops = board.bishops();
    let rooks = board.rooks();
    let queens = board.queens();
    let kings = board.kings();

    let wp = pawns & white;
    let bp = pawns & black;
    let wn = knights & white;
    let bn = knights & black;
    let wb = bishops & white;
    let bb = bishops & black;
    let wr = rooks & white;
    let br = rooks & black;
    let wq = queens & white;
    let bq = queens & black;
    let wk = kings & white;
    let bk = kings & black;

    let mut h = 0x1234_5678_9ABC_DEF0u64;
    mix64(&mut h, bb_u64(wp));
    mix64(&mut h, bb_u64(bp));
    mix64(&mut h, bb_u64(wn));
    mix64(&mut h, bb_u64(bn));
    mix64(&mut h, bb_u64(wb));
    mix64(&mut h, bb_u64(bb));
    mix64(&mut h, bb_u64(wr));
    mix64(&mut h, bb_u64(br));
    mix64(&mut h, bb_u64(wq));
    mix64(&mut h, bb_u64(bq));
    mix64(&mut h, bb_u64(wk));
    mix64(&mut h, bb_u64(bk));

    h
}

#[inline(always)]
fn position_hash_and_turn(position: &Chess) -> (i64, i32) {
    let h = board_hash(position.board());
    let turn_i32 = match position.turn() {
        Color::White => 0,
        Color::Black => 1,
    };
    (h as i64, turn_i32)
}

/// ============================================================================
/// Data for exact position matching
/// ============================================================================

#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub struct ExactData {
    pawn_home: u16,
    material: MaterialCount,
    position: Chess,
}

/// Precomputed masks for partial matching
#[derive(Debug, Hash, PartialEq, Eq, Clone)]
struct PartialMasks {
    kings: Bitboard,
    queens: Bitboard,
    rooks: Bitboard,
    bishops: Bitboard,
    knights: Bitboard,
    pawns: Bitboard,
    white: Bitboard,
    black: Bitboard,
    non_empty: u16,
}

impl PartialMasks {
    const KINGS: u16 = 1 << 0;
    const QUEENS: u16 = 1 << 1;
    const ROOKS: u16 = 1 << 2;
    const BISHOPS: u16 = 1 << 3;
    const KNIGHTS: u16 = 1 << 4;
    const PAWNS: u16 = 1 << 5;
    const WHITE: u16 = 1 << 6;
    const BLACK: u16 = 1 << 7;

    #[inline(always)]
    fn from_setup(setup: &Setup) -> Self {
        let b = &setup.board;

        let kings = b.kings();
        let queens = b.queens();
        let rooks = b.rooks();
        let bishops = b.bishops();
        let knights = b.knights();
        let pawns = b.pawns();
        let white = b.white();
        let black = b.black();

        let mut non_empty = 0u16;

        if !kings.is_empty() {
            non_empty |= Self::KINGS;
        }
        if !queens.is_empty() {
            non_empty |= Self::QUEENS;
        }
        if !rooks.is_empty() {
            non_empty |= Self::ROOKS;
        }
        if !bishops.is_empty() {
            non_empty |= Self::BISHOPS;
        }
        if !knights.is_empty() {
            non_empty |= Self::KNIGHTS;
        }
        if !pawns.is_empty() {
            non_empty |= Self::PAWNS;
        }
        if !white.is_empty() {
            non_empty |= Self::WHITE;
        }
        if !black.is_empty() {
            non_empty |= Self::BLACK;
        }

        Self {
            kings,
            queens,
            rooks,
            bishops,
            knights,
            pawns,
            white,
            black,
            non_empty,
        }
    }
}

/// Data for partial position matching
#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub struct PartialData {
    piece_positions: Setup,
    material: MaterialCount,
    masks: PartialMasks,
}

/// Query type for searching positions
#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub enum PositionQuery {
    Exact(ExactData),
    Partial(PartialData),
}

impl PositionQuery {
    pub fn exact_from_fen(fen: &str) -> Result<PositionQuery, Error> {
        let position: Chess =
            Fen::from_ascii(fen.as_bytes())?.into_position(shakmaty::CastlingMode::Chess960)?;
        let pawn_home = get_pawn_home(position.board());
        let material = get_material_count(position.board());
        Ok(PositionQuery::Exact(ExactData {
            pawn_home,
            material,
            position,
        }))
    }

    pub fn partial_from_fen(fen: &str) -> Result<PositionQuery, Error> {
        let fen = Fen::from_ascii(fen.as_bytes())?;
        let setup = fen.into_setup();
        let material = get_material_count(&setup.board);
        let masks = PartialMasks::from_setup(&setup);

        Ok(PositionQuery::Partial(PartialData {
            piece_positions: setup,
            material,
            masks,
        }))
    }

    #[inline(always)]
    fn target_material(&self) -> &MaterialCount {
        match self {
            PositionQuery::Exact(ref data) => &data.material,
            PositionQuery::Partial(ref data) => &data.material,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq, Eq, Hash)]
pub struct PositionQueryJs {
    pub fen: String,
    pub type_: String,
}

/// Convert JavaScript position query to internal format
#[inline(always)]
fn convert_position_query(query: PositionQueryJs) -> Result<PositionQuery, Error> {
    match query.type_.as_str() {
        "exact" => PositionQuery::exact_from_fen(&query.fen),
        "partial" => PositionQuery::partial_from_fen(&query.fen),
        _ => Err(Error::FenError(format!(
            "Invalid position query type: {}",
            query.type_
        ))),
    }
}

impl PositionQuery {
    /// Check if a chess position matches this query
    #[inline(always)]
    fn matches(&self, position: &Chess) -> bool {
        match self {
            PositionQuery::Exact(ref data) => {
                if data.position.turn() != position.turn() {
                    return false;
                }
                if data.position.board() != position.board() {
                    return false;
                }
                // Castling rights comparison omitted (Castles lacks PartialEq in shakmaty 0.27.3)
                if data.position.ep_square(EnPassantMode::Legal)
                    != position.ep_square(EnPassantMode::Legal)
                {
                    return false;
                }
                true
            }
            PositionQuery::Partial(ref data) => {
                let m = &data.masks;
                if m.non_empty == 0 {
                    return true;
                }
                let tested = position.board();

                if (m.non_empty & PartialMasks::KINGS) != 0
                    && !is_contained(tested.kings(), m.kings)
                {
                    return false;
                }
                if (m.non_empty & PartialMasks::QUEENS) != 0
                    && !is_contained(tested.queens(), m.queens)
                {
                    return false;
                }
                if (m.non_empty & PartialMasks::ROOKS) != 0
                    && !is_contained(tested.rooks(), m.rooks)
                {
                    return false;
                }
                if (m.non_empty & PartialMasks::BISHOPS) != 0
                    && !is_contained(tested.bishops(), m.bishops)
                {
                    return false;
                }
                if (m.non_empty & PartialMasks::KNIGHTS) != 0
                    && !is_contained(tested.knights(), m.knights)
                {
                    return false;
                }
                if (m.non_empty & PartialMasks::PAWNS) != 0
                    && !is_contained(tested.pawns(), m.pawns)
                {
                    return false;
                }
                if (m.non_empty & PartialMasks::WHITE) != 0
                    && !is_contained(tested.white(), m.white)
                {
                    return false;
                }
                if (m.non_empty & PartialMasks::BLACK) != 0
                    && !is_contained(tested.black(), m.black)
                {
                    return false;
                }

                true
            }
        }
    }

    fn is_reachable_by(&self, material: &MaterialCount, pawn_home: u16) -> bool {
        match self {
            PositionQuery::Exact(ref data) => {
                is_end_reachable(data.pawn_home, pawn_home)
                    && is_material_reachable(&data.material, material)
            }
            PositionQuery::Partial(ref data) => is_material_reachable(&data.material, material),
        }
    }

    fn can_reach(&self, material: &MaterialCount, pawn_home: u16) -> bool {
        match self {
            PositionQuery::Exact(ref data) => {
                is_end_reachable(pawn_home, data.pawn_home)
                    && is_material_reachable(material, &data.material)
            }
            PositionQuery::Partial(_) => true,
        }
    }
}

/// Check if target pawn structure can be reached from current position
#[inline(always)]
fn is_end_reachable(end: u16, pos: u16) -> bool {
    end & !pos == 0
}

/// Check if target material count can be reached from current material
#[inline(always)]
fn is_material_reachable(end: &MaterialCount, pos: &MaterialCount) -> bool {
    end.white <= pos.white && end.black <= pos.black
}

/// Check if all pieces in subset are also in container
#[inline(always)]
fn is_contained(container: Bitboard, subset: Bitboard) -> bool {
    container & subset == subset
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct PositionStats {
    #[serde(rename = "move")]
    pub move_: String,
    pub white: i32,
    pub draw: i32,
    pub black: i32,
}

/// Parses chess moves from binary format one at a time
struct MoveStream<'a> {
    bytes: &'a [u8],
    position: Chess,
    index: usize,
}

impl<'a> MoveStream<'a> {
    const START_VARIATION: u8 = 254;
    const END_VARIATION: u8 = 253;
    const COMMENT: u8 = 252;
    const NAG: u8 = 251;

    fn new(bytes: &'a [u8], start_position: Chess) -> Self {
        Self {
            bytes,
            position: start_position,
            index: 0,
        }
    }

    #[inline]
    fn next_move(&mut self) -> Option<(Chess, String)> {
        let bytes = self.bytes;
        let len = bytes.len();

        while self.index < len {
            let byte = bytes[self.index];

            match byte {
                Self::COMMENT => {
                    if self.index + 8 >= len {
                        break;
                    }
                    let length_bytes = &bytes[self.index + 1..self.index + 9];
                    if let Ok(length_array) = <[u8; 8]>::try_from(length_bytes) {
                        let length = u64::from_be_bytes(length_array) as usize;
                        self.index += 9 + length;
                    } else {
                        break;
                    }
                }
                Self::NAG => {
                    self.index += 2;
                }
                Self::START_VARIATION => {
                    let mut depth = 1;
                    self.index += 1;
                    while self.index < len && depth > 0 {
                        match bytes[self.index] {
                            Self::START_VARIATION => depth += 1,
                            Self::END_VARIATION => depth -= 1,
                            _ => {}
                        }
                        self.index += 1;
                    }
                }
                Self::END_VARIATION => {
                    break;
                }
                move_byte => {
                    let legal_moves = self.position.legal_moves();
                    let idx = move_byte as usize;
                    if idx < legal_moves.len() {
                        if let Some(chess_move) = legal_moves.get(idx) {
                            let san = SanPlus::from_move_and_play_unchecked(
                                &mut self.position,
                                chess_move,
                            );
                            let move_string = san.to_string();
                            self.index += 1;
                            return Some((self.position.clone(), move_string));
                        }
                    }
                    break;
                }
            }
        }

        None
    }
}

/// Find the next move played after a position matches the query
/// This is the en-croissant version - simpler and more efficient
#[inline]
fn get_move_after_match(
    move_blob: &[u8],
    fen: &Option<String>,
    query: &PositionQuery,
) -> Result<Option<String>, Error> {
    use crate::db::encoding::decode_move;

    let mut chess = if let Some(fen) = fen {
        let fen = Fen::from_ascii(fen.as_bytes())?;
        Chess::from_setup(fen.into_setup(), shakmaty::CastlingMode::Chess960)?
    } else {
        Chess::default()
    };

    // Early return if position matches at start
    if query.matches(&chess) {
        if move_blob.is_empty() {
            return Ok(Some("*".to_string()));
        }
        if let Some(next_move) = decode_move(move_blob[0], &chess) {
            let san = SanPlus::from_move(chess, &next_move);
            return Ok(Some(san.to_string()));
        }
        return Ok(None);
    }

    let blob_len = move_blob.len();
    for (i, &byte) in move_blob.iter().enumerate() {
        let Some(m) = decode_move(byte, &chess) else {
            return Ok(None);
        };
        chess.play_unchecked(&m);

        // Early exit if unreachable
        let board = chess.board();
        if !query.is_reachable_by(&get_material_count(board), get_pawn_home(board)) {
            return Ok(None);
        }

        if query.matches(&chess) {
            if i == blob_len - 1 {
                return Ok(Some("*".to_string()));
            }
            if let Some(next_move) = decode_move(move_blob[i + 1], &chess) {
                let san = SanPlus::from_move(chess, &next_move);
                return Ok(Some(san.to_string()));
            }
            return Ok(None);
        }
    }
    Ok(None)
}

#[derive(Clone, serde::Serialize)]
pub struct ProgressPayload {
    pub progress: f64,
    pub id: String,
    pub finished: bool,
}

/// ============================================================================
/// Build checkpoints command
/// ============================================================================

/// Builds / extends the checkpoint index.
/// This is optional maintenance for large DBs.
/// It does NOT break existing flows.
#[allow(dead_code)]
#[tauri::command]
#[specta::specta]
pub async fn build_position_checkpoints(
    file: PathBuf,
    app: tauri::AppHandle,
    tab_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<i64, Error> {
    let file_str = file
        .to_str()
        .ok_or_else(|| Error::FenError("Invalid database path".to_string()))?;

    let db = &mut get_db_or_create(&state, file_str, ConnectionOptions::default())?;

    if ENABLE_AUX_INDEXES {
        ensure_aux_indexes(db);
    }
    ensure_checkpoint_table(db);

    // PRAGMAs for bulk-ish insert
    let _ = diesel::sql_query(
        "PRAGMA journal_mode=OFF; \
         PRAGMA synchronous=OFF; \
         PRAGMA temp_store=MEMORY; \
         PRAGMA mmap_size=1073741824; \
         PRAGMA cache_size=200000;",
    )
    .execute(db);

    // How many games exist
    let total_count: i64 = games::table.count().get_result(db)?;
    if total_count == 0 {
        return Ok(0);
    }
    let total_games = total_count as usize;

    // Keyset scan
    const BATCH_SIZE: usize = 50_000;
    let batches_to_process = (total_games / BATCH_SIZE + 1).min(200);
    let mut last_id: i32 = 0;

    // Insert batching respecting SQLite variable limit
    // 4 vars per row → 200 rows = 800 vars safe
    const INSERT_ROWS: usize = 200;

    let mut inserted_total: i64 = 0;
    let mut processed_total: usize = 0;
    let progress_step: usize = (total_games / 20).max(50_000);
    let mut next_progress_tick: usize = progress_step;

    for _ in 0..batches_to_process {
        let batch: Vec<(i32, Vec<u8>, Option<String>)> = games::table
            .filter(games::id.gt(last_id))
            .order(games::id.asc())
            .select((games::id, games::moves, games::fen))
            .limit(BATCH_SIZE as i64)
            .load(db)?;

        if batch.is_empty() {
            break;
        }

        if let Some(last) = batch.last() {
            last_id = last.0;
        }

        // Collect checkpoints for this batch
        let mut rows: Vec<(i32, i32, i64, i32)> = Vec::with_capacity(batch.len() * 4);

        for (game_id, moves, fen) in batch.iter() {
            // Start position
            let start_position = if let Some(fen) = fen {
                let fen = Fen::from_ascii(fen.as_bytes())?;
                Chess::from_setup(fen.into_setup(), shakmaty::CastlingMode::Chess960)?
            } else {
                Chess::default()
            };

            // ply 0 checkpoint
            let (h0, t0) = position_hash_and_turn(&start_position);
            rows.push((*game_id, 0, h0, t0));

            let mut stream = MoveStream::new(moves, start_position);
            let mut ply: i32 = 0;

            while let Some((pos, _san)) = stream.next_move() {
                ply += 1;
                if (ply as usize) % CHECKPOINT_STRIDE == 0 {
                    let (hh, tt) = position_hash_and_turn(&pos);
                    rows.push((*game_id, ply, hh, tt));
                }
            }
        }

        // Bulk insert in safe chunks
        for chunk in rows.chunks(INSERT_ROWS) {
            if chunk.is_empty() {
                continue;
            }

            let mut sql = String::from(
                "INSERT OR IGNORE INTO game_position_checkpoints \
                 (game_id, ply, board_hash, turn) VALUES ",
            );
            for (i, (gid, ply, bh, turn)) in chunk.iter().enumerate() {
                if i > 0 {
                    sql.push(',');
                }
                sql.push_str(&format!("({}, {}, {}, {})", gid, ply, bh, turn));
            }

            let r = diesel::sql_query(sql).execute(db)?;
            inserted_total += r as i64;
        }

        // Progress
        processed_total = processed_total.saturating_add(batch.len());
        if processed_total >= next_progress_tick {
            let progress = (processed_total as f64 / total_games as f64 * 100.0).min(99.0);
            let _ = app.emit(
                "search_progress",
                ProgressPayload {
                    progress,
                    id: tab_id.clone(),
                    finished: false,
                },
            );
            next_progress_tick = next_progress_tick.saturating_add(progress_step);
        }

        if batch.len() < BATCH_SIZE {
            break;
        }
    }

    let _ = app.emit(
        "search_progress",
        ProgressPayload {
            progress: 100.0,
            id: tab_id.clone(),
            finished: true,
        },
    );

    Ok(inserted_total)
}

/// ============================================================================
/// LOCAL internal search (original behavior preserved)
/// ============================================================================
///
/// Uses cached in-memory game list in `state.db_cache`.
/// This is the original LOCAL path.
/// Fix: when sorting by AverageElo, we must not take the first N matches found.
/// Instead, we keep a Top-K of highest average ELO while scanning.
/// To avoid breaking `state.db_cache` type, the AverageElo branch loads
/// a local vector from DB including white_elo/black_elo.
///
/// Returns: (openings stats, matching game ids)
fn search_position_local_internal(
    db: &mut SqliteConnection,
    position_query: &PositionQuery,
    query: &GameQueryJs,
    app: &tauri::AppHandle,
    tab_id: &str,
    state: &AppState,
) -> Result<(Vec<PositionStats>, Vec<i32>), Error> {
    const MAX_SAMPLE_GAMES: usize = 1000;

    let sort_avg = query
        .options
        .as_ref()
        .map(|o| matches!(o.sort, GameSort::AverageElo))
        .unwrap_or(false);

    #[inline]
    fn avg_elo(white: Option<i32>, black: Option<i32>) -> i32 {
        match (white, black) {
            (Some(w), Some(b)) => (w + b + 1) / 2,
            (Some(w), None) => w,
            (None, Some(b)) => b,
            (None, None) => 0,
        }
    }

    #[inline]
    fn push_top_k(vec: &mut Vec<(i32, i32)>, k: usize, item: (i32, i32)) {
        if vec.len() < k {
            vec.push(item);
            return;
        }

        // Find current min avg
        let mut min_idx = 0usize;
        let mut min_val = vec[0].0;
        for (i, (v, _)) in vec.iter().enumerate().skip(1) {
            if *v < min_val {
                min_val = *v;
                min_idx = i;
            }
        }

        if item.0 > min_val {
            vec[min_idx] = item;
        }
    }

    // Shared containers
    let openings: DashMap<String, PositionStats> = DashMap::with_capacity(128);
    let sample_games: Mutex<Vec<(i32, i32)>> =
        Mutex::new(Vec::with_capacity(MAX_SAMPLE_GAMES)); // (avg_elo, id)

    // Pre-compute filter values to avoid repeated clones
    let start_date = query.start_date.as_deref();
    let end_date = query.end_date.as_deref();
    let player1 = query.player1;
    let player2 = query.player2;
    let wanted_result = query.wanted_result.as_deref().and_then(|r| match r {
        "whitewon" => Some("1-0"),
        "blackwon" => Some("0-1"),
        "draw" => Some("1/2-1/2"),
        _ => None,
    });

    // ------------------------------------------------------------------------
    // Branch A: AverageElo sort (safe path that doesn't touch state.db_cache)
    // ------------------------------------------------------------------------
    if sort_avg {
        // Load a local vector including elos
        let games_with_elo: Vec<(
            i32,            // id
            i32,            // white_id
            i32,            // black_id
            Option<String>, // date
            Option<String>, // result
            Vec<u8>,        // moves
            Option<String>, // fen
            i32,            // pawn_home
            i32,            // white_material
            i32,            // black_material
            Option<i32>,    // white_elo
            Option<i32>,    // black_elo
        )> = games::table
            .select((
                games::id,
                games::white_id,
                games::black_id,
                games::date,
                games::result,
                games::moves,
                games::fen,
                games::pawn_home,
                games::white_material,
                games::black_material,
                games::white_elo,
                games::black_elo,
            ))
            .load(db)?;

        let games_len = games_with_elo.len();
        if games_len == 0 {
            return Ok((Vec::new(), Vec::new()));
        }

        let processed = AtomicUsize::new(0);
        let progress_step = (games_len / 20).max(50_000);
        let next_progress_tick = Arc::new(AtomicUsize::new(progress_step));
        let next_progress_tick_clone = next_progress_tick.clone();

        games_with_elo.par_iter().for_each(
            |(
                id,
                white_id,
                black_id,
                date,
                result,
                game,
                fen,
                end_pawn_home,
                white_material,
                black_material,
                white_elo,
                black_elo,
            )| {
                if state.new_request.available_permits() == 0 {
                    return;
                }

                // Early filter checks (most selective first)
                if let Some(white) = player1 {
                    if white != *white_id {
                        return;
                    }
                }

                if let Some(black) = player2 {
                    if black != *black_id {
                        return;
                    }
                }

                if let Some(expected_result) = wanted_result {
                    if result.as_deref() != Some(expected_result) {
                        return;
                    }
                }

                if let (Some(start_date), Some(date)) = (start_date, date) {
                    if date.as_str() < start_date {
                        return;
                    }
                }

                if let (Some(end_date), Some(date)) = (end_date, date) {
                    if date.as_str() > end_date {
                        return;
                    }
                }

                let end_material: MaterialCount = ByColor {
                    white: *white_material as u8,
                    black: *black_material as u8,
                };

                // Check reachability before expensive matching
                if !position_query.can_reach(&end_material, *end_pawn_home as u16) {
                    return;
                }

                let index = processed.fetch_add(1, Ordering::Relaxed);
                let current_tick = next_progress_tick_clone.load(Ordering::Relaxed);
                if index >= current_tick {
                    let _ = app.emit(
                        "search_progress",
                        ProgressPayload {
                            progress: ((index + 1) as f64 / games_len as f64 * 100.0).min(99.0),
                            id: tab_id.to_string(),
                            finished: false,
                        },
                    );
                    next_progress_tick_clone.store(
                        current_tick.saturating_add(progress_step),
                        Ordering::Relaxed,
                    );
                }

                if let Ok(Some(m)) = get_move_after_match(game, fen, position_query) {
                    // Keep Top-K by average elo
                    let a = avg_elo(*white_elo, *black_elo);
                    if let Ok(mut sample) = sample_games.try_lock() {
                        push_top_k(&mut sample, MAX_SAMPLE_GAMES, (a, *id));
                    }

                    // Update move stats
                    let entry = openings.entry(m);
                    match entry {
                        Entry::Occupied(mut e) => {
                            let opening = e.get_mut();
                            match result.as_deref() {
                                Some("1-0") => opening.white += 1,
                                Some("0-1") => opening.black += 1,
                                Some("1/2-1/2") => opening.draw += 1,
                                _ => (),
                            }
                        }
                        Entry::Vacant(e) => {
                            let move_str = e.key().clone();
                            let (white, black, draw) = match result.as_deref() {
                                Some("1-0") => (1, 0, 0),
                                Some("0-1") => (0, 1, 0),
                                Some("1/2-1/2") => (0, 0, 1),
                                _ => (0, 0, 0),
                            };
                            e.insert(PositionStats {
                                move_: move_str,
                                white,
                                black,
                                draw,
                            });
                        }
                    }
                }
            },
        );

        let openings_vec: Vec<PositionStats> = openings.into_iter().map(|(_, v)| v).collect();

        let mut sample = sample_games.into_inner().unwrap();
        // Sort Top-K by avg desc to ensure ids are already best-first
        sample.sort_by(|a, b| b.0.cmp(&a.0));
        let ids: Vec<i32> = sample.into_iter().map(|(_, id)| id).collect();

        return Ok((openings_vec, ids));
    }

    // ------------------------------------------------------------------------
    // Branch B: Original LOCAL path (uses state.db_cache)
    // ------------------------------------------------------------------------
    let mut games = state.db_cache.lock().unwrap();

    if games.is_empty() {
        *games = games::table
            .select((
                games::id,
                games::white_id,
                games::black_id,
                games::date,
                games::result,
                games::moves,
                games::fen,
                games::pawn_home,
                games::white_material,
                games::black_material,
            ))
            .load(db)?;
    }

    let games_len = games.len();
    if games_len == 0 {
        return Ok((Vec::new(), Vec::new()));
    }

    let processed = AtomicUsize::new(0);
    let progress_step = (games_len / 20).max(50_000);
    let next_progress_tick = Arc::new(AtomicUsize::new(progress_step));
    let next_progress_tick_clone = next_progress_tick.clone();

    games.par_iter().for_each(
        |(
            id,
            white_id,
            black_id,
            date,
            result,
            game,
            fen,
            end_pawn_home,
            white_material,
            black_material,
        )| {
            if state.new_request.available_permits() == 0 {
                return;
            }

            // Early filter checks (most selective first)
            if let Some(white) = player1 {
                if white != *white_id {
                    return;
                }
            }

            if let Some(black) = player2 {
                if black != *black_id {
                    return;
                }
            }

            if let Some(expected_result) = wanted_result {
                if result.as_deref() != Some(expected_result) {
                    return;
                }
            }

            if let (Some(start_date), Some(date)) = (start_date, date) {
                if date.as_str() < start_date {
                    return;
                }
            }

            if let (Some(end_date), Some(date)) = (end_date, date) {
                if date.as_str() > end_date {
                    return;
                }
            }

            let end_material: MaterialCount = ByColor {
                white: *white_material as u8,
                black: *black_material as u8,
            };

            // Check reachability before expensive matching
            if !position_query.can_reach(&end_material, *end_pawn_home as u16) {
                return;
            }

            let index = processed.fetch_add(1, Ordering::Relaxed);
            let current_tick = next_progress_tick_clone.load(Ordering::Relaxed);
            if index >= current_tick {
                let _ = app.emit(
                    "search_progress",
                    ProgressPayload {
                        progress: ((index + 1) as f64 / games_len as f64 * 100.0).min(99.0),
                        id: tab_id.to_string(),
                        finished: false,
                    },
                );
                next_progress_tick_clone.store(
                    current_tick.saturating_add(progress_step),
                    Ordering::Relaxed,
                );
            }

            if let Ok(Some(m)) = get_move_after_match(game, fen, position_query) {
                {
                    let mut sample = sample_games.lock().unwrap();
                    if sample.len() < MAX_SAMPLE_GAMES {
                        sample.push((0, *id));
                    }
                }

                let entry = openings.entry(m);
                match entry {
                    Entry::Occupied(mut e) => {
                        let opening = e.get_mut();
                        match result.as_deref() {
                            Some("1-0") => opening.white += 1,
                            Some("0-1") => opening.black += 1,
                            Some("1/2-1/2") => opening.draw += 1,
                            _ => (),
                        }
                    }
                    Entry::Vacant(e) => {
                        let move_str = e.key().clone();
                        let (white, black, draw) = match result.as_deref() {
                            Some("1-0") => (1, 0, 0),
                            Some("0-1") => (0, 1, 0),
                            Some("1/2-1/2") => (0, 0, 1),
                            _ => (0, 0, 0),
                        };
                        e.insert(PositionStats {
                            move_: move_str,
                            white,
                            black,
                            draw,
                        });
                    }
                }
            }
        },
    );

    let openings_vec: Vec<PositionStats> = openings.into_iter().map(|(_, v)| v).collect();
    let ids: Vec<i32> = sample_games
        .into_inner()
        .unwrap()
        .into_iter()
        .map(|(_, id)| id)
        .collect();

    Ok((openings_vec, ids))
}

/// ============================================================================
/// ONLINE internal search
/// ============================================================================

/// Search position in online databases (Lichess/Chess.com)
/// Uses reachability check from each game's initial position (from FEN)
/// and does NOT rely on `games.pawn_home/white_material/black_material`.
fn search_position_online_internal(
    db: &mut SqliteConnection,
    position_query: &PositionQuery,
    query: &GameQueryJs,
    app: &tauri::AppHandle,
    tab_id: &str,
    state: &AppState,
    total_games: usize,
) -> (Vec<PositionStats>, Vec<i32>) {
    const MAX_SAMPLE_GAMES: usize = 1000;

    let openings: DashMap<String, PositionStats> = DashMap::with_capacity(256);
    let sample_games: Mutex<Vec<i32>> = Mutex::new(Vec::with_capacity(MAX_SAMPLE_GAMES));

    // Load games directly from database (ONLINE path)
    let games: Vec<(
        i32,            // id
        i32,            // white_id
        i32,            // black_id
        Option<String>, // date
        Option<String>, // result
        Vec<u8>,        // moves
        Option<String>, // fen
        i32,            // pawn_home (ignored)
        i32,            // white_material (ignored)
        i32,            // black_material (ignored)
    )> = match games::table
        .select((
            games::id,
            games::white_id,
            games::black_id,
            games::date,
            games::result,
            games::moves,
            games::fen,
            games::pawn_home,
            games::white_material,
            games::black_material,
        ))
        .load(db)
    {
        Ok(g) => g,
        Err(_) => return (Vec::new(), Vec::new()),
    };

    let games_len = games.len();
    if games_len == 0 {
        return (Vec::new(), Vec::new());
    }

    let processed = AtomicUsize::new(0);
    let expected = total_games.max(games_len).max(1);
    let progress_step = (expected / 20).max(50000);
    let next_progress_tick = Arc::new(AtomicUsize::new(progress_step));
    let next_progress_tick_clone = next_progress_tick.clone();

    // Pre-compute filter values
    let start_date = query.start_date.as_deref();
    let end_date = query.end_date.as_deref();
    let player1 = query.player1;
    let player2 = query.player2;
    let wanted_result = query.wanted_result.as_deref().and_then(|r| match r {
        "whitewon" => Some("1-0"),
        "blackwon" => Some("0-1"),
        "draw" => Some("1/2-1/2"),
        _ => None,
    });

    let use_parallel = games_len < 1_000_000;

    if use_parallel {
        games.par_iter().for_each(
            |(
                id,
                white_id,
                black_id,
                date,
                result,
                game,
                fen,
                _end_pawn_home,
                _white_material,
                _black_material,
            )| {
                if state.new_request.available_permits() == 0 {
                    return;
                }

                // Early filter checks (most selective first)
                if let Some(white) = player1 {
                    if white != *white_id {
                        return;
                    }
                }

                if let Some(black) = player2 {
                    if black != *black_id {
                        return;
                    }
                }

                if let Some(expected_result) = wanted_result {
                    if result.as_deref() != Some(expected_result) {
                        return;
                    }
                }

                if let (Some(start_date), Some(date)) = (start_date, date) {
                    if date.as_str() < start_date {
                        return;
                    }
                }

                if let (Some(end_date), Some(date)) = (end_date, date) {
                    if date.as_str() > end_date {
                        return;
                    }
                }

                let index = processed.fetch_add(1, Ordering::Relaxed);
                let current_tick = next_progress_tick_clone.load(Ordering::Relaxed);
                if index >= current_tick {
                    let _ = app.emit(
                        "search_progress",
                        ProgressPayload {
                            progress: ((index + 1) as f64 / games_len as f64 * 100.0).min(99.0),
                            id: tab_id.to_string(),
                            finished: false,
                        },
                    );
                    next_progress_tick_clone.store(
                        current_tick.saturating_add(progress_step),
                        Ordering::Relaxed,
                    );
                }

                if let Ok(Some(m)) = get_move_after_match(game, fen, position_query) {
                    if let Ok(mut sample) = sample_games.try_lock() {
                        if sample.len() < MAX_SAMPLE_GAMES {
                            sample.push(*id);
                        }
                    }

                    let entry = openings.entry(m);
                    match entry {
                        Entry::Occupied(mut e) => {
                            let opening = e.get_mut();
                            match result.as_deref() {
                                Some("1-0") => opening.white += 1,
                                Some("0-1") => opening.black += 1,
                                Some("1/2-1/2") => opening.draw += 1,
                                _ => (),
                            }
                        }
                        Entry::Vacant(e) => {
                            let move_str = e.key().clone();
                            let (white, black, draw) = match result.as_deref() {
                                Some("1-0") => (1, 0, 0),
                                Some("0-1") => (0, 1, 0),
                                Some("1/2-1/2") => (0, 0, 1),
                                _ => (0, 0, 0),
                            };
                            e.insert(PositionStats {
                                move_: move_str,
                                white,
                                black,
                                draw,
                            });
                        }
                    }
                }
            },
        );
    } else {
        for (
            id,
            white_id,
            black_id,
            date,
            result,
            game,
            fen,
            _end_pawn_home,
            _white_material,
            _black_material,
        ) in games.iter()
        {
            if state.new_request.available_permits() == 0 {
                break;
            }

            // Early filter checks
            if let Some(white) = player1 {
                if white != *white_id {
                    continue;
                }
            }

            if let Some(black) = player2 {
                if black != *black_id {
                    continue;
                }
            }

            if let Some(expected_result) = wanted_result {
                if result.as_deref() != Some(expected_result) {
                    continue;
                }
            }

            if let (Some(start_date), Some(date)) = (start_date, date) {
                if date.as_str() < start_date {
                    continue;
                }
            }

            if let (Some(end_date), Some(date)) = (end_date, date) {
                if date.as_str() > end_date {
                    continue;
                }
            }

            let (initial_material, initial_pawn_home): (MaterialCount, u16) = if let Some(fen_str) =
                fen
            {
                if let Ok(fen_parsed) = Fen::from_ascii(fen_str.as_bytes()) {
                    if let Ok(start_pos) =
                        Chess::from_setup(fen_parsed.into_setup(), shakmaty::CastlingMode::Chess960)
                    {
                        (
                            get_material_count(start_pos.board()),
                            get_pawn_home(start_pos.board()),
                        )
                    } else {
                        let start = Chess::default();
                        (
                            get_material_count(start.board()),
                            get_pawn_home(start.board()),
                        )
                    }
                } else {
                    let start = Chess::default();
                    (
                        get_material_count(start.board()),
                        get_pawn_home(start.board()),
                    )
                }
            } else {
                let start = Chess::default();
                (
                    get_material_count(start.board()),
                    get_pawn_home(start.board()),
                )
            };

            if !position_query.can_reach(&initial_material, initial_pawn_home) {
                continue;
            }

            let index = processed.fetch_add(1, Ordering::Relaxed);
            let current_tick = next_progress_tick_clone.load(Ordering::Relaxed);
            if index >= current_tick {
                let _ = app.emit(
                    "search_progress",
                    ProgressPayload {
                        progress: ((index + 1) as f64 / games_len as f64 * 100.0).min(99.0),
                        id: tab_id.to_string(),
                        finished: false,
                    },
                );
                next_progress_tick_clone.store(
                    current_tick.saturating_add(progress_step),
                    Ordering::Relaxed,
                );
            }

            if let Ok(Some(m)) = get_move_after_match(game, fen, position_query) {
                {
                    let mut sample = sample_games.lock().unwrap();
                    if sample.len() < MAX_SAMPLE_GAMES {
                        sample.push(*id);
                    }
                }

                let entry = openings.entry(m);
                match entry {
                    Entry::Occupied(mut e) => {
                        let opening = e.get_mut();
                        match result.as_deref() {
                            Some("1-0") => opening.white += 1,
                            Some("0-1") => opening.black += 1,
                            Some("1/2-1/2") => opening.draw += 1,
                            _ => (),
                        }
                    }
                    Entry::Vacant(e) => {
                        let move_str = e.key().clone();
                        let (white, black, draw) = match result.as_deref() {
                            Some("1-0") => (1, 0, 0),
                            Some("0-1") => (0, 1, 0),
                            Some("1/2-1/2") => (0, 0, 1),
                            _ => (0, 0, 0),
                        };
                        e.insert(PositionStats {
                            move_: move_str,
                            white,
                            black,
                            draw,
                        });
                    }
                }
            }
        }
    }

    let openings: Vec<PositionStats> = openings.into_iter().map(|(_, v)| v).collect();
    let ids: Vec<i32> = sample_games.into_inner().unwrap();
    (openings, ids)
}

/// ============================================================================
/// Search for chess positions in the database
/// Returns position statistics and matching games
/// ============================================================================

#[tauri::command]
#[specta::specta]
pub async fn search_position(
    file: PathBuf,
    query: GameQueryJs,
    app: tauri::AppHandle,
    tab_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(Vec<PositionStats>, Vec<NormalizedGame>), Error> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    // Build cache key (without game_details_limit)
    let mut cache_query = query.clone();
    cache_query.game_details_limit = None;
    let cache_key = (cache_query.clone(), file.clone());

    if let Some(pos) = state.line_cache.get(&cache_key) {
        let (cached_openings, cached_games) = pos.value().clone();

        // Apply game_details_limit if specified
        let game_details_limit: usize = query
            .game_details_limit
            .unwrap_or(10)
            .min(1000)
            .try_into()
            .unwrap_or(10);

        let truncated_games = if cached_games.len() > game_details_limit {
            cached_games.into_iter().take(game_details_limit).collect()
        } else {
            cached_games
        };

        return Ok((cached_openings, truncated_games));
    }

    // Convert position query
    let position_query = match &query.position {
        Some(pos_query) => convert_position_query(pos_query.clone())?,
        None => return Err(Error::NoMatchFound),
    };

    let permit = state.new_request.acquire().await.unwrap();

    // Decide strategy based on DB type
    let online = is_online_database(&file);

    // Optional schema/index safety for large/foreign DBs
    // (kept behind flags and very cheap if already present)
    if ENABLE_AUX_INDEXES {
        ensure_aux_indexes(db);
    }
    if ENABLE_CHECKPOINT_TABLE_SCHEMA {
        ensure_checkpoint_table(db);
    }

    // Phase 1: scan and collect openings + sample IDs
    let (openings, ids): (Vec<PositionStats>, Vec<i32>) = if online {
        let total_count: i64 = games::table.count().get_result(db).unwrap_or(0);
        let total_games = total_count.max(0) as usize;

        search_position_online_internal(
            db,
            &position_query,
            &query,
            &app,
            &tab_id,
            state.inner(),
            total_games,
        )
    } else {
        search_position_local_internal(db, &position_query, &query, &app, &tab_id, state.inner())?
    };

    if state.new_request.available_permits() == 0 {
        drop(permit);
        return Err(Error::SearchStopped);
    }

    // Apply game_details_limit
    let game_details_limit: usize = query
        .game_details_limit
        .unwrap_or(10)
        .min(1000)
        .try_into()
        .unwrap_or(10);

    let ids_to_load: Vec<i32> = ids.into_iter().take(game_details_limit).collect();

    let (white_players, black_players) = diesel::alias!(players as white, players as black);
    let mut query_builder = games::table
        .inner_join(white_players.on(games::white_id.eq(white_players.field(players::id))))
        .inner_join(black_players.on(games::black_id.eq(black_players.field(players::id))))
        .inner_join(events::table.on(games::event_id.eq(events::id)))
        .inner_join(sites::table.on(games::site_id.eq(sites::id)))
        .filter(games::id.eq_any(&ids_to_load))
        .into_boxed();

    // Apply sorting if specified
    if let Some(options) = &query.options {
        query_builder = match options.sort {
            GameSort::Id => match options.direction {
                SortDirection::Asc => query_builder.order(games::id.asc()),
                SortDirection::Desc => query_builder.order(games::id.desc()),
            },
            GameSort::Date => match options.direction {
                SortDirection::Asc => query_builder.order((games::date.asc(), games::time.asc())),
                SortDirection::Desc => {
                    query_builder.order((games::date.desc(), games::time.desc()))
                }
            },
            GameSort::WhiteElo => match options.direction {
                SortDirection::Asc => query_builder.order(games::white_elo.asc()),
                SortDirection::Desc => query_builder.order(games::white_elo.desc()),
            },
            GameSort::BlackElo => match options.direction {
                SortDirection::Asc => query_builder.order(games::black_elo.asc()),
                SortDirection::Desc => query_builder.order(games::black_elo.desc()),
            },
            GameSort::PlyCount => match options.direction {
                SortDirection::Asc => query_builder.order(games::ply_count.asc()),
                SortDirection::Desc => query_builder.order(games::ply_count.desc()),
            },
            GameSort::AverageElo => query_builder,
        };
    }

    let games_result: Vec<(Game, Player, Player, Event, Site)> = if !ids_to_load.is_empty() {
        query_builder.load(db)?
    } else {
        Vec::new()
    };

    let mut normalized_games = normalize_games(games_result)?;

    // Sort by average ELO if needed (after loading)
    if let Some(options) = &query.options {
        if matches!(options.sort, GameSort::AverageElo) {
            let sort_direction = options.direction.clone();
            normalized_games.sort_by(|a, b| {
                let a_avg = match (a.white_elo, a.black_elo) {
                    (Some(w), Some(bl)) => Some((w + bl + 1) / 2),
                    (Some(e), None) | (None, Some(e)) => Some(e),
                    (None, None) => None,
                };
                let b_avg = match (b.white_elo, b.black_elo) {
                    (Some(w), Some(bl)) => Some((w + bl + 1) / 2),
                    (Some(e), None) | (None, Some(e)) => Some(e),
                    (None, None) => None,
                };

                let a_val = a_avg.unwrap_or(0);
                let b_val = b_avg.unwrap_or(0);

                match sort_direction {
                    SortDirection::Asc => a_val.cmp(&b_val),
                    SortDirection::Desc => b_val.cmp(&a_val),
                }
            });
        }
    }

    // Cache results (key ignores game_details_limit as before)
    state
        .line_cache
        .insert(cache_key, (openings.clone(), normalized_games.clone()));

    let _ = app.emit(
        "search_progress",
        ProgressPayload {
            progress: 100.0,
            id: tab_id.clone(),
            finished: true,
        },
    );

    drop(permit);
    Ok((openings, normalized_games))
}

/// Check if a position exists in the database (without full search)
pub async fn is_position_in_db(
    file: PathBuf,
    query: GameQueryJs,
    state: tauri::State<'_, AppState>,
) -> Result<bool, Error> {
    let mut cache_query = query.clone();
    cache_query.game_details_limit = None;

    if let Some(pos) = state.line_cache.get(&(cache_query.clone(), file.clone())) {
        return Ok(!pos.0.is_empty());
    }

    let permit = state.new_request.acquire().await.unwrap();

    let position_query = match &query.position {
        Some(pos_query) => convert_position_query(pos_query.clone())?,
        None => {
            drop(permit);
            return Ok(false);
        }
    };

    let file_str = file
        .to_str()
        .ok_or_else(|| Error::FenError("Invalid database path".to_string()))?;

    let db = &mut get_db_or_create(&state, file_str, ConnectionOptions::default())?;

    if ENABLE_AUX_INDEXES {
        ensure_aux_indexes(db);
    }
    if ENABLE_CHECKPOINT_TABLE_SCHEMA {
        ensure_checkpoint_table(db);
    }

    let mut sample_query_builder = games::table.into_boxed();

    if let Some(player1) = query.player1 {
        sample_query_builder = sample_query_builder.filter(games::white_id.eq(player1));
    }
    if let Some(player2) = query.player2 {
        sample_query_builder = sample_query_builder.filter(games::black_id.eq(player2));
    }

    if ENABLE_MATERIAL_SQL_PREFILTER {
        let t = position_query.target_material();
        sample_query_builder =
            sample_query_builder.filter(games::white_material.ge(t.white as i32));
        sample_query_builder =
            sample_query_builder.filter(games::black_material.ge(t.black as i32));
    }

    let sample: Vec<(i32, Option<String>, Vec<u8>, Option<String>)> = sample_query_builder
        .select((games::id, games::result, games::moves, games::fen))
        .limit(1000)
        .load(db)?;

    let exists = sample.iter().any(|(_id, _result, game, fen)| {
        get_move_after_match(game, fen, &position_query)
            .unwrap_or(None)
            .is_some()
    });

    if !exists {
        state
            .line_cache
            .insert((cache_query, file), (vec![], vec![]));
    }

    drop(permit);
    Ok(exists)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_partial_match(fen1: &str, fen2: &str) {
        let query = PositionQuery::partial_from_fen(fen1).unwrap();
        let fen = Fen::from_ascii(fen2.as_bytes()).unwrap();
        let chess = Chess::from_setup(fen.into_setup(), shakmaty::CastlingMode::Chess960).unwrap();
        assert!(query.matches(&chess));
    }

    #[test]
    fn exact_matches() {
        let query = PositionQuery::exact_from_fen(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        )
        .unwrap();
        let chess = Chess::default();
        assert!(query.matches(&chess));
    }

    #[test]
    fn empty_matches_anything() {
        assert_partial_match(
            "8/8/8/8/8/8/8/8 w - - 0 1",
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        );
    }

    #[test]
    fn correct_partial_match() {
        assert_partial_match(
            "8/8/8/8/8/8/8/6N1 w - - 0 1",
            "3k4/8/8/8/8/4P3/3PKP2/6N1 w - - 0 1",
        );
    }

    #[test]
    #[should_panic]
    fn fail_partial_match() {
        assert_partial_match(
            "8/8/8/8/8/8/8/6N1 w - - 0 1",
            "3k4/8/8/8/8/4P3/3PKP2/7N w - - 0 1",
        );
        assert_partial_match(
            "8/8/8/8/8/8/8/6N1 w - - 0 1",
            "3k4/8/8/8/8/4P3/3PKP2/6n1 w - - 0 1",
        );
    }

    #[test]
    fn correct_exact_is_reachable() {
        let query =
            PositionQuery::exact_from_fen("rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR")
                .unwrap();
        let chess = Chess::default();
        assert!(query.is_reachable_by(
            &get_material_count(chess.board()),
            get_pawn_home(chess.board())
        ));
    }

    #[test]
    fn correct_partial_is_reachable() {
        let query = PositionQuery::partial_from_fen("8/8/8/8/8/8/8/8").unwrap();
        let chess = Chess::default();
        assert!(query.is_reachable_by(
            &get_material_count(chess.board()),
            get_pawn_home(chess.board())
        ));
    }

    #[test]
    fn correct_partial_can_reach() {
        let query = PositionQuery::partial_from_fen("8/8/8/8/8/8/8/8").unwrap();
        let chess = Chess::default();
        assert!(query.can_reach(
            &get_material_count(chess.board()),
            get_pawn_home(chess.board())
        ));
    }

    #[test]
    fn get_move_after_exact_match_test() {
        let game = vec![12, 12]; // 1. e4 e5

        let query = PositionQuery::exact_from_fen(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        )
        .unwrap();
        let result = get_move_after_match(&game[..], &None, &query).unwrap();
        assert_eq!(result, Some("e4".to_string()));

        let query = PositionQuery::exact_from_fen(
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        )
        .unwrap();
        let result = get_move_after_match(&game[..], &None, &query).unwrap();
        assert_eq!(result, Some("e5".to_string()));

        let query = PositionQuery::exact_from_fen(
            "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
        )
        .unwrap();
        let result = get_move_after_match(&game[..], &None, &query).unwrap();
        assert_eq!(result, Some("*".to_string()));
    }

    #[test]
    fn get_move_after_partial_match_test() {
        let game = vec![12, 12]; // 1. e4 e5

        let query = PositionQuery::partial_from_fen("8/pppppppp/8/8/8/8/PPPPPPPP/8").unwrap();
        let result = get_move_after_match(&game[..], &None, &query).unwrap();
        assert_eq!(result, Some("e4".to_string()));
    }
}
