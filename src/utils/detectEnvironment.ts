/**
 * Environment types that the application can run in
 */
export type Environment = "desktop" | "mobile" | "web";

/**
 * Platform types for more specific detection
 */
export type Platform = "windows" | "macos" | "linux" | "ios" | "android" | "web-desktop" | "web-mobile" | "unknown";

/**
 * Detailed environment information
 */
export interface EnvironmentInfo {
  environment: Environment;
  platform: Platform;
  isTauri: boolean;
  isWeb: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  userAgent: string;
  touchSupport: boolean;
  screenSize: {
    width: number;
    height: number;
  };
}

/**
 * Extended window interface for Tauri detection
 */
declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

/**
 * Extended navigator interface for touch detection
 */
interface ExtendedNavigator extends Navigator {
  msMaxTouchPoints?: number;
}

/**
 * Detects if the app is running in Tauri (desktop environment)
 */
function isTauriApp(): boolean {
  try {
    // Check if Tauri APIs are available
    return typeof window !== "undefined" && window.__TAURI__ !== undefined;
  } catch {
    return false;
  }
}

/**
 * Detects if the device supports touch input
 */
function hasTouchSupport(): boolean {
  if (typeof window === "undefined") return false;

  const nav = navigator as ExtendedNavigator;

  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    (nav.msMaxTouchPoints !== undefined && nav.msMaxTouchPoints > 0)
  );
}

/**
 * Detects if the device is mobile based on user agent and screen size
 */
function isMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i;
  const isMobileUA = mobileRegex.test(userAgent);

  // Also check screen size as a secondary indicator
  const isSmallScreen = window.innerWidth <= 768 && window.innerHeight <= 1024;

  // Consider it mobile if either UA indicates mobile OR it's a small touchscreen
  return isMobileUA || (isSmallScreen && hasTouchSupport());
}

/**
 * Detects the specific platform
 */
function detectPlatform(): Platform {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "unknown";
  }

  const userAgent = navigator.userAgent.toLowerCase();

  // Check for mobile platforms first
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return "ios";
  }

  if (/android/i.test(userAgent)) {
    return "android";
  }

  // If running in Tauri, detect desktop OS
  if (isTauriApp()) {
    if (/win/i.test(userAgent) || navigator.platform.toLowerCase().includes("win")) {
      return "windows";
    }
    if (/mac/i.test(userAgent) || navigator.platform.toLowerCase().includes("mac")) {
      return "macos";
    }
    if (/linux/i.test(userAgent) || navigator.platform.toLowerCase().includes("linux")) {
      return "linux";
    }
  }

  // Web environment detection
  if (isMobileDevice()) {
    return "web-mobile";
  }

  return "web-desktop";
}

/**
 * Gets the current screen dimensions
 */
function getScreenSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 0, height: 0 };
  }

  return {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  };
}

/**
 * Main function to detect the current environment
 */
export function detectEnvironment(): Environment {
  // If running in Tauri, it's always desktop
  if (isTauriApp()) {
    return "desktop";
  }

  // Otherwise, check if it's mobile or web
  if (isMobileDevice()) {
    return "mobile";
  }

  return "web";
}

/**
 * Gets detailed environment information
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  const isTauri = isTauriApp();
  const platform = detectPlatform();
  const environment = detectEnvironment();
  const isMobile = isMobileDevice();
  const touchSupport = hasTouchSupport();
  const screenSize = getScreenSize();

  return {
    environment,
    platform,
    isTauri,
    isWeb: !isTauri,
    isMobile,
    isDesktop: environment === "desktop",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    touchSupport,
    screenSize,
  };
}

/**
 * Utility functions for quick environment checks
 */
export const env = {
  /**
   * Check if running on desktop (Tauri app)
   */
  isDesktop: (): boolean => detectEnvironment() === "desktop",

  /**
   * Check if running on mobile device
   */
  isMobile: (): boolean => detectEnvironment() === "mobile",

  /**
   * Check if running in web browser
   */
  isWeb: (): boolean => detectEnvironment() === "web",

  /**
   * Check if running in Tauri
   */
  isTauri: (): boolean => isTauriApp(),

  /**
   * Check if device has touch support
   */
  hasTouch: (): boolean => hasTouchSupport(),

  /**
   * Get current platform
   */
  getPlatform: (): Platform => detectPlatform(),

  /**
   * Get full environment info
   */
  getInfo: (): EnvironmentInfo => getEnvironmentInfo(),
};

/**
 * React hook for environment detection (if using React)
 */
export function useEnvironment(): EnvironmentInfo {
  // For SSR compatibility, we'll return a default value initially
  if (typeof window === "undefined") {
    return {
      environment: "web",
      platform: "unknown",
      isTauri: false,
      isWeb: true,
      isMobile: false,
      isDesktop: false,
      userAgent: "",
      touchSupport: false,
      screenSize: { width: 0, height: 0 },
    };
  }

  return getEnvironmentInfo();
}

// Default export for convenience
export default {
  detect: detectEnvironment,
  getInfo: getEnvironmentInfo,
  env,
  useEnvironment,
};
