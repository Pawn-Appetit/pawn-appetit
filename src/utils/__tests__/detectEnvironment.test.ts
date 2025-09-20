import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectEnvironment, env, getEnvironmentInfo } from "@/utils/detectEnvironment";

// Mock globals for testing
const mockWindow = (overrides = {}) => {
  return {
    innerWidth: 1920,
    innerHeight: 1080,
    ...overrides,
  };
};

const mockNavigator = (overrides = {}) => {
  return {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    maxTouchPoints: 0,
    platform: "MacIntel",
    ...overrides,
  };
};

describe("Environment Detection", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock window and navigator
    Object.defineProperty(global, "window", {
      value: mockWindow(),
      writable: true,
    });

    Object.defineProperty(global, "navigator", {
      value: mockNavigator(),
      writable: true,
    });

    Object.defineProperty(global, "document", {
      value: {
        documentElement: {
          clientWidth: 1920,
          clientHeight: 1080,
        },
      },
      writable: true,
    });
  });

  describe("detectEnvironment", () => {
    it("should detect web environment by default", () => {
      const env = detectEnvironment();
      expect(env).toBe("web");
    });

    it("should detect desktop environment when Tauri is available", () => {
      const windowWithTauri = { ...mockWindow(), __TAURI__: {} };
      Object.defineProperty(global, "window", {
        value: windowWithTauri,
        writable: true,
      });

      const env = detectEnvironment();
      expect(env).toBe("desktop");
    });

    it("should detect mobile environment for mobile user agents", () => {
      Object.defineProperty(global, "navigator", {
        value: mockNavigator({
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)",
        }),
        writable: true,
      });

      const env = detectEnvironment();
      expect(env).toBe("mobile");
    });

    it("should detect mobile environment for small screens with touch", () => {
      Object.defineProperty(global, "window", {
        value: mockWindow({
          innerWidth: 375,
          innerHeight: 667,
          ontouchstart: {},
        }),
        writable: true,
      });

      Object.defineProperty(global, "navigator", {
        value: mockNavigator({
          maxTouchPoints: 5,
        }),
        writable: true,
      });

      const env = detectEnvironment();
      expect(env).toBe("mobile");
    });
  });

  describe("getEnvironmentInfo", () => {
    it("should return complete environment info for web", () => {
      const info = getEnvironmentInfo();

      expect(info).toMatchObject({
        environment: "web",
        platform: "web-desktop",
        isTauri: false,
        isWeb: true,
        isMobile: false,
        isDesktop: false,
        touchSupport: false,
      });

      expect(info.screenSize).toMatchObject({
        width: 1920,
        height: 1080,
      });

      expect(typeof info.userAgent).toBe("string");
    });

    it("should return complete environment info for desktop/Tauri", () => {
      const windowWithTauri = { ...mockWindow(), __TAURI__: {} };
      Object.defineProperty(global, "window", {
        value: windowWithTauri,
        writable: true,
      });

      const info = getEnvironmentInfo();

      expect(info).toMatchObject({
        environment: "desktop",
        platform: "macos",
        isTauri: true,
        isWeb: false,
        isMobile: false,
        isDesktop: true,
      });
    });

    it("should detect iOS platform correctly", () => {
      Object.defineProperty(global, "navigator", {
        value: mockNavigator({
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)",
        }),
        writable: true,
      });

      const info = getEnvironmentInfo();
      expect(info.platform).toBe("ios");
      expect(info.environment).toBe("mobile");
    });

    it("should detect Android platform correctly", () => {
      Object.defineProperty(global, "navigator", {
        value: mockNavigator({
          userAgent: "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36",
        }),
        writable: true,
      });

      const info = getEnvironmentInfo();
      expect(info.platform).toBe("android");
      expect(info.environment).toBe("mobile");
    });
  });

  describe("env utilities", () => {
    it("should provide correct utility functions", () => {
      expect(env.isDesktop()).toBe(false);
      expect(env.isMobile()).toBe(false);
      expect(env.isWeb()).toBe(true);
      expect(env.isTauri()).toBe(false);
      expect(env.hasTouch()).toBe(false);
      expect(env.getPlatform()).toBe("web-desktop");
    });

    it("should detect touch support correctly", () => {
      Object.defineProperty(global, "window", {
        value: mockWindow({ ontouchstart: {} }),
        writable: true,
      });

      expect(env.hasTouch()).toBe(true);
    });

    it("should detect touch support via maxTouchPoints", () => {
      Object.defineProperty(global, "navigator", {
        value: mockNavigator({ maxTouchPoints: 1 }),
        writable: true,
      });

      expect(env.hasTouch()).toBe(true);
    });
  });

  describe("Platform detection", () => {
    it("should detect Windows platform in Tauri", () => {
      const windowWithTauri = { ...mockWindow(), __TAURI__: {} };
      Object.defineProperty(global, "window", {
        value: windowWithTauri,
        writable: true,
      });

      Object.defineProperty(global, "navigator", {
        value: mockNavigator({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          platform: "Win32",
        }),
        writable: true,
      });

      expect(env.getPlatform()).toBe("windows");
    });

    it("should detect Linux platform in Tauri", () => {
      const windowWithTauri = { ...mockWindow(), __TAURI__: {} };
      Object.defineProperty(global, "window", {
        value: windowWithTauri,
        writable: true,
      });

      Object.defineProperty(global, "navigator", {
        value: mockNavigator({
          userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
          platform: "Linux x86_64",
        }),
        writable: true,
      });

      expect(env.getPlatform()).toBe("linux");
    });
  });

  describe("SSR compatibility", () => {
    it("should handle undefined window gracefully", () => {
      const originalWindow = global.window;
      const originalNavigator = global.navigator;

      // Temporarily remove window and navigator
      Object.defineProperty(global, "window", {
        value: undefined,
        configurable: true,
      });
      Object.defineProperty(global, "navigator", {
        value: undefined,
        configurable: true,
      });

      expect(() => detectEnvironment()).not.toThrow();
      expect(detectEnvironment()).toBe("web"); // Should default to web

      // Restore
      Object.defineProperty(global, "window", {
        value: originalWindow,
        configurable: true,
      });
      Object.defineProperty(global, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    });
  });
});
