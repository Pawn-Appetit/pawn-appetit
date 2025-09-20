import type { AppShellProps } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { type } from "@tauri-apps/plugin-os";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { nativeBarAtom } from "@/state/atoms";
import { vars } from "@/styles/theme";

// Platform types
export type Platform = "desktop" | "mobile" | "web";

// Get platform from Tauri OS plugin
export const getPlatform = (): Platform => {
  try {
    const osType = type();
    if (osType === "android" || osType === "ios") {
      return "mobile";
    }
    return "desktop";
  } catch {
    // If Tauri is not available (web), assume web platform
    return "web";
  }
};

export type MenuBarMode = "disabled" | "native" | "custom";
export type SideBarPosition = "navbar" | "footer";
export type PanelsType = "drawer" | "sidepanel";
export type DrawerPosition = "top" | "bottom";
export type LayoutType = "mobile" | "desktop";
export type DatabasesDensity = "compact" | "normal" | "comfortable";

type ResponsiveLayout = {
  // App shell configuration
  menuBar: {
    mode: MenuBarMode;
    displayWindowControls: boolean;
  };
  sidebar: {
    position: SideBarPosition;
  };
  appShellProps: AppShellProps;

  // Game-specific layout
  gameInfoCollapsedByDefault: boolean;
  gameNotationUnderBoard: boolean;

  // Panel configuration
  panels: {
    type: PanelsType;
    drawer: {
      position: DrawerPosition;
      size: string;
    };
  };

  // Feature-specific configurations
  settings: {
    layoutType: LayoutType;
  };
  databases: {
    density: DatabasesDensity;
    layoutType: LayoutType;
  };
  learn: {
    layoutType: LayoutType;
  };
  engines: {
    layoutType: LayoutType;
  };
  accounts: {
    layoutType: LayoutType;
  };
  files: {
    layoutType: LayoutType;
  };
  chessBoard: {
    layoutType: LayoutType;
    touchOptimized: boolean;
    maintainAspectRatio: boolean;
  };
};

// Performance metrics interface
interface PerformanceMetrics {
  calculationTime: number;
  lastCalculated: number;
}

export const useResponsiveLayout: () => {
  layout: ResponsiveLayout;
  headerOffset: string;
  footerOffset: string;
  mainContentHeight: string;
  performanceMetrics: PerformanceMetrics;
} = () => {
  const platform = getPlatform();
  const isNative = useAtomValue(nativeBarAtom);
  const smallScreenMax = useMediaQuery(`(width < ${vars.breakpoints.sm})`);
  const largeScreenMax = useMediaQuery(`(width < ${vars.breakpoints.lg})`);
  const extraLargeScreenMax = useMediaQuery(`(width < ${vars.breakpoints.xl})`);

  return useMemo(() => {
    const startTime = performance.now();

    // Layout configurations
    const useDrawerOnDesktop = false; // To use drawer on desktop regardless of screen size

    // Platform-specific mobile detection
    const isMobileOS = platform === "mobile";
    const isMobile = isMobileOS;
    const isMobileOrSmallScreen = isMobileOS || smallScreenMax;

    const menuBarMode: MenuBarMode = isMobile ? "disabled" : isNative ? "native" : "custom";
    const sideBarPosition: SideBarPosition = isMobileOrSmallScreen ? "footer" : "navbar";
    const panelsType: PanelsType = isMobile || useDrawerOnDesktop ? "drawer" : "sidepanel";
    const drawerPosition: DrawerPosition = "bottom";
    const settingsLayoutType: LayoutType = isMobileOrSmallScreen ? "mobile" : "desktop";
    const chessBoardLayoutType: LayoutType = isMobileOrSmallScreen ? "mobile" : "desktop";

    const databasesDensity: DatabasesDensity = isMobileOrSmallScreen
      ? "compact"
      : extraLargeScreenMax
        ? "comfortable"
        : "normal";
    const databasesLayoutType: LayoutType = isMobile || largeScreenMax ? "mobile" : "desktop";
    const twoColumnLayoutType: LayoutType = isMobile || largeScreenMax ? "mobile" : "desktop";

    // AppShell states
    const isHeaderCollapsed = menuBarMode === "disabled";
    const isFooterCollapsed = sideBarPosition !== "footer";
    const isNavbarCollapsed = sideBarPosition !== "navbar";

    // Layout dimensions
    const headerHeight = isHeaderCollapsed ? "0rem" : "2.3rem";
    const navbarWidth = isNavbarCollapsed ? "0rem" : "3rem";
    const footerHeight = isFooterCollapsed ? "0rem" : isMobile ? "4rem" : "3rem";
    const marginTop = isMobile ? "3rem" : "0rem";

    // Calculated dimensions
    const headerOffset = !isHeaderCollapsed ? headerHeight : "0rem";
    const footerOffset = !isFooterCollapsed ? footerHeight : "0rem";
    const mainContentHeight = `calc(100vh - ${headerOffset} - ${footerOffset})`;
    const drawerContentSize = `calc(100vh - ${headerOffset} - ${marginTop})`;

    // Layout configurations
    const layout = {
      // App shell configuration
      menuBar: {
        mode: menuBarMode,
        displayWindowControls: !isNative && !isMobile,
      },
      sidebar: {
        position: sideBarPosition,
      },

      // AppShell configuration with CSS transitions
      appShellProps: {
        mt: marginTop,
        header: {
          height: headerHeight,
          collapsed: isHeaderCollapsed,
          offset: true,
        },
        navbar: {
          width: navbarWidth,
          breakpoint: "sm",
          collapsed: { desktop: false, mobile: true },
        },
        footer: {
          height: footerHeight,
          collapsed: isFooterCollapsed,
          offset: true,
        },
      },

      // Game-specific layout
      gameInfoCollapsedByDefault: isMobileOrSmallScreen,
      gameNotationUnderBoard: isMobile || extraLargeScreenMax,

      // Panel configuration
      panels: {
        type: panelsType,
        drawer: {
          position: drawerPosition,
          size: drawerContentSize,
        },
      },

      // Feature-specific configurations
      settings: {
        layoutType: settingsLayoutType,
      },
      databases: {
        density: databasesDensity,
        layoutType: databasesLayoutType,
      },
      learn: {
        layoutType: twoColumnLayoutType,
      },
      engines: {
        layoutType: twoColumnLayoutType,
      },
      accounts: {
        layoutType: twoColumnLayoutType,
      },
      files: {
        layoutType: twoColumnLayoutType,
      },
      chessBoard: {
        layoutType: chessBoardLayoutType,
        touchOptimized: isMobileOrSmallScreen,
        maintainAspectRatio: true,
      },
    };

    // Performance metrics
    const endTime = performance.now();
    const performanceMetrics: PerformanceMetrics = {
      calculationTime: endTime - startTime,
      lastCalculated: endTime,
    };

    return {
      layout,
      headerOffset,
      footerOffset,
      mainContentHeight,
      performanceMetrics,
    };
  }, [platform, isNative, smallScreenMax, extraLargeScreenMax, largeScreenMax]);
};
