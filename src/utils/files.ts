import { Result } from "@badrap/result";
import { useQuery } from "@tanstack/react-query";
import { BaseDirectory, basename, extname, resolve, tempDir } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { platform } from "@tauri-apps/plugin-os";
import { defaultGame, makePgn } from "chessops/pgn";
import { commands } from "@/bindings";
import { invalidateFileIndex, type FileMetadata } from "@/features/files/utils/file";
import { unwrap } from "@/utils/unwrap";
import { parsePGN } from "./chess";
import { recordRecentFile } from "./recentFiles";
import { serializeStorageValue } from "./tabStateStorage";
import { createTab, type Tab } from "./tabs";
import { getGameName } from "./treeReducer";

export function usePlatform() {
    const r = useQuery({
        queryKey: ["os"],
        queryFn: async () => {
            return platform();
        },
        staleTime: Infinity,
    });
    return { os: r.data, ...r };
}

export async function getFileNameWithoutExtension(filePath: string): Promise<string> {
    const fileNameWithExtension = await basename(filePath);
    const extension = await extname(filePath);
    return fileNameWithExtension.replace(`.${extension}`, "");
}

export async function openFile(
    file: string,
    setTabs: React.Dispatch<React.SetStateAction<Tab[]>>,
    setActiveTab: React.Dispatch<React.SetStateAction<string | null>>,
) {
    const count = unwrap(await commands.countPgnGames(file));
    const firstGame = unwrap(await commands.readGames(file, 0, 0))[0];
    if (!firstGame) {
        throw new Error("PGN file does not contain any games");
    }

    const fileName = await getFileNameWithoutExtension(file);

    const metadataPath = file.replace(/\.pgn$/i, ".info");
    let fileType: "game" | "repertoire" | "tournament" | "puzzle" | "variants" | "other" = "game";
    try {
        if (await exists(metadataPath)) {
            const metadata = JSON.parse(await readTextFile(metadataPath));
            if (metadata.type) {
                fileType = metadata.type;
            }
        }
    } catch {}

    const fileInfo: FileMetadata = {
        type: "file",
        metadata: {
            tags: [],
            type: fileType,
        },
        name: fileName,
        path: file,
        numGames: count,
        lastModified: new Date().getUTCSeconds(),
    };

    // Parse only the first game for session storage
    // For variants files, parse as normal PGN (with variations) but display in variants view
    // Don't use isVariantsMode for parsing - that's only for special PGNs where all sequences are variations
    const firstGameTree = await parsePGN(firstGame);

    const tabId = await createTab({
        tab: {
            name: getGameName(firstGameTree?.headers) || "Multiple Games",
            type: "analysis",
        },
        setTabs,
        setActiveTab,
        srcInfo: fileInfo,
        gameNumber: 0,
    });

    // Store the first game's state in session storage (for backward compatibility)
    // The analysis board will handle multiple games through the pgn content
    sessionStorage.setItem(tabId, serializeStorageValue({ version: 0, state: firstGameTree }));
}

export async function openFileAndRemember(
    file: string,
    setTabs: React.Dispatch<React.SetStateAction<Tab[]>>,
    setActiveTab: React.Dispatch<React.SetStateAction<string | null>>,
) {
    await openFile(file, setTabs, setActiveTab);
    recordRecentFile(file);
}

export async function createFile({
    filename,
    filetype,
    pgn,
    dir,
}: {
    filename: string;
    filetype: "game" | "repertoire" | "tournament" | "puzzle" | "variants" | "other";
    pgn?: string;
    dir: string;
}): Promise<Result<FileMetadata>> {
    const file = await resolve(dir, `${filename}.pgn`);
    if (await exists(file)) {
        return Result.err(Error("File already exists"));
    }
    const metadata = {
        type: filetype,
        tags: [],
    };
    await mkdir(dir, { recursive: true });
    await writeTextFile(file, pgn || makePgn(defaultGame()));
    await writeTextFile(file.replace(".pgn", ".info"), JSON.stringify(metadata));

    const numGames = unwrap(await commands.countPgnGames(file));
    invalidateFileIndex(dir);

    return Result.ok({
        type: "file",
        name: filename,
        path: file,
        numGames,
        metadata,
        lastModified: new Date().getUTCSeconds(),
    });
}

export async function createTempImportFile(pgn: string): Promise<FileMetadata> {
    const tempDirPath = await resolve(await tempDir(), "pawn-appetit");
    const tempFilePath = await resolve(tempDirPath, `temp_import_${Date.now()}.pgn`);

    // Ensure temp directory exists
    try {
        await mkdir("pawn-appetit", { baseDir: BaseDirectory.Temp });
    } catch {
        // Directory might already exist, continue
    }

    await writeTextFile(tempFilePath, pgn);

    const numGames = unwrap(await commands.countPgnGames(tempFilePath));

    return {
        type: "file",
        name: "Untitled",
        path: tempFilePath,
        numGames,
        metadata: {
            type: "game",
            tags: [],
        },
        lastModified: Date.now(),
    };
}

export function isTempImportFile(filePath: string): boolean {
    return filePath.includes("temp_import_");
}
