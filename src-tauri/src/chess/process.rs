//! UCI engine process abstraction and communication utilities.
//!
//! This module provides the `EngineProcess` struct for managing a UCI chess engine process,
//! sending commands, updating options, and parsing engine output for best-move analysis.

use std::path::PathBuf;
use std::time::Instant;

use tokio::io::AsyncWriteExt;
use vampirc_uci::{uci::ScoreValue, UciInfoAttribute};

use crate::error::Error;

use super::types::{BestMoves, EngineLog, EngineOptions, GoMode};
use super::uci::UciCommunicator;
use shakmaty::{fen::Fen, san::SanPlus, uci::UciMove, CastlingMode, Chess, Color, Position};

#[cfg(target_os = "windows")]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Represents a running UCI engine process and its state.
pub struct EngineProcess {
    pub child: tokio::process::Child,
    pub stdin: tokio::process::ChildStdin,
    pub last_depth: u32,
    pub best_moves: Vec<BestMoves>,
    pub last_best_moves: Vec<BestMoves>,
    pub last_progress: f32,
    pub options: EngineOptions,
    pub go_mode: GoMode,
    pub running: bool,
    pub real_multipv: u16,
    pub logs: Vec<EngineLog>,
    pub start: Instant,
}

impl EngineProcess {
    /// Spawn a new UCI engine process and initialize it.
    ///
    /// Returns the process and a line reader for its stdout.
    /// 
    /// # Errors
    /// Returns `Error::EngineTimeout` if engine doesn't respond within 10 seconds.
    pub async fn new(path: PathBuf) -> Result<(Self, tokio::io::Lines<tokio::io::BufReader<tokio::process::ChildStdout>>), Error> {
        let mut comm = UciCommunicator::spawn(path).await?;

        let mut logs = Vec::new();

        // Send UCI command with timeout
        comm.write_line("uci\n").await?;
        logs.push(EngineLog::Gui("uci\n".to_string()));
        
        // Wait for uciok with timeout (10 seconds)
        let uci_timeout = tokio::time::Duration::from_secs(10);
        let uciok_received = tokio::time::timeout(uci_timeout, async {
            while let Some(line) = comm.stdout_lines.next_line().await? {
                logs.push(EngineLog::Engine(line.clone()));
                if line == "uciok" {
                    return Ok::<_, Error>(true);
                }
            }
            Ok(false)
        }).await;

        match uciok_received {
            Ok(Ok(true)) => {
                // uciok received, proceed with isready
                comm.write_line("isready\n").await?;
                logs.push(EngineLog::Gui("isready\n".to_string()));
                
                // Wait for readyok with timeout (5 seconds)
                let ready_timeout = tokio::time::Duration::from_secs(5);
                let readyok_received = tokio::time::timeout(ready_timeout, async {
                    while let Some(line_is_ready) = comm.stdout_lines.next_line().await? {
                        logs.push(EngineLog::Engine(line_is_ready.clone()));
                        if line_is_ready == "readyok" {
                            return Ok::<_, Error>(true);
                        }
                    }
                    Ok(false)
                }).await;

                match readyok_received {
                    Ok(Ok(true)) => {
                        // Engine initialized successfully
                    }
                    Ok(Ok(false)) => {
                        return Err(Error::EngineInitFailed("Engine closed before sending readyok".to_string()));
                    }
                    Ok(Err(e)) => {
                        return Err(e);
                    }
                    Err(_) => {
                        return Err(Error::EngineTimeout("Engine did not respond to isready command".to_string()));
                    }
                }
            }
            Ok(Ok(false)) => {
                return Err(Error::EngineInitFailed("Engine closed before sending uciok".to_string()));
            }
            Ok(Err(e)) => {
                return Err(e);
            }
            Err(_) => {
                return Err(Error::EngineTimeout("Engine did not respond to uci command".to_string()));
            }
        }

        Ok((
            Self {
                child: comm.child,
                stdin: comm.stdin,
                last_depth: 0,
                best_moves: Vec::new(),
                last_best_moves: Vec::new(),
                last_progress: 0.0,
                logs,
                options: EngineOptions::default(),
                real_multipv: 0,
                go_mode: GoMode::Infinite,
                running: false,
                start: Instant::now(),
            },
            comm.stdout_lines,
        ))
    }

    /// Set a single UCI option for the engine.
    pub async fn set_option<T>(&mut self, name: &str, value: T) -> Result<(), Error>
    where
        T: std::fmt::Display,
    {
        let msg = format!("setoption name {} value {}\n", name, value);
        self.stdin.write_all(msg.as_bytes()).await?;
        self.logs.push(EngineLog::Gui(msg));
        Ok(())
    }

    /// Set all engine options, including FEN, moves, and extra UCI options.
    /// Updates multipv and resets best-move tracking.
    pub async fn set_options(&mut self, options: EngineOptions) -> Result<(), Error> {
        let fen: Fen = options.fen.parse()?;
        let mut pos: Chess = match fen.into_position(CastlingMode::Chess960) {
            Ok(p) => p,
            Err(e) => e.ignore_too_much_material()?,
        };
        for m in &options.moves {
            let uci = UciMove::from_ascii(m.as_bytes())?;
            let mv = uci.to_move(&pos)?;
            pos.play_unchecked(&mv);
        }
        let multipv = options
            .extra_options
            .iter()
            .find(|x| x.name == "MultiPV")
            .map(|x| x.value.parse().unwrap_or(1))
            .unwrap_or(1);

        self.real_multipv = multipv.min(pos.legal_moves().len() as u16);

        for option in &options.extra_options {
            if !self.options.extra_options.contains(option) {
                self.set_option(&option.name, &option.value).await?;
            }
        }

        if options.fen != self.options.fen || options.moves != self.options.moves {
            self.set_position(&options.fen, &options.moves).await?;
        }
        self.last_depth = 0;
        self.options = options.clone();
        self.best_moves.clear();
        self.last_best_moves.clear();
        Ok(())
    }

    /// Set the engine's position using FEN and move list.
    pub async fn set_position(&mut self, fen: &str, moves: &Vec<String>) -> Result<(), Error> {
        let msg = if moves.is_empty() {
            format!("position fen {}\n", fen)
        } else {
            format!("position fen {} moves {}\n", fen, moves.join(" "))
        };
        self.stdin.write_all(msg.as_bytes()).await?;
        self.options.fen = fen.to_string();
        self.options.moves = moves.clone();
        self.logs.push(EngineLog::Gui(msg));
        Ok(())
    }

    /// Start engine search with the given mode (depth, time, etc).
    pub async fn go(&mut self, mode: &GoMode) -> Result<(), Error> {
        self.go_mode = mode.clone();
        let msg = match mode {
            GoMode::Depth(depth) => format!("go depth {}\n", depth),
            GoMode::Time(time) => format!("go movetime {}\n", time),
            GoMode::Nodes(nodes) => format!("go nodes {}\n", nodes),
            GoMode::PlayersTime(super::types::PlayersTime { white, black, winc, binc }) => {
                format!(
                    "go wtime {} btime {} winc {} binc {} movetime 1000\n",
                    white, black, winc, binc
                )
            }
            GoMode::Infinite => "go infinite\n".to_string(),
        };
        self.stdin.write_all(msg.as_bytes()).await?;
        self.logs.push(EngineLog::Gui(msg));
        self.running = true;
        self.start = Instant::now();
        Ok(())
    }

    /// Stop the engine's current search.
    pub async fn stop(&mut self) -> Result<(), Error> {
        self.stdin.write_all(b"stop\n").await?;
        self.logs.push(EngineLog::Gui("stop\n".to_string()));
        self.running = false;
        Ok(())
    }

    /// Kill the engine process gracefully, with force-kill fallback.
    /// 
    /// First sends "quit" command and waits up to 2 seconds for graceful shutdown.
    /// If engine doesn't terminate, forcefully kills the process.
    pub async fn kill(&mut self) -> Result<(), Error> {
        use log::warn;
        
        // Try graceful shutdown first
        if let Err(e) = self.stdin.write_all(b"quit\n").await {
            warn!("Failed to send quit command to engine: {}", e);
        } else {
            self.logs.push(EngineLog::Gui("quit\n".to_string()));
        }
        
        self.running = false;
        
        // Wait for process to exit gracefully (2 second timeout)
        let wait_result = tokio::time::timeout(
            tokio::time::Duration::from_secs(2),
            self.child.wait()
        ).await;
        
        match wait_result {
            Ok(Ok(status)) => {
                log::info!("Engine process exited gracefully with status: {:?}", status);
                Ok(())
            }
            Ok(Err(e)) => {
                warn!("Error waiting for engine process: {}", e);
                // Try force kill
                self.child.kill().await?;
                log::info!("Engine process force-killed");
                Ok(())
            }
            Err(_) => {
                // Timeout - force kill
                warn!("Engine did not exit gracefully, force-killing");
                self.child.kill().await?;
                // Wait for kill to complete
                let _ = self.child.wait().await;
                log::info!("Engine process force-killed after timeout");
                Ok(())
            }
        }
    }
}

/// Invert a UCI score (for black's perspective).
fn invert_score(score: vampirc_uci::uci::Score) -> vampirc_uci::uci::Score {
    let new_value = match score.value {
        ScoreValue::Cp(x) => ScoreValue::Cp(-x),
        ScoreValue::Mate(x) => ScoreValue::Mate(-x),
    };
    let new_wdl = score.wdl.map(|(w, d, l)| (l, d, w));
    vampirc_uci::uci::Score { value: new_value, wdl: new_wdl, ..score }
}

/// Parse UCI info attributes into a `BestMoves` struct for the current position.
///
/// # Arguments
/// * `attrs` - UCI info attributes from the engine.
/// * `fen` - FEN string for the position.
/// * `moves` - List of moves leading to the position.
///
/// # Returns
/// `BestMoves` struct with parsed data.
///
/// # Errors
/// Returns `Error` if parsing fails or no moves are found.
pub fn parse_uci_attrs(
    attrs: Vec<UciInfoAttribute>,
    fen: &Fen,
    moves: &Vec<String>,
) -> Result<BestMoves, Error> {
    let mut best_moves = BestMoves::default();

    let mut pos: Chess = match fen.clone().into_position(CastlingMode::Chess960) {
        Ok(p) => p,
        Err(e) => e.ignore_too_much_material()?,
    };
    for m in moves {
        let uci = UciMove::from_ascii(m.as_bytes())?;
        let mv = uci.to_move(&pos)?;
        pos.play_unchecked(&mv);
    }
    let turn = pos.turn();

    for a in attrs {
        match a {
            UciInfoAttribute::Pv(m) => {
                for mv in m {
                    let uci: UciMove = mv.to_string().parse()?;
                    let m = uci.to_move(&pos)?;
                    let san = SanPlus::from_move_and_play_unchecked(&mut pos, &m);
                    best_moves.san_moves.push(san.to_string());
                    best_moves.uci_moves.push(uci.to_string());
                }
            }
            UciInfoAttribute::Nps(nps) => {
                best_moves.nps = nps as u32;
            }
            UciInfoAttribute::Nodes(nodes) => {
                best_moves.nodes = nodes as u32;
            }
            UciInfoAttribute::Depth(depth) => {
                best_moves.depth = depth;
            }
            UciInfoAttribute::MultiPv(multipv) => {
                best_moves.multipv = multipv;
            }
            UciInfoAttribute::Score(score) => {
                best_moves.score = score;
            }
            _ => (),
        }
    }

    if best_moves.san_moves.is_empty() {
        return Err(Error::NoMovesFound);
    }

    if turn == Color::Black {
        best_moves.score = invert_score(best_moves.score);
    }

    Ok(best_moves)
}


