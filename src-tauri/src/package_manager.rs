use tokio::process::Command;
use log::info;
use specta::Type;
use serde::{Deserialize, Serialize};
use tokio::time::{timeout, Duration};

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
pub async fn install_package(manager: String, package_name: String) -> Result<PackageManagerResult, Error> {
    info!("Installing package {} using {}", package_name, manager);

    validate_package_name(&package_name)?;
    
    let result = match manager.as_str() {
        "brew" => install_brew_package(&package_name).await,
        "apt" => install_apt_package(&package_name).await,
        "dnf" => install_dnf_package(&package_name).await,
        "pacman" => install_pacman_package(&package_name).await,
        _ => return Err(Error::PackageManager("Unsupported package manager".to_string())),
    };
    
    match result {
        Ok(output) => Ok(PackageManagerResult {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        }),
        Err(e) => Err(Error::PackageManager(format!("Failed to install package: {}", e))),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn check_package_installed(manager: String, package_name: String) -> Result<bool, Error> {
    validate_package_name(&package_name)?;
    let installed = match manager.as_str() {
        "brew" => check_brew_package_installed(&package_name).await,
        "apt" => check_apt_package_installed(&package_name).await,
        "dnf" => check_dnf_package_installed(&package_name).await,
        "pacman" => check_pacman_package_installed(&package_name).await,
        _ => return Err(Error::PackageManager("Unsupported package manager".to_string())),
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
    validate_executable_name(&executable_name)?;

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("where");
        c.arg(&executable_name);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new("which");
        c.arg(&executable_name);
        c
    };

    let output = timeout(Duration::from_secs(3), cmd.output())
        .await
        .map_err(|_| Error::PackageManager("Executable lookup timed out".to_string()))?
        .map_err(|e| Error::PackageManager(format!("Executable lookup failed: {}", e)))?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).lines().next().unwrap_or("").trim().to_string();
        if !path.is_empty() {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

// Brew-specific functions
fn check_brew_available() -> bool {
    std::process::Command::new("brew")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn install_brew_package(package: &str) -> Result<std::process::Output, std::io::Error> {
    timeout(Duration::from_secs(60 * 10), Command::new("brew").args(["install", package]).output())
        .await
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::TimedOut, "brew install timed out"))?
}

async fn check_brew_package_installed(package: &str) -> Result<bool, std::io::Error> {
    let output = timeout(Duration::from_secs(5), Command::new("brew").args(["list", package]).output())
        .await
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::TimedOut, "brew list timed out"))??;
    Ok(output.status.success())
}

// APT-specific functions (Debian/Ubuntu)
fn check_apt_available() -> bool {
    std::process::Command::new("apt")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn install_apt_package(package: &str) -> Result<std::process::Output, std::io::Error> {
    // `-n` fails fast if sudo password is required (prevents GUI hang).
    timeout(
        Duration::from_secs(60 * 10),
        Command::new("sudo").args(["-n", "apt", "install", "-y", package]).output(),
    )
    .await
    .map_err(|_| std::io::Error::new(std::io::ErrorKind::TimedOut, "apt install timed out"))?
}

async fn check_apt_package_installed(package: &str) -> Result<bool, std::io::Error> {
    let output = timeout(Duration::from_secs(5), Command::new("dpkg").args(["-l", package]).output())
        .await
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::TimedOut, "dpkg query timed out"))??;
    Ok(output.status.success())
}

// DNF-specific functions (Fedora/RHEL)
fn check_dnf_available() -> bool {
    std::process::Command::new("dnf")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn install_dnf_package(package: &str) -> Result<std::process::Output, std::io::Error> {
    timeout(
        Duration::from_secs(60 * 10),
        Command::new("sudo").args(["-n", "dnf", "install", "-y", package]).output(),
    )
    .await
    .map_err(|_| std::io::Error::new(std::io::ErrorKind::TimedOut, "dnf install timed out"))?
}

async fn check_dnf_package_installed(package: &str) -> Result<bool, std::io::Error> {
    let output = timeout(Duration::from_secs(5), Command::new("dnf").args(["list", "installed", package]).output())
        .await
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::TimedOut, "dnf query timed out"))??;
    Ok(output.status.success())
}

// Pacman-specific functions (Arch Linux)
fn check_pacman_available() -> bool {
    std::process::Command::new("pacman")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn install_pacman_package(package: &str) -> Result<std::process::Output, std::io::Error> {
    timeout(
        Duration::from_secs(60 * 10),
        Command::new("sudo").args(["-n", "pacman", "-S", "--noconfirm", package]).output(),
    )
    .await
    .map_err(|_| std::io::Error::new(std::io::ErrorKind::TimedOut, "pacman install timed out"))?
}

async fn check_pacman_package_installed(package: &str) -> Result<bool, std::io::Error> {
    let output = timeout(Duration::from_secs(5), Command::new("pacman").args(["-Q", package]).output())
        .await
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::TimedOut, "pacman query timed out"))??;
    Ok(output.status.success())
}

fn validate_package_name(name: &str) -> Result<(), Error> {
    // Avoid passing weird characters into package managers.
    let ok = !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '+'));
    if ok {
        Ok(())
    } else {
        Err(Error::PackageManager("Invalid package name".to_string()))
    }
}

fn validate_executable_name(name: &str) -> Result<(), Error> {
    let ok = !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' ));
    if ok {
        Ok(())
    } else {
        Err(Error::PackageManager("Invalid executable name".to_string()))
    }
}
