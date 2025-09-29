//! Position search functionality
//! 
//! This module handles searching for chess positions in game databases.
//! It supports both exact position matching and partial position matching.

use diesel::prelude::*;
use log::info;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use shakmaty::{fen::Fen, Bitboard, ByColor, Chess, FromSetup, Position, Setup, san::SanPlus};
use specta::Type;
use std::{
    path::PathBuf,
    time::Instant,
    collections::HashMap,
    sync::{Arc, atomic::{AtomicUsize, Ordering}},
};
use tauri::Emitter;

use crate::{
    db::{
        get_db_or_create, get_pawn_home, models::*,
        pgn::{get_material_count, MaterialCount},
        normalize_games, schema::*, ConnectionOptions,
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

#[derive(Debug, Clone, Deserialize, Type, PartialEq, Eq, Hash)]
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
        _ => unreachable!(),
    }
}

impl PositionQuery {
    /// Check if a chess position matches this query
    #[inline(always)]
    fn matches(&self, position: &Chess) -> bool {
        match self {
            PositionQuery::Exact(ref data) => {
                // Check turn and board position exactly
                data.position.turn() == position.turn() 
                    && data.position.board() == position.board()
            }
            PositionQuery::Partial(ref data) => {
                let query_board = &data.piece_positions.board;
                let tested_board = position.board();

                // Check each piece type (kings first for efficiency)
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
    #[inline(always)]
    fn has_sufficient_material(&self, current_material: &MaterialCount) -> bool {
        let target_material = match self {
            PositionQuery::Exact(ref data) => &data.material,
            PositionQuery::Partial(ref data) => &data.material,
        };
        
        // Current position must have at least as much material as target
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
fn is_end_reachable(end: u16, pos: u16) -> bool {
    end & !pos == 0
}

/// Check if target material count can be reached from current material
fn is_material_reachable(end: &MaterialCount, pos: &MaterialCount) -> bool {
    end.white <= pos.white && end.black <= pos.black
}

/// Check if all pieces in subset are also in container
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

    fn next_move(&mut self) -> Option<(Chess, String)> {
        while self.index < self.bytes.len() {
            let byte = self.bytes[self.index];
            
            match byte {
                // Skip comments, annotations, and variations
                Self::COMMENT => {
                    if self.index + 8 >= self.bytes.len() {
                        break;
                    }
                    let length_bytes = &self.bytes[self.index + 1..self.index + 9];
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
                    // Skip entire variation
                    let mut depth = 1;
                    self.index += 1;
                    while self.index < self.bytes.len() && depth > 0 {
                        match self.bytes[self.index] {
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
                    // Parse actual chess move
                    if let Some(chess_move) = self.position.legal_moves().get(move_byte as usize) {
                        let san = SanPlus::from_move_and_play_unchecked(&mut self.position, chess_move);
                        let move_string = san.to_string();
                        self.index += 1;
                        return Some((self.position.clone(), move_string));
                    } else {
                        break; // Invalid move
                    }
                }
            }
        }
        None
    }
}

/// Find the next move played after a position matches the query
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

    // Check if starting position already matches
    if query.matches(&start_position) {
        let mut stream = MoveStream::new(move_blob, start_position);
        if let Some((_, first_move)) = stream.next_move() {
            return Ok(Some(first_move));
        }
        return Ok(Some("*".to_string()));
    }

    // Check each position in the game
    let mut stream = MoveStream::new(move_blob, start_position);
    
    while let Some((current_position, _current_move)) = stream.next_move() {
        // Quick material check first
        let board = current_position.board();
        let material = get_material_count(board);
        
        if !query.has_sufficient_material(&material) {
            continue;
        }
        
        let pawn_home = get_pawn_home(board);
        if !query.is_reachable_by(&material, pawn_home) {
            return Ok(None); // Position is unreachable
        }

        // Check for position match
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

/// Get total number of games in database
fn get_total_game_count(
    state: &tauri::State<'_, AppState>,
    file: &PathBuf,
) -> Result<i64, Error> {
    let db = &mut get_db_or_create(state, file.to_str().unwrap(), ConnectionOptions::default())?;
    use diesel::dsl::count_star;
    
    let total_count: i64 = games::table
        .select(count_star())
        .first(db)?;
    
    Ok(total_count)
}

/// Load games from database in batches
fn load_games_batch(
    state: &tauri::State<'_, AppState>,
    file: &PathBuf,
    offset: i64,
    limit: i64,
) -> Result<Vec<(i32, i32, i32, Option<String>, Option<String>, Vec<u8>, Option<String>, i32, i32, i32)>, Error> {
    let db = &mut get_db_or_create(state, file.to_str().unwrap(), ConnectionOptions::default())?;
    
    let games = games::table
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
        .offset(offset)
        .limit(limit)
        .load(db)?;
    
    Ok(games)
}

/// Check if game matches basic filters (player, date, result)
#[inline(always)]
fn matches_basic_filters(
    white_id: i32,
    black_id: i32,
    date: &Option<String>,
    result: &Option<String>,
    query: &GameQueryJs,
) -> bool {
    // Check player filters
    if let Some(player1) = query.player1 {
        if player1 != white_id {
            return false;
        }
    }
    
    if let Some(player2) = query.player2 {
        if player2 != black_id {
            return false;
        }
    }
    
    // Check result filter
    if let Some(wanted_result) = &query.wanted_result {
        if let Some(game_result) = result {
            let matches = match wanted_result.as_str() {
                "whitewon" => game_result == "1-0",
                "blackwon" => game_result == "0-1", 
                "draw" => game_result == "1/2-1/2",
                _ => true,
            };
            if !matches {
                return false;
            }
        }
    }
    
    // Check date filters
    if let Some(start_date) = &query.start_date {
        if let Some(game_date) = date {
            if game_date < start_date {
                return false;
            }
        }
    }
    
    if let Some(end_date) = &query.end_date {
        if let Some(game_date) = date {
            if game_date > end_date {
                return false;
            }
        }
    }
    
    true
}

/// Calculate search progress as percentage
#[inline(always)]
fn calculate_batch_progress(processed: usize, total: usize) -> f64 {
    (processed as f64 / total as f64 * 100.0).min(100.0)
}



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
    let start = Instant::now();
    info!("Starting position search for tab: {}", tab_id);

    // Convert position query if present - do this first to validate the query
    let position_query = match &query.position {
        Some(pos_query) => {
            info!("Processing position query with FEN: {}", pos_query.fen);
            let converted = convert_position_query(pos_query.clone())?;
            
            // Debug: Log target position material and pawn structure
            match &converted {
                PositionQuery::Exact(data) => {
                    info!("Target position (EXACT): material={:?}, pawn_home={}", data.material, data.pawn_home);
                },
                PositionQuery::Partial(data) => {
                    info!("Target position (PARTIAL): material={:?}", data.material);
                }
            }
            
            Some(converted)
        },
        None => return Err(Error::NoMatchFound), // Position search requires a position
    };

    let position_query = position_query.unwrap();

    // Cache management
    const DISABLE_CACHE: bool = false;
    
    if !DISABLE_CACHE {
        let cache_key = (query.clone(), file.clone());
        
        // Return cached results if available
        if let Some(cached_result) = state.line_cache.get(&cache_key) {
            info!("Using cached results: {} stats, {} games", 
                  cached_result.0.len(), cached_result.1.len());
            return Ok(cached_result.clone());
        }

        // Clear cache if it gets too large
        if state.line_cache.len() > 100 {
            info!("Clearing cache (too many entries: {})", state.line_cache.len());
            state.line_cache.clear();
        }
    }

    // Handle request cancellation
    let permit = state.new_request.acquire().await.unwrap();
    if state.new_request.available_permits() == 0 {
        drop(permit);
        return Err(Error::SearchStopped);
    }
    
    // Decide between cached data or batch processing
    let (use_cached_data, total_games, cached_games) = {
        let games_cache = state.db_cache.lock().unwrap();
        let use_cached = !games_cache.is_empty();
        if use_cached {
            let cached_games = games_cache.clone();
            let total = cached_games.len();
            (true, total, Some(cached_games))
        } else {
            drop(games_cache);
            let total = get_total_game_count(&state, &file)? as usize;
            (false, total, None)
        }
    };
    
    info!("Starting optimized position analysis on {} games with parallel processing", total_games);
    
    // Data structures for collecting results from parallel processing
    let position_stats: HashMap<String, PositionStats>;
    let matched_game_ids: Vec<i32>;
    let processed_count: usize;
    let games_with_basic_filter_match: usize;

    if use_cached_data {
        // Use cached data with thread-local accumulator pattern (eliminates mutex contention)
        let games = cached_games.unwrap();
        
        // Atomic counters for lock-free progress tracking
        let processed_count_atomic = Arc::new(AtomicUsize::new(0));
        let filter_match_count_atomic = Arc::new(AtomicUsize::new(0));
        
        // Structure for collecting results in parallel threads
        #[derive(Default)]
        struct ThreadLocalResults {
            position_stats: HashMap<String, PositionStats>,
            matched_ids: Vec<i32>,
        }
        
        // Process games in parallel
        let final_results = games.par_iter()
            .fold(
                || ThreadLocalResults::default(),
                |mut acc, (id, white_id, black_id, date, result, moves, fen, _pawn_home, _white_material, _black_material)| {
                    // Check for cancellation (lock-free)
                    if state.new_request.available_permits() == 0 {
                        return acc;
                    }
                    
                    // Lock-free increment of processed count
                    let _current_processed = processed_count_atomic.fetch_add(1, Ordering::Relaxed) + 1;
                    
                    // Progress updates only from main thread after batch completion

                    // Check basic filters first (player, date, result)
                    if !matches_basic_filters(*white_id, *black_id, date, result, &query) {
                        return acc;
                    }
                    
                    // Count games that pass basic filters
                    filter_match_count_atomic.fetch_add(1, Ordering::Relaxed);

                    // Check if game contains the target position
                    if let Ok(Some(next_move)) = get_move_after_match(moves, fen, &position_query) {
                        // Save matching game ID (limit to 50 games)
                        if acc.matched_ids.len() < 50 {
                            acc.matched_ids.push(*id);
                        }
                        
                        // Update move statistics
                        let stats = acc.position_stats.entry(next_move.clone()).or_insert_with(|| PositionStats {
                            move_: next_move,
                            white: 0,
                            black: 0,
                            draw: 0,
                        });
                        
                        // Count results by game outcome
                        match result.as_deref() {
                            Some("1-0") => stats.white += 1,
                            Some("0-1") => stats.black += 1,
                            Some("1/2-1/2") => stats.draw += 1,
                            _ => (), // Skip unknown results
                        }
                    }
                    
                    acc
                }
            )
            .reduce(
                || ThreadLocalResults::default(),
                |mut acc1, acc2| {
                    // Merge thread-local results (no contention here!)
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
                    
                    // Merge matched IDs (keep within limit)
                    for id in acc2.matched_ids {
                        if acc1.matched_ids.len() < 50 {
                            acc1.matched_ids.push(id);
                        }
                    }
                    
                    acc1
                }
            );
        
        // Extract final results (no Arc unwrapping needed)
        position_stats = final_results.position_stats;
        matched_game_ids = final_results.matched_ids;
        processed_count = processed_count_atomic.load(Ordering::Relaxed);
        games_with_basic_filter_match = filter_match_count_atomic.load(Ordering::Relaxed);
        
        info!("Cached data processing complete: {} games processed, {} passed basic filters, {} matches found", 
              processed_count, games_with_basic_filter_match, matched_game_ids.len());
              
        // Emit progress update after batch completion (main thread, no mutex overhead)
        let _ = app.emit(
            "search_progress",
            ProgressPayload {
                progress: 100.0,
                id: tab_id.clone(),
                finished: false,
            },
        );
    } else {
        // Process large datasets in batches to manage memory
        const BATCH_SIZE: i64 = 30000;
        let mut offset = 0;
        
        // Track progress across all threads
        let global_processed_count = Arc::new(AtomicUsize::new(0));
        let global_filter_match_count = Arc::new(AtomicUsize::new(0));
        
        // Collect results from all batches
        let mut global_position_stats = HashMap::<String, PositionStats>::new();
        let mut global_matched_ids = Vec::<i32>::new();
        
        loop {
            // Check for cancellation
            if state.new_request.available_permits() == 0 {
                drop(permit);
                return Err(Error::SearchStopped);
            }
            
            // Load batch
            let batch = load_games_batch(&state, &file, offset, BATCH_SIZE)?;
            if batch.is_empty() {
                break;
            }
            
            info!("Processing batch: {} games (offset: {}) with thread-local accumulators", batch.len(), offset);
            
            // Thread-local accumulator structure
            #[derive(Default)]
            struct ThreadLocalResults {
                position_stats: HashMap<String, PositionStats>,
                matched_ids: Vec<i32>,
            }
            
            // Process batch using parallel fold pattern with thread-local accumulators
            let batch_results = batch.par_iter()
                .fold(
                    || ThreadLocalResults::default(),
                    |mut acc, (id, white_id, black_id, date, result, moves, fen, _pawn_home, _white_material, _black_material)| {
                        // Check for cancellation (lock-free)
                        if state.new_request.available_permits() == 0 {
                            return acc;
                        }
                        
                        // Lock-free increment of processed count
                        let _current_processed = global_processed_count.fetch_add(1, Ordering::Relaxed) + 1;
                        
                        // Progress updates only from main thread after batch completion

                        // Apply basic filters first (fast elimination)
                        if !matches_basic_filters(*white_id, *black_id, date, result, &query) {
                            return acc;
                        }
                        
                        // Lock-free increment of filter match count
                        global_filter_match_count.fetch_add(1, Ordering::Relaxed);

                        // Process game for position matching
                        if let Ok(Some(next_move)) = get_move_after_match(moves, fen, &position_query) {
                            // Thread-local update (no locks needed!)
                            if acc.matched_ids.len() < 50 {
                                acc.matched_ids.push(*id);
                            }
                            
                            let stats = acc.position_stats.entry(next_move.clone()).or_insert_with(|| PositionStats {
                                move_: next_move,
                                white: 0,
                                black: 0,
                                draw: 0,
                            });
                            
                            match result.as_deref() {
                                Some("1-0") => stats.white += 1,
                                Some("0-1") => stats.black += 1,
                                Some("1/2-1/2") => stats.draw += 1,
                                _ => (), // Unknown results don't count
                            }
                        }
                        
                        acc
                    }
                )
                .reduce(
                    || ThreadLocalResults::default(),
                    |mut acc1, acc2| {
                        // Merge thread-local results (no contention here!)
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
                        
                        // Merge matched IDs (keep within limit)
                        for id in acc2.matched_ids {
                            if acc1.matched_ids.len() < 50 {
                                acc1.matched_ids.push(id);
                            }
                        }
                        
                        acc1
                    }
                );
            
            // Merge batch results into global accumulator (single-threaded, no contention)
            for (key, batch_stat) in batch_results.position_stats {
                let global_stat = global_position_stats.entry(key).or_insert_with(|| PositionStats {
                    move_: batch_stat.move_.clone(),
                    white: 0,
                    black: 0,
                    draw: 0,
                });
                global_stat.white += batch_stat.white;
                global_stat.black += batch_stat.black;
                global_stat.draw += batch_stat.draw;
            }
            
            // Merge matched IDs (keep within limit)
            for id in batch_results.matched_ids {
                if global_matched_ids.len() < 50 {
                    global_matched_ids.push(id);
                }
            }
            
            offset += BATCH_SIZE;
            
            // Emit progress update after batch completion (main thread, no mutex overhead)
            let progress = calculate_batch_progress(offset as usize, total_games);
            let _ = app.emit(
                "search_progress",
                ProgressPayload {
                    progress,
                    id: tab_id.clone(),
                    finished: false,
                },
            );
            
            // For first batch, populate cache if it's reasonable size
            if offset == BATCH_SIZE && batch.len() < 50000 {
                info!("Caching games for future searches (small dataset: {} games)", batch.len());
                let mut cache = state.db_cache.lock().unwrap();
                if cache.is_empty() {
                    // Load all games into cache since dataset is manageable
                    let all_games = load_games_batch(&state, &file, 0, i64::MAX)?;
                    *cache = all_games;
                }
            }
        }
        
        // Extract final results from global accumulators (no Arc unwrapping needed)
        position_stats = global_position_stats;
        matched_game_ids = global_matched_ids;
        processed_count = global_processed_count.load(Ordering::Relaxed);
        games_with_basic_filter_match = global_filter_match_count.load(Ordering::Relaxed);
        
        info!("Batch processing complete: {} games processed, {} passed basic filters, {} matches found", 
              processed_count, games_with_basic_filter_match, matched_game_ids.len());
    }

    info!("Position search completed in {:?}. Found {} unique moves from {} games.", 
          start.elapsed(), position_stats.len(), matched_game_ids.len());

    // Final cancellation check
    if state.new_request.available_permits() == 0 {
        drop(permit);
        return Err(Error::SearchStopped);
    }

    // Convert results
    let openings: Vec<PositionStats> = position_stats.into_values().collect();

    // Load full game details for matched games
    let normalized_games = if !matched_game_ids.is_empty() {
        let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;
        
        let (white_players, black_players) = diesel::alias!(players as white, players as black);
        let detailed_games: Vec<(Game, Player, Player, Event, Site)> = games::table
            .inner_join(white_players.on(games::white_id.eq(white_players.field(players::id))))
            .inner_join(black_players.on(games::black_id.eq(black_players.field(players::id))))
            .inner_join(events::table.on(games::event_id.eq(events::id)))
            .inner_join(sites::table.on(games::site_id.eq(sites::id)))
            .filter(games::id.eq_any(&matched_game_ids))
            .load(db)?;
            
        normalize_games(detailed_games)?
    } else {
        Vec::new()
    };

    // Cache results (unless caching is disabled for debugging)
    let result = (openings.clone(), normalized_games.clone());
    if !DISABLE_CACHE {
        let cache_key = (query.clone(), file.clone());
        state.line_cache.insert(cache_key.clone(), result.clone());
        info!("Cached position search results for FEN '{}': {} position stats, {} games", 
              cache_key.0.position.as_ref().map(|p| p.fen.as_str()).unwrap_or("None"),
              openings.len(), 
              normalized_games.len());
    } else {
        info!("CACHE DISABLED: Not caching results ({} position stats, {} games)", 
              openings.len(), normalized_games.len());
    }

    // Emit completion
    let _ = app.emit(
        "search_progress",
        ProgressPayload {
            progress: 100.0,
            id: tab_id,
            finished: true,
        },
    );

    drop(permit);
    
    // Log total search time for performance monitoring
    info!("Position search completed in total time: {:?} for FEN: '{}'", 
          start.elapsed(), 
          query.position.as_ref().map(|p| p.fen.as_str()).unwrap_or("None"));
    
    Ok(result)
}

/// Check if a position exists in the database (without full search)
pub async fn is_position_in_db(
    file: PathBuf,
    query: GameQueryJs,
    state: tauri::State<'_, AppState>,
) -> Result<bool, Error> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    // Log the position query for debugging
    if let Some(pos_query) = &query.position {
        info!("Checking if position exists in DB with FEN: {}", pos_query.fen);
    }

    if let Some(pos) = state.line_cache.get(&(query.clone(), file.clone())) {
        info!("Using cached result for position existence check: {}", !pos.0.is_empty());
        return Ok(!pos.0.is_empty());
    }

    // start counting the time
    let start = Instant::now();
    info!("start loading games");

    let permit = state.new_request.acquire().await.unwrap();
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

        info!("got {} games: {:?}", games.len(), start.elapsed());
    }

    let exists = games.par_iter().any(
        |(
            _id,
            _white_id,
            _black_id,
            _date,
            _result,
            game,
            fen,
            end_pawn_home,
            white_material,
            black_material,
        )| {
            if state.new_request.available_permits() == 0 {
                return false;
            }
            let end_material: MaterialCount = ByColor {
                white: *white_material as u8,
                black: *black_material as u8,
            };
            if let Some(position_query) = &query.position {
                let position_query =
                    convert_position_query(position_query.clone()).expect("Invalid position query");
                position_query.can_reach(&end_material, *end_pawn_home as u16)
                    && get_move_after_match(game, fen, &position_query)
                        .unwrap_or(None)
                        .is_some()
            } else {
                false
            }
        },
    );
    info!("finished search in {:?}", start.elapsed());
    if state.new_request.available_permits() == 0 {
        drop(permit);
        return Err(Error::SearchStopped);
    }

    if !exists {
        info!("Position not found in DB, caching empty result");
        state.line_cache.insert((query, file), (vec![], vec![]));
    } else {
        info!("Position found in DB");
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
