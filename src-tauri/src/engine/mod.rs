// =============================================================================
// Chess Engine Module
// =============================================================================
//
// This module provides a modular architecture for chess engine management,
// breaking down the previously monolithic implementation into focused,
// testable, and maintainable components.
//
// ## Architecture Overview
//
// ```
// ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
// │    Manager      │    │    Analysis     │    │     Events      │
// │  (High-level)   │────│   (Workflows)   │────│ (Rate limiting) │
// └─────────────────┘    └─────────────────┘    └─────────────────┘
//          │                       │                       │
// ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
// │   Process       │    │ Communication   │    │   Evaluation    │
// │ (Process mgmt)  │────│  (UCI Protocol) │    │ (Chess logic)   │
// └─────────────────┘    └─────────────────┘    └─────────────────┘
//          │                       │                       │
// ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
// │     Types       │    │     Config      │    │      ...        │
// │ (Shared types)  │    │ (Discovery)     │    │                 │
// └─────────────────┘    └─────────────────┘    └─────────────────┘
// ```
//
// ## Module Responsibilities
//
// - **types**: Shared type definitions, enums, constants, and error types
// - **process**: Low-level engine process management and UCI communication
// - **communication**: UCI message parsing and analysis state management
// - **manager**: High-level orchestration and resource management
// - **events**: Event emission with rate limiting and backpressure control
// - **analysis**: Complete game analysis workflows and progress reporting
// - **evaluation**: Chess-specific evaluation and position assessment
// - **config**: Engine discovery, configuration, and capability detection
//
// ## Usage Examples
//
// ### Basic Engine Analysis
// ```rust
// use engine::{EngineManager, EngineOptions, GoMode};
//
// let manager = EngineManager::new();
// let options = EngineOptions { /* ... */ };
// let result = manager.start_analysis(
//     "analysis_id".to_string(),
//     "/path/to/engine".to_string(),
//     "tab1".to_string(),
//     GoMode::Depth(20),
//     options,
//     app_handle,
// ).await?;
// ```
//
// ### Game Analysis
// ```rust
// use engine::{GameAnalyzer, AnalysisConfigBuilder};
//
// let analyzer = GameAnalyzer::new(engine_path);
// let (options, uci_options, go_mode) = AnalysisConfigBuilder::new()
//     .position(fen, moves)
//     .multipv(3)
//     .go_mode(GoMode::Depth(15))
//     .build();
//
// let analysis = analyzer.analyze_game(id, go_mode, options, uci_options, state, app).await?;
// ```
//
// ### Engine Configuration
// ```rust
// use engine::{EngineConfigurator, RecommendedSettings};
//
// let config = EngineConfigurator::get_engine_config(engine_path).await?;
// let settings = EngineConfigurator::get_recommended_settings(&config);
// ```

pub mod types;
pub mod process;
pub mod communication;
pub mod manager;
pub mod events;
pub mod analysis;
pub mod evaluation;
pub mod config;
pub mod debug;
pub mod diagnostics;

// =============================================================================
// Public API Re-exports
// =============================================================================

// Core types and errors
pub use types::{
    // Error handling
    EngineError, EngineResult,
    
    // Engine states and modes
    EngineState, GoMode, PlayersTime,
    
    // Configuration types
    EngineOptions, EngineOption,
    
    // Analysis types
    BestMoves, MoveAnalysis, AnalysisOptions,
    
    // Event payloads
    BestMovesPayload, ReportProgress,
    
    // Configuration
    EngineConfig, EngineLog,
    
    // Cache and state
    AnalysisCacheKey, AnalysisState,
    
    // Constants
    ENGINE_INIT_TIMEOUT, ENGINE_STOP_TIMEOUT, ENGINE_STATE_TRANSITION_TIMEOUT,
    MIN_EVENT_INTERVAL, EVENTS_PER_SECOND,
    
    // Helper functions
    piece_value, invert_score,
};

// Process management
pub use process::EngineProcess;

// Communication and UCI handling
pub use communication::{
    UciCommunicator, AnalysisHandler, EventQueue,
    parse_info_to_best_moves, calculate_progress, calculate_effective_multipv,
};

// High-level management
pub use manager::{EngineManager, ExtendedEngineManager};

// Event management
pub use events::{
    EventManager, PriorityEventManager, EmittableEvent,
    EmissionStrategy, EventPriority,
    create_best_moves_payload, create_progress_payload, emit_progress_update,
};

// Analysis workflows
pub use analysis::{
    GameAnalyzer,
};

// Chess evaluation
pub use evaluation::{
    ChessEvaluator, AdvancedEvaluator, SacrificeDetector,
    TacticalAnalysis, SacrificeType, naive_eval,
};

// Configuration and discovery
pub use config::{
    EngineConfigurator, ValidationReport, RecommendedSettings, ResponsivenessReport,
};

// Debug utilities for UCI protocol debugging
pub use debug::{
    UciDebugger, MultiPvAnalysis, MultiPvResponseAnalysis,
};

// Diagnostics for troubleshooting engine issues
pub use diagnostics::{
    UciProtocolDebugger, MultiPvDiagnostic, EngineCapabilityTest,
};

// =============================================================================
// Convenience functions for common operations
// =============================================================================

/// Create a new engine manager instance
pub fn create_engine_manager() -> EngineManager {
    EngineManager::new()
}

/// Get engine configuration with error handling
pub async fn get_engine_configuration(
    path: std::path::PathBuf
) -> EngineResult<(EngineConfig, ValidationReport, RecommendedSettings)> {
    let config = EngineConfigurator::get_engine_config(path).await?;
    let validation = EngineConfigurator::validate_config(&config)?;
    let settings = EngineConfigurator::get_recommended_settings(&config);
    
    Ok((config, validation, settings))
}

/// Test engine and get comprehensive report
pub async fn test_engine_comprehensive(
    path: std::path::PathBuf,
    timeout_ms: u64,
) -> EngineResult<EngineTestReport> {
    let config_result = EngineConfigurator::get_engine_config(path.clone()).await;
    let responsiveness_result = EngineConfigurator::test_engine_responsiveness(path, timeout_ms).await;
    
    let (config, validation, settings) = match config_result {
        Ok(config) => {
            let validation = EngineConfigurator::validate_config(&config)?;
            let settings = EngineConfigurator::get_recommended_settings(&config);
            (Some(config), Some(validation), Some(settings))
        }
        Err(e) => {
            log::warn!("Failed to get engine config during comprehensive test: {}", e);
            (None, None, None)
        }
    };
    
    let responsiveness = match responsiveness_result {
        Ok(report) => Some(report),
        Err(e) => {
            log::warn!("Failed to test engine responsiveness: {}", e);
            None
        }
    };
    
    Ok(EngineTestReport {
        config,
        validation,
        settings,
        responsiveness,
    })
}

/// Comprehensive engine test report
#[derive(Debug, Clone)]
pub struct EngineTestReport {
    pub config: Option<EngineConfig>,
    pub validation: Option<ValidationReport>,
    pub settings: Option<RecommendedSettings>,
    pub responsiveness: Option<ResponsivenessReport>,
}

impl EngineTestReport {
    /// Check if engine passed all tests
    pub fn is_fully_functional(&self) -> bool {
        self.config.is_some() 
            && self.validation.as_ref().map_or(false, |v| v.is_valid)
            && self.responsiveness.as_ref().map_or(false, |r| r.is_responsive)
    }
    
    /// Get summary of test results
    pub fn summary(&self) -> String {
        let config_status = if self.config.is_some() { "✓" } else { "✗" };
        let validation_status = match &self.validation {
            Some(v) if v.is_valid => "✓",
            Some(_) => "⚠",
            None => "✗",
        };
        let responsiveness_status = match &self.responsiveness {
            Some(r) if r.is_responsive => "✓",
            Some(_) => "✗",
            None => "✗",
        };
        
        format!("Config: {} | Validation: {} | Responsiveness: {}", 
                config_status, validation_status, responsiveness_status)
    }
}

// =============================================================================
// Module Tests
// =============================================================================

#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    fn test_module_creation() {
        let _manager = create_engine_manager();
        // let _config_builder = create_analysis_config(); // Commented out missing function
    }

    #[test]
    fn test_engine_test_report() {
        let report = EngineTestReport {
            config: None,
            validation: None,
            settings: None,
            responsiveness: None,
        };
        
        assert!(!report.is_fully_functional());
        assert!(report.summary().contains("✗"));
    }
}
