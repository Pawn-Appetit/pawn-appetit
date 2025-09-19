//! Chess engine integration and analysis submodules.
//!
//! This module re-exports all core chess logic, including UCI engine process management, analysis routines,
//! evaluation, and Tauri command handlers. It serves as the main entry point for chess-related backend features.

pub mod types;
pub mod uci;
pub mod process;
pub mod manager;
pub mod evaluation;
pub mod analysis;
pub mod commands;

#[allow(unused_imports)]
pub use {
    types::*,
    uci::*,
    process::*,
    manager::*,
    evaluation::*,
    analysis::*,
    commands::*,
};