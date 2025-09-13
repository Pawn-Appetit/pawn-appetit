/// Debug utilities for UCI engine communication
/// 
/// This module provides tools for debugging MultiPV and other UCI issues:
/// - Logging UCI command exchanges
/// - Verifying engine capabilities
/// - Analyzing MultiPV response patterns
/// - Detecting common configuration problems

use log::{debug, info, warn};
use vampirc_uci::{UciMessage, UciOptionConfig};
use serde::{Serialize, Deserialize};
use specta::Type;

use super::types::{EngineConfig, EngineOptions, BestMoves};

/// Debug helper for UCI communication
pub struct UciDebugger;

impl UciDebugger {
    /// Log UCI command being sent with context
    pub fn log_command(command: &str, context: &str) {
        info!("UCI_SEND [{}]: {}", context, command.trim());
    }

    /// Log UCI response received with parsing info
    pub fn log_response(response: &str, message: &UciMessage) {
        debug!("UCI_RECV: {} -> {:?}", response.trim(), message);
    }

    /// Analyze engine configuration for MultiPV support
    pub fn analyze_multipv_support(config: &EngineConfig) -> MultiPvAnalysis {
        let multipv_option = config.options.iter()
            .find(|opt| {
                match opt {
                    UciOptionConfig::Spin { name, .. } => name == "MultiPV",
                    _ => false,
                }
            });

        match multipv_option {
            Some(UciOptionConfig::Spin { default, min, max, .. }) => {
                MultiPvAnalysis {
                    supported: true,
                    default_value: default.map(|v| v as u16),
                    min_value: min.map(|v| v as u16),
                    max_value: max.map(|v| v as u16),
                    option_type: "spin".to_string(),
                }
            }
            Some(other) => {
                warn!("MultiPV option found but not a spin type: {:?}", other);
                MultiPvAnalysis {
                    supported: true,
                    default_value: None,
                    min_value: None,
                    max_value: None,
                    option_type: format!("{:?}", other),
                }
            }
            None => {
                MultiPvAnalysis {
                    supported: false,
                    default_value: None,
                    min_value: None,
                    max_value: None,
                    option_type: "not_found".to_string(),
                }
            }
        }
    }

    /// Log MultiPV configuration details
    pub fn log_multipv_config(options: &EngineOptions, effective_multipv: u16) {
        let requested_multipv = options.extra_options.iter()
            .find(|opt| opt.name == "MultiPV")
            .and_then(|opt| opt.value.parse::<u16>().ok())
            .unwrap_or(1);

        info!("MultiPV Configuration:");
        info!("  Requested: {}", requested_multipv);
        info!("  Effective: {}", effective_multipv);
        info!("  Position: {}", options.fen);
        info!("  Move count: {}", options.moves.len());
        
        if requested_multipv != effective_multipv {
            warn!("MultiPV value adjusted from {} to {} based on legal moves", 
                  requested_multipv, effective_multipv);
        }
    }

    /// Analyze MultiPV response pattern for debugging
    pub fn analyze_multipv_responses(responses: &[BestMoves]) -> MultiPvResponseAnalysis {
        if responses.is_empty() {
            return MultiPvResponseAnalysis {
                total_lines: 0,
                multipv_values: Vec::new(),
                depths: Vec::new(),
                all_same_depth: true,
                missing_lines: Vec::new(),
                has_gaps: false,
            };
        }

        let multipv_values: Vec<u16> = responses.iter().map(|r| r.multipv).collect();
        let depths: Vec<u32> = responses.iter().map(|r| r.depth).collect();
        let first_depth = depths[0];
        let all_same_depth = depths.iter().all(|&d| d == first_depth);
        
        // Check for gaps in MultiPV sequence
        let expected_max = multipv_values.iter().max().unwrap_or(&1);
        let mut missing_lines = Vec::new();
        let mut has_gaps = false;
        
        for expected in 1..=*expected_max {
            if !multipv_values.contains(&expected) {
                missing_lines.push(expected);
                has_gaps = true;
            }
        }

        MultiPvResponseAnalysis {
            total_lines: responses.len(),
            multipv_values,
            depths,
            all_same_depth,
            missing_lines,
            has_gaps,
        }
    }

    /// Log comprehensive MultiPV analysis results
    pub fn log_multipv_analysis(analysis: &MultiPvResponseAnalysis) {
        info!("MultiPV Response Analysis:");
        info!("  Total lines received: {}", analysis.total_lines);
        info!("  MultiPV values: {:?}", analysis.multipv_values);
        info!("  Depths: {:?}", analysis.depths);
        info!("  All same depth: {}", analysis.all_same_depth);
        
        if analysis.has_gaps {
            warn!("  Missing MultiPV lines: {:?}", analysis.missing_lines);
            warn!("  This indicates the engine is not sending complete MultiPV sets!");
        } else {
            info!("  No gaps detected in MultiPV sequence");
        }
    }

    /// Provide debugging suggestions based on analysis
    pub fn suggest_fixes(analysis: &MultiPvResponseAnalysis, config_analysis: &MultiPvAnalysis) -> Vec<String> {
        let mut suggestions = Vec::new();

        if !config_analysis.supported {
            suggestions.push("Engine does not support MultiPV - consider using a different engine".to_string());
            return suggestions;
        }

        if analysis.total_lines == 0 {
            suggestions.push("No MultiPV responses received - check if MultiPV option was set correctly".to_string());
            suggestions.push("Verify UCI command 'setoption name MultiPV value N' was sent".to_string());
        }

        if analysis.total_lines == 1 && analysis.multipv_values.contains(&1) {
            suggestions.push("Only received multipv=1 responses - engine may not have processed MultiPV option".to_string());
            suggestions.push("Check engine logs for UCI option acknowledgment".to_string());
        }

        if analysis.has_gaps {
            suggestions.push("Missing MultiPV lines detected - engine may have insufficient time or depth".to_string());
            suggestions.push("Try increasing analysis time or depth for complete MultiPV results".to_string());
        }

        if !analysis.all_same_depth {
            suggestions.push("MultiPV lines have different depths - ensure proper synchronization".to_string());
            suggestions.push("This may cause incomplete result sets to be discarded".to_string());
        }

        if suggestions.is_empty() {
            suggestions.push("MultiPV analysis looks correct - issue may be elsewhere".to_string());
        }

        suggestions
    }
}

/// Analysis result for MultiPV engine capability
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MultiPvAnalysis {
    pub supported: bool,
    pub default_value: Option<u16>,
    pub min_value: Option<u16>,
    pub max_value: Option<u16>,
    pub option_type: String,
}

/// Analysis result for MultiPV response patterns
#[derive(Debug, Clone, Serialize, Type)]
pub struct MultiPvResponseAnalysis {
    pub total_lines: usize,
    pub multipv_values: Vec<u16>,
    pub depths: Vec<u32>,
    pub all_same_depth: bool,
    pub missing_lines: Vec<u16>,
    pub has_gaps: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use vampirc_uci::uci::Score;

    #[test]
    fn test_multipv_analysis_complete_set() {
        let responses = vec![
            BestMoves { multipv: 1, depth: 10, ..Default::default() },
            BestMoves { multipv: 2, depth: 10, ..Default::default() },
            BestMoves { multipv: 3, depth: 10, ..Default::default() },
        ];

        let analysis = UciDebugger::analyze_multipv_responses(&responses);
        
        assert_eq!(analysis.total_lines, 3);
        assert_eq!(analysis.multipv_values, vec![1, 2, 3]);
        assert!(analysis.all_same_depth);
        assert!(!analysis.has_gaps);
        assert!(analysis.missing_lines.is_empty());
    }

    #[test]
    fn test_multipv_analysis_gaps() {
        let responses = vec![
            BestMoves { multipv: 1, depth: 10, ..Default::default() },
            BestMoves { multipv: 3, depth: 10, ..Default::default() }, // Missing multipv=2
        ];

        let analysis = UciDebugger::analyze_multipv_responses(&responses);
        
        assert_eq!(analysis.total_lines, 2);
        assert!(analysis.has_gaps);
        assert_eq!(analysis.missing_lines, vec![2]);
    }

    #[test]
    fn test_multipv_analysis_different_depths() {
        let responses = vec![
            BestMoves { multipv: 1, depth: 10, ..Default::default() },
            BestMoves { multipv: 2, depth: 11, ..Default::default() }, // Different depth
        ];

        let analysis = UciDebugger::analyze_multipv_responses(&responses);
        
        assert!(!analysis.all_same_depth);
    }
}
