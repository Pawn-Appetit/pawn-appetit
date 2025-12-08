//! Position search functionality
//! 
//! This module handles searching for chess positions in game databases.
//! It supports both exact position matching and partial position matching.

use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel::sql_types::{Integer, BigInt};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use shakmaty::{
    fen::Fen,
    san::SanPlus,
    Bitboard,
    Chess,
    EnPassantMode,
    FromSetup,
    Position,
    Setup,
    Color,
};
use specta::Type;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use tauri::Emitter;

use crate::{
    db::{
        get_db_or_create, get_pawn_home, models::*,
        pgn::{get_material_count, MaterialCount},
        normalize_games, schema::*, ConnectionOptions, GameSort, SortDirection,
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
const ENABLE_MATERIAL_SQL_PREFILTER: bool = false;

/// Create minimal + material indexes automatically.
const ENABLE_AUX_INDEXES: bool = true;

/// Enable checkpoint schema auto-creation.
const ENABLE_CHECKPOINT_TABLE_SCHEMA: bool = true;

/// Enable checkpoint-based fast-path for EXACT queries.
const ENABLE_CHECKPOINT_FAST_PATH: bool = true;

/// Checkpoint stride (every N plies).
const CHECKPOINT_STRIDE: usize = 8;

/// Max candidates allowed to switch into checkpoint path.
/// If more than this, fallback to full scan to avoid huge IN lists.
const MAX_CHECKPOINT_CANDIDATES: usize = 350_000;

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

        if !kings.is_empty() { non_empty |= Self::KINGS; }
        if !queens.is_empty() { non_empty |= Self::QUEENS; }
        if !rooks.is_empty() { non_empty |= Self::ROOKS; }
        if !bishops.is_empty() { non_empty |= Self::BISHOPS; }
        if !knights.is_empty() { non_empty |= Self::KNIGHTS; }
        if !pawns.is_empty() { non_empty |= Self::PAWNS; }
        if !white.is_empty() { non_empty |= Self::WHITE; }
        if !black.is_empty() { non_empty |= Self::BLACK; }

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

    #[inline(always)]
    fn is_exact(&self) -> bool {
        matches!(self, PositionQuery::Exact(_))
    }

    #[inline(always)]
    fn exact_position(&self) -> Option<&Chess> {
        match self {
            PositionQuery::Exact(ref data) => Some(&data.position),
            _ => None,
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
        _ => Err(Error::FenError(format!("Invalid position query type: {}", query.type_))),
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
                { return false; }
                if (m.non_empty & PartialMasks::QUEENS) != 0
                    && !is_contained(tested.queens(), m.queens)
                { return false; }
                if (m.non_empty & PartialMasks::ROOKS) != 0
                    && !is_contained(tested.rooks(), m.rooks)
                { return false; }
                if (m.non_empty & PartialMasks::BISHOPS) != 0
                    && !is_contained(tested.bishops(), m.bishops)
                { return false; }
                if (m.non_empty & PartialMasks::KNIGHTS) != 0
                    && !is_contained(tested.knights(), m.knights)
                { return false; }
                if (m.non_empty & PartialMasks::PAWNS) != 0
                    && !is_contained(tested.pawns(), m.pawns)
                { return false; }
                if (m.non_empty & PartialMasks::WHITE) != 0
                    && !is_contained(tested.white(), m.white)
                { return false; }
                if (m.non_empty & PartialMasks::BLACK) != 0
                    && !is_contained(tested.black(), m.black)
                { return false; }

                true
            }
        }
    }

    #[inline(always)]
    fn has_sufficient_material(&self, current_material: &MaterialCount) -> bool {
        let target = self.target_material();
        current_material.white >= target.white && current_material.black >= target.black
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

    #[cfg(test)]
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
                            let san =
                                SanPlus::from_move_and_play_unchecked(&mut self.position, chess_move);
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
#[inline]
fn get_move_after_match(
    move_blob: &[u8],
    fen: &Option<String>,
    query: &PositionQuery,
) -> Result<Option<String>, Error> {
    let start_position = if let Some(fen) = fen {
        let fen = Fen::from_ascii(fen.as_bytes())?;
        Chess::from_setup(fen.into_setup(), shakmaty::CastlingMode::Chess960)?
    } else {
        Chess::default()
    };

    let query_material = query.target_material();
    let is_exact = query.is_exact();

    if query.matches(&start_position) {
        let mut stream = MoveStream::new(move_blob, start_position);
        if let Some((_, first_move)) = stream.next_move() {
            return Ok(Some(first_move));
        }
        return Ok(Some("*".to_string()));
    }

    let start_board = start_position.board();
    let start_material = get_material_count(start_board);
    if !query.has_sufficient_material(&start_material) {
        return Ok(None);
    }

    let mut stream = MoveStream::new(move_blob, start_position);

    while let Some((current_position, _current_move)) = stream.next_move() {
        let board = current_position.board();
        let material = get_material_count(board);

        if material.white < query_material.white || material.black < query_material.black {
            return Ok(None);
        }

        if is_exact {
            let pawn_home = get_pawn_home(board);
            if !query.is_reachable_by(&material, pawn_home) {
                return Ok(None);
            }
        } else {
            if !query.is_reachable_by(&material, 0) {
                return Ok(None);
            }
        }

        if query.matches(&current_position) {
            if let Some((_, next_move)) = stream.next_move() {
                return Ok(Some(next_move));
            }
            return Ok(Some("*".to_string()));
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
/// Checkpoint query rows
/// ============================================================================
#[derive(QueryableByName)]
struct GameIdRow {
    #[diesel(sql_type = Integer)]
    game_id: i32,
}

#[derive(QueryableByName)]
struct CountRow {
    #[diesel(sql_type = BigInt)]
    c: i64,
}

/// ============================================================================
/// Build checkpoints command
/// ============================================================================

/// Builds / extends the checkpoint index.
/// This is optional maintenance for large DBs.
/// It does NOT break existing flows.
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
                if i > 0 { sql.push(','); }
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
/// Checkpoint-based exact search path
/// ============================================================================

#[inline]
fn has_any_checkpoints(db: &mut SqliteConnection) -> bool {
    let count: QueryResult<i64> = diesel::sql_query(
        "SELECT COUNT(1) as c FROM game_position_checkpoints",
    )
    .get_result::<CountRow>(db)
    .map(|r| r.c);

    match count {
        Ok(c) => c > 0,
        Err(_) => false,
    }
}

#[inline]
fn load_checkpoint_candidates(
    db: &mut SqliteConnection,
    target_hash: i64,
    target_turn: i32,
) -> Result<Vec<i32>, Error> {
    let rows: Vec<GameIdRow> = diesel::sql_query(
        "SELECT DISTINCT game_id \
         FROM game_position_checkpoints \
         WHERE board_hash = ? AND turn = ?",
    )
    .bind::<BigInt, _>(target_hash)
    .bind::<Integer, _>(target_turn)
    .load(db)?;

    Ok(rows.into_iter().map(|r| r.game_id).collect())
}

/// Same reduction logic as main scan but on a narrowed ID set.
/// We reuse the existing filters by applying id.eq_any(chunk) to base query.
fn search_exact_with_candidates(
    candidates: &[i32],
    build_base_query: &dyn Fn() -> games::BoxedQuery<'static, diesel::sqlite::Sqlite>,
    db: &mut SqliteConnection,
    position_query: &PositionQuery,
) -> Result<(Vec<PositionStats>, Vec<i32>), Error> {
    #[derive(Default)]
    struct ThreadLocalResults {
        position_stats: HashMap<String, PositionStats>,
        matched_ids: Vec<i32>,
    }

    let mut position_stats: HashMap<String, PositionStats> = HashMap::with_capacity(128);
    let mut matched_game_ids: Vec<i32> = Vec::with_capacity(1000);

    const ID_CHUNK: usize = 900;

    for chunk in candidates.chunks(ID_CHUNK) {
        let rows: Vec<(i32, Option<String>, Vec<u8>, Option<String>)> = build_base_query()
            .filter(games::id.eq_any(chunk))
            .select((games::id, games::result, games::moves, games::fen))
            .load(db)?;

        if rows.is_empty() {
            continue;
        }

        let position_query_clone = position_query.clone();

        let batch_results = rows
            .par_iter()
            .fold(
                || ThreadLocalResults::default(),
                |mut acc, (id, result, moves, fen)| {
                    if let Ok(Some(next_move)) =
                        get_move_after_match(moves, fen, &position_query_clone)
                    {
                        if acc.matched_ids.len() < 1000 {
                            acc.matched_ids.push(*id);
                        }

                        let stats = acc.position_stats.entry(next_move.clone()).or_insert_with(|| {
                            PositionStats {
                                move_: next_move,
                                white: 0,
                                black: 0,
                                draw: 0,
                            }
                        });

                        if let Some(res) = result.as_deref() {
                            match res {
                                "1-0" => stats.white += 1,
                                "0-1" => stats.black += 1,
                                "1/2-1/2" => stats.draw += 1,
                                _ => (),
                            }
                        }
                    }
                    acc
                },
            )
            .reduce(
                || ThreadLocalResults::default(),
                |mut acc1, mut acc2| {
                    if acc1.position_stats.is_empty() {
                        std::mem::swap(&mut acc1.position_stats, &mut acc2.position_stats);
                    } else {
                        for (key, stats2) in acc2.position_stats {
                            let stats1 =
                                acc1.position_stats.entry(key).or_insert_with(|| PositionStats {
                                    move_: stats2.move_.clone(),
                                    white: 0,
                                    black: 0,
                                    draw: 0,
                                });
                            stats1.white += stats2.white;
                            stats1.black += stats2.black;
                            stats1.draw += stats2.draw;
                        }
                    }

                    let remaining = 1000 - acc1.matched_ids.len();
                    if remaining > 0 {
                        let to_add = acc2.matched_ids.len().min(remaining);
                        acc1.matched_ids.reserve(to_add);
                        acc1.matched_ids.extend(acc2.matched_ids.into_iter().take(remaining));
                    }

                    acc1
                },
            );

        for (key, stats2) in batch_results.position_stats {
            let stats1 = position_stats.entry(key).or_insert_with(|| PositionStats {
                move_: stats2.move_.clone(),
                white: 0,
                black: 0,
                draw: 0,
            });
            stats1.white += stats2.white;
            stats1.black += stats2.black;
            stats1.draw += stats2.draw;
        }

        let remaining = 1000 - matched_game_ids.len();
        if remaining > 0 {
            let to_add = batch_results.matched_ids.len().min(remaining);
            matched_game_ids.reserve(to_add);
            matched_game_ids.extend(batch_results.matched_ids.into_iter().take(remaining));
        }
    }

    Ok((position_stats.into_values().collect(), matched_game_ids))
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
    // Cancel any previous search for this tab
    if let Some(prev_cancel_flag) = state.active_searches.get(&tab_id) {
        prev_cancel_flag.store(true, Ordering::Relaxed);
    }

    let cancel_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
    state.active_searches.insert(tab_id.clone(), cancel_flag.clone());

    // Convert position query if present
    let position_query = match &query.position {
        Some(pos_query) => {
            Some(convert_position_query(pos_query.clone())?)
        },
        None => {
            state.active_searches.remove(&tab_id);
            return Err(Error::NoMatchFound);
        }
    };

    let position_query = position_query.unwrap();
    let position_query_for_sql = position_query.clone();

    // Cache controls
    const DISABLE_CACHE: bool = false;
    const MAX_CACHE_ENTRIES: usize = 100;

    if !DISABLE_CACHE {
        let mut cache_query = query.clone();
        cache_query.game_details_limit = None;
        let cache_key = (cache_query, file.clone());

        if let Some(cached_result) = state.line_cache.get(&cache_key) {
            let (cached_openings, cached_games) = cached_result.value().clone();

            let game_details_limit_usize: usize = query.game_details_limit
                .unwrap_or(10)
                .min(1000)
                .try_into()
                .unwrap_or(10);

            let truncated_games = if cached_games.len() > game_details_limit_usize {
                cached_games.into_iter().take(game_details_limit_usize).collect()
            } else {
                cached_games
            };

            state.active_searches.remove(&tab_id);
            return Ok((cached_openings, truncated_games));
        }

        if state.line_cache.len() >= MAX_CACHE_ENTRIES {
            let entries_to_remove = state.line_cache.len() / 5;
            let keys_to_remove: Vec<_> = state.line_cache.iter()
                .take(entries_to_remove)
                .map(|entry| entry.key().clone())
                .collect();
            for key in keys_to_remove {
                state.line_cache.remove(&key);
            }
        }
    }

    if cancel_flag.load(Ordering::Relaxed) {
        state.active_searches.remove(&tab_id);
        return Err(Error::SearchStopped);
    }

    let permit = state.new_request.acquire().await.unwrap();

    if cancel_flag.load(Ordering::Relaxed) {
        state.active_searches.remove(&tab_id);
        drop(permit);
        return Err(Error::SearchStopped);
    }

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

    // Read-only friendly PRAGMAs
    let _ = diesel::sql_query(
        "PRAGMA journal_mode=OFF; \
         PRAGMA synchronous=OFF; \
         PRAGMA temp_store=MEMORY; \
         PRAGMA mmap_size=1073741824; \
         PRAGMA cache_size=200000;",
    )
    .execute(db);

    // Clone values needed for the closure to avoid lifetime issues
    let player1 = query.player1;
    let player2 = query.player2;
    let start_date = query.start_date.clone();
    let end_date = query.end_date.clone();
    let wanted_result = query.wanted_result.clone();
    let position_query_for_sql_clone = position_query_for_sql.clone();

    // Helper to build filtered query
    let build_base_query = move || -> games::BoxedQuery<'static, diesel::sqlite::Sqlite> {
        let mut q: games::BoxedQuery<'static, diesel::sqlite::Sqlite> = games::table.into_boxed();

        if let Some(player1) = player1 {
            q = q.filter(games::white_id.eq(player1));
        }
        if let Some(player2) = player2 {
            q = q.filter(games::black_id.eq(player2));
        }
        if let Some(start_date) = &start_date {
            let date_str = start_date.clone();
            q = q.filter(games::date.ge(date_str));
        }
        if let Some(end_date) = &end_date {
            let date_str = end_date.clone();
            q = q.filter(games::date.le(date_str));
        }
        if let Some(wanted_result) = &wanted_result {
            let result_filter = match wanted_result.as_str() {
                "whitewon" => "1-0",
                "blackwon" => "0-1",
                "draw" => "1/2-1/2",
                _ => "",
            };
            if !result_filter.is_empty() {
                q = q.filter(games::result.eq(result_filter));
            }
        }

        if ENABLE_MATERIAL_SQL_PREFILTER {
            let t = position_query_for_sql_clone.target_material();
            q = q.filter(games::white_material.ge(t.white as i32));
            q = q.filter(games::black_material.ge(t.black as i32));
        }

        q
    };

    // ------------------------------------------------------------------------
    // FAST PATH: EXACT + checkpoints
    // ------------------------------------------------------------------------
    if ENABLE_CHECKPOINT_FAST_PATH && position_query.is_exact() && has_any_checkpoints(db) {
        if let Some(exact_pos) = position_query.exact_position() {
            let (target_hash, target_turn) = position_hash_and_turn(exact_pos);

            let candidates = load_checkpoint_candidates(db, target_hash, target_turn)
                .unwrap_or_default();

            if !candidates.is_empty() && candidates.len() <= MAX_CHECKPOINT_CANDIDATES {
                // Search only candidates with existing filters
                let (openings, matched_game_ids) =
                    search_exact_with_candidates(&candidates, &build_base_query, db, &position_query)?;

                // Load full game details (limited)
                let game_details_limit: usize = query.game_details_limit
                    .unwrap_or(10)
                    .min(1000)
                    .try_into()
                    .unwrap_or(10);

                let mut normalized_games = if !matched_game_ids.is_empty() && game_details_limit > 0 {
                    let db = &mut get_db_or_create(&state, file_str, ConnectionOptions::default())?;
                    if ENABLE_AUX_INDEXES {
                        ensure_aux_indexes(db);
                    }

                    const CHUNK_SIZE: usize = 900;
                    let mut all_detailed_games = Vec::new();

                    for chunk in matched_game_ids
                        .iter()
                        .take(game_details_limit)
                        .copied()
                        .collect::<Vec<_>>()
                        .chunks(CHUNK_SIZE)
                    {
                        let (white_players, black_players) = diesel::alias!(players as white, players as black);
                        let mut query_builder = games::table
                            .inner_join(white_players.on(games::white_id.eq(white_players.field(players::id))))
                            .inner_join(black_players.on(games::black_id.eq(black_players.field(players::id))))
                            .inner_join(events::table.on(games::event_id.eq(events::id)))
                            .inner_join(sites::table.on(games::site_id.eq(sites::id)))
                            .filter(games::id.eq_any(chunk))
                            .into_boxed();

                        let query_options = query.options.as_ref();
                        if let Some(options) = query_options {
                            query_builder = match options.sort {
                                GameSort::Id => match options.direction {
                                    SortDirection::Asc => query_builder.order(games::id.asc()),
                                    SortDirection::Desc => query_builder.order(games::id.desc()),
                                },
                                GameSort::Date => match options.direction {
                                    SortDirection::Asc => query_builder.order((games::date.asc(), games::time.asc())),
                                    SortDirection::Desc => query_builder.order((games::date.desc(), games::time.desc())),
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

                        let chunk_games: Vec<(Game, Player, Player, Event, Site)> = query_builder.load(db)?;
                        all_detailed_games.extend(chunk_games);
                    }

                    normalize_games(all_detailed_games)?
                } else {
                    Vec::new()
                };

                // Sort by average ELO if needed
                let query_options = query.options.as_ref();
                let should_sort_by_avg_elo = query_options
                    .map(|opt| matches!(opt.sort, GameSort::AverageElo))
                    .unwrap_or(true);

                let sort_direction = query_options
                    .map(|opt| opt.direction.clone())
                    .unwrap_or(SortDirection::Desc);

                if should_sort_by_avg_elo {
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

                // Cache results
                let result = (openings.clone(), normalized_games.clone());
                if !DISABLE_CACHE {
                    let mut cache_query = query.clone();
                    cache_query.game_details_limit = None;
                    let cache_key = (cache_query, file.clone());
                    if !openings.is_empty() || !normalized_games.is_empty() {
                        state.line_cache.insert(cache_key, result.clone());
                    }
                }

                let _ = app.emit(
                    "search_progress",
                    ProgressPayload { progress: 100.0, id: tab_id.clone(), finished: true },
                );

                drop(permit);
                state.active_searches.remove(&tab_id);
                return Ok(result);
            }
        }
    }

    // ------------------------------------------------------------------------
    // FALLBACK PATH: full scan (your optimized batch flow)
    // ------------------------------------------------------------------------

    const BATCH_SIZE_NO_FILTERS: usize = 200_000;
    const BATCH_SIZE_FILTERED: usize = 50_000;
    const MAX_BATCHES: usize = 50;

    let total_count: i64 = build_base_query().count().get_result(db)?;
    if total_count == 0 {
        state.active_searches.remove(&tab_id);
        drop(permit);
        return Ok((vec![], vec![]));
    }
    let total_games = total_count as usize;

    let mut position_stats: HashMap<String, PositionStats> = HashMap::with_capacity(128);
    let mut matched_game_ids: Vec<i32> = Vec::with_capacity(1000);

    #[derive(Default)]
    struct ThreadLocalResults {
        position_stats: HashMap<String, PositionStats>,
        matched_ids: Vec<i32>,
    }

    let has_filters = query.player1.is_some()
        || query.player2.is_some()
        || query.start_date.is_some()
        || query.end_date.is_some()
        || query.wanted_result.is_some();

    let batch_size: usize = if has_filters {
        BATCH_SIZE_FILTERED
    } else {
        BATCH_SIZE_NO_FILTERS
    };

    let batches_to_process = (total_games / batch_size + 1).min(MAX_BATCHES);
    let mut last_id: i32 = 0;

    // Progress OUTSIDE hot path
    let mut processed_total: usize = 0;
    let progress_step: usize = (total_games / 20).max(50_000);
    let mut next_progress_tick: usize = progress_step;

    for _batch_num in 0..batches_to_process {
        if cancel_flag.load(Ordering::Relaxed) {
            state.active_searches.remove(&tab_id);
            drop(permit);
            return Err(Error::SearchStopped);
        }

        // Narrow SELECT hot path
        let batch: Vec<(i32, Option<String>, Vec<u8>, Option<String>)> =
            build_base_query()
                .filter(games::id.gt(last_id))
                .order(games::id.asc())
                .select((games::id, games::result, games::moves, games::fen))
                .limit(batch_size as i64)
                .load(db)?;

        if batch.is_empty() {
            break;
        }

        if let Some(last) = batch.last() {
            last_id = last.0;
        }

        let cancel_flag_clone = cancel_flag.clone();
        let position_query_clone = position_query.clone();

        let batch_results = batch.par_iter()
            .fold(
                || ThreadLocalResults::default(),
                |mut acc, (id, result, moves, fen)| {
                    if cancel_flag_clone.load(Ordering::Relaxed) {
                        return acc;
                    }

                    if let Ok(Some(next_move)) = get_move_after_match(moves, fen, &position_query_clone) {
                        if acc.matched_ids.len() < 1000 {
                            acc.matched_ids.push(*id);
                        }

                        let stats = acc.position_stats.entry(next_move.clone()).or_insert_with(|| PositionStats {
                            move_: next_move,
                            white: 0,
                            black: 0,
                            draw: 0,
                        });

                        if let Some(res) = result.as_deref() {
                            match res {
                                "1-0" => stats.white += 1,
                                "0-1" => stats.black += 1,
                                "1/2-1/2" => stats.draw += 1,
                                _ => (),
                            }
                        }
                    }

                    acc
                }
            )
            .reduce(
                || ThreadLocalResults::default(),
                |mut acc1, mut acc2| {
                    if acc1.position_stats.is_empty() {
                        std::mem::swap(&mut acc1.position_stats, &mut acc2.position_stats);
                    } else {
                        for (key, stats2) in acc2.position_stats {
                            let stats1 = acc1.position_stats.entry(key).or_insert_with(|| PositionStats {
                                move_: stats2.move_.clone(),
                                white: 0,
                                black: 0,
                                draw: 0,
                            });
                            stats1.white += stats2.white;
                            stats1.black += stats2.black;
                            stats1.draw += stats2.draw;
                        }
                    }

                    let remaining = 1000 - acc1.matched_ids.len();
                    if remaining > 0 {
                        let to_add = acc2.matched_ids.len().min(remaining);
                        acc1.matched_ids.reserve(to_add);
                        acc1.matched_ids.extend(acc2.matched_ids.into_iter().take(remaining));
                    }

                    acc1
                }
            );

        for (key, stats2) in batch_results.position_stats {
            let stats1 = position_stats.entry(key).or_insert_with(|| PositionStats {
                move_: stats2.move_.clone(),
                white: 0,
                black: 0,
                draw: 0,
            });
            stats1.white += stats2.white;
            stats1.black += stats2.black;
            stats1.draw += stats2.draw;
        }

        let remaining = 1000 - matched_game_ids.len();
        if remaining > 0 {
            let to_add = batch_results.matched_ids.len().min(remaining);
            matched_game_ids.reserve(to_add);
            matched_game_ids.extend(batch_results.matched_ids.into_iter().take(remaining));
        }

        // Batch progress
        processed_total = processed_total.saturating_add(batch.len());
        if processed_total >= next_progress_tick {
            let progress = (processed_total as f64 / total_games as f64 * 100.0).min(99.0);
            let _ = app.emit(
                "search_progress",
                ProgressPayload { progress, id: tab_id.clone(), finished: false },
            );
            next_progress_tick = next_progress_tick.saturating_add(progress_step);
        }

        if batch.len() < batch_size {
            break;
        }
    }

    let openings: Vec<PositionStats> = position_stats.into_values().collect();

    let game_details_limit: usize = query.game_details_limit
        .unwrap_or(10)
        .min(1000)
        .try_into()
        .unwrap_or(10);

    let mut normalized_games = if !matched_game_ids.is_empty() && game_details_limit > 0 {
        let db = &mut get_db_or_create(&state, file_str, ConnectionOptions::default())?;
        if ENABLE_AUX_INDEXES {
            ensure_aux_indexes(db);
        }

        const CHUNK_SIZE: usize = 900;
        let mut all_detailed_games = Vec::new();

        for chunk in matched_game_ids
            .iter()
            .take(game_details_limit)
            .copied()
            .collect::<Vec<_>>()
            .chunks(CHUNK_SIZE)
        {
            let (white_players, black_players) = diesel::alias!(players as white, players as black);
            let mut query_builder = games::table
                .inner_join(white_players.on(games::white_id.eq(white_players.field(players::id))))
                .inner_join(black_players.on(games::black_id.eq(black_players.field(players::id))))
                .inner_join(events::table.on(games::event_id.eq(events::id)))
                .inner_join(sites::table.on(games::site_id.eq(sites::id)))
                .filter(games::id.eq_any(chunk))
                .into_boxed();

            let query_options = query.options.as_ref();
            if let Some(options) = query_options {
                query_builder = match options.sort {
                    GameSort::Id => match options.direction {
                        SortDirection::Asc => query_builder.order(games::id.asc()),
                        SortDirection::Desc => query_builder.order(games::id.desc()),
                    },
                    GameSort::Date => match options.direction {
                        SortDirection::Asc => query_builder.order((games::date.asc(), games::time.asc())),
                        SortDirection::Desc => query_builder.order((games::date.desc(), games::time.desc())),
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

            let chunk_games: Vec<(Game, Player, Player, Event, Site)> = query_builder.load(db)?;
            all_detailed_games.extend(chunk_games);
        }

        normalize_games(all_detailed_games)?
    } else {
        Vec::new()
    };

    // Sort by average ELO in Rust if needed
    let query_options = query.options.as_ref();
    let should_sort_by_avg_elo = query_options
        .map(|opt| matches!(opt.sort, GameSort::AverageElo))
        .unwrap_or(true);

    let sort_direction = query_options
        .map(|opt| opt.direction.clone())
        .unwrap_or(SortDirection::Desc);

    if should_sort_by_avg_elo {
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

    if cancel_flag.load(Ordering::Relaxed) {
        state.active_searches.remove(&tab_id);
        drop(permit);
        return Err(Error::SearchStopped);
    }

    let result = (openings.clone(), normalized_games.clone());

    if !DISABLE_CACHE {
        let mut cache_query = query.clone();
        cache_query.game_details_limit = None;
        let cache_key = (cache_query, file.clone());

        if !openings.is_empty() || !normalized_games.is_empty() {
            state.line_cache.insert(cache_key, result.clone());
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

    drop(permit);
    state.active_searches.remove(&tab_id);

    Ok(result)
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
        sample_query_builder = sample_query_builder.filter(games::white_material.ge(t.white as i32));
        sample_query_builder = sample_query_builder.filter(games::black_material.ge(t.black as i32));
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
        state.line_cache.insert((cache_query, file), (vec![], vec![]));
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

        let query =
            PositionQuery::exact_from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").unwrap();
        let result = get_move_after_match(&game[..], &None, &query).unwrap();
        assert_eq!(result, Some("e4".to_string()));

        let query =
            PositionQuery::exact_from_fen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1").unwrap();
        let result = get_move_after_match(&game[..], &None, &query).unwrap();
        assert_eq!(result, Some("e5".to_string()));

        let query =
            PositionQuery::exact_from_fen("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2")
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
