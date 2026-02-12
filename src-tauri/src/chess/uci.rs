//! UCI protocol communication utilities for chess engines.
//!
//! This module provides the `UciCommunicator` struct for spawning and communicating with UCI engines
//! using async I/O. Handles stdin/stdout/stderr and line-based protocol.

use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use log::{error, info};

use crate::error::Error;

/// Async communicator for a running UCI engine process.
pub struct UciCommunicator {
    pub child: Child,
    pub stdin: ChildStdin,
    pub stdout_lines: Lines<BufReader<ChildStdout>>,
}

impl UciCommunicator {
    /// Spawn a new UCI engine process and set up async I/O.
    ///
    /// # Arguments
    /// * `path` - Path to the engine binary.
    ///
    /// # Returns
    /// `UciCommunicator` with stdin and stdout line reader.
    ///
    /// # Errors
    /// Returns `Error` if process or I/O setup fails.
    pub async fn spawn(path: PathBuf) -> Result<Self, Error> {
        let mut command = Command::new(&path);
        command.current_dir(path.parent().unwrap());
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        command.creation_flags(super::process::CREATE_NO_WINDOW);

        let mut child = command.spawn()?;
        info!("Starting engine process: {:?}", &path);
        let stdin = child.stdin.take().ok_or(Error::NoStdin)?;
        let stdout = child.stdout.take().ok_or(Error::NoStdout)?;
        let stdout_lines = BufReader::new(stdout).lines();

        // Drain stderr to avoid deadlocks when buffer fills up
        let stderr = child.stderr.take();
        tokio::spawn(async move {
            if let Some(stderr) = stderr {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    error!("[engine-stderr] {}", line);
                }
            }
        });

        Ok(Self {
            child,
            stdin,
            stdout_lines,
        })
    }

    /// Write a line to the engine's stdin (async).
    ///
    /// # Arguments
    /// * `line` - The command string to send (should end with `\n`).
    ///
    /// # Errors
    /// Returns `Error` if writing fails.
    pub async fn write_line(&mut self, line: &str) -> Result<(), Error> {
        info!("[engine-stdin] {}", line.trim_end());
        self.stdin.write_all(line.as_bytes()).await?;
        Ok(())
    }
}


