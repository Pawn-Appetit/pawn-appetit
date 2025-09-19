import { Notifications } from "@mantine/notifications";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { getMatches } from "@tauri-apps/plugin-cli";
import { attachConsole, error, info } from "@tauri-apps/plugin-log";
import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { ContextMenuProvider } from "mantine-contextmenu";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
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
import { EventMonitor } from "@/common/components/debug/EventMonitor";
import ErrorComponent from "@/common/components/ErrorComponent";
import { VERSION_CHECK_SETTINGS } from "@/config";
import ThemeProvider from "@/features/themes/components/ThemeProvider";
import { commands } from "./bindings";
import { showUpdateNotification, UpdateNotificationModal } from "./common/components/UpdateNotification";
import { useVersionCheck } from "./common/hooks/useVersionCheck";
import { IS_DEV } from "./config";
import i18n from "./i18n";
import { routeTree } from "./routeTree.gen";
import type { VersionCheckResult } from "./services/version-checker";
import { openFile } from "./utils/files";

export type Dirs = {
  documentDir: string;
};

const DEFAULT_FONT_SIZE = 18;
const APP_FOLDER_NAME = "Pawn Appetit";

let directoriesCache: Promise<Dirs> | null = null;

export const loadDirectories = async (): Promise<Dirs> => {
  if (directoriesCache) {
    return directoriesCache;
  }

  directoriesCache = (async () => {
    const store = getDefaultStore();
    let doc = store.get(storedDocumentDirAtom);

    if (!doc) {
      try {
        doc = await resolve(await documentDir(), APP_FOLDER_NAME);
      } catch (e) {
        error(`Failed to access documents directory: ${e}`);
        doc = await resolve(await homeDir(), APP_FOLDER_NAME);
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
    <div
      style={{
        backgroundColor: "#1a1b1e",
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: "24px",
          height: "24px",
          border: "2px solid #374151",
          borderTop: "2px solid #667eea",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
    </div>
  );
}

function preloadPieceSetCSS(pieceSet: string) {
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "style";
  link.href = `/pieces/${pieceSet}.css`;
  link.onload = () => {
    link.rel = "stylesheet";
  };
  link.onerror = () => {
    error(`Failed to load piece set CSS: ${pieceSet}`);
  };
  document.head.appendChild(link);
}

export default function App() {
  const pieceSet = useAtomValue(pieceSetAtom);
  const fontSize = useAtomValue(fontSizeAtom);
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);

  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [updateModalData, setUpdateModalData] = useState<VersionCheckResult | null>(null);

  const fontSizeValue = useMemo(() => fontSize || DEFAULT_FONT_SIZE, [fontSize]);

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

  useEffect(() => {
    let detachConsole: (() => void) | null = null;
    let isCancelled = false;

    const initializeApp = async () => {
      try {
        info("Starting React app initialization");

        await Promise.allSettled([
          loadDirectories(),
          attachConsole().then((detach) => {
            detachConsole = detach;
            info("Console logging attached successfully");
            return detach;
          }),
          handleCommandLineFile(),
        ]);

        if (isCancelled) return;

        info("Closing splash screen");
        await commands.closeSplashscreen();

        setIsInitialized(true);
        info("React app initialization completed successfully");
      } catch (e) {
        if (isCancelled) return;

        const errorMsg = `Failed to initialize app: ${e}`;
        error(errorMsg);
        setInitError(errorMsg);

        try {
          await commands.closeSplashscreen();
        } catch (splashError) {
          error(`Failed to close splash screen after error: ${splashError}`);
        }

        setIsInitialized(true);
      }
    };

    initializeApp();

    return () => {
      isCancelled = true;
      if (detachConsole) {
        detachConsole();
      }
    };
  }, [handleCommandLineFile]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSizeValue}%`;
  }, [fontSizeValue]);

  useEffect(() => {
    const rootElement = document.documentElement;
    const direction = i18n.dir();

    rootElement.setAttribute("dir", direction);
    rootElement.classList.toggle("rtl", direction === "rtl");
  }, []);

  useEffect(() => {
    const loadingElement = document.getElementById("app-loading");
    if (loadingElement) {
      loadingElement.style.display = "none";
    }

    if (pieceSet) {
      preloadPieceSetCSS(pieceSet);
    }
  }, [pieceSet]);

  if (!isInitialized) {
    return <AppLoading />;
  }

  if (initError) {
    return (
      <div
        style={{
          backgroundColor: "#1a1b1e",
          color: "#ffffff",
          padding: "20px",
          minHeight: "100vh",
        }}
      >
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
          }}
        >
          {initError}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: "16px",
            padding: "8px 16px",
            backgroundColor: "#667eea",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Reload Application
        </button>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <link
          rel="stylesheet"
          href={`/pieces/${pieceSet}.css`}
          onError={() => {
            error(`Failed to load piece set CSS: ${pieceSet}`);
          }}
        />
        <meta name="description" content="Pawn Appétit Chess Application" />
        <title>Pawn Appétit</title>
      </Helmet>

      <ThemeProvider>
        <ContextMenuProvider>
          {IS_DEV && <EventMonitor />}
          <Notifications />
          <RouterProvider router={router} />

          {/* Update notification modal */}
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
    </>
  );
}
