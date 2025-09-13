import { Notifications } from "@mantine/notifications";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { getMatches } from "@tauri-apps/plugin-cli";
import { attachConsole, error, info } from "@tauri-apps/plugin-log";
import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { ContextMenuProvider } from "mantine-contextmenu";
import { useCallback, useEffect } from "react";
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
import ErrorComponent from "@/common/components/ErrorComponent";
import ThemeProvider from "@/features/themes/components/ThemeProvider";
import { commands } from "./bindings";
import i18n from "./i18n";
import { routeTree } from "./routeTree.gen";
import { getPlatform } from "./common/hooks/useResponsiveLayout";
import { openFile } from "./utils/files";

export type Dirs = {
  documentDir: string;
};

const DEFAULT_FONT_SIZE = 18;
const APP_FOLDER_NAME = "Pawn Appetit";

const loadDirectories = async (): Promise<Dirs> => {
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

export default function App() {
  const pieceSet = useAtomValue(pieceSetAtom);
  const fontSize = useAtomValue(fontSizeAtom);
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);
  const platform = getPlatform();

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

    const initializeApp = async () => {
      try {
        await commands.closeSplashscreen();
        detachConsole = await attachConsole();
        info("React app started successfully");

        await handleCommandLineFile();
      } catch (e) {
        error(`Failed to initialize app: ${e}`);
      }
    };

    initializeApp();

    return () => {
      if (detachConsole) {
        detachConsole();
      }
    };
  }, [handleCommandLineFile]);

  useEffect(() => {
    const rootElement = document.documentElement;
    const fontSizeValue = fontSize || DEFAULT_FONT_SIZE;

    rootElement.style.fontSize = `${fontSizeValue}%`;
  }, [fontSize]);

  useEffect(() => {
    const rootElement = document.documentElement;
    const direction = i18n.dir();

    rootElement.setAttribute("dir", direction);

    if (direction === "rtl") {
      rootElement.classList.add("rtl");
    } else {
      rootElement.classList.remove("rtl");
    }
  }, []);

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
          <Notifications />
          <RouterProvider router={router} />
        </ContextMenuProvider>
      </ThemeProvider>
    </>
  );
}
