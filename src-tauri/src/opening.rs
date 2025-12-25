use log::info;
use serde::{Deserialize, Serialize};
use shakmaty::{fen::Fen, san::San, CastlingMode, Chess, EnPassantMode, Position, Setup};

use lazy_static::lazy_static;
use specta::Type;
use strsim::{jaro_winkler, sorensen_dice};

use crate::error::Error;

#[derive(Debug, Clone)]
struct Opening {
    #[allow(dead_code)]
    eco: String,
    name: String,
    setup: Setup,
    pgn: Option<String>,
}

#[derive(Debug, Clone, Type, Serialize)]
pub struct OutOpening {
    name: String,
    fen: String,
}

#[derive(Debug, Clone, Type, Serialize)]
pub struct OpeningInfo {
    pub eco: String,
    pub opening: String,
    pub variation: String,
}

#[derive(Deserialize)]
struct OpeningRecord {
    eco: String,
    name: String,
    pgn: String,
}

pub const TSV_DATA: [&[u8]; 5] = [
    include_bytes!("../data/a.tsv"),
    include_bytes!("../data/b.tsv"),
    include_bytes!("../data/c.tsv"),
    include_bytes!("../data/d.tsv"),
    include_bytes!("../data/e.tsv"),
];

const FISCHER_RANDOM_DATA: &[u8] = include_bytes!("../data/frc.tsv");

#[derive(Deserialize)]
struct FischerRandomRecord {
    name: String,
    fen: String,
}

#[tauri::command]
#[specta::specta]
pub fn get_opening_from_fen(fen: &str) -> Result<String, Error> {
    let fen: Fen = fen.parse()?;
    // Normalize the FEN by converting to Chess position and back to Setup
    // This ensures consistent comparison with how openings are stored (using EnPassantMode::Legal)
    // This way, the opening is determined by the resulting position (FEN), not by move order
    let chess: Chess = fen.into_position(CastlingMode::Standard)?;
    let setup = chess.into_setup(EnPassantMode::Legal);
    get_opening_from_setup(setup)
}

#[tauri::command]
#[specta::specta]
pub fn get_opening_from_name(name: &str) -> Result<String, Error> {
    OPENINGS
        .iter()
        .find(|o| o.name == name)
        .and_then(|o| o.pgn.clone())
        .ok_or_else(|| Error::NoOpeningFound)
}

pub fn get_opening_from_setup(setup: Setup) -> Result<String, Error> {
    OPENINGS
        .iter()
        .find(|o| o.setup == setup)
        .map(|o| o.name.clone())
        .ok_or_else(|| Error::NoOpeningFound)
}

#[tauri::command]
#[specta::specta]
pub fn get_opening_info_from_fen(fen: &str) -> Result<OpeningInfo, Error> {
    // Store the original FEN string for error messages
    let fen_str = fen.to_string();
    let fen: Fen = fen.parse()?;
    let chess: Chess = fen.into_position(CastlingMode::Standard)?;
    let setup = chess.into_setup(EnPassantMode::Legal);
    
    // Try exact match first
    let opening = OPENINGS
        .iter()
        .find(|o| o.setup == setup);
    
    // If no exact match, try to find by comparing board positions only
    // (ignoring en passant, castling rights, etc. which may differ)
    let opening = if opening.is_none() {
        OPENINGS
            .iter()
            .find(|o| {
                // Compare board positions, turn, and move counters
                // This is more lenient and will match even if en passant or castling differ
                o.setup.board == setup.board &&
                o.setup.turn == setup.turn &&
                o.setup.fullmoves == setup.fullmoves &&
                o.setup.halfmoves == setup.halfmoves
            })
    } else {
        opening
    };
    
    // If still no match, try matching just board and turn (most lenient)
    let opening = if opening.is_none() {
        OPENINGS
            .iter()
            .find(|o| {
                // Just compare board and turn - this will match positions that are the same
                // regardless of move counters, en passant, or castling
                o.setup.board == setup.board &&
                o.setup.turn == setup.turn
            })
    } else {
        opening
    };
    
    let opening = opening.ok_or_else(|| {
        info!("No opening found for FEN: {}", fen_str);
        Error::NoOpeningFound
    })?;
    
    // Parse the opening name to extract ECO, Opening, and Variation
    let eco = opening.eco.clone();
    let full_name = opening.name.clone().trim().to_string();
    
    // The format in TSV files is typically:
    // - "Catalan Opening"
    // - "Catalan Opening: Hungarian Gambit"
    // - "Catalan Opening: Open Defense, Alekhine Variation"
    // - "Indian Defense: Devin Gambit"
    
    // First, try to split by colon (:) which separates opening from variation
    let colon_parts: Vec<&str> = full_name.splitn(2, ':').map(|s| s.trim()).collect();
    
    let opening_name = colon_parts[0].to_string();
    
    // If there's a colon, the part after is the variation
    // But it might contain commas for sub-variations (e.g., "Open Defense, Alekhine Variation")
    let variation = if colon_parts.len() > 1 {
        colon_parts[1].to_string()
    } else {
        // No colon, check if there's a comma (less common format)
        let comma_parts: Vec<&str> = full_name.splitn(2, ',').map(|s| s.trim()).collect();
        if comma_parts.len() > 1 && comma_parts[0].len() > 10 {
            // If the first part looks like an opening name (not too short), split it
            comma_parts[1].to_string()
        } else {
            String::new()
        }
    };
    
    Ok(OpeningInfo {
        eco,
        opening: opening_name,
        variation,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn search_opening_name(query: String) -> Result<Vec<OutOpening>, Error> {
    let lower_query = query.to_lowercase();
    let scores = OPENINGS
        .iter()
        .map(|opening| {
            let lower_name = opening.name.to_lowercase();
            let sorenson_score = sorensen_dice(&lower_query, &lower_name);
            let jaro_score = jaro_winkler(&lower_query, &lower_name);
            let score = sorenson_score.max(jaro_score);
            (opening.clone(), score)
        })
        .collect::<Vec<_>>();
    let mut best_matches = scores
        .into_iter()
        .filter(|(_, score)| *score > 0.8)
        .collect::<Vec<_>>();

    best_matches.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let best_matches_names = best_matches
        .iter()
        .map(|(o, _)| o.clone())
        .take(15)
        .map(|o| OutOpening {
            name: o.name,
            fen: Fen::from_setup(o.setup.clone()).to_string(),
        })
        .collect();
    Ok(best_matches_names)
}

lazy_static! {
    static ref OPENINGS: Vec<Opening> = {
        let mut positions = vec![
            Opening {
                eco: "Extra".to_string(),
                name: "Starting Position".to_string(),
                setup: Setup::default(),
                pgn: None,
            },
            Opening {
                eco: "Extra".to_string(),
                name: "Empty Board".to_string(),
                setup: Setup::empty(),
                pgn: None,
            },
        ];

        let mut total_loaded = 0;
        for (tsv_idx, tsv) in TSV_DATA.iter().enumerate() {
            let mut rdr = csv::ReaderBuilder::new().delimiter(b'\t').from_reader(*tsv);
            let mut file_count = 0;
            for result in rdr.deserialize() {
                match result {
                    Ok(record) => {
                        let record: OpeningRecord = record;
                        let mut pos = Chess::default();
                        for token in record.pgn.split_whitespace() {
                            if let Ok(san) = token.parse::<San>() {
                                if let Ok(mv) = san.to_move(&pos) {
                                    pos.play_unchecked(&mv);
                                } else {
                                    // Skip invalid moves but log them
                                    info!("Skipping invalid move in opening {}: {}", record.name, token);
                                }
                            }
                        }
                        positions.push(Opening {
                            eco: record.eco.clone(),
                            name: record.name.clone(),
                            setup: pos.into_setup(EnPassantMode::Legal),
                            pgn: Some(record.pgn),
                        });
                        file_count += 1;
                        total_loaded += 1;
                    },
                    Err(e) => {
                        // Log the error but continue processing other openings
                        info!("Failed to deserialize opening: {}", e);
                    }
                }
            }
            info!("Loaded {} openings from file {}", file_count, 
                  match tsv_idx {
                      0 => "a.tsv",
                      1 => "b.tsv",
                      2 => "c.tsv",
                      3 => "d.tsv",
                      4 => "e.tsv",
                      _ => "unknown",
                  });
        }
        info!("Total openings loaded: {}", total_loaded);
        let mut rdr = csv::ReaderBuilder::new()
            .delimiter(b'\t')
            .from_reader(FISCHER_RANDOM_DATA);
        for result in rdr.deserialize() {
            match result {
                Ok(record) => {
                    let record: FischerRandomRecord = record;
                    match record.fen.parse::<Fen>() {
                        Ok(fen) => {
                            positions.push(Opening {
                                eco: "FRC".to_string(),
                                name: record.name,
                                setup: fen.into_setup(),
                                pgn: None,
                            });
                        },
                        Err(e) => {
                            // Log the error but continue processing other openings
                            info!("Failed to parse FEN for opening {}: {}", record.name, e);
                        }
                    }
                },
                Err(e) => {
                    // Log the error but continue processing other openings
                    info!("Failed to deserialize Fischer Random opening: {}", e);
                }
            }
        }
        positions
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_opening() {
        let opening =
            get_opening_from_fen("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPPKPPP/RNBQ1BNR b kq - 1 2")
                .unwrap();
        assert_eq!(opening, "Bongcloud Attack");
    }
}
