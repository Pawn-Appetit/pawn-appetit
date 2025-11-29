import { Button, Checkbox, Group, Stack, Text, TextInput } from "@mantine/core";
import type { ContextModalProps } from "@mantine/modals";
import { useLoaderData } from "@tanstack/react-router";
import { makeFen, parseFen } from "chessops/fen";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import GenericCard from "@/components/GenericCard";
import { FilenameInput } from "@/features/files/components/FilenameInput";
import { FileTypeSelector } from "@/features/files/components/FileTypeSelector";
import {
  PgnSourceInput,
  type PgnTarget,
  type ResolvedPgnTarget,
  resolvePgnTarget,
} from "@/features/files/components/PgnSourceInput";
import type { FileType } from "@/features/files/utils/file";
import { activeTabAtom, currentTabAtom, tabsAtom } from "@/state/atoms";
import { parsePGN } from "@/utils/chess";
import { getChesscomGame } from "@/utils/chess.com/api";
import { chessopsError } from "@/utils/chessops";
import { createFile, createTempImportFile, openFile } from "@/utils/files";
import { getLichessGame } from "@/utils/lichess/api";
import { parseMultiplePgnGames } from "@/utils/pgnUtils";
import { defaultTree, getGameName, type TreeState } from "@/utils/treeReducer";
import { ImportSummary } from "./ImportSummary";
import { basename } from "@tauri-apps/api/path";

type ImportType = "PGN" | "Link" | "FEN";

interface ImportResult {
  successCount: number;
  totalGames: number;
  errors: { file?: string; error: string }[];
  failedGames?: { gameIndex: number; error: string; fileName?: string }[];
  importedFiles?: { path: string; name: string; gameCount: number }[];
}

export default function ImportModal({ context, id }: ContextModalProps<{ modalBody: string }>) {
  const { t } = useTranslation();
  const [pgnTarget, setPgnTarget] = useState<PgnTarget>({ type: "pgn", target: "" });
  const [fen, setFen] = useState("");
  const [link, setLink] = useState("");
  const [importType, setImportType] = useState<ImportType>("PGN");
  const [filetype, setFiletype] = useState<FileType>("game");
  const [loading, setLoading] = useState(false);
  const [, setCurrentTab] = useAtom(currentTabAtom);
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);
  const [fenError, setFenError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [save, setSave] = useState(false);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const { documentDir } = useLoaderData({ from: "/boards" });

  async function parseGamesFromTarget(
    resolvedTarget: ResolvedPgnTarget,
  ): Promise<{ trees: TreeState[]; errors: { gameIndex: number; error: string; fileName?: string }[] }> {
    const trees = [];
    const errors = [];

    if (resolvedTarget.type === "pgn") {
      const { games, errors: parseErrors } = await parseMultiplePgnGames(resolvedTarget.content);

      trees.push(...games.map((g) => g.tree));
      errors.push(
        ...parseErrors.map((e) => ({
          gameIndex: e.gameIndex,
          error: e.error,
          fileName: "Pasted Content",
        })),
      );
    } else {
      for (let i = 0; i < resolvedTarget.games.length; i++) {
        try {
          const gameContent = resolvedTarget.games[i].trim();
          if (gameContent) {
            const tree = await parsePGN(gameContent);
            trees.push(tree);
          }
        } catch (error) {
          errors.push({
            gameIndex: i,
            error: error instanceof Error ? error.message : String(error),
            fileName: resolvedTarget.file.name || "Unknown File",
          });
        }
      }
    }

    return { trees, errors };
  }

  async function processMultipleFiles(resolvedTarget: ResolvedPgnTarget): Promise<ImportResult> {
    if (resolvedTarget.type === "pgn") {
      const { trees, errors } = await parseGamesFromTarget(resolvedTarget);

      const importedFiles: { path: string; name: string; gameCount: number }[] = [];

      if (trees.length > 0) {
        if (save) {
          const newFile = await createFile({
            filename,
            filetype,
            pgn: resolvedTarget.content,
            dir: documentDir,
          });

          if (newFile.isOk) {
            importedFiles.push({
              path: newFile.value.path,
              name: filename,
              gameCount: trees.length,
            });
            await openFile(newFile.value.path, setTabs, setActiveTab);
          } else {
            return {
              successCount: 0,
              totalGames: resolvedTarget.count,
              errors: [{ error: newFile.error.message }],
              failedGames: errors,
              importedFiles: [],
            };
          }
        } else {
          const tempFile = await createTempImportFile(resolvedTarget.content);
          importedFiles.push({
            path: tempFile.path,
            name: "Pasted Content",
            gameCount: trees.length,
          });
          await openFile(tempFile.path, setTabs, setActiveTab);
        }
      }

      return {
        successCount: trees.length,
        totalGames: resolvedTarget.count,
        errors: resolvedTarget.errors || [],
        failedGames: errors,
        importedFiles,
      };
    }

    if (resolvedTarget.type === "files" && Array.isArray(resolvedTarget.target)) {
      const importedFiles: { path: string; name: string; gameCount: number }[] = [];
      const allErrors: { file?: string; error: string }[] = [...(resolvedTarget.errors || [])];
      const failedGames: { gameIndex: number; error: string; fileName?: string }[] = [];
      let totalSuccessfulGames = 0;
      let totalGames = 0;

      for (const filePath of resolvedTarget.target) {
        try {
          const fileName = await basename(filePath);

          const singleFileTarget = await resolvePgnTarget({ type: "file", target: filePath });
          const { trees, errors } = await parseGamesFromTarget(singleFileTarget);

          totalGames += singleFileTarget.count;
          totalSuccessfulGames += trees.length;

          errors.forEach((error) => {
            failedGames.push({
              ...error,
              fileName,
            });
          });

          if (trees.length > 0) {
            if (save) {
              const baseFileName = fileName.replace(/\.pgn$/i, "");
              const finalFileName = `${filename}_${baseFileName}`;
              const newFile = await createFile({
                filename: finalFileName,
                filetype,
                pgn: singleFileTarget.content,
                dir: documentDir,
              });

              if (newFile.isOk) {
                importedFiles.push({
                  path: newFile.value.path,
                  name: finalFileName,
                  gameCount: trees.length,
                });
                await openFile(newFile.value.path, setTabs, setActiveTab);
              } else {
                allErrors.push({
                  file: fileName,
                  error: `Failed to save: ${newFile.error.message}`,
                });
              }
            } else {
              importedFiles.push({
                path: singleFileTarget.file.path,
                name: fileName,
                gameCount: trees.length,
              });
              await openFile(singleFileTarget.file.path, setTabs, setActiveTab);
            }
          }

          if (singleFileTarget.errors) {
            allErrors.push(...singleFileTarget.errors);
          }
        } catch (error) {
          const fileName = await basename(filePath);
          allErrors.push({
            file: fileName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        successCount: totalSuccessfulGames,
        totalGames,
        errors: allErrors,
        failedGames,
        importedFiles,
      };
    }

    const { trees, errors } = await parseGamesFromTarget(resolvedTarget);
    const importedFiles: { path: string; name: string; gameCount: number }[] = [];

    if (trees.length > 0) {
      if (save) {
        const newFile = await createFile({
          filename,
          filetype,
          pgn: resolvedTarget.content,
          dir: documentDir,
        });

        if (newFile.isOk) {
          importedFiles.push({
            path: newFile.value.path,
            name: filename,
            gameCount: trees.length,
          });
          await openFile(newFile.value.path, setTabs, setActiveTab);
        } else {
          return {
            successCount: 0,
            totalGames: resolvedTarget.count,
            errors: [{ error: newFile.error.message }],
            failedGames: errors,
            importedFiles: [],
          };
        }
      } else {
        importedFiles.push({
          path: resolvedTarget.file.path,
          name: resolvedTarget.file.name || "Imported Game",
          gameCount: trees.length,
        });
        await openFile(resolvedTarget.file.path, setTabs, setActiveTab);
      }
    }

    return {
      successCount: trees.length,
      totalGames: resolvedTarget.count,
      errors: resolvedTarget.errors || [],
      failedGames: errors,
      importedFiles,
    };
  }

  async function handleSubmit() {
    setLoading(true);
    setImportResult(null);

    if (importType === "PGN") {
      try {
        const resolvedPgnTarget = await resolvePgnTarget(pgnTarget);
        const result = await processMultipleFiles(resolvedPgnTarget);
        setImportResult(result);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } else if (importType === "Link") {
      if (!link) {
        setLoading(false);
        return;
      }
      let pgn = "";
      if (link.includes("chess.com")) {
        const res = await getChesscomGame(link);
        if (res === null) {
          setLoading(false);
          return;
        }
        pgn = res;
      } else if (link.includes("lichess")) {
        const gameId = link.split("/")[3];
        pgn = await getLichessGame(gameId);
      }
      const tree = await parsePGN(pgn);
      setCurrentTab((prev) => {
        sessionStorage.setItem(prev.value, JSON.stringify({ version: 0, state: tree }));
        return {
          ...prev,
          name: getGameName(tree.headers),
          type: "analysis",
        };
      });
    } else if (importType === "FEN") {
      const res = parseFen(fen.trim());
      if (res.isErr) {
        setFenError(chessopsError(res.error));
        setLoading(false);
        return;
      }
      setFenError("");
      const parsedFen = makeFen(res.value);
      setCurrentTab((prev) => {
        const tree = defaultTree(parsedFen);
        tree.headers.fen = parsedFen;
        sessionStorage.setItem(prev.value, JSON.stringify({ version: 0, state: tree }));
        return {
          ...prev,
          name: t("features.tabs.analysisBoard.title"),
          type: "analysis",
        };
      });
    }
    setLoading(false);

    if (importType !== "PGN") {
      context.closeModal(id);
    }
  }

  const Input = match(importType)
    .with("PGN", () => (
      <Stack>
        <PgnSourceInput
          setFilename={setFilename}
          setPgnTarget={setPgnTarget}
          pgnTarget={pgnTarget}
          allowMultiple={true}
        />

        <Checkbox
          label={t("features.tabs.importGame.saveToCollection")}
          checked={save}
          onChange={(e) => setSave(e.currentTarget.checked)}
        />

        {save && (
          <>
            <FilenameInput value={filename} onChange={setFilename} error={error} />
            <FileTypeSelector value={filetype} onChange={setFiletype} />
          </>
        )}
      </Stack>
    ))
    .with("Link", () => (
      <TextInput
        value={link}
        onChange={(event) => setLink(event.currentTarget.value)}
        label={t("features.tabs.importGame.url")}
        data-autofocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
      />
    ))
    .with("FEN", () => (
      <TextInput
        value={fen}
        onChange={(event) => setFen(event.currentTarget.value)}
        error={fenError}
        label="FEN"
        data-autofocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
      />
    ))
    .exhaustive();

  const disabled = match(importType)
    .with(
      "PGN",
      () =>
        !pgnTarget.target ||
        (Array.isArray(pgnTarget.target) ? pgnTarget.target.length === 0 : !pgnTarget.target) ||
        (save && !filename.trim()),
    )
    .with("Link", () => !link)
    .with("FEN", () => !fen)
    .exhaustive();

  if (importResult) {
    return (
      <Stack>
        <ImportSummary result={importResult} />
        <Group>
          <Button variant="default" onClick={() => setImportResult(null)}>
            {t("common.importMore")}
          </Button>
          <Button onClick={() => context.closeModal(id)}>{t("common.close")}</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <>
      <Group grow mb="sm">
        <GenericCard
          id={"PGN"}
          isSelected={importType === "PGN"}
          setSelected={setImportType}
          content={<Text ta="center">PGN</Text>}
        />

        <GenericCard
          id={"Link"}
          isSelected={importType === "Link"}
          setSelected={setImportType}
          content={<Text ta="center">{t("features.tabs.importGame.online")}</Text>}
        />

        <GenericCard
          id={"FEN"}
          isSelected={importType === "FEN"}
          setSelected={setImportType}
          content={<Text ta="center">FEN</Text>}
        />
      </Group>

      {Input}

      <Button fullWidth mt="md" radius="md" loading={loading} disabled={disabled} onClick={handleSubmit}>
        {loading ? t("features.tabs.importGame.importing") : t("features.tabs.importGame.import")}
      </Button>
    </>
  );
}
