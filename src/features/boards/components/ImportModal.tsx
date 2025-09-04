import { Button, Checkbox, Group, Stack, Text, TextInput } from "@mantine/core";
import type { ContextModalProps } from "@mantine/modals";
import { makeFen, parseFen } from "chessops/fen";
import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import GenericCard from "@/common/components/GenericCard";
import { FilenameInput } from "@/features/files/components/FilenameInput";
import { FileTypeSelector } from "@/features/files/components/FileTypeSelector";
import type { FileType } from "@/features/files/components/file";
import { PgnSourceInput, type PgnTarget, resolvePgnTarget } from "@/features/files/components/PgnSourceInput";
import { activeTabAtom, currentTabAtom, storedDocumentDirAtom, tabsAtom } from "@/state/atoms";
import { parsePGN } from "@/utils/chess";
import { getChesscomGame } from "@/utils/chess.com/api";
import { chessopsError } from "@/utils/chessops";
import { createFile, openFile } from "@/utils/files";
import { getLichessGame } from "@/utils/lichess/api";
import { defaultTree, getGameName } from "@/utils/treeReducer";

type ImportType = "PGN" | "Link" | "FEN";

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

  const [save, setSave] = useState(false);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const documentDir = useAtomValue(storedDocumentDirAtom) || "";

  async function handleSubmit() {
    setLoading(true);
    if (importType === "PGN") {
      const resolvedPgnTarget = await resolvePgnTarget(pgnTarget);

      if (save) {
        const newFile = await createFile({
          filename,
          filetype,
          pgn: resolvedPgnTarget.content,
          dir: documentDir,
        });
        if (newFile.isErr) {
          setError(newFile.error.message);
          setLoading(false);
          return;
        }
        await openFile(newFile.value.path, setTabs, setActiveTab);
      } else {
        await openFile(resolvedPgnTarget.file.path, setTabs, setActiveTab);
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
    context.closeModal(id);
  }

  const Input = match(importType)
    .with("PGN", () => (
      <Stack>
        <PgnSourceInput setFilename={setFilename} setPgnTarget={setPgnTarget} pgnTarget={pgnTarget} />

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
    .with("PGN", () => !pgnTarget.target || (save && !filename.trim()))
    .with("Link", () => !link)
    .with("FEN", () => !fen)
    .exhaustive();

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
