//! Position search functionality
//! 
//! This module handles searching for chess positions in game databases.
//! It supports both exact position matching and partial position matching.

use diesel::prelude::*;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use shakmaty::{fen::Fen, Bitboard, Chess, FromSetup, Position, Setup, san::SanPlus};
use specta::Type;
use std::{
    path::PathBuf,
    collections::HashMap,
    sync::{Arc, atomic::{AtomicUsize, Ordering}},
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

/// Data for exact position matching
/// Requires the position to match exactly including turn, castling rights, etc.
#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub struct ExactData {
    pawn_home: u16,
    material: MaterialCount,
    position: Chess,
}

/// Data for partial position matching
/// Only checks if the specified pieces are present, ignoring other pieces
#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub struct PartialData {
    piece_positions: Setup,
    material: MaterialCount,
}

/// Query type for searching positions
/// - Exact: Match the position exactly
/// - Partial: Match only specified pieces (subset matching)
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
        Ok(PositionQuery::Partial(PartialData {
            piece_positions: setup,
            material,
        }))
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
        // FIXED: Replace unreachable! with proper error for production safety
        _ => Err(Error::FenError(format!("Invalid position query type: {}", query.type_))),
    }
}

impl PositionQuery {
    /// Check if a chess position matches this query
    /// OPTIMIZED: Early exits, reduced comparisons
    #[inline(always)]
    fn matches(&self, position: &Chess) -> bool {
        match self {
            PositionQuery::Exact(ref data) => {
                // Check turn first (cheapest check)
                data.position.turn() == position.turn() 
                    && data.position.board() == position.board()
            }
            PositionQuery::Partial(ref data) => {
                let query_board = &data.piece_positions.board;
                let tested_board = position.board();

                // Check each piece type with early exit (kings first for efficiency)
                // Use short-circuit evaluation for optimal performance
                is_contained(tested_board.kings(), query_board.kings())
                    && is_contained(tested_board.queens(), query_board.queens())
                    && is_contained(tested_board.rooks(), query_board.rooks())
                    && is_contained(tested_board.bishops(), query_board.bishops())
                    && is_contained(tested_board.knights(), query_board.knights())
                    && is_contained(tested_board.pawns(), query_board.pawns())
                    && is_contained(tested_board.white(), query_board.white())
                    && is_contained(tested_board.black(), query_board.black())
            }
        }
    }

    /// Check if current position has enough material to match the query
    /// OPTIMIZED: Direct comparison without match overhead
    #[inline(always)]
    fn has_sufficient_material(&self, current_material: &MaterialCount) -> bool {
        let target_material = match self {
            PositionQuery::Exact(ref data) => &data.material,
            PositionQuery::Partial(ref data) => &data.material,
        };
        
        // Current position must have at least as much material as target
        // Optimized: check both conditions with short-circuit evaluation
        current_material.white >= target_material.white && 
        current_material.black >= target_material.black
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
                is_end_reachable(pawn_home, data.pawn_home) && is_material_reachable(material, &data.material)
            }
            PositionQuery::Partial(_) => true,
        }
    }
}

/// Check if target pawn structure can be reached from current position
/// OPTIMIZED: Bitwise operation for fast comparison
#[inline(always)]
fn is_end_reachable(end: u16, pos: u16) -> bool {
    end & !pos == 0
}

/// Check if target material count can be reached from current material
/// OPTIMIZED: Direct comparison with short-circuit
#[inline(always)]
fn is_material_reachable(end: &MaterialCount, pos: &MaterialCount) -> bool {
    end.white <= pos.white && end.black <= pos.black
}

/// Check if all pieces in subset are also in container
/// OPTIMIZED: Bitwise operation for fast subset check
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
/// Avoids loading entire game tree into memory
struct MoveStream<'a> {
    bytes: &'a [u8],
    position: Chess,
    index: usize,
}

impl<'a> MoveStream<'a> {
    // Binary format markers
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
                // Skip comments, annotations, and variations
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
                    // Skip entire variation (optimized: single pass)
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
                    // Parse actual chess move (optimized: avoid bounds check in legal_moves)
                    let legal_moves = self.position.legal_moves();
                    if (move_byte as usize) < legal_moves.len() {
                        if let Some(chess_move) = legal_moves.get(move_byte as usize) {
                            let san = SanPlus::from_move_and_play_unchecked(&mut self.position, chess_move);
                            let move_string = san.to_string();
                            self.index += 1;
                            return Some((self.position.clone(), move_string));
                        }
                    }
                    break; // Invalid move
                }
            }
        }
        None
    }
}

/// Find the next move played after a position matches the query
/// OPTIMIZED: Early exits, cached calculations, reduced allocations
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

    // Pre-compute query material for faster comparisons
    let query_material = match query {
        PositionQuery::Exact(ref data) => &data.material,
        PositionQuery::Partial(ref data) => &data.material,
    };

    // Check if starting position already matches (fast path)
    if query.matches(&start_position) {
        let mut stream = MoveStream::new(move_blob, start_position);
        if let Some((_, first_move)) = stream.next_move() {
            return Ok(Some(first_move));
        }
        return Ok(Some("*".to_string()));
    }

    // Pre-check starting position material for early exit
    let start_board = start_position.board();
    let start_material = get_material_count(start_board);
    if !query.has_sufficient_material(&start_material) {
        // Starting position doesn't have enough material, can't reach target
        return Ok(None);
    }

    // Check each position in the game
    let mut stream = MoveStream::new(move_blob, start_position);
    
    while let Some((current_position, _current_move)) = stream.next_move() {
        // Quick material check first (most selective filter)
        let board = current_position.board();
        let material = get_material_count(board);
        
        // Early exit if material decreased below query requirements
        if material.white < query_material.white || material.black < query_material.black {
            // Material can only decrease, so we can't reach the target anymore
            return Ok(None);
        }
        
        // Check reachability before expensive position matching
        let pawn_home = get_pawn_home(board);
        if !query.is_reachable_by(&material, pawn_home) {
            return Ok(None); // Position is unreachable
        }

        // Check for position match (most expensive, do last)
        if query.matches(&current_position) {
            // Return the next move after the match
            if let Some((_, next_move)) = stream.next_move() {
                return Ok(Some(next_move));
            }
            return Ok(Some("*".to_string())); // End of game
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

// REMOVED: get_total_game_count - no longer needed since we load all games at once


// Removed: matches_basic_filters - filters now applied at SQL level



/// Search for chess positions in the database
/// Returns position statistics and matching games
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
    
    // Create new cancel flag for this search
    let cancel_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
    state.active_searches.insert(tab_id.clone(), cancel_flag.clone());

    // Convert position query if present - do this first to validate the query
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

    // OPTIMIZED: Cache management with memory-aware limits
    const DISABLE_CACHE: bool = false;
    const MAX_CACHE_ENTRIES: usize = 100;
    
    if !DISABLE_CACHE {
        // Create cache key WITHOUT game_details_limit (stats are the same regardless of limit)
        let mut cache_query = query.clone();
        cache_query.game_details_limit = None; // Normalize for cache key
        let cache_key = (cache_query, file.clone());
        
        // Return cached results if available (FAST PATH)
        if let Some(cached_result) = state.line_cache.get(&cache_key) {
            let (cached_openings, cached_games) = cached_result.value().clone();
            
            // If cached, still need to respect the requested game_details_limit
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

        // Clear cache more aggressively to prevent memory growth
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

    // Check if cancelled before acquiring expensive resources
    if cancel_flag.load(Ordering::Relaxed) {
        state.active_searches.remove(&tab_id);
        return Err(Error::SearchStopped);
    }
    
    // Handle request concurrency
    let permit = state.new_request.acquire().await.unwrap();
    
    // Check again after acquiring permit
    if cancel_flag.load(Ordering::Relaxed) {
        state.active_searches.remove(&tab_id);
        drop(permit);
        return Err(Error::SearchStopped);
    }
    
    // Process in batches to avoid loading entire database into memory
    // Adaptive batch size: larger when no filters, smaller when filtered
    const BATCH_SIZE_NO_FILTERS: usize = 200_000;
    const BATCH_SIZE_FILTERED: usize = 50_000;
    const MAX_BATCHES: usize = 50; // Process up to 5M games total
    
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
    
    // Helper to build filtered query (can't clone BoxedSelectStatement)
    let build_base_query = || {
        let mut q = games::table.into_boxed();
        
        if let Some(player1) = query.player1 {
            q = q.filter(games::white_id.eq(player1));
        }
        if let Some(player2) = query.player2 {
            q = q.filter(games::black_id.eq(player2));
        }
        if let Some(ref start_date) = query.start_date {
            q = q.filter(games::date.ge(start_date));
        }
        if let Some(ref end_date) = query.end_date {
            q = q.filter(games::date.le(end_date));
        }
        if let Some(ref wanted_result) = query.wanted_result {
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
        
        q
    };
    
    // Apply read-only friendly PRAGMAs to speed up large scans
    // OPTIMIZED: Batch PRAGMA statements for better performance
    // Safe because searches are read-only
    let _ = diesel::sql_query("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY; PRAGMA mmap_size=1073741824; PRAGMA cache_size=200000;").execute(db);

    // Get total count for progress tracking
    let total_count: i64 = build_base_query().count().get_result(db)?;
    
    if total_count == 0 {
        state.active_searches.remove(&tab_id);
        drop(permit);
        return Ok((vec![], vec![]));
    }
    
    let total_games = total_count as usize;
    
    // Data structures for collecting results (optimized: pre-allocate capacity)
    let mut position_stats: HashMap<String, PositionStats> = HashMap::with_capacity(128);
    let mut matched_game_ids: Vec<i32> = Vec::with_capacity(1000);
    let processed_count_atomic = Arc::new(AtomicUsize::new(0));
    
    // Structure for collecting results in parallel threads
    #[derive(Default)]
    struct ThreadLocalResults {
        position_stats: HashMap<String, PositionStats>,
        matched_ids: Vec<i32>,
    }
    
    // Choose adaptive batch size
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

    // Process games in batches using keyset pagination (no OFFSET)
    let batches_to_process = (total_games / batch_size + 1).min(MAX_BATCHES);
    let mut last_id: i32 = 0;
    
    for batch_num in 0..batches_to_process {
        // Check for cancellation before each batch
        if cancel_flag.load(Ordering::Relaxed) {
            state.active_searches.remove(&tab_id);
            drop(permit);
            return Err(Error::SearchStopped);
        }

        // Load batch from database using keyset pagination (id > last_id)
        let batch: Vec<(i32, i32, i32, Option<String>, Option<String>, Vec<u8>, Option<String>, i32, i32, i32)> =
            build_base_query()
                .filter(games::id.gt(last_id))
                .order(games::id.asc())
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
                .limit(batch_size as i64)
                .load(db)?;
        
        if batch.is_empty() {
            break;
        }

        // Update last_id for keyset pagination
        if let Some(last) = batch.last() {
            last_id = last.0;
        }
        
        // Process batch in parallel (optimized: reduce allocations, improve cache locality)
        let cancel_flag_clone = cancel_flag.clone();
        let position_query_clone = position_query.clone();
        let batch_results = batch.par_iter()
            .fold(
                || ThreadLocalResults::default(),
                |mut acc, (id, _white_id, _black_id, _date, result, moves, fen, _pawn_home, _white_material, _black_material)| {
                    if cancel_flag_clone.load(Ordering::Relaxed) {
                        return acc;
                    }
                    
                    // Update progress counter (optimized: batch updates to reduce contention)
                    let current_processed = processed_count_atomic.fetch_add(1, Ordering::Relaxed) + 1;
                    
                    // Emit progress updates (optimized: less frequent to reduce overhead)
                    let progress_interval = 25000.min(total_games / 5 + 1);
                    if current_processed % progress_interval == 0 {
                        let progress = (current_processed as f64 / total_games as f64 * 100.0).min(99.0);
                        let _ = app.emit(
                            "search_progress",
                            ProgressPayload {
                                progress,
                                id: tab_id.clone(),
                                finished: false,
                            },
                        );
                    }

                    // Check if game contains the target position
                    if let Ok(Some(next_move)) = get_move_after_match(moves, fen, &position_query_clone) {
                        // Only save first 1000 game IDs for detailed loading
                        if acc.matched_ids.len() < 1000 {
                            acc.matched_ids.push(*id);
                        }
                        
                        // Always update statistics (no limit) - use entry API for efficiency
                        let stats = acc.position_stats.entry(next_move.clone()).or_insert_with(|| PositionStats {
                            move_: next_move,
                            white: 0,
                            black: 0,
                            draw: 0,
                        });
                        
                        // Optimized result matching (avoid string allocation in match)
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
                    // Merge statistics (optimized: reuse allocations when possible)
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
                    
                    // Merge game IDs (up to 1000) - optimized: reserve capacity
                    let remaining = 1000 - acc1.matched_ids.len();
                    if remaining > 0 {
                        let to_add = acc2.matched_ids.len().min(remaining);
                        acc1.matched_ids.reserve(to_add);
                        acc1.matched_ids.extend(acc2.matched_ids.into_iter().take(remaining));
                    }
                    
                    acc1
                }
            );
        
        // Merge batch results into global results (optimized: reduce allocations)
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
        
        // Add game IDs (up to 1000 total) - optimized: reserve and extend
        let remaining = 1000 - matched_game_ids.len();
        if remaining > 0 {
            let to_add = batch_results.matched_ids.len().min(remaining);
            matched_game_ids.reserve(to_add);
            matched_game_ids.extend(batch_results.matched_ids.into_iter().take(remaining));
        }

        // If fewer than batch_size rows were returned, we've reached the end
        if batch.len() < batch_size {
            break;
        }
    }
    

    // Convert results
    let openings: Vec<PositionStats> = position_stats.into_values().collect();

    // Determine how many game details to load (stats are already complete)
    // Convert from u64 (from TypeScript bigint) to usize
    // Frontend passes 10 by default, 1000 when games tab is opened
    let game_details_limit: usize = query.game_details_limit
        .unwrap_or(10)  // Default to 10 (matches frontend default)
        .min(1000)
        .try_into()
        .unwrap_or(10); // Fallback to 10 if conversion fails

    // Load full game details for matched games (limited)
    
    // FIXED: Split into chunks to avoid "too many SQL variables" error (SQLite limit ~999)
    let mut normalized_games = if !matched_game_ids.is_empty() && game_details_limit > 0 {
        let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
        
        // SQLite has a limit of ~999 variables per query, so we chunk the IDs
        const CHUNK_SIZE: usize = 900; // Use larger chunks closer to SQLite limit for fewer queries
        let mut all_detailed_games = Vec::new();
        
        // Process IDs in chunks
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
            
            // Apply sorting from query options (except AverageElo which we'll handle in Rust)
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
                    GameSort::AverageElo => {
                        // AverageElo will be sorted in Rust after calculating
                        query_builder
                    },
                };
            }
            
            let chunk_games: Vec<(Game, Player, Player, Event, Site)> = query_builder.load(db)?;
            all_detailed_games.extend(chunk_games);
        }
        
        normalize_games(all_detailed_games)?
    } else {
        Vec::new()
    };
    
    // Sort by average ELO if needed (calculated in Rust)
    let query_options = query.options.as_ref();
    let should_sort_by_avg_elo = query_options
        .map(|opt| matches!(opt.sort, GameSort::AverageElo))
        .unwrap_or(true); // Default to AverageElo if no options provided
    
    let sort_direction = query_options
        .and_then(|opt| Some(opt.direction.clone()))
        .unwrap_or(SortDirection::Desc); // Default to Desc if no options provided
    
    if should_sort_by_avg_elo {
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
            
            match sort_direction {
                SortDirection::Asc => a_val.cmp(&b_val),
                SortDirection::Desc => b_val.cmp(&a_val), // Descending: higher ELO first
            }
        });
    }

    // Check one more time if cancelled before returning results
    if cancel_flag.load(Ordering::Relaxed) {
        state.active_searches.remove(&tab_id);
        drop(permit);
        return Err(Error::SearchStopped);
    }

    // Cache results (unless caching is disabled for debugging)
    // NOTE: Cache FULL results (up to 1000 games), then truncate on retrieval based on requested limit
    let result = (openings.clone(), normalized_games.clone());
    if !DISABLE_CACHE {
        // Create cache key WITHOUT game_details_limit (stats are the same regardless of limit)
        let mut cache_query = query.clone();
        cache_query.game_details_limit = None; // Normalize for cache key
        let cache_key = (cache_query, file.clone());
        
        // Only cache if we have results (avoid caching empty results from failed searches)
        if !openings.is_empty() || !normalized_games.is_empty() {
            state.line_cache.insert(cache_key.clone(), result.clone());
        }
    }

    // Emit completion
    let _ = app.emit(
        "search_progress",
        ProgressPayload {
            progress: 100.0,
            id: tab_id.clone(),
            finished: true,
        },
    );

    drop(permit);
    
    // Clean up the cancel flag for this search
    state.active_searches.remove(&tab_id);
    
    Ok(result)
}

/// Check if a position exists in the database (without full search)
/// OPTIMIZED: Quick check using first batch only
pub async fn is_position_in_db(
    file: PathBuf,
    query: GameQueryJs,
    state: tauri::State<'_, AppState>,
) -> Result<bool, Error> {
    // Check cache first
    if let Some(pos) = state.line_cache.get(&(query.clone(), file.clone())) {
        return Ok(!pos.0.is_empty());
    }

    let permit = state.new_request.acquire().await.unwrap();
    
    // Convert position query
    let position_query = match &query.position {
        Some(pos_query) => convert_position_query(pos_query.clone())?,
        None => return Ok(false),
    };
    
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
    
    // Build filtered query
    let mut sample_query = games::table.into_boxed();
    
    if let Some(player1) = query.player1 {
        sample_query = sample_query.filter(games::white_id.eq(player1));
    }
    if let Some(player2) = query.player2 {
        sample_query = sample_query.filter(games::black_id.eq(player2));
    }
    
    // Load only first 1000 games as a sample
    let sample: Vec<(i32, i32, i32, Option<String>, Option<String>, Vec<u8>, Option<String>, i32, i32, i32)> = sample_query
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
        .limit(1000)
        .load(db)?;
    
    // Check if any game contains the position
    let exists = sample.iter().any(
        |(_id, _white_id, _black_id, _date, _result, game, fen, _pawn_home, _white_material, _black_material)| {
            get_move_after_match(game, fen, &position_query)
                .unwrap_or(None)
                .is_some()
        },
    );

    if !exists {
        // Normalize cache key without game_details_limit
        let mut cache_query = query;
        cache_query.game_details_limit = None;
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
