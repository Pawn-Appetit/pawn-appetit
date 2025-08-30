import { Notifications } from "@mantine/notifications";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { getMatches } from "@tauri-apps/plugin-cli";
import { attachConsole, info } from "@tauri-apps/plugin-log";
import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { ContextMenuProvider } from "mantine-contextmenu";
import { useEffect } from "react";
import { Helmet } from "react-helmet";
import {
  activeTabAtom,
  fontSizeAtom,
  pieceSetAtom,
  spellCheckAtom,
  storedDocumentDirAtom,
  tabsAtom,
} from "./state/atoms";

import "@/styles/chessgroundBaseOverride.css";
import "@/styles/chessgroundColorsOverride.css";

import "@mantine/charts/styles.css";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/tiptap/styles.css";
import "@mantine/spotlight/styles.css";

import "mantine-contextmenu/styles.css";
import "mantine-datatable/styles.css";

import "@/styles/global.css";

import { documentDir, homeDir, resolve } from "@tauri-apps/api/path";
import ErrorComponent from "@/common/components/ErrorComponent";
import { commands } from "./bindings";
import i18n from "./i18n";
import { routeTree } from "./routeTree.gen";
import { ThemeProvider } from "./themes";
import { openFile } from "./utils/files";

export type Dirs = {
  documentDir: string;
};

const router = createRouter({
  routeTree,
  defaultErrorComponent: ErrorComponent,
  context: {
    loadDirs: async () => {
      const store = getDefaultStore();
      let doc = store.get(storedDocumentDirAtom);
      if (!doc) {
        try {
          doc = await resolve(await documentDir(), "Pawn Appetit");
        } catch (e) {
          doc = await resolve(await homeDir(), "Pawn Appetit");
        }
      }
      const dirs: Dirs = { documentDir: doc };
      return dirs;
    },
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  const pieceSet = useAtomValue(pieceSetAtom);
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);

  useEffect(() => {
    (async () => {
      await commands.closeSplashscreen();
      const detach = await attachConsole();
      info("React app started successfully");

      const matches = await getMatches();
      if (matches.args.file.occurrences > 0) {
        info(`Opening file from command line: ${matches.args.file.value}`);
        if (typeof matches.args.file.value === "string") {
          const file = matches.args.file.value;
          openFile(file, setTabs, setActiveTab);
        }
      }

      return () => {
        detach();
      };
    })();
  }, [setTabs, setActiveTab]);

  const fontSize = useAtomValue(fontSizeAtom);
  const spellCheck = useAtomValue(spellCheckAtom);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}%`;
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.setAttribute("dir", i18n.dir());
  }, []);

  return (
    <>
      <Helmet>
        <link rel="stylesheet" href={`/pieces/${pieceSet}.css`} />
      </Helmet>
      <ThemeProvider
        // Pass the component extensions and other Mantine config
        mantineConfig={
          {
            //   primaryColor,
            //   colors: {
            //     dark: [
            //       "#C1C2C5",
            //       "#A6A7AB",
            //       "#909296",
            //       "#5c5f66",
            //       "#373A40",
            //       "#2C2E33",
            //       "#25262b",
            //       "#1A1B1E",
            //       "#141517",
            //       "#101113",
            //     ],
            //   },
          }
        }
        spellCheck={spellCheck}
      >
        <ContextMenuProvider>
          <Notifications />
          <RouterProvider router={router} />
        </ContextMenuProvider>
      </ThemeProvider>
    </>
  );
}
