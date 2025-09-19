//! Core types and data structures for chess engine communication and analysis.
//!
//! This module defines the main data types used for engine options, move analysis, progress reporting,
//! and engine process management. Types are designed for serialization and Tauri event emission.

use derivative::Derivative;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;
use vampirc_uci::uci::{Score, UciOptionConfig};

/// Log entry for engine GUI or engine output.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum EngineLog {
    Gui(String),
    Engine(String),
}

/// UCI engine option (name-value pair).
#[derive(Serialize, Deserialize, Debug, Clone, Type, PartialEq, Eq)]
pub struct EngineOption {
    pub name: String,
    pub value: String,
}

/// Options for configuring engine analysis (FEN, moves, extra UCI options).
#[derive(Deserialize, Debug, Clone, Type, Derivative, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
#[derivative(Default)]
pub struct EngineOptions {
    pub fen: String,
    pub moves: Vec<String>,
    pub extra_options: Vec<EngineOption>,
}

/// Engine search mode (depth, time, nodes, etc).
#[derive(Deserialize, Debug, Clone, Type, PartialEq, Eq)]
#[serde(tag = "t", content = "c")]
pub enum GoMode {
    PlayersTime(PlayersTime),
    Depth(u32),
    Time(u32),
    Nodes(u32),
    Infinite,
}

/// Player time controls for GoMode::PlayersTime.
#[derive(Deserialize, Debug, Clone, Type, PartialEq, Eq)]
pub struct PlayersTime {
    pub white: u32,
    pub black: u32,
    pub winc: u32,
    pub binc: u32,
}

/// Best-move line from engine output, including PV, score, and stats.
#[derive(Clone, Serialize, Debug, Derivative, Type)]
#[derivative(Default)]
pub struct BestMoves {
    pub nodes: u32,
    pub depth: u32,
    pub score: Score,
    #[serde(rename = "uciMoves")]
    pub uci_moves: Vec<String>,
    #[serde(rename = "sanMoves")]
    pub san_moves: Vec<String>,
    #[derivative(Default(value = "1"))]
    pub multipv: u16,
    pub nps: u32,
}

/// Event payload for best-move updates (emitted to frontend).
#[derive(Serialize, Debug, Clone, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct BestMovesPayload {
    pub best_lines: Vec<BestMoves>,
    pub engine: String,
    pub tab: String,
    pub fen: String,
    pub moves: Vec<String>,
    pub progress: f64,
}

/// Analysis result for a single move/position.
#[derive(Serialize, Debug, Default, Type)]
pub struct MoveAnalysis {
    pub best: Vec<BestMoves>,
    pub novelty: bool,
    pub is_sacrifice: bool,
}

/// Options for full-game analysis (FEN, moves, novelty annotation, etc).
#[derive(Deserialize, Debug, Default, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisOptions {
    pub fen: String,
    pub moves: Vec<String>,
    pub annotate_novelties: bool,
    pub reference_db: Option<std::path::PathBuf>,
    pub reversed: bool,
}

/// Event payload for reporting analysis progress.
#[derive(Clone, Type, serde::Serialize, Event)]
pub struct ReportProgress {
    pub progress: f64,
    pub id: String,
    pub finished: bool,
}

/// Cache key for analysis results (used for deduplication).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AnalysisCacheKey {
    pub tab: String,
    pub fen: String,
    pub engine: String,
    pub multipv: u16,
}

/// UCI engine configuration (name and available options).
#[derive(Type, Default, Serialize, Debug)]
pub struct EngineConfig {
    pub name: String,
    pub options: Vec<UciOptionConfig>,
}


