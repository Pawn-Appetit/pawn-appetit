use log::info;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;

use crate::error::Error;

#[derive(Debug, Type, Serialize, Deserialize)]
pub struct PackageManagerResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
#[specta::specta]
pub async fn check_package_manager_available(manager: String) -> Result<bool, Error> {
    let available = match manager.as_str() {
        "brew" => check_brew_available(),
        "apt" => check_apt_available(),
        "dnf" => check_dnf_available(),
        "pacman" => check_pacman_available(),
        _ => false,
    };
    Ok(available)
}

#[tauri::command]
#[specta::specta]
pub async fn install_package(
    manager: String,
    package_name: String,
) -> Result<PackageManagerResult, Error> {
    info!("Installing package {} using {}", package_name, manager);

    let result = match manager.as_str() {
        "brew" => install_brew_package(&package_name).await,
        "apt" => install_apt_package(&package_name).await,
        "dnf" => install_dnf_package(&package_name).await,
        "pacman" => install_pacman_package(&package_name).await,
        _ => {
            return Err(Error::PackageManager(
                "Unsupported package manager".to_string(),
            ))
        }
    };

    match result {
        Ok(output) => Ok(PackageManagerResult {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        }),
        Err(e) => Err(Error::PackageManager(format!(
            "Failed to install package: {}",
            e
        ))),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn check_package_installed(manager: String, package_name: String) -> Result<bool, Error> {
    let installed = match manager.as_str() {
        "brew" => check_brew_package_installed(&package_name).await,
        "apt" => check_apt_package_installed(&package_name).await,
        "dnf" => check_dnf_package_installed(&package_name).await,
        "pacman" => check_pacman_package_installed(&package_name).await,
        _ => {
            return Err(Error::PackageManager(
                "Unsupported package manager".to_string(),
            ))
        }
    };

    match installed {
        Ok(result) => Ok(result),
        Err(e) => {
            info!("Error checking package installation: {}", e);
            Ok(false)
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn find_executable_path(executable_name: String) -> Result<Option<String>, Error> {
    let output = Command::new("which").arg(&executable_name).output();

    match output {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                Ok(Some(path))
            } else {
                Ok(None)
            }
        }
        _ => Ok(None),
    }
}

// Brew-specific functions
fn check_brew_available() -> bool {
    Command::new("brew")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn install_brew_package(package: &str) -> Result<std::process::Output, std::io::Error> {
    Command::new("brew").args(["install", package]).output()
}

async fn check_brew_package_installed(package: &str) -> Result<bool, std::io::Error> {
    let output = Command::new("brew").args(["list", package]).output()?;

    Ok(output.status.success())
}

// APT-specific functions (Debian/Ubuntu)
fn check_apt_available() -> bool {
    Command::new("apt")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn install_apt_package(package: &str) -> Result<std::process::Output, std::io::Error> {
    Command::new("sudo")
        .args(["apt", "install", "-y", package])
        .output()
}

async fn check_apt_package_installed(package: &str) -> Result<bool, std::io::Error> {
    let output = Command::new("dpkg").args(["-l", package]).output()?;

    Ok(output.status.success())
}

// DNF-specific functions (Fedora/RHEL)
fn check_dnf_available() -> bool {
    Command::new("dnf")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn install_dnf_package(package: &str) -> Result<std::process::Output, std::io::Error> {
    Command::new("sudo")
        .args(["dnf", "install", "-y", package])
        .output()
}

async fn check_dnf_package_installed(package: &str) -> Result<bool, std::io::Error> {
    let output = Command::new("dnf")
        .args(["list", "installed", package])
        .output()?;

    Ok(output.status.success())
}

// Pacman-specific functions (Arch Linux)
fn check_pacman_available() -> bool {
    Command::new("pacman")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn install_pacman_package(package: &str) -> Result<std::process::Output, std::io::Error> {
    Command::new("sudo")
        .args(["pacman", "-S", "--noconfirm", package])
        .output()
}

async fn check_pacman_package_installed(package: &str) -> Result<bool, std::io::Error> {
    let output = Command::new("pacman").args(["-Q", package]).output()?;

    Ok(output.status.success())
}
