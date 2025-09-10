/// Debugging utilities for MultiPV and UCI engine issues
/// 
/// This module provides high-level debugging functions that can be called
/// from the frontend to diagnose engine communication problems.

use std::path::PathBuf;

use log::{info, warn};
use serde::{Deserialize, Serialize};
use specta::Type;
use vampirc_uci::UciOptionConfig;

use super::{
    config::EngineConfigurator,
    debug::{UciDebugger, MultiPvAnalysis},
    types::{EngineError, EngineResult, EngineOptions},
};

/// Comprehensive MultiPV diagnostic report
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MultiPvDiagnostic {
    pub engine_name: String,
    pub engine_path: String,
    pub multipv_supported: bool,
    pub multipv_analysis: MultiPvAnalysis,
    pub requested_multipv: u16,
    pub effective_multipv: u16,
    pub legal_moves_count: usize,
    pub position_fen: String,
    pub suggestions: Vec<String>,
    pub uci_commands_to_verify: Vec<String>,
}

/// Engine capability test result
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EngineCapabilityTest {
    pub engine_name: String,
    pub uci_support: bool,
    pub multipv_support: bool,
    pub max_multipv: Option<u16>,
    pub other_options: Vec<String>,
    pub test_successful: bool,
    pub error_message: Option<String>,
}

/// UCI protocol debugging utilities
pub struct UciProtocolDebugger;

impl UciProtocolDebugger {
    /// Perform comprehensive MultiPV diagnostic for a given engine and position
    pub async fn diagnose_multipv(
        engine_path: PathBuf,
        options: EngineOptions,
    ) -> EngineResult<MultiPvDiagnostic> {
        info!("Starting MultiPV diagnostic for engine: {:?}", engine_path);
        
        // Get engine configuration
        let config = EngineConfigurator::get_engine_config(engine_path.clone()).await?;
        let multipv_analysis = UciDebugger::analyze_multipv_support(&config);
        
        // Find requested MultiPV value
        let requested_multipv = options.extra_options.iter()
            .find(|opt| opt.name == "MultiPV")
            .and_then(|opt| opt.value.parse::<u16>().ok())
            .unwrap_or(1);
        
        // Calculate effective MultiPV
        let effective_multipv = super::communication::calculate_effective_multipv(
            requested_multipv,
            &options.fen,
            &options.moves,
        )?;
        
        // Get legal moves count for context
        let legal_moves_count = Self::count_legal_moves(&options.fen, &options.moves)?;
        
        // Generate suggestions based on analysis
        let fake_response_analysis = super::debug::MultiPvResponseAnalysis {
            total_lines: 0,
            multipv_values: Vec::new(),
            depths: Vec::new(),
            all_same_depth: true,
            missing_lines: Vec::new(),
            has_gaps: false,
        };
        
        let mut suggestions = UciDebugger::suggest_fixes(&fake_response_analysis, &multipv_analysis);
        
        // Add specific suggestions for common issues
        if !multipv_analysis.supported {
            suggestions.push("This engine does not support MultiPV analysis".to_string());
            suggestions.push("Consider using engines like Stockfish, Komodo, or Leela Chess Zero".to_string());
        } else if requested_multipv > effective_multipv {
            suggestions.push(format!(
                "Requested MultiPV ({}) exceeds legal moves ({})", 
                requested_multipv, legal_moves_count
            ));
        }
        
        // Generate UCI commands to verify
        let uci_commands = vec![
            "uci".to_string(),
            format!("setoption name MultiPV value {}", effective_multipv),
            format!("position fen {} moves {}", options.fen, options.moves.join(" ")),
            "go depth 10".to_string(),
        ];
        
        Ok(MultiPvDiagnostic {
            engine_name: config.name,
            engine_path: engine_path.to_string_lossy().to_string(),
            multipv_supported: multipv_analysis.supported,
            multipv_analysis,
            requested_multipv,
            effective_multipv,
            legal_moves_count,
            position_fen: options.fen,
            suggestions,
            uci_commands_to_verify: uci_commands,
        })
    }
    
    /// Test engine capabilities and UCI protocol compliance
    pub async fn test_engine_capabilities(engine_path: PathBuf) -> EngineCapabilityTest {
        let mut test = EngineCapabilityTest {
            engine_name: "Unknown".to_string(),
            uci_support: false,
            multipv_support: false,
            max_multipv: None,
            other_options: Vec::new(),
            test_successful: false,
            error_message: None,
        };
        
        match EngineConfigurator::get_engine_config(engine_path.clone()).await {
            Ok(config) => {
                test.engine_name = config.name.clone();
                test.uci_support = true;
                test.multipv_support = EngineConfigurator::supports_multipv(&config);
                test.max_multipv = EngineConfigurator::get_max_multipv(&config);
                test.other_options = config.options.iter()
                    .filter_map(|opt| {
                        match opt {
                            UciOptionConfig::Spin { name, .. } => {
                                if name != "MultiPV" { Some(name.clone()) } else { None }
                            }
                            UciOptionConfig::Check { name, .. } => Some(name.clone()),
                            UciOptionConfig::Combo { name, .. } => Some(name.clone()),
                            UciOptionConfig::Button { name } => Some(name.clone()),
                            UciOptionConfig::String { name, .. } => Some(name.clone()),
                        }
                    })
                    .collect();
                test.test_successful = true;
            }
            Err(e) => {
                test.error_message = Some(e.to_string());
                warn!("Engine capability test failed for {:?}: {}", engine_path, e);
            }
        }
        
        test
    }
    
    /// Generate step-by-step debugging instructions
    pub fn generate_debug_steps(diagnostic: &MultiPvDiagnostic) -> Vec<String> {
        let mut steps = Vec::new();
        
        steps.push("🔍 MultiPV Debugging Steps:".to_string());
        steps.push("".to_string());
        
        steps.push("1. Verify engine supports MultiPV:".to_string());
        if diagnostic.multipv_supported {
            steps.push("   ✅ Engine supports MultiPV".to_string());
            if let Some(max) = diagnostic.multipv_analysis.max_value {
                steps.push(format!("   📊 Maximum MultiPV value: {}", max));
            }
        } else {
            steps.push("   ❌ Engine does NOT support MultiPV".to_string());
            steps.push("   💡 Try a different engine (Stockfish, Komodo, etc.)".to_string());
            return steps;
        }
        
        steps.push("".to_string());
        steps.push("2. Check UCI commands being sent:".to_string());
        for (i, cmd) in diagnostic.uci_commands_to_verify.iter().enumerate() {
            steps.push(format!("   {}: {}", i + 1, cmd));
        }
        
        steps.push("".to_string());
        steps.push("3. Verify MultiPV configuration:".to_string());
        steps.push(format!("   📝 Requested: {}", diagnostic.requested_multipv));
        steps.push(format!("   ⚙️  Effective: {}", diagnostic.effective_multipv));
        steps.push(format!("   ♟️  Legal moves: {}", diagnostic.legal_moves_count));
        
        if diagnostic.requested_multipv != diagnostic.effective_multipv {
            steps.push("   ⚠️  MultiPV value was adjusted".to_string());
        }
        
        steps.push("".to_string());
        steps.push("4. Look for these patterns in engine output:".to_string());
        steps.push("   ✅ info depth 1 multipv 1 ...".to_string());
        steps.push("   ✅ info depth 1 multipv 2 ...".to_string());
        steps.push("   ✅ info depth 1 multipv 3 ...".to_string());
        steps.push("   ❌ Only seeing multipv 1 (means MultiPV not working)".to_string());
        
        steps.push("".to_string());
        steps.push("5. Common issues and solutions:".to_string());
        for suggestion in &diagnostic.suggestions {
            steps.push(format!("   💡 {}", suggestion));
        }
        
        steps
    }
    
    /// Helper function to count legal moves in a position
    fn count_legal_moves(fen: &str, moves: &[String]) -> EngineResult<usize> {
        use shakmaty::{Chess, Position, CastlingMode, fen::Fen, uci::UciMove};
        
        let fen: Fen = fen.parse()
            .map_err(|e| EngineError::FenParsing(e))?;
        
        let mut pos: Chess = match fen.into_position(CastlingMode::Chess960) {
            Ok(p) => p,
            Err(e) => e.ignore_too_much_material()
                .map_err(|e| EngineError::PositionSetup(e))?,
        };
        
        // Apply moves
        for move_str in moves {
            let uci = UciMove::from_ascii(move_str.as_bytes())
                .map_err(|e| EngineError::UciMoveParsing(e))?;
            let mv = uci.to_move(&pos)
                .map_err(|e| EngineError::IllegalMove(e.to_string()))?;
            pos.play_unchecked(&mv);
        }
        
        Ok(pos.legal_moves().len())
    }
}
