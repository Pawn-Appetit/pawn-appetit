import { Divider, FileInput, Textarea } from "@mantine/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings/generated";
import type { FileMetadata } from "@/features/files/components/file";
import { createTempImportFile, getFileNameWithoutExtension } from "@/utils/files";
import { unwrap } from "@/utils/unwrap";

export type PgnTarget = {
  type: "file" | "files" | "pgn";
  target: string | string[]; // filePath if type is "file", filePaths if type is "files", pgn content if type is "pgn"
};

export type ResolvedPgnTarget = PgnTarget & {
  content: string;
  games: string[];
  count: number;
  file: FileMetadata;
  errors?: { file?: string; error: string }[]; // Track import errors
};

export async function resolvePgnTarget(target: PgnTarget): Promise<ResolvedPgnTarget> {
  if (target.type === "file") {
    // Read the file and create a temp file with the content.
    // The temp file can be used to open the analysis board if we don't save it.
    const count = unwrap(await commands.countPgnGames(target.target as string));
    const games = unwrap(await commands.readGames(target.target as string, 0, count - 1));
    const content = games.join("");
    const file = await createTempImportFile(content);
    return {
      ...target,
      content,
      games,
      count,
      file,
    };
  }

  if (target.type === "files") {
    // Handle multiple files
    const allGames: string[] = [];
    const errors: { file?: string; error: string }[] = [];
    const filePaths = target.target as string[];

    for (const filePath of filePaths) {
      try {
        const count = unwrap(await commands.countPgnGames(filePath));
        const games = unwrap(await commands.readGames(filePath, 0, count - 1));
        allGames.push(...games);
      } catch (error) {
        errors.push({
          file: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const content = allGames.join("");
    const file = await createTempImportFile(content);

    return {
      ...target,
      content,
      games: allGames,
      count: allGames.length,
      file,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // Create a temp file with the content of the text area. Allow to reuse the same parsing flow for normal files.
  // Here again, the temp file can be used to open the analysis board if we don't save it.
  const file = await createTempImportFile(target.target as string);
  const count = unwrap(await commands.countPgnGames(file.path));
  const games = unwrap(await commands.readGames(file.path, 0, count - 1));
  return {
    ...target,
    content: games.join(""),
    games,
    count,
    file,
  };
}

type PgnSourceInputProps = {
  setPgnTarget: (source: PgnTarget) => void;
  pgnTarget: PgnTarget;
  setFilename?: (name: string) => void;
  // Optional override keys; if omitted defaults are used
  fileInputLabelKey?: string; // default: "common.pgnFile"
  fileInputDescriptionKey?: string; // default: "common.clickToSelectPGN"
  dividerLabelKey?: string; // default: "Common.OR"
  textareaLabelKey?: string; // default: "common.pgnGame"
  textareaPlaceholderKey?: string; // default: "features.files.create.pgnPlaceholder"
  allowMultiple?: boolean; // Allow multiple file selection
};

export function PgnSourceInput({
  setPgnTarget,
  pgnTarget,
  setFilename,
  fileInputLabelKey = "common.pgnFile",
  fileInputDescriptionKey = "common.clickToSelectPGN",
  dividerLabelKey = "common.or",
  textareaLabelKey = "common.pgnGame",
  textareaPlaceholderKey = "features.files.create.pgnPlaceholder",
  allowMultiple = false,
}: PgnSourceInputProps) {
  const { t } = useTranslation();
  const [pgn, setPgn] = useState(pgnTarget.type === "pgn" ? (pgnTarget.target as string) : "");
  const [files, setFiles] = useState<string[]>(
    pgnTarget.type === "file"
      ? [pgnTarget.target as string]
      : pgnTarget.type === "files"
        ? (pgnTarget.target as string[])
        : [],
  );

  const hasFiles = files.length > 0;
  const fileDisplayText = hasFiles
    ? files.length === 1
      ? files[0].split("/").pop() || files[0]
      : t("common.multipleFiles", { count: files.length })
    : "";

  return (
    <div>
      <FileInput
        label={allowMultiple ? t("common.pgnFiles") : t(fileInputLabelKey)}
        description={allowMultiple ? t("common.clickToSelectMultiplePGN") : t(fileInputDescriptionKey)}
        onClick={async () => {
          const selected = (await open({
            multiple: allowMultiple,
            filters: [
              {
                name: "PGN file",
                extensions: ["pgn"],
              },
            ],
          })) as string | string[];

          if (selected) {
            const selectedFiles = Array.isArray(selected) ? selected : [selected];
            setFiles(selectedFiles);
            setPgn("");

            if (selectedFiles.length === 1) {
              setPgnTarget({ type: "file", target: selectedFiles[0] });
              if (setFilename) {
                setFilename(await getFileNameWithoutExtension(selectedFiles[0]));
              }
            } else {
              setPgnTarget({ type: "files", target: selectedFiles });
              if (setFilename) {
                setFilename(`${selectedFiles.length}_games`);
              }
            }
          }
        }}
        value={hasFiles ? new File([new Blob()], fileDisplayText) : null}
        onChange={(e) => {
          if (e === null) {
            setFiles([]);
            setPgnTarget({ type: "pgn", target: "" });
            if (setFilename) {
              setFilename("");
            }
          }
        }}
        disabled={pgn !== ""}
      />
      <Divider pt="xs" label={t(dividerLabelKey).toUpperCase()} labelPosition="center" />
      <Textarea
        value={pgn}
        disabled={hasFiles}
        onChange={(event) => {
          setFiles([]);
          setPgn(event.currentTarget.value);
          setPgnTarget({ type: "pgn", target: event.currentTarget.value });
        }}
        label={t(textareaLabelKey)}
        placeholder={t(textareaPlaceholderKey)}
        rows={8}
      />
    </div>
  );
}
