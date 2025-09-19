import { version } from "../../package.json";
import type { VersionCheckConfig } from "../services/version-checker";

export const IS_DEV = import.meta.env.DEV;

export const VERSION_CHECK_CONFIG: VersionCheckConfig = {
  versionUrl: "https://api.github.com/repos/ChessKitchen/pawn-appetit/releases/latest",
  currentVersion: version,
  timeout: 15_000,
  skipInDev: true,
};

export const VERSION_CHECK_SETTINGS = {
  checkIntervalHours: 24,
  startupDelayMs: 5_000,
  useModalNotification: true,
  enabledByDefault: true,
} as const;

export function getCurrentVersion(): string {
  return VERSION_CHECK_CONFIG.currentVersion;
}

export function getVersionCheckConfig(): VersionCheckConfig {
  return {
    ...VERSION_CHECK_CONFIG,
    currentVersion: getCurrentVersion(),
    skipInDev: IS_DEV,
  };
}
