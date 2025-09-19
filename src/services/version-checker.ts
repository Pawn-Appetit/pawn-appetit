import { info, error as logError } from "@tauri-apps/plugin-log";

export interface VersionInfo {
  version: string;
  downloadUrl?: string;
  releaseNotes?: string;
  isPrerelease?: boolean;
  publishedAt?: string;
}

export interface VersionCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  versionInfo?: VersionInfo;
  error?: string;
}

export interface VersionCheckConfig {
  versionUrl: string;
  currentVersion: string;
  timeout?: number;
  skipInDev?: boolean;
}

function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.replace(/^v/, '').split('.').map(Number);
  const v2Parts = version2.replace(/^v/, '').split('.').map(Number);
  
  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  
  return 0;
}

function isValidVersion(version: string): boolean {
  const semverRegex = /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+))?(?:\+([a-zA-Z0-9-]+))?$/;
  return semverRegex.test(version);
}

async function fetchVersionInfo(url: string, timeout = 10000): Promise<VersionInfo> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PawnAppetit-VersionChecker/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    let versionInfo: VersionInfo;
    
    if (data.tag_name && data.name) {
      versionInfo = {
        version: data.tag_name,
        downloadUrl: data.html_url,
        releaseNotes: data.body,
        isPrerelease: data.prerelease,
        publishedAt: data.published_at
      };
    } else if (data.version) {
      versionInfo = {
        version: data.version,
        downloadUrl: data.downloadUrl,
        releaseNotes: data.releaseNotes,
        isPrerelease: data.isPrerelease,
        publishedAt: data.publishedAt
      };
    } else {
      throw new Error('Invalid version info format');
    }
    
    if (!isValidVersion(versionInfo.version)) {
      throw new Error(`Invalid version format: ${versionInfo.version}`);
    }
    
    return versionInfo;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkForUpdates(config: VersionCheckConfig): Promise<VersionCheckResult> {
  const { versionUrl, currentVersion, timeout = 10000, skipInDev = true } = config;
  
  try {
    if (skipInDev) {
      info('Skipping version check in development mode');
      return {
        hasUpdate: false,
        currentVersion,
        error: 'Skipped in development mode'
      };
    }
    
    if (!isValidVersion(currentVersion)) {
      throw new Error(`Invalid current version format: ${currentVersion}`);
    }
    
    info(`Starting version check - Current: ${currentVersion}, URL: ${versionUrl}`);
    
    const versionInfo = await fetchVersionInfo(versionUrl, timeout);
    const hasUpdate = compareVersions(versionInfo.version, currentVersion) > 0;
    
    info(`Version check completed - Latest: ${versionInfo.version}, Has update: ${hasUpdate}`);
    
    return {
      hasUpdate,
      currentVersion,
      latestVersion: versionInfo.version,
      versionInfo: hasUpdate ? versionInfo : undefined
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logError(`Version check failed: ${errorMessage}`);
    
    return {
      hasUpdate: false,
      currentVersion,
      error: errorMessage
    };
  }
}

export function createGitHubVersionConfig(
  owner: string, 
  repo: string, 
  currentVersion: string,
  options?: Partial<VersionCheckConfig>
): VersionCheckConfig {
  return {
    versionUrl: `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    currentVersion,
    timeout: 15000,
    skipInDev: true,
    ...options
  };
}

export const VERSION_CHECK_STORAGE = {
  LAST_CHECK: 'version-check-last',
  SKIP_VERSION: 'version-check-skip',
  ENABLED: 'version-check-enabled'
} as const;

export function shouldCheckForUpdates(intervalHours = 24): boolean {
  try {
    const lastCheck = localStorage.getItem(VERSION_CHECK_STORAGE.LAST_CHECK);
    if (!lastCheck) return true;
    
    const lastCheckTime = new Date(lastCheck);
    const now = new Date();
    const hoursSinceLastCheck = (now.getTime() - lastCheckTime.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceLastCheck >= intervalHours;
  } catch {
    return true;
  }
}

export function recordVersionCheck(): void {
  try {
    localStorage.setItem(VERSION_CHECK_STORAGE.LAST_CHECK, new Date().toISOString());
  } catch (error) {
    logError(`Failed to record version check time: ${error}`);
  }
}

export function isVersionSkipped(version: string): boolean {
  try {
    const skippedVersion = localStorage.getItem(VERSION_CHECK_STORAGE.SKIP_VERSION);
    return skippedVersion === version;
  } catch {
    return false;
  }
}

export function skipVersion(version: string): void {
  try {
    localStorage.setItem(VERSION_CHECK_STORAGE.SKIP_VERSION, version);
  } catch (error) {
    logError(`Failed to skip version: ${error}`);
  }
}

export function isVersionCheckEnabled(): boolean {
  try {
    const enabled = localStorage.getItem(VERSION_CHECK_STORAGE.ENABLED);
    return enabled !== 'false';
  } catch {
    return true;
  }
}

export function setVersionCheckEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(VERSION_CHECK_STORAGE.ENABLED, enabled.toString());
  } catch (error) {
    logError(`Failed to set version check enabled state: ${error}`);
  }
}