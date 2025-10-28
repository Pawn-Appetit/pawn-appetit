import { save } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import type { StoreApi } from "zustand";
import { commands } from "@/bindings";
import { fileMetadataSchema } from "@/features/files/components/file";
import type { TreeStoreState } from "@/state/store/tree";
import { createFile, getFileNameWithoutExtension, isTempImportFile } from "@/utils/files";
import { unwrap } from "@/utils/unwrap";
import { getPGN, parsePGN } from "./chess";
import { formatDateToPGN } from "./format";
import type { GameHeaders, TreeState } from "./treeReducer";

const dbGameMetadataSchema = z.object({
  type: z.literal("db"),
  db: z.string(),
  id: z.number(),
});
export type DbGameMetadata = z.infer<typeof dbGameMetadataSchema>;

const entitySourceMetadataSchema = z.union([fileMetadataSchema, dbGameMetadataSchema]);

export type EntitySourceMetadata = z.infer<typeof entitySourceMetadataSchema>;

export const tabSchema = z.object({
  name: z.string(),
  value: z.string(),
  type: z.enum(["new", "play", "analysis", "puzzles"]),
  gameNumber: z.number().nullish(),
  source: entitySourceMetadataSchema.nullish(),
  meta: z
    .object({
      timeControl: z.object({
        seconds: z.number(),
        increment: z.number(),
      }),
    })
    .optional(),
});

export type Tab = z.infer<typeof tabSchema>;

export function genID() {
  function S4() {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  }
  return S4() + S4();
}

export async function createTab({
  tab,
  setTabs,
  setActiveTab,
  pgn,
  headers,
  srcInfo,
  gameNumber,
  position,
}: {
  tab: Omit<Tab, "value">;
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string | null>>;
  pgn?: string;
  headers?: GameHeaders;
  srcInfo?: EntitySourceMetadata;
  gameNumber?: number;
  position?: number[];
}) {
  const id = genID();

  if (pgn !== undefined) {
    const tree = await parsePGN(pgn, headers?.fen);
    if (headers) {
      tree.headers = headers;
      if (position) {
        tree.position = position;
      }
    }
    sessionStorage.setItem(id, JSON.stringify({ version: 0, state: tree }));
  }

  setTabs((prev) => {
    if (prev.length === 0 || (prev.length === 1 && prev[0].type === "new" && tab.type !== "new")) {
      return [
        {
          ...tab,
          value: id,
          source: srcInfo,
          gameNumber,
        },
      ];
    }
    return [
      ...prev,
      {
        ...tab,
        value: id,
        source: srcInfo,
        gameNumber,
      },
    ];
  });
  setActiveTab(id);
  return id;
}

export async function saveToFile({
  dir,
  tab,
  setCurrentTab,
  store,
}: {
  dir: string;
  tab: Tab | undefined;
  setCurrentTab: React.Dispatch<React.SetStateAction<Tab>>;
  store: StoreApi<TreeStoreState>;
}) {
  let filePath: string;
  if (tab?.source?.type === "file" && !isTempImportFile(tab?.source?.path)) {
    filePath = tab.source.path;
  } else {
    const userChoice = await save({
      defaultPath: `${dir}/analyze-game-${formatDateToPGN(new Date())}.pgn`,
      filters: [
        {
          name: "PGN",
          extensions: ["pgn"],
        },
      ],
    });
    if (userChoice === null) return;
    filePath = userChoice;
    const fileName = await getFileNameWithoutExtension(filePath);
    if (tab?.source?.type === "file" && isTempImportFile(tab?.source?.path)) {
      const count = unwrap(await commands.countPgnGames(tab?.source?.path ?? ""));
      const games = unwrap(await commands.readGames(tab?.source?.path ?? "", 0, count - 1));
      const pgn = games.join("");
      await createFile({
        filename: fileName,
        filetype: "game",
        pgn,
        dir: dir,
      });
    }
    setCurrentTab((prev) => {
      return {
        ...prev,
        source: {
          ...(prev.source ?? { type: "file", numGames: 1, metadata: { type: "game", tags: [] } }),
          name: fileName,
          path: filePath,
          lastModified: Date.now(),
        },
      };
    });
  }
  await commands.writeGame(
    filePath,
    tab?.gameNumber || 0,
    `${getPGN(store.getState().root, {
      headers: store.getState().headers,
      comments: true,
      extraMarkups: true,
      glyphs: true,
      variations: true,
    })}\n\n`,
  );
  store.getState().save();
}

export async function saveTab(tab: Tab, store: StoreApi<TreeStoreState>) {
  if (tab.source?.type === "file") {
    await commands.writeGame(
      tab.source.path,
      tab?.gameNumber || 0,
      `${getPGN(store.getState().root, {
        headers: store.getState().headers,
        comments: true,
        extraMarkups: true,
        glyphs: true,
        variations: true,
      })}\n\n`,
    );
  } else if (tab.source?.type === "db") {
    const headers = store.getState().headers;
    const moves = `${getPGN(store.getState().root, {
      headers: headers,
      comments: true,
      extraMarkups: true,
      glyphs: true,
      variations: true,
    })}\n\n`;

    await commands.updateGame(tab.source.db, tab.source.id, {
      ...headers,
      moves,
    });
  }
}

export async function reloadTab(tab: Tab): Promise<TreeState | undefined> {
  let tree: TreeState | undefined;

  if (tab.source?.type === "file") {
    const game = unwrap(await commands.readGames(tab.source.path, 0, 0))[0];

    tree = await parsePGN(game);
  } else if (tab.source?.type === "db") {
    const game = unwrap(await commands.getGame(tab.source.db, tab.source.id));

    tree = await parsePGN(game.moves);
    tree.headers = game;
  }

  if (tree != null) {
    sessionStorage.setItem(tab.value, JSON.stringify({ version: 0, state: tree }));
    return tree;
  }
}
