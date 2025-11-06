import { BaseDirectory, basename, join } from "@tauri-apps/api/path";
import { type DirEntry, exists, readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { z } from "zod";
import { commands } from "@/bindings";
import { unwrap } from "@/utils/unwrap";

const fileTypeSchema = z.enum(["repertoire", "game", "tournament", "puzzle", "other"]);

export type FileType = z.infer<typeof fileTypeSchema>;

export const FILE_TYPE_LABELS: Record<FileType, string> = {
  game: "features.files.fileType.game",
  repertoire: "features.files.fileType.repertoire",
  tournament: "features.files.fileType.tournament",
  puzzle: "features.files.fileType.puzzle",
  other: "features.files.fileType.other",
} as const;

export type FileTypeItem = { labelKey: string; value: FileType };

export const FILE_TYPES: FileTypeItem[] = Object.entries(FILE_TYPE_LABELS).map(([value, labelKey]) => ({
  labelKey,
  value: value as FileType,
}));

const fileInfoMetadataSchema = z.object({
  type: fileTypeSchema,
  tags: z.array(z.string()),
});

export type FileInfoMetadata = z.infer<typeof fileInfoMetadataSchema>;

export const fileMetadataSchema = z.object({
  type: z.literal("file"),
  name: z.string(),
  path: z.string(),
  numGames: z.number(),
  metadata: fileInfoMetadataSchema,
  lastModified: z.number(),
});

export type FileMetadata = z.infer<typeof fileMetadataSchema>;

export type FileData = {
  metadata: FileInfoMetadata;
  games: string[];
};

async function readFileMetadata(path: string): Promise<FileMetadata | null> {
  if (!path.endsWith(".pgn")) {
    return null;
  }
  const metadataPath = path.replace(".pgn", ".info");
  let metadata: FileInfoMetadata;
  if (await exists(metadataPath)) {
    metadata = JSON.parse(await readTextFile(metadataPath));
  } else {
    metadata = {
      type: "other",
      tags: [],
    };
    await writeTextFile(metadataPath, JSON.stringify(metadata));
  }
  const fileMetadata = unwrap(await commands.getFileMetadata(path));
  const numGames = unwrap(await commands.countPgnGames(path));
  return {
    type: "file",
    path,
    name: (await basename(path)).replace(".pgn", ""),
    numGames,
    metadata,
    lastModified: Number(fileMetadata.last_modified),
  };
}

export type Directory = {
  type: "directory";
  children: (FileMetadata | Directory)[];
  path: string;
  name: string;
};

export async function processEntriesRecursively(parent: string, entries: DirEntry[]) {
  const allEntries: (FileMetadata | Directory)[] = [];
  for (const entry of entries) {
    if (entry.isFile) {
      const metadata = await readFileMetadata(await join(parent, entry.name));
      if (!metadata) continue;
      allEntries.push(metadata);
    }
    if (entry.isDirectory) {
      const dir = await join(parent, entry.name);
      const newEntries = await processEntriesRecursively(
        dir,
        await readDir(dir, { baseDir: BaseDirectory.AppLocalData }),
      );
      allEntries.push({
        type: "directory",
        name: entry.name,
        path: dir,
        children: newEntries,
      });
    }
  }
  return allEntries;
}
