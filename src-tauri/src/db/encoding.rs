use shakmaty::{Chess, Move, Position};
use crate::db::pgn::GameTree;

/// Extract only the main line moves from encoded game data, skipping annotations
/// This function properly handles the extended format with comments and variations
pub fn extract_main_line_moves(bytes: &[u8], start_position: Option<Chess>) -> Result<Vec<Move>, crate::error::Error> {
    let tree = GameTree::from_bytes(bytes, start_position.clone())?;
    let mut moves = Vec::new();
    let mut position = start_position.unwrap_or_default();
    
    for node in tree.nodes() {
        if let crate::db::pgn::GameTreeNode::Move(san_plus) = node {
            if let Ok(mv) = san_plus.san.to_move(&position) {
                moves.push(mv.clone());
                position.play_unchecked(&mv);
            }
        }
    }
    
    Ok(moves)
}

/// Decode game moves progressively, yielding positions after each move
/// This function properly handles the extended format
pub fn decode_game_positions(bytes: &[u8], start_position: Option<Chess>) -> Result<Vec<Chess>, crate::error::Error> {
    let moves = extract_main_line_moves(bytes, start_position.clone())?;
    let mut positions = Vec::new();
    let mut position = start_position.unwrap_or_default();
    
    positions.push(position.clone());
    
    for mv in moves {
        position.play_unchecked(&mv);
        positions.push(position.clone());
    }
    
    Ok(positions)
}