import { Button, Modal, Stack } from "@mantine/core";
import { useLoaderData } from "@tanstack/react-router";
import { rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FilenameInput } from "@/features/files/components/FilenameInput";
import { FileTypeSelector } from "@/features/files/components/FileTypeSelector";
import { PgnSourceInput, type PgnTarget, resolvePgnTarget } from "@/features/files/components/PgnSourceInput";
import { createFile } from "@/utils/files";
import type { Directory, FileMetadata, FileType } from "./file";

export function CreateModal({
  opened,
  setOpened,
  files,
  setFiles,
  setSelected,
}: {
  opened: boolean;
  setOpened: (opened: boolean) => void;
  files: (FileMetadata | Directory)[];
  setFiles: (files: (FileMetadata | Directory)[]) => void;
  setSelected: React.Dispatch<React.SetStateAction<FileMetadata | null>>;
}) {
  const { t } = useTranslation();
  const [pgnTarget, setPgnTarget] = useState<PgnTarget>({ type: "pgn", target: "" });
  const [filename, setFilename] = useState("");
  const [filetype, setFiletype] = useState<FileType>("game");
  const [error, setError] = useState("");
  const { documentDir } = useLoaderData({ from: "/files" });

  async function addFile() {
    const resolvedPgnTarget = await resolvePgnTarget(pgnTarget);
    const newFile = await createFile({
      filename,
      filetype: filetype as Exclude<FileType, "all">,
      pgn: resolvedPgnTarget.content,
      dir: documentDir,
    });
    if (newFile.isErr) {
      setError(newFile.error.message);
    } else {
      setFiles([...files, newFile.value]);
      setSelected(newFile.value);
      setError("");
      setOpened(false);
      setFilename("");
      setFiletype("game");
    }
  }

  return (
    <Modal opened={opened} onClose={() => setOpened(false)} title={t("features.files.create.title")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addFile();
        }}
      >
        <Stack>
          <FilenameInput value={filename} onChange={setFilename} error={error} />
          <FileTypeSelector value={filetype} onChange={setFiletype} />

          <PgnSourceInput setFilename={setFilename} setPgnTarget={setPgnTarget} pgnTarget={pgnTarget} />

          <Button style={{ marginTop: "1rem" }} type="submit">
            {t("common.create")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

export function EditModal({
  opened,
  setOpened,
  mutate,
  setSelected,
  metadata,
}: {
  opened: boolean;
  setOpened: (opened: boolean) => void;
  mutate: () => void;
  setSelected: React.Dispatch<React.SetStateAction<FileMetadata | null>>;
  metadata: FileMetadata;
}) {
  const { t } = useTranslation();

  const [filename, setFilename] = useState(metadata.name);
  const [filetype, setFiletype] = useState<FileType>(metadata.metadata.type);
  const [error, setError] = useState("");

  async function editFile() {
    const metadataPath = metadata.path.replace(".pgn", ".info");
    const newMetadata = {
      type: filetype,
      tags: [],
    };
    await writeTextFile(metadataPath, JSON.stringify(newMetadata));

    const newPGNPath = metadata.path.replace(`${metadata.name}.pgn`, `${filename}.pgn`);

    await rename(metadata.path, newPGNPath);
    await rename(metadataPath.replace(".pgn", ".info"), newPGNPath.replace(".pgn", ".info"));

    mutate();
    setSelected((selected) =>
      selected?.path === metadata.path
        ? {
            ...metadata,
            name: filename,
            path: newPGNPath,
            numGames: metadata.numGames,
            metadata: newMetadata,
          }
        : selected,
    );

    setError("");
    setOpened(false);
  }

  return (
    <Modal opened={opened} onClose={() => setOpened(false)} title={t("features.files.edit.title")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          editFile();
        }}
      >
        <Stack>
          <FilenameInput value={filename} onChange={setFilename} error={error} />
          <FileTypeSelector value={filetype} onChange={setFiletype} />

          <Button style={{ marginTop: "1rem" }} type="submit">
            {t("common.edit")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
