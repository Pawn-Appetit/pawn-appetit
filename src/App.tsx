import { Notifications } from "@mantine/notifications";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { getMatches } from "@tauri-apps/plugin-cli";
import { attachConsole, error, info } from "@tauri-apps/plugin-log";
import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { ContextMenuProvider } from "mantine-contextmenu";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { activeTabAtom, fontSizeAtom, pieceSetAtom, storedDocumentDirAtom, tabsAtom } from "./state/atoms";

import "@mantine/charts/styles.css";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/tiptap/styles.css";
import "@mantine/spotlight/styles.css";
import "mantine-contextmenu/styles.css";
import "mantine-datatable/styles.css";
import "@/styles/chessgroundBaseOverride.css";
import "@/styles/chessgroundColorsOverride.css";
import "@/styles/global.css";

import { documentDir, homeDir, resolve } from "@tauri-apps/api/path";
import ErrorComponent from "@/components/ErrorComponent";
import { EventMonitor } from "@/components/EventMonitor";
import { showUpdateNotification, UpdateNotificationModal } from "@/components/UpdateNotification";
import { VERSION_CHECK_SETTINGS } from "@/config";
import ThemeProvider from "@/features/themes/components/ThemeProvider";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { commands } from "./bindings";
import { IS_DEV } from "./config";
import i18n from "./i18n";
import { routeTree } from "./routeTree.gen";
import type { VersionCheckResult } from "./services/version-checker";
import { openFile } from "./utils/files";

export type Dirs = {
  documentDir: string;
};

type InitializationState = "loading" | "initialized" | "error";

const DEFAULT_FONT_SIZE = 18;
const APP_FOLDER_NAME = "Pawn Appetit";
const SPINNER_STYLES = {
  width: "24px",
  height: "24px",
  border: "2px solid #374151",
  borderTop: "2px solid #667eea",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
} as const;

const LOADING_CONTAINER_STYLES = {
  backgroundColor: "#1a1b1e",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const;

const ERROR_CONTAINER_STYLES = {
  backgroundColor: "#1a1b1e",
  color: "#ffffff",
  padding: "20px",
  minHeight: "100vh",
} as const;

let directoriesCache: Promise<Dirs> | null = null;

export const loadDirectories = async (): Promise<Dirs> => {
  if (directoriesCache) {
    return directoriesCache;
  }

  directoriesCache = (async (): Promise<Dirs> => {
    const store = getDefaultStore();
    let doc = store.get(storedDocumentDirAtom);

    if (!doc) {
      try {
        doc = await resolve(await documentDir(), APP_FOLDER_NAME);
        info(`Using documents directory: ${doc}`);
      } catch (e) {
        error(`Failed to access documents directory: ${e}`);
        try {
          doc = await resolve(await homeDir(), APP_FOLDER_NAME);
          info(`Fallback to home directory: ${doc}`);
        } catch (homeError) {
          error(`Failed to access home directory: ${homeError}`);
          throw new Error(`Cannot access any suitable directory: ${e}, ${homeError}`);
        }
      }
    }

    return { documentDir: doc };
  })();

  return directoriesCache;
};

const router = createRouter({
  routeTree,
  defaultErrorComponent: ErrorComponent,
  context: {
    loadDirs: loadDirectories,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function AppLoading() {
  return (
    <div style={LOADING_CONTAINER_STYLES}>
      <div style={SPINNER_STYLES} />
    </div>
  );
}

function AppError({ error: errorMsg }: { error: string }) {
  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div style={ERROR_CONTAINER_STYLES}>
      <h2 style={{ color: "#ef4444", marginBottom: "16px" }}>Initialization Error</h2>
      <p style={{ color: "#9ca3af", marginBottom: "16px" }}>The application encountered an error during startup:</p>
      <pre
        style={{
          backgroundColor: "#374151",
          padding: "12px",
          borderRadius: "6px",
          color: "#ffffff",
          fontSize: "12px",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {errorMsg}
      </pre>
      <button
        type="button"
        onClick={handleReload}
        style={{
          marginTop: "16px",
          padding: "8px 16px",
          backgroundColor: "#667eea",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "14px",
        }}
      >
        Reload Application
      </button>
    </div>
  );
}

function preloadPieceSetCSS(pieceSet: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "style";
    link.href = `/pieces/${pieceSet}.css`;

    const timeout = setTimeout(() => {
      reject(new Error(`Timeout loading piece set CSS: ${pieceSet}`));
    }, 5000);

    link.onload = () => {
      clearTimeout(timeout);
      link.rel = "stylesheet";
      info(`Successfully loaded piece set CSS: ${pieceSet}`);
      resolve();
    };

    link.onerror = () => {
      clearTimeout(timeout);
      const errorMsg = `Failed to load piece set CSS: ${pieceSet}`;
      error(errorMsg);
      reject(new Error(errorMsg));
    };

    document.head.appendChild(link);
  });
}

function useAppInitialization() {
  const [initState, setInitState] = useState<InitializationState>("loading");
  const [initError, setInitError] = useState<string | null>(null);
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);

  const handleCommandLineFile = useCallback(async () => {
    try {
      const matches = await getMatches();
      if (matches.args.file.occurrences > 0 && typeof matches.args.file.value === "string") {
        info(`Opening file from command line: ${matches.args.file.value}`);
        await openFile(matches.args.file.value, setTabs, setActiveTab);
      }
    } catch (e) {
      error(`Failed to handle command line file: ${e}`);
    }
  }, [setTabs, setActiveTab]);

  const initializeApp = useCallback(async () => {
    let detachConsole: (() => void) | null = null;

    try {
      info("Starting React app initialization");

      const [, detach] = await Promise.all([loadDirectories(), attachConsole()]);

      detachConsole = detach;
      info("Console logging attached successfully");

      await handleCommandLineFile();

      info("Closing splash screen");
      await commands.closeSplashscreen();

      setInitState("initialized");
      info("React app initialization completed successfully");

      return detachConsole;
    } catch (e) {
      const errorMsg = `Failed to initialize app: ${e}`;
      error(errorMsg);
      setInitError(errorMsg);
      setInitState("error");

      try {
        await commands.closeSplashscreen();
      } catch (splashError) {
        error(`Failed to close splash screen after error: ${splashError}`);
      }

      return detachConsole;
    }
  }, [handleCommandLineFile]);

  return { initState, initError, initializeApp };
}

function usePieceSetManager(pieceSet: string) {
  useEffect(() => {
    const loadingElement = document.getElementById("app-loading");
    if (loadingElement) {
      loadingElement.style.display = "none";
    }

    if (pieceSet) {
      preloadPieceSetCSS(pieceSet).catch((error) => {
        console.warn("Piece set CSS preloading failed:", error);
      });
    }
  }, [pieceSet]);
}

function useFontSizeManager(fontSize: number | null) {
  const fontSizeValue = useMemo(() => fontSize || DEFAULT_FONT_SIZE, [fontSize]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSizeValue}%`;
  }, [fontSizeValue]);

  return fontSizeValue;
}

export default function App() {
  const { t } = useTranslation();
  const pieceSet = useAtomValue(pieceSetAtom);
  const fontSize = useAtomValue(fontSizeAtom);

  const [updateModalData, setUpdateModalData] = useState<VersionCheckResult | null>(null);

  const { initState, initError, initializeApp } = useAppInitialization();

  useFontSizeManager(fontSize);
  usePieceSetManager(pieceSet);

  const { installUpdate, isUpdating } = useVersionCheck({
    autoCheck: true,
    onUpdateAvailable: (result) => {
      if (VERSION_CHECK_SETTINGS.useModalNotification && result.versionInfo) {
        setUpdateModalData(result);
      } else if (result.versionInfo) {
        showUpdateNotification(
          result.versionInfo,
          () => installUpdate(),
          () => setUpdateModalData(result),
          t,
        );
      }
    },
    onCheckError: (error) => {
      info(`Version check failed: ${error}`);
    },
    onNoUpdates: () => {
      info("No updates available");
    },
  });

  const handleUpdateModalClose = useCallback(() => {
    setUpdateModalData(null);
  }, []);

  const handleUpdateModalUpdate = useCallback(() => {
    installUpdate();
    setUpdateModalData(null);
  }, [installUpdate]);

  useEffect(() => {
    let detachConsole: (() => void) | null = null;

    const init = async () => {
      detachConsole = await initializeApp();
    };

    init();

    return () => {
      if (detachConsole) {
        try {
          detachConsole();
        } catch (e) {
          error(`Failed to detach console: ${e}`);
        }
      }
    };
  }, [initializeApp]);

  useEffect(() => {
    const rootElement = document.documentElement;
    const direction = i18n.dir();

    rootElement.setAttribute("dir", direction);
    rootElement.classList.toggle("rtl", direction === "rtl");
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `/pieces/${pieceSet}.css`;
    link.id = `piece-set-${pieceSet}`;

    link.onerror = () => {
      console.error(`Failed to load piece set CSS: ${pieceSet}`);
    };

    document.head.appendChild(link);

    return () => {
      const existingLink = document.getElementById(`piece-set-${pieceSet}`);
      if (existingLink) {
        document.head.removeChild(existingLink);
      }
    };
  }, [pieceSet]);

  if (initState === "loading") {
    return <AppLoading />;
  }

  if (initState === "error" && initError) {
    return <AppError error={initError} />;
  }

  return (
    <ThemeProvider>
      <ContextMenuProvider>
        {IS_DEV && <EventMonitor />}
        <Notifications />
        <RouterProvider router={router} />

        {updateModalData?.versionInfo && (
          <UpdateNotificationModal
            versionInfo={updateModalData.versionInfo}
            onUpdate={handleUpdateModalUpdate}
            onSkip={handleUpdateModalClose}
            onDismiss={handleUpdateModalClose}
            isUpdating={isUpdating}
          />
        )}
      </ContextMenuProvider>
    </ThemeProvider>
  );
}
