use chrono::{NaiveDate, NaiveTime};
use diesel::{prelude::*, SqliteConnection};
use shakmaty::{Board, Piece, Position};

use crate::{
    db::{core, models::NewGame, ops::*, pgn::TempGame, schema::games},
    error::Result,
};

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
pub(crate) fn get_pawn_home(board: &Board) -> u16 {
    let white_pawns = board.by_piece(WHITE_PAWN);
    let black_pawns = board.by_piece(BLACK_PAWN);
    let second_rank_pawns = (white_pawns.0 >> 8) as u8;
    let seventh_rank_pawns = (black_pawns.0 >> 48) as u8;
    (second_rank_pawns as u16) | ((seventh_rank_pawns as u16) << 8)
}

fn game_stored(
    db: &mut SqliteConnection,
    white_id: i32,
    black_id: i32,
    date: &str,
    time: &str,
) -> Result<bool> {
    let found: Option<i32> = games::table
        .filter(games::white_id.eq(white_id))
        .filter(games::black_id.eq(black_id))
        .filter(games::date.eq(date))
        .filter(games::time.eq(time))
        .select(games::id)
        .first(db)
        .optional()?;
    Ok(found.is_some())
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

    // Idempotent import: a game already stored under the same (date, time,
    // players) identity is skipped. Requires a parseable timestamp so distinct
    // undated games do not collapse.
    if let (Some(date), Some(time)) = (game.date.as_deref(), game.time.as_deref()) {
        if NaiveDate::parse_from_str(date, "%Y.%m.%d").is_ok()
            && NaiveTime::parse_from_str(time, "%H:%M:%S").is_ok()
            && game_stored(db, white_id, black_id, date, time)?
        {
            return Ok(());
        }
    }

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
    let final_material = super::pgn::get_material_count(game.position.board());
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::pgn::Importer;
    use pgn_reader::BufferedReader;

    #[test]
    fn home_row() {
        let pawn_home = get_pawn_home(&Board::default());
        assert_eq!(pawn_home, 0b1111111111111111);

        let pawn_home = get_pawn_home(
            &Board::from_ascii_board_fen(b"8/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/8").unwrap(),
        );
        assert_eq!(pawn_home, 0b1110111111101111);

        let pawn_home = get_pawn_home(&Board::from_ascii_board_fen(b"8/8/8/8/8/8/8/8").unwrap());
        assert_eq!(pawn_home, 0b0000000000000000);
    }

    fn insert_pgn(conn: &mut SqliteConnection, pgn: &str) {
        let mut reader = BufferedReader::new_cursor(&pgn[..]);
        let mut importer = Importer::new(None);
        let game = reader.read_game(&mut importer).unwrap().flatten().unwrap();
        insert_to_db(conn, &game).unwrap();
    }

    fn game_count(conn: &mut SqliteConnection) -> i64 {
        games::table.count().get_result(conn).unwrap()
    }

    #[test]
    fn reimporting_a_stored_game_does_not_add_a_row() {
        let mut conn = SqliteConnection::establish(":memory:").unwrap();
        core::init_db(&mut conn, "Test", "Test").unwrap();
        let pgn = r#"[Event "e"]
[Date "2026.09.09"]
[UTCTime "11:05:14"]
[White "bonfire123"]
[Black "capaloco"]
[Result "0-1"]

1. e4 e5 0-1
"#;
        insert_pgn(&mut conn, pgn);
        insert_pgn(&mut conn, pgn);
        assert_eq!(game_count(&mut conn), 1);
    }

    #[test]
    fn games_with_distinct_timestamps_are_both_inserted() {
        let mut conn = SqliteConnection::establish(":memory:").unwrap();
        core::init_db(&mut conn, "Test", "Test").unwrap();
        let pgn_a = r#"[Date "2026.09.09"]
[UTCTime "11:05:14"]
[White "bonfire123"]
[Black "capaloco"]

1. e4 e5 *
"#;
        let pgn_b = r#"[Date "2026.09.10"]
[UTCTime "11:05:14"]
[White "bonfire123"]
[Black "capaloco"]

1. d4 d5 *
"#;
        insert_pgn(&mut conn, pgn_a);
        insert_pgn(&mut conn, pgn_b);
        assert_eq!(game_count(&mut conn), 2);
    }

    #[test]
    fn undated_games_between_same_players_do_not_collapse() {
        let mut conn = SqliteConnection::establish(":memory:").unwrap();
        core::init_db(&mut conn, "Test", "Test").unwrap();
        let pgn_a = r#"[White "bonfire123"]
[Black "capaloco"]

1. e4 e5 *
"#;
        let pgn_b = r#"[White "bonfire123"]
[Black "capaloco"]

1. d4 d5 *
"#;
        insert_pgn(&mut conn, pgn_a);
        insert_pgn(&mut conn, pgn_b);
        assert_eq!(game_count(&mut conn), 2);
    }

    #[test]
    fn placeholder_dates_do_not_collapse() {
        let mut conn = SqliteConnection::establish(":memory:").unwrap();
        core::init_db(&mut conn, "Test", "Test").unwrap();
        let pgn_a = r#"[Date "????.??.??"]
[White "bonfire123"]
[Black "capaloco"]

1. e4 e5 *
"#;
        let pgn_b = r#"[Date "????.??.??"]
[White "bonfire123"]
[Black "capaloco"]

1. d4 d5 *
"#;
        insert_pgn(&mut conn, pgn_a);
        insert_pgn(&mut conn, pgn_b);
        assert_eq!(game_count(&mut conn), 2);
    }
}
