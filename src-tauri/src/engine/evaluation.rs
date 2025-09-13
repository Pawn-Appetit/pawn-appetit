use shakmaty::{ByColor, Chess, Color, Position, Role};

use super::types::piece_value;

/// Chess position evaluation utilities
/// 
/// This module provides:
/// - Material counting and evaluation
/// - Quiescence search implementation  
/// - Position assessment functions
/// - Sacrifice detection logic
pub struct ChessEvaluator;

impl ChessEvaluator {
    /// Count material difference from current player's perspective
    pub fn count_material(position: &Chess) -> i32 {
        if position.is_checkmate() {
            return -10000;
        }
        
        let material: ByColor<i32> = position.board().material().map(|piece_counts| {
            piece_counts.pawn as i32 * piece_value(Role::Pawn)
                + piece_counts.knight as i32 * piece_value(Role::Knight)
                + piece_counts.bishop as i32 * piece_value(Role::Bishop)
                + piece_counts.rook as i32 * piece_value(Role::Rook)
                + piece_counts.queen as i32 * piece_value(Role::Queen)
        });
        
        if position.turn() == Color::White {
            material.white - material.black
        } else {
            material.black - material.white
        }
    }

    /// Perform quiescence search to evaluate tactical sequences
    pub fn quiescence_search(position: &Chess, mut alpha: i32, beta: i32) -> i32 {
        let stand_pat = Self::count_material(position);

        if stand_pat >= beta {
            return beta;
        }
        if alpha < stand_pat {
            alpha = stand_pat;
        }

        let legal_moves = position.legal_moves();
        let mut captures: Vec<_> = legal_moves.iter().filter(|m| m.is_capture()).collect();

        // Sort captures by MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
        captures.sort_by(|a, b| {
            let a_value = a.capture().map_or(0, piece_value);
            let b_value = b.capture().map_or(0, piece_value);
            b_value.cmp(&a_value)
        });

        for capture in captures {
            let mut new_position = position.clone();
            new_position.play_unchecked(capture);
            let score = -Self::quiescence_search(&new_position, -beta, -alpha);
            
            if score >= beta {
                return beta; // Beta cutoff
            }
            if score > alpha {
                alpha = score;
            }
        }

        alpha
    }

    /// Simple evaluation combining material and tactics
    pub fn evaluate_position(position: &Chess) -> i32 {
        if position.is_game_over() {
            return if position.is_checkmate() { i32::MIN } else { 0 };
        }
        
        position.legal_moves()
            .iter()
            .map(|mv| {
                let mut new_position = position.clone();
                new_position.play_unchecked(mv);
                -Self::quiescence_search(&new_position, i32::MIN, i32::MAX)
            })
            .max()
            .unwrap_or(0)
    }

    /// Detect if a move appears to be a sacrifice
    pub fn is_sacrifice(before: &Chess, after: &Chess, threshold: i32) -> bool {
        let before_eval = Self::count_material(before);
        let after_eval = -Self::count_material(after);
        
        // Consider it a sacrifice if evaluation drops by more than threshold
        before_eval > after_eval + threshold
    }

    /// Analyze position for tactical motifs
    pub fn analyze_tactics(position: &Chess) -> TacticalAnalysis {
        let mut analysis = TacticalAnalysis::default();
        
        // Check for checks
        analysis.has_checks = position.legal_moves()
            .iter()
            .any(|mv| {
                let mut pos = position.clone();
                pos.play_unchecked(mv);
                pos.is_check()
            });

        // Check for captures
        analysis.has_captures = position.legal_moves()
            .iter()
            .any(|mv| mv.is_capture());

        // Material balance
        analysis.material_balance = Self::count_material(position);

        // Mobility (number of legal moves)
        analysis.mobility = position.legal_moves().len() as i32;

        analysis
    }

    /// Get piece-square table value (simplified)
    pub fn piece_square_value(role: Role, square: shakmaty::Square, color: Color) -> i32 {
        use shakmaty::Square;
        
        let rank = square.rank().into();
        let file: u8 = square.file().into();
        
        // Flip rank for black pieces
        let rank = if color == Color::White { rank } else { 7 - rank };
        
        match role {
            Role::Pawn => {
                // Pawns are more valuable when advanced
                match rank {
                    0 => 0,   // Can't have pawns on back rank
                    1 => 100,
                    2 => 110,
                    3 => 120,
                    4 => 130,
                    5 => 140,
                    6 => 150,
                    7 => 0,   // Promoted
                    _ => 100,
                }
            }
            Role::Knight => {
                // Knights prefer central squares
                let center_distance = ((3.5 - file as f32).abs() + (3.5 - rank as f32).abs()) as i32;
                300 - center_distance * 10
            }
            Role::Bishop => {
                // Bishops prefer long diagonals
                let diagonal_value = if (rank + file) % 2 == 0 { 5 } else { 0 };
                300 + diagonal_value
            }
            Role::Rook => {
                // Rooks prefer open files and ranks
                let open_file_bonus = if file == 0 || file == 7 { 10 } else { 0 };
                500 + open_file_bonus
            }
            Role::Queen => {
                // Queens prefer central control
                let center_distance = ((3.5 - file as f32).abs() + (3.5 - rank as f32).abs()) as i32;
                900 - center_distance * 5
            }
            Role::King => {
                // King safety depends on game phase
                match rank {
                    0 | 1 => 10,  // Safe on back ranks
                    2 | 3 => 0,   // Neutral
                    _ => -10,     // Exposed
                }
            }
        }
    }

    /// Calculate positional score
    pub fn positional_score(position: &Chess) -> i32 {
        let mut score = 0;
        
        for square in shakmaty::Square::ALL {
            if let Some(piece) = position.board().piece_at(square) {
                let piece_value = Self::piece_square_value(piece.role, square, piece.color);
                
                if piece.color == position.turn() {
                    score += piece_value;
                } else {
                    score -= piece_value;
                }
            }
        }
        
        score
    }
}

/// Tactical analysis result
#[derive(Debug, Default, Clone)]
pub struct TacticalAnalysis {
    pub has_checks: bool,
    pub has_captures: bool,
    pub material_balance: i32,
    pub mobility: i32,
    pub tactical_score: i32,
}

impl TacticalAnalysis {
    /// Calculate overall tactical score
    pub fn calculate_score(&mut self) {
        self.tactical_score = self.material_balance 
            + self.mobility 
            + if self.has_checks { 20 } else { 0 }
            + if self.has_captures { 10 } else { 0 };
    }
}

/// Advanced evaluation with multiple factors
pub struct AdvancedEvaluator {
    material_weight: f32,
    positional_weight: f32,
    tactical_weight: f32,
}

impl AdvancedEvaluator {
    /// Create new advanced evaluator with weights
    pub fn new(material_weight: f32, positional_weight: f32, tactical_weight: f32) -> Self {
        Self {
            material_weight,
            positional_weight,
            tactical_weight,
        }
    }

    /// Comprehensive position evaluation
    pub fn evaluate(&self, position: &Chess) -> f32 {
        if position.is_game_over() {
            return if position.is_checkmate() { -10000.0 } else { 0.0 };
        }

        let material = ChessEvaluator::count_material(position) as f32;
        let positional = ChessEvaluator::positional_score(position) as f32;
        
        let mut tactical_analysis = ChessEvaluator::analyze_tactics(position);
        tactical_analysis.calculate_score();
        let tactical = tactical_analysis.tactical_score as f32;

        material * self.material_weight 
            + positional * self.positional_weight 
            + tactical * self.tactical_weight
    }

    /// Evaluate move quality
    pub fn evaluate_move(&self, position: &Chess, mv: &shakmaty::Move) -> f32 {
        let mut new_position = position.clone();
        new_position.play_unchecked(mv);
        
        let before_eval = self.evaluate(position);
        let after_eval = -self.evaluate(&new_position);
        
        after_eval - before_eval
    }
}

impl Default for AdvancedEvaluator {
    fn default() -> Self {
        Self::new(1.0, 0.1, 0.05)
    }
}

/// Sacrifice detector with configurable thresholds
pub struct SacrificeDetector {
    material_threshold: i32,
    positional_compensation: i32,
}

impl SacrificeDetector {
    /// Create new sacrifice detector
    pub fn new(material_threshold: i32, positional_compensation: i32) -> Self {
        Self {
            material_threshold,
            positional_compensation,
        }
    }

    /// Detect if a move is a sacrifice
    pub fn is_sacrifice(&self, before: &Chess, after: &Chess) -> bool {
        let material_loss = ChessEvaluator::count_material(before) + ChessEvaluator::count_material(after);
        let positional_gain = ChessEvaluator::positional_score(after) - ChessEvaluator::positional_score(before);
        
        material_loss > self.material_threshold && positional_gain < self.positional_compensation
    }

    /// Classify sacrifice type
    pub fn classify_sacrifice(&self, before: &Chess, after: &Chess) -> SacrificeType {
        if !self.is_sacrifice(before, after) {
            return SacrificeType::None;
        }

        let material_loss = ChessEvaluator::count_material(before) + ChessEvaluator::count_material(after);
        
        match material_loss {
            loss if loss >= 900 => SacrificeType::Queen,
            loss if loss >= 500 => SacrificeType::Rook,
            loss if loss >= 300 => SacrificeType::MinorPiece,
            loss if loss >= 100 => SacrificeType::Pawn,
            _ => SacrificeType::None,
        }
    }
}

/// Types of sacrifices
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SacrificeType {
    None,
    Pawn,
    MinorPiece,
    Rook,
    Queen,
}

impl Default for SacrificeDetector {
    fn default() -> Self {
        Self::new(100, 50) // Sacrifice if lose > 1 pawn and gain < 0.5 pawn positionally
    }
}

// Convenience function for backward compatibility
pub fn naive_eval(pos: &Chess) -> i32 {
    ChessEvaluator::evaluate_position(pos)
}

#[cfg(test)]
mod tests {
    use super::*;
    use shakmaty::{fen::Fen, CastlingMode};

    #[test]
    fn test_starting_position_material() {
        let fen: Fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".parse().unwrap();
        let pos: Chess = fen.into_position(CastlingMode::Standard).unwrap();
        
        assert_eq!(ChessEvaluator::count_material(&pos), 0);
    }

    #[test]
    fn test_advanced_evaluator() {
        let evaluator = AdvancedEvaluator::default();
        let fen: Fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".parse().unwrap();
        let pos: Chess = fen.into_position(CastlingMode::Standard).unwrap();
        
        let eval = evaluator.evaluate(&pos);
        assert!(eval.abs() < 100.0); // Should be close to equal
    }

    #[test]
    fn test_sacrifice_detector() {
        let detector = SacrificeDetector::default();
        let fen: Fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".parse().unwrap();
        let pos: Chess = fen.into_position(CastlingMode::Standard).unwrap();
        
        // Same position should not be a sacrifice
        assert!(!detector.is_sacrifice(&pos, &pos));
    }
}
