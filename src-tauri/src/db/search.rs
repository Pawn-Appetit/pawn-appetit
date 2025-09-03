use diesel::prelude::*;
use log::info;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use shakmaty::{fen::Fen, san::SanPlus, Bitboard, ByColor, Chess, FromSetup, Position, Setup};
use specta::Type;
use std::{
    path::PathBuf,
    sync::{atomic::{AtomicUsize, Ordering}},
    time::Instant,
};
use std::collections::HashMap;
use tauri::Emitter;

use crate::{
    db::{
        encoding::decode_move, get_db_or_create, get_pawn_home, models::*,
        pgn::{get_material_count, MaterialCount},
        normalize_games, schema::*, ConnectionOptions,
    },
    error::Error,
    AppState,
};

use super::GameQueryJs;

#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub struct ExactData {
    pawn_home: u16,
    material: MaterialCount,
    position: Chess,
}

#[derive(Debug, Hash, PartialEq, Eq, Clone)]
pub struct PartialData {
    piece_positions: Setup,
    material: MaterialCount,
}

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

fn convert_position_query(query: PositionQueryJs) -> Result<PositionQuery, Error> {
    match query.type_.as_str() {
        "exact" => PositionQuery::exact_from_fen(&query.fen),
        "partial" => PositionQuery::partial_from_fen(&query.fen),
        _ => unreachable!(),
    }
}

impl PositionQuery {
    fn matches(&self, position: &Chess) -> bool {
        match self {
            PositionQuery::Exact(ref data) => {
                data.position.board() == position.board() && data.position.turn() == position.turn()
            }
            PositionQuery::Partial(ref data) => {
                let query_board = &data.piece_positions.board;
                let tested_board = position.board();

                is_contained(tested_board.white(), query_board.white())
                    && is_contained(tested_board.black(), query_board.black())
                    && is_contained(tested_board.pawns(), query_board.pawns())
                    && is_contained(tested_board.knights(), query_board.knights())
                    && is_contained(tested_board.bishops(), query_board.bishops())
                    && is_contained(tested_board.rooks(), query_board.rooks())
                    && is_contained(tested_board.queens(), query_board.queens())
                    && is_contained(tested_board.kings(), query_board.kings())
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

/// Returns true if the end pawn structure is reachable
fn is_end_reachable(end: u16, pos: u16) -> bool {
    end & !pos == 0
}

/// Returns true if the end material is reachable
fn is_material_reachable(end: &MaterialCount, pos: &MaterialCount) -> bool {
    end.white <= pos.white && end.black <= pos.black
}

/// Returns true if the subset is contained in the container
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

fn get_move_after_match(
    move_blob: &Vec<u8>,
    fen: &Option<String>,
    query: &PositionQuery,
) -> Result<Option<String>, Error> {
    let mut chess = if let Some(fen) = fen {
        let fen = Fen::from_ascii(fen.as_bytes())?;
        Chess::from_setup(fen.into_setup(), shakmaty::CastlingMode::Chess960)?
    } else {
        Chess::default()
    };

    if query.matches(&chess) {
        if move_blob.is_empty() {
            return Ok(Some("*".to_string()));
        }
        let next_move = decode_move(move_blob[0], &chess).unwrap();
        let san = SanPlus::from_move(chess, &next_move);
        return Ok(Some(san.to_string()));
    }

    for (i, byte) in move_blob.iter().enumerate() {
        let m = decode_move(*byte, &chess).unwrap();
        chess.play_unchecked(&m);
        let board = chess.board();
        if !query.is_reachable_by(&get_material_count(board), get_pawn_home(board)) {
            return Ok(None);
        }
        if query.matches(&chess) {
            if i == move_blob.len() - 1 {
                return Ok(Some("*".to_string()));
            }
            let next_move = decode_move(move_blob[i + 1], &chess).unwrap();
            let san = SanPlus::from_move(chess, &next_move);
            return Ok(Some(san.to_string()));
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

    if let Some(pos) = state.line_cache.get(&(query.clone(), file.clone())) {
        return Ok(pos.clone());
    }

    // start counting the time
    let start = Instant::now();
    info!("start loading games");

    let permit = state.new_request.acquire().await.unwrap();
    let mut games = state.db_cache.lock().unwrap();

    if games.is_empty() {
        // Try parallel chunked loading to speed up reading large DBs.
        // We'll split the id range into several chunks and load each chunk
        // using a separate connection from the pool, then merge results.
        use diesel::dsl::{max, min};

        let db_path_str = file.to_str().unwrap().to_string();

    let min_id: Option<i32> = games::table.select(min(games::id)).first::<Option<i32>>(db).ok().flatten();
    let max_id: Option<i32> = games::table.select(max(games::id)).first::<Option<i32>>(db).ok().flatten();

        if let (Some(min_id), Some(max_id)) = (min_id, max_id) {
            // determine number of chunks (cap to avoid too many small queries)
            let max_workers = std::cmp::max(1, std::cmp::min(8, rayon::current_num_threads()));
            let total = (max_id - min_id + 1) as usize;
            let chunk_size = (total + max_workers - 1) / max_workers;

            let ranges: Vec<(i32, i32)> = (0..max_workers)
                .map(|i| {
                    let start = min_id + (i * chunk_size) as i32;
                    let end = std::cmp::min(max_id, start + chunk_size as i32 - 1);
                    (start, end)
                })
                .filter(|(s, e)| s <= e)
                .collect();

            let load_result: Result<Vec<(
                i32,
                i32,
                i32,
                Option<String>,
                Option<String>,
                Vec<u8>,
                Option<String>,
                i32,
                i32,
                i32,
            )>, Error> = ranges
                .into_par_iter()
                .map(|(s, e)| {
                    // each thread gets its own connection from the pool
                    let mut conn = get_db_or_create(&state, &db_path_str, ConnectionOptions::default())?;
                    let part: Vec<(
                        i32,
                        i32,
                        i32,
                        Option<String>,
                        Option<String>,
                        Vec<u8>,
                        Option<String>,
                        i32,
                        i32,
                        i32,
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
                        ))
                        .filter(games::id.ge(s).and(games::id.le(e)))
                        .load(&mut conn)?;
                    Ok(part)
                })
                .reduce(|| Ok(Vec::new()), |a, b| match (a, b) {
                    (Ok(mut va), Ok(vb)) => {
                        va.extend(vb);
                        Ok(va)
                    }
                    (Err(e), _) | (_, Err(e)) => Err(e),
                });

            match load_result {
                Ok(v) => {
                    *games = v;
                    info!("got {} games: {:?}", games.len(), start.elapsed());
                }
                Err(_) => {
                    // Fallback to single-threaded load on error
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

                    info!("got {} games (fallback): {:?}", games.len(), start.elapsed());
                }
            }
        } else {
            // No rows; load normally to get empty vec
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
    }

    // openings is now built from per-thread maps and merged later
    use rayon::iter::ParallelIterator;
    use rayon::iter::IntoParallelRefIterator;

    let processed = AtomicUsize::new(0);

    println!("start search on {tab_id}");

    // Pre-convert position_query if present
    let converted_position_query = query.position.as_ref().map(|pq| convert_position_query(pq.clone()).ok()).flatten();

    // Use rayon fold/reduce to keep per-thread local maps and sample vectors, then merge to avoid global locks
    // acc: (ids, openings_map, local_processed_count)
    let (ids, openings_map, local_processed) = games
        .par_iter()
        .fold(
            || (Vec::<i32>::new(), HashMap::<String, PositionStats>::new(), 0usize),
            |mut acc, (
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
                    return acc;
                }
                // increment local counter and batch updates to the global atomic to reduce contention
                acc.2 += 1;
                if acc.2 >= 1000 {
                    let prev = processed.fetch_add(acc.2, Ordering::Relaxed);
                    let index = prev + acc.2;
                    acc.2 = 0;
                    if index % 10000 == 0 {
                        info!("{} games processed: {:?}", index, start.elapsed());
                        let _ = app.emit(
                            "search_progress",
                            ProgressPayload {
                                progress: (index as f64 / games.len() as f64) * 100.0,
                                id: tab_id.clone(),
                                finished: false,
                            },
                        );
                    }
                }

                // Early filtering: date, player, result
                if let Some(start_date) = &query.start_date {
                    if let Some(date) = date {
                        if date < start_date {
                            return acc;
                        }
                    }
                }
                if let Some(end_date) = &query.end_date {
                    if let Some(date) = date {
                        if date > end_date {
                            return acc;
                        }
                    }
                }
                if let Some(white) = query.player1 {
                    if white != *white_id {
                        return acc;
                    }
                }
                if let Some(black) = query.player2 {
                    if black != *black_id {
                        return acc;
                    }
                }
                if let Some(result) = result {
                    if let Some(wanted_result) = &query.wanted_result {
                        match wanted_result.as_str() {
                            "whitewon" => if result != "1-0" { return acc; },
                            "blackwon" => if result != "0-1" { return acc; },
                            "draw" => if result != "1/2-1/2" { return acc; },
                            &_ => {}
                        }
                    }
                }

                // Position query
                if let Some(position_query) = &converted_position_query {
                    let end_material: MaterialCount = ByColor {
                        white: *white_material as u8,
                        black: *black_material as u8,
                    };
                    if position_query.can_reach(&end_material, *end_pawn_home as u16) {
                        if let Ok(Some(m)) = get_move_after_match(game, fen, position_query) {
                            if acc.0.len() < 10 {
                                acc.0.push(*id);
                            }
                            match acc.1.get_mut(&m) {
                                Some(opening) => {
                                    match result.as_deref() {
                                        Some("1-0") => opening.white += 1,
                                        Some("0-1") => opening.black += 1,
                                        Some("1/2-1/2") => opening.draw += 1,
                                        _ => (),
                                    }
                                }
                                None => {
                                    let mut opening = PositionStats {
                                        black: 0,
                                        white: 0,
                                        draw: 0,
                                        move_: m.clone(),
                                    };
                                    match result.as_deref() {
                                        Some("1-0") => opening.white = 1,
                                        Some("0-1") => opening.black = 1,
                                        Some("1/2-1/2") => opening.draw = 1,
                                        _ => (),
                                    }
                                    acc.1.insert(m, opening);
                                }
                            }
                        }
                    }
                }

                acc
            },
        )
        .reduce(
            || (Vec::<i32>::new(), HashMap::<String, PositionStats>::new(), 0usize),
            |mut a, b| {
                // a and b are (ids, map, local_count)
                a.0.extend(b.0);
                for (mv, ps) in b.1 {
                    if let Some(existing) = a.1.get_mut(&mv) {
                        existing.white += ps.white;
                        existing.black += ps.black;
                        existing.draw += ps.draw;
                    } else {
                        a.1.insert(mv, ps);
                    }
                }
                // accumulate local counts into the first accumulator's counter
                a.2 += b.2;
                a
            },
        );

    // flush any remaining local counter into the global processed counter
    if local_processed > 0 {
        processed.fetch_add(local_processed, Ordering::Relaxed);
    }
    let openings: Vec<PositionStats> = openings_map.into_iter().map(|(_, v)| v).collect();

    info!("finished search in {:?}", start.elapsed());

    if state.new_request.available_permits() == 0 {
        drop(permit);
        return Err(Error::SearchStopped);
    }

    let (white_players, black_players) = diesel::alias!(players as white, players as black);
    let games: Vec<(Game, Player, Player, Event, Site)> = games::table
        .inner_join(white_players.on(games::white_id.eq(white_players.field(players::id))))
        .inner_join(black_players.on(games::black_id.eq(black_players.field(players::id))))
        .inner_join(events::table.on(games::event_id.eq(events::id)))
        .inner_join(sites::table.on(games::site_id.eq(sites::id)))
        .filter(games::id.eq_any(ids))
        .load(db)?;
    let normalized_games = normalize_games(games)?;

    state
        .line_cache
        .insert((query, file), (openings.clone(), normalized_games.clone()));

    Ok((openings, normalized_games))
}

pub async fn is_position_in_db(
    file: PathBuf,
    query: GameQueryJs,
    state: tauri::State<'_, AppState>,
) -> Result<bool, Error> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    if let Some(pos) = state.line_cache.get(&(query.clone(), file.clone())) {
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
        state.line_cache.insert((query, file), (vec![], vec![]));
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
            PositionQuery::exact_from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR").unwrap();
        let result = get_move_after_match(&game, &None, &query).unwrap();
        assert_eq!(result, Some("e4".to_string()));

        let query =
            PositionQuery::exact_from_fen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR").unwrap();
        let result = get_move_after_match(&game, &None, &query).unwrap();
        assert_eq!(result, Some("e5".to_string()));

        let query =
            PositionQuery::exact_from_fen("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR")
                .unwrap();
        let result = get_move_after_match(&game, &None, &query).unwrap();
        assert_eq!(result, Some("*".to_string()));
    }

    #[test]
    fn get_move_after_partial_match_test() {
        let game = vec![12, 12]; // 1. e4 e5

        let query = PositionQuery::partial_from_fen("8/pppppppp/8/8/8/8/PPPPPPPP/8").unwrap();
        let result = get_move_after_match(&game, &None, &query).unwrap();
        assert_eq!(result, Some("e4".to_string()));
    }
}
