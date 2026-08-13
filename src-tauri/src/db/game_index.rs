//! Piece-square occupancy masks that pre-filter position searches.
//!
//! For every game we record, per piece type, the union of squares that piece
//! type stood on at any point in the main line. A query position can only occur
//! in a game if every queried piece sits inside the matching mask, so a cheap
//! bitwise test over a narrow table rejects most games before their move blobs
//! are ever decoded.
//!
//! The masks are a union over the whole game, so they are a *conservative*
//! filter only: a game whose knight visited e4 on move 10 and whose bishop
//! reached c4 on move 40 passes a combined query even though the two placements
//! never co-existed. Survivors must still be verified by replaying the game.

use diesel::{prelude::*, SqliteConnection};
use log::{info, warn};
use rayon::prelude::*;
use serde::Serialize;
use shakmaty::{fen::Fen, Board, Chess, Color, FromSetup, Piece, Position, Role};
use specta::Type;
use std::{path::PathBuf, time::Instant};
use tauri::Emitter;

use super::{
    get_db_or_create,
    models::NewGameIndex,
    schema::{game_index, games, info},
    search::MoveStream,
    ConnectionOptions,
};
use crate::{error::Result, AppState};

/// Bumped whenever the mask layout changes, so stale indexes can be rebuilt.
pub const INDEX_VERSION: i32 = 1;

/// `Info` key holding the highest `Games.ID` covered by the index.
const INDEXED_UP_TO_KEY: &str = "PositionIndexedUpTo";

/// `Info` key holding the [`INDEX_VERSION`] the index was built with.
const INDEX_VERSION_KEY: &str = "PositionIndexVersion";

/// Games read from the database per pass.
const READ_BATCH_SIZE: i64 = 20_000;

/// Rows per `INSERT`, kept well under SQLite's bound-parameter limit.
const INSERT_CHUNK_SIZE: usize = 1_000;

const CREATE_GAME_INDEX_SQL: &str = include_str!("../../../database/schema/game_index.sql");

/// The twelve (colour, role) pairs, in the column order of `GameIndex`.
const PIECES: [Piece; 12] = [
    Piece {
        color: Color::White,
        role: Role::Pawn,
    },
    Piece {
        color: Color::White,
        role: Role::Knight,
    },
    Piece {
        color: Color::White,
        role: Role::Bishop,
    },
    Piece {
        color: Color::White,
        role: Role::Rook,
    },
    Piece {
        color: Color::White,
        role: Role::Queen,
    },
    Piece {
        color: Color::White,
        role: Role::King,
    },
    Piece {
        color: Color::Black,
        role: Role::Pawn,
    },
    Piece {
        color: Color::Black,
        role: Role::Knight,
    },
    Piece {
        color: Color::Black,
        role: Role::Bishop,
    },
    Piece {
        color: Color::Black,
        role: Role::Rook,
    },
    Piece {
        color: Color::Black,
        role: Role::Queen,
    },
    Piece {
        color: Color::Black,
        role: Role::King,
    },
];

/// Union of the squares each piece type occupied during one game.
///
/// Entries are ordered as [`PIECES`]: white pawn through white king, then black.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PieceMasks([u64; PIECES.len()]);

impl PieceMasks {
    /// Fold one position into the accumulated masks.
    #[inline(always)]
    fn add_position(&mut self, position: &Chess) {
        let board = position.board();
        for (mask, piece) in self.0.iter_mut().zip(PIECES) {
            *mask |= board.by_piece(piece).0;
        }
    }

    /// Build the masks for a game stored as an encoded move blob.
    ///
    /// `fen` is the game's starting position, or `None` for the standard setup.
    /// Only the main line is walked, matching what position search examines.
    ///
    /// # Errors
    ///
    /// Returns an error if `fen` is present but not a legal position.
    pub fn from_moves(moves: &[u8], fen: Option<&str>) -> Result<Self> {
        let start = match fen {
            Some(fen) => {
                let fen = Fen::from_ascii(fen.as_bytes())?;
                Chess::from_setup(fen.into_setup(), shakmaty::CastlingMode::Chess960)?
            }
            None => Chess::default(),
        };

        let mut masks = Self::default();
        masks.add_position(&start);

        let mut stream = MoveStream::new(moves, start);
        while stream.advance() {
            masks.add_position(stream.position());
        }

        Ok(masks)
    }

    /// The masks as signed values, for storage in SQLite `INTEGER` columns.
    ///
    /// SQLite integers are signed 64-bit, so masks with the h8 bit set wrap to
    /// negative. The bit pattern round-trips unchanged, which is all the
    /// bitwise `AND` filter needs.
    fn to_signed(self) -> [i64; PIECES.len()] {
        self.0.map(|mask| mask as i64)
    }

    /// The per-piece placements of a single board, as masks.
    ///
    /// Used to turn a query position into the masks a game must contain.
    pub fn from_board(board: &Board) -> Self {
        let mut masks = Self::default();
        for (mask, piece) in masks.0.iter_mut().zip(PIECES) {
            *mask = board.by_piece(piece).0;
        }
        masks
    }
}

/// Column names of `GameIndex`, in [`PIECES`] order.
const MASK_COLUMNS: [&str; PIECES.len()] = [
    "WP", "WN", "WB", "WR", "WQ", "WK", "BP", "BN", "BB", "BR", "BQ", "BK",
];

/// Standard starting squares of each piece type, in [`PIECES`] order.
///
/// Used only to rank clause selectivity, so a database of Chess960 games costs
/// a worse ordering, never a wrong result.
const HOME_SQUARES: [u64; PIECES.len()] = [
    0x0000_0000_0000_FF00, // white pawns, rank 2
    0x0000_0000_0000_0042, // white knights, b1 g1
    0x0000_0000_0000_0024, // white bishops, c1 f1
    0x0000_0000_0000_0081, // white rooks, a1 h1
    0x0000_0000_0000_0008, // white queen, d1
    0x0000_0000_0000_0010, // white king, e1
    0x00FF_0000_0000_0000, // black pawns, rank 7
    0x4200_0000_0000_0000, // black knights, b8 g8
    0x2400_0000_0000_0000, // black bishops, c8 f8
    0x8100_0000_0000_0000, // black rooks, a8 h8
    0x0800_0000_0000_0000, // black queen, d8
    0x1000_0000_0000_0000, // black king, e8
];

/// A conservative SQL pre-filter for position search.
///
/// Every clause is a *necessary* condition for a game to contain the query
/// position, so the filter can admit games that do not match but never rejects
/// one that does. Survivors must still be verified by replaying them.
#[derive(Debug, Clone)]
pub struct IndexFilter {
    masks: [i64; PIECES.len()],
    /// Home-square bits the game's final position must not have, if any.
    pawn_home_reject: Option<i32>,
    /// Upper bounds on the game's final material, if any.
    max_material: Option<(i32, i32)>,
    /// Games above this id are not indexed and must not be filtered out.
    indexed_up_to: i32,
}

impl IndexFilter {
    /// Build a filter for the pieces on `board`.
    pub fn new(board: &Board, indexed_up_to: i32) -> Self {
        Self {
            masks: PieceMasks::from_board(board).to_signed(),
            pawn_home_reject: None,
            max_material: None,
            indexed_up_to,
        }
    }

    /// Add the bounds that only hold when matching a position exactly.
    ///
    /// Material never increases, so a game whose final position is already
    /// poorer than the query cannot have passed through it; likewise a game
    /// whose pawns left home squares the query still occupies. These mirror
    /// `PositionQuery::can_reach` and are unsound for partial queries, where
    /// the matched position may hold pieces the query does not mention.
    pub fn with_exact_bounds(mut self, pawn_home: u16, white: u8, black: u8) -> Self {
        self.pawn_home_reject = Some(!pawn_home as i32 & 0xFFFF);
        self.max_material = Some((white as i32, black as i32));
        self
    }

    /// Render the filter as a SQL predicate over `Games` joined to `GameIndex`.
    ///
    /// Returns `None` when nothing can be excluded. Only integers are
    /// interpolated, so the result carries no user-supplied text.
    ///
    /// Mask clauses are ordered most-selective first. SQLite short-circuits
    /// `AND`, so a clause that rejects most rows spares the rest from being
    /// evaluated at all; leading with a weak clause makes every row pay for
    /// the whole chain.
    pub fn to_sql(&self) -> Option<String> {
        let mut clauses = vec!["GameIndex.GameID IS NOT NULL".to_string()];

        let mut mask_clauses: Vec<(u32, String)> = self
            .masks
            .iter()
            .zip(MASK_COLUMNS)
            .zip(HOME_SQUARES)
            .filter(|((mask, _), _)| **mask != 0)
            .map(|((mask, column), home)| {
                // Squares a piece had to travel to are rare; squares it starts
                // on are shared by nearly every game and filter almost nothing.
                let away_from_home = (*mask as u64 & !home).count_ones();
                (
                    away_from_home,
                    format!("(GameIndex.{column} & {mask}) = {mask}"),
                )
            })
            .collect();

        mask_clauses.sort_by(|a, b| b.0.cmp(&a.0));
        clauses.extend(mask_clauses.into_iter().map(|(_, clause)| clause));

        if let Some(reject) = self.pawn_home_reject {
            clauses.push(format!("(Games.PawnHome & {reject}) = 0"));
        }

        if let Some((white, black)) = self.max_material {
            clauses.push(format!(
                "Games.WhiteMaterial <= {white} AND Games.BlackMaterial <= {black}"
            ));
        }

        if clauses.len() == 1 {
            return None;
        }

        // Games past the indexed range have no masks and must always be kept.
        Some(format!(
            "(Games.ID > {} OR ({}))",
            self.indexed_up_to,
            clauses.join(" AND ")
        ))
    }
}

/// The highest game id covered by a usable index, or 0 if there is none.
pub fn indexed_up_to(conn: &mut SqliteConnection) -> i32 {
    if !matches!(
        read_info_i32(conn, INDEX_VERSION_KEY),
        Ok(Some(INDEX_VERSION))
    ) {
        return 0;
    }
    read_info_i32(conn, INDEXED_UP_TO_KEY)
        .ok()
        .flatten()
        .unwrap_or(0)
}

/// Outcome of a [`build_position_index`] run.
#[derive(Debug, Clone, Serialize, Type)]
pub struct IndexBuildReport {
    /// Games indexed by this run.
    pub indexed: i64,
    /// Games whose moves could not be decoded, and so were left unindexed.
    pub skipped: i64,
    /// Highest `Games.ID` now covered.
    pub indexed_up_to: i32,
    /// Wall-clock duration of the run.
    pub elapsed_ms: u64,
}

/// Progress event emitted while the index builds.
#[derive(Debug, Clone, Serialize)]
pub struct IndexProgress {
    pub processed: i64,
    pub total: i64,
    pub finished: bool,
}

/// Create the `GameIndex` table if the database predates it.
pub fn ensure_table(conn: &mut SqliteConnection) -> Result<()> {
    use diesel::connection::SimpleConnection;
    conn.batch_execute(CREATE_GAME_INDEX_SQL)?;
    Ok(())
}

fn read_info_i32(conn: &mut SqliteConnection, key: &str) -> Result<Option<i32>> {
    let value: Option<String> = info::table
        .filter(info::name.eq(key))
        .select(info::value)
        .first::<Option<String>>(conn)
        .optional()?
        .flatten();

    Ok(value.and_then(|value| value.parse().ok()))
}

fn write_info_i32(conn: &mut SqliteConnection, key: &str, value: i32) -> Result<()> {
    diesel::insert_into(info::table)
        .values((info::name.eq(key), info::value.eq(value.to_string())))
        .on_conflict(info::name)
        .do_update()
        .set(info::value.eq(value.to_string()))
        .execute(conn)?;

    Ok(())
}

/// Build (or resume building) the piece-square index for a database.
///
/// The build is incremental: it starts from the highest game already covered,
/// so it is safe to interrupt and re-run, and re-running after an import only
/// processes the newly added games. Games are never modified.
#[tauri::command]
#[specta::specta]
pub async fn build_position_index(
    file: PathBuf,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<IndexBuildReport> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    build_index(db, |processed, total| {
        let _ = app.emit(
            "position_index_progress",
            IndexProgress {
                processed,
                total,
                finished: processed >= total,
            },
        );
    })
}

/// Index every game not yet covered, reporting `(processed, total)` per batch.
///
/// This is the Tauri-free core of [`build_position_index`], so it can be driven
/// from tests and tooling.
pub fn build_index(
    db: &mut SqliteConnection,
    mut on_progress: impl FnMut(i64, i64),
) -> Result<IndexBuildReport> {
    let start = Instant::now();

    ensure_table(db)?;

    // A version bump invalidates existing masks, so start over.
    let stored_version = read_info_i32(db, INDEX_VERSION_KEY)?;
    if stored_version != Some(INDEX_VERSION) {
        if stored_version.is_some() {
            info!("Position index version changed, rebuilding from scratch");
            diesel::delete(game_index::table).execute(db)?;
        }
        write_info_i32(db, INDEXED_UP_TO_KEY, 0)?;
        write_info_i32(db, INDEX_VERSION_KEY, INDEX_VERSION)?;
    }

    let mut cursor = read_info_i32(db, INDEXED_UP_TO_KEY)?.unwrap_or(0);
    let total: i64 = games::table.count().first(db)?;
    let mut indexed = 0i64;
    let mut skipped = 0i64;

    info!("Building position index for {total} games, resuming from ID {cursor}");

    loop {
        let batch: Vec<(i32, Vec<u8>, Option<String>)> = games::table
            .select((games::id, games::moves, games::fen))
            .filter(games::id.gt(cursor))
            .order(games::id.asc())
            .limit(READ_BATCH_SIZE)
            .load(db)?;

        if batch.is_empty() {
            break;
        }

        let batch_max_id = batch.last().map(|(id, _, _)| *id).unwrap_or(cursor);

        let rows: Vec<NewGameIndex> = batch
            .par_iter()
            .filter_map(
                |(id, moves, fen)| match PieceMasks::from_moves(moves, fen.as_deref()) {
                    Ok(masks) => Some(NewGameIndex::new(*id, masks.to_signed())),
                    Err(err) => {
                        warn!("Skipping game {id} while indexing: {err}");
                        None
                    }
                },
            )
            .collect();

        skipped += (batch.len() - rows.len()) as i64;
        indexed += rows.len() as i64;

        db.transaction::<_, diesel::result::Error, _>(|conn| {
            for chunk in rows.chunks(INSERT_CHUNK_SIZE) {
                diesel::replace_into(game_index::table)
                    .values(chunk)
                    .execute(conn)?;
            }
            Ok(())
        })?;

        cursor = batch_max_id;
        write_info_i32(db, INDEXED_UP_TO_KEY, cursor)?;

        on_progress(indexed + skipped, total);
    }

    let elapsed_ms = start.elapsed().as_millis() as u64;
    info!("Position index built: {indexed} indexed, {skipped} skipped, in {elapsed_ms}ms");

    Ok(IndexBuildReport {
        indexed,
        skipped,
        indexed_up_to: cursor,
        elapsed_ms,
    })
}

/// Drop the piece-square index and its bookkeeping.
#[tauri::command]
#[specta::specta]
pub async fn delete_position_index(file: PathBuf, state: tauri::State<'_, AppState>) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    ensure_table(db)?;
    diesel::delete(game_index::table).execute(db)?;
    write_info_i32(db, INDEXED_UP_TO_KEY, 0)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use shakmaty::{Board, Square};

    fn square_bit(square: Square) -> u64 {
        1u64 << square as u32
    }

    fn mask_for(masks: &PieceMasks, piece: Piece) -> u64 {
        let idx = PIECES.iter().position(|p| *p == piece).unwrap();
        masks.0[idx]
    }

    #[test]
    fn start_position_is_included() {
        let masks = PieceMasks::from_moves(&[], None).unwrap();
        let white_pawns = mask_for(
            &masks,
            Piece {
                color: Color::White,
                role: Role::Pawn,
            },
        );

        assert_eq!(white_pawns, Board::default().by_piece(PIECES[0]).0);
    }

    #[test]
    fn masks_accumulate_visited_squares() {
        // 1. e4 Nf6 2. e5 Nd5 — the black knight visits g8, f6 and d5.
        let mut moves = Vec::new();
        let mut position = Chess::default();
        for san in ["e4", "Nf6", "e5", "Nd5"] {
            let san: shakmaty::san::San = san.parse().unwrap();
            let mv = san.to_move(&position).unwrap();
            let idx = position
                .legal_moves()
                .iter()
                .position(|candidate| *candidate == mv)
                .unwrap();
            moves.push(idx as u8);
            position.play_unchecked(&mv);
        }

        let masks = PieceMasks::from_moves(&moves, None).unwrap();
        let knights = mask_for(
            &masks,
            Piece {
                color: Color::Black,
                role: Role::Knight,
            },
        );

        for square in [Square::G8, Square::F6, Square::D5, Square::B8] {
            assert_ne!(knights & square_bit(square), 0, "missing {square}");
        }
        assert_eq!(knights & square_bit(Square::E4), 0);
    }

    /// Encoded-blob markers, mirrored from `MoveStream`.
    const START_VARIATION: u8 = 254;
    const END_VARIATION: u8 = 253;
    const COMMENT: u8 = 252;
    const NAG: u8 = 251;

    /// Encode `san` as a move byte, playing it on `position`.
    fn push_move(blob: &mut Vec<u8>, position: &mut Chess, san: &str) {
        let san: shakmaty::san::San = san.parse().unwrap();
        let mv = san.to_move(position).unwrap();
        let idx = position
            .legal_moves()
            .iter()
            .position(|candidate| *candidate == mv)
            .unwrap();
        blob.push(idx as u8);
        position.play_unchecked(&mv);
    }

    /// A blob exercising every marker: NAGs, a variation and a comment.
    fn blob_with_annotations() -> Vec<u8> {
        let mut blob = Vec::new();
        let mut position = Chess::default();

        push_move(&mut blob, &mut position, "e4");
        blob.extend([NAG, 3]);

        // A variation is an alternative to the move just played; its contents
        // are skipped wholesale, so any legal byte sequence exercises the path.
        blob.push(START_VARIATION);
        blob.push(0);
        blob.push(END_VARIATION);

        push_move(&mut blob, &mut position, "e5");

        let comment = b"a comment";
        blob.push(COMMENT);
        blob.extend((comment.len() as u64).to_be_bytes());
        blob.extend(comment);

        push_move(&mut blob, &mut position, "Nf3");
        push_move(&mut blob, &mut position, "Nc6");

        blob
    }

    /// `advance` must visit exactly the positions `next_move` does: the
    /// pre-filter would be unsound if the masks covered a different main line
    /// than the search that verifies them.
    #[test]
    fn advance_matches_next_move() {
        let blob = blob_with_annotations();

        let mut cheap = MoveStream::new(&blob, Chess::default());
        let mut reference = MoveStream::new(&blob, Chess::default());

        let mut visited = 0;
        loop {
            let expected = reference.next_move().map(|_| reference.position().clone());
            let advanced = cheap.advance();

            match expected {
                Some(expected) => {
                    assert!(advanced, "cheap walker stopped early at ply {visited}");
                    assert_eq!(cheap.position().board(), expected.board(), "ply {visited}");
                    visited += 1;
                }
                None => {
                    assert!(!advanced, "cheap walker ran past the end at ply {visited}");
                    break;
                }
            }
        }

        assert_eq!(visited, 4, "expected the four main-line moves");
    }

    #[test]
    fn variations_are_excluded_from_masks() {
        let masks = PieceMasks::from_moves(&blob_with_annotations(), None).unwrap();
        let white_knights = mask_for(
            &masks,
            Piece {
                color: Color::White,
                role: Role::Knight,
            },
        );

        // Nf3 is main line; the skipped variation must not contribute squares.
        assert_ne!(white_knights & square_bit(Square::F3), 0);
        assert_eq!(white_knights & square_bit(Square::C3), 0);
    }

    /// Builds the index in a real database. Writes to the file it is given.
    ///
    /// `POSITION_INDEX_BUILD_DB=/path/to.db3 cargo test --release
    /// run_index_build -- --ignored --nocapture`
    #[test]
    #[ignore = "writes to a real database; run manually"]
    fn run_index_build() {
        use diesel::Connection;

        let Ok(path) = std::env::var("POSITION_INDEX_BUILD_DB") else {
            panic!("set POSITION_INDEX_BUILD_DB to a database path");
        };

        let mut conn = SqliteConnection::establish(&path).unwrap();
        let started = Instant::now();

        let report = build_index(&mut conn, |processed, total| {
            println!(
                "  {processed}/{total} ({:.1}%) after {:.1}s",
                processed as f64 / total as f64 * 100.0,
                started.elapsed().as_secs_f64(),
            );
        })
        .unwrap();

        println!("{report:?}");
    }

    /// Measures mask-building throughput against a real database.
    ///
    /// Opens the database read-only and never writes. Enable with:
    /// `POSITION_INDEX_BENCH_DB=/path/to.db3 cargo test --release
    /// bench_mask_throughput -- --ignored --nocapture`
    #[test]
    #[ignore = "requires a large database; run manually"]
    fn bench_mask_throughput() {
        use diesel::Connection;

        let Ok(path) = std::env::var("POSITION_INDEX_BENCH_DB") else {
            panic!("set POSITION_INDEX_BENCH_DB to a database path");
        };
        let sample: i64 = std::env::var("POSITION_INDEX_BENCH_GAMES")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(100_000);

        let mut conn = SqliteConnection::establish(&format!("file:{path}?mode=ro")).unwrap();

        /// Game id, encoded moves, starting FEN and stored ply count.
        type BenchRow = (i32, Vec<u8>, Option<String>, Option<i32>);

        let load_start = Instant::now();
        let rows: Vec<BenchRow> = games::table
            .select((games::id, games::moves, games::fen, games::ply_count))
            .limit(sample)
            .load(&mut conn)
            .unwrap();
        let load_ms = load_start.elapsed().as_millis();

        let blob_bytes: usize = rows.iter().map(|(_, moves, _, _)| moves.len()).sum();
        let stored_plies: i64 = rows
            .iter()
            .map(|(_, _, _, plies)| plies.unwrap_or(0) as i64)
            .sum();

        let compute_start = Instant::now();
        // Count plies actually walked, to prove the decoder is not bailing early.
        let walked: i64 = rows
            .par_iter()
            .map(|(_, moves, fen, _)| {
                let mut stream = MoveStream::new(
                    moves,
                    match fen {
                        Some(fen) => Chess::from_setup(
                            Fen::from_ascii(fen.as_bytes()).unwrap().into_setup(),
                            shakmaty::CastlingMode::Chess960,
                        )
                        .unwrap(),
                        None => Chess::default(),
                    },
                );
                let mut masks = PieceMasks::default();
                let mut plies = 0i64;
                masks.add_position(stream.position());
                while stream.advance() {
                    masks.add_position(stream.position());
                    plies += 1;
                }
                std::hint::black_box(masks);
                plies
            })
            .sum();
        let compute_ms = compute_start.elapsed().as_millis();

        println!(
            "games={} blob={:.1}MB load={}ms compute={}ms | plies walked={} stored={} ({:.2}%) | ~{:.0} games/s, ~{:.1}M plies/s",
            rows.len(),
            blob_bytes as f64 / 1_048_576.0,
            load_ms,
            compute_ms,
            walked,
            stored_plies,
            walked as f64 / stored_plies as f64 * 100.0,
            rows.len() as f64 / (compute_ms.max(1) as f64 / 1000.0),
            walked as f64 / (compute_ms.max(1) as f64 / 1000.0) / 1_000_000.0,
        );
    }

    #[test]
    fn home_squares_match_the_starting_board() {
        let start = PieceMasks::from_board(&Board::default());
        assert_eq!(start.0, HOME_SQUARES);
    }

    /// Clauses naming travelled-to squares must sort ahead of home squares.
    #[test]
    fn selective_clauses_come_first() {
        // Ruy Lopez after 3.Bb5: only the bishop, knights and pawns have moved.
        let board = Fen::from_ascii(b"r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R")
            .unwrap()
            .into_setup()
            .board;
        let sql = IndexFilter::new(&board, i32::MAX).to_sql().unwrap();

        let position_of = |column: &str| sql.find(&format!("GameIndex.{column} ")).unwrap();
        for travelled in ["WB", "WN", "WP", "BP", "BN"] {
            for home in ["WR", "WQ", "WK", "BB", "BR", "BQ", "BK"] {
                assert!(
                    position_of(travelled) < position_of(home),
                    "{travelled} should be evaluated before {home}"
                );
            }
        }
    }

    #[test]
    fn signed_round_trip_preserves_bits() {
        let mut masks = PieceMasks::default();
        masks.0[0] = u64::MAX;
        assert_eq!(masks.to_signed()[0] as u64, u64::MAX);
    }
}
