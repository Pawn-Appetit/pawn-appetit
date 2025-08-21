import { Divider, FileInput, Textarea } from "@mantine/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings/generated";
import type { FileMetadata } from "@/features/files/components/file";
import { createTempImportFile, getFileNameWithoutExtension } from "@/utils/files";
import { unwrap } from "@/utils/unwrap";

export type PgnTarget = {
  type: "file" | "pgn";
  target: string; // filePath if type is "file", pgn content if type is "pgn"
};

export type ResolvedPgnTarget = PgnTarget & {
  content: string;
  games: string[];
  count: number;
  file: FileMetadata;
};

export async function resolvePgnTarget(target: PgnTarget): Promise<ResolvedPgnTarget> {
  if (target.type === "file") {
    // Read the file and create a temp file with the content.
    // The temp file can be used to open the analysis board if we don't save it.
    const count = unwrap(await commands.countPgnGames(target.target));
    const games = unwrap(await commands.readGames(target.target, 0, count - 1));
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
  // Create a temp file with the content of the text area. Allow to reuse the same parsing flow for normal files.
  // Here again, the temp file can be used to open the analysis board if we don't save it.
  const file = await createTempImportFile(target.target);
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
  fileInputLabelKey?: string; // default: "Common.PGNFile"
  fileInputDescriptionKey?: string; // default: "Common.ClickToSelectPGN"
  dividerLabelKey?: string; // default: "Common.OR"
  textareaLabelKey?: string; // default: "Common.PGNGame"
  textareaPlaceholderKey?: string; // default: "Files.Create.PGNPlaceholder"
};

export function PgnSourceInput({
  setPgnTarget,
  pgnTarget,
  setFilename,
  fileInputLabelKey = "Common.PGNFile",
  fileInputDescriptionKey = "Common.ClickToSelectPGN",
  dividerLabelKey = "Common.Or",
  textareaLabelKey = "Common.PGNGame",
  textareaPlaceholderKey = "Files.Create.PGNPlaceholder",
}: PgnSourceInputProps) {
  const { t } = useTranslation();
  const [pgn, setPgn] = useState(pgnTarget.type === "pgn" ? pgnTarget.target : "");
  const [file, setFile] = useState<string | null>(pgnTarget.type === "file" ? pgnTarget.target : null);

  return (
    <div>
      <FileInput
        label={t(fileInputLabelKey)}
        description={t(fileInputDescriptionKey)}
        onClick={async () => {
          const selected = (await open({
            multiple: false,
            filters: [
              {
                name: "PGN file",
                extensions: ["pgn"],
              },
            ],
          })) as string;
          setFile(selected);
          setPgn("");
          setPgnTarget({ type: "file", target: selected });
          if (setFilename) {
            setFilename(await getFileNameWithoutExtension(selected));
          }
        }}
        value={new File([new Blob()], file || "")}
        onChange={(e) => {
          if (e === null) {
            setFile(null);
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
        disabled={file !== null}
        onChange={(event) => {
          setFile(null);
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
