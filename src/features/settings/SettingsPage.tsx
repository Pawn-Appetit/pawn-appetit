import { Box, Card, Group, ScrollArea, Select, Stack, Tabs, Text, TextInput, Title, useDirection } from "@mantine/core";

import { IconBook, IconBrush, IconChess, IconFlag, IconFolder, IconMouse, IconVolume } from "@tabler/icons-react";
import { useLoaderData } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { updateDirectoriesCache } from "@/App";
import AboutModal from "@/components/About";
import FileInput from "@/components/FileInput";
import ColorSchemeSettings from "@/features/themes/components/ColorSchemeSettings";
import ThemeSelectionSettings from "@/features/themes/components/ThemeSettings";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import {
  autoPromoteAtom,
  autoSaveAtom,
  blindfoldAtom,
  enableBoardScrollAtom,
  eraseDrawablesOnClickAtom,
  forcedEnPassantAtom,
  hideDashboardOnStartupAtom,
  minimumGamesAtom,
  moveInputAtom,
  moveMethodAtom,
  moveNotationTypeAtom,
  nativeBarAtom,
  percentageCoverageAtom,
  previewBoardOnHoverAtom,
  showArrowsAtom,
  showConsecutiveArrowsAtom,
  showCoordinatesAtom,
  showDestsAtom,
  snapArrowsAtom,
  spellCheckAtom,
  storedDocumentDirAtom,
} from "@/state/atoms";
import { hasTranslatedPieceChars } from "@/utils/format";
import ColorControl from "../themes/components/ColorControl";
import FontSizeSlider from "../themes/components/FontSizeSlider";
import BoardSelect from "./components/BoardSelect";
import PiecesSelect from "./components/PiecesSelect";
import SettingsNumberInput from "./components/SettingsNumberInput";
import SettingsSwitch from "./components/SettingsSwitch";
import SoundSelect from "./components/SoundSelect";
import TelemetrySettings from "./components/TelemetrySettings";
import VolumeSlider from "./components/VolumeSlider";
import * as classes from "./SettingsPage.css";

interface SettingItem {
  id: string;
  title: string;
  description: string;
  tab: string;
  component: React.ReactNode;
}

export default function Page() {
  const { t, i18n } = useTranslation();
  const { setDirection } = useDirection();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("board");
  const { layout } = useResponsiveLayout();

  const [isNative, setIsNative] = useAtom(nativeBarAtom);
  const {
    dirs: { documentDir },
  } = useLoaderData({ from: "/settings" });
  let [filesDirectory, setFilesDirectory] = useAtom(storedDocumentDirAtom);
  filesDirectory = filesDirectory || documentDir;

  const [moveMethod, setMoveMethod] = useAtom(moveMethodAtom);
  const [moveNotationType, setMoveNotationType] = useAtom(moveNotationTypeAtom);
  const [dateFormatMode, setDateFormatMode] = useState(localStorage.getItem("dateFormatMode") || "intl");

  const handleDateFormatModeChange = useCallback(
    (val: "intl" | "locale") => {
      setDateFormatMode(val);
      localStorage.setItem("dateFormatMode", val);
      i18n.changeLanguage(i18n.language); // triggers formatters re-render via languageChanged event
    },
    [i18n],
  );

  const languages = useMemo(() => {
    const langs: { value: string; label: string }[] = [];
    for (const localeCode of Object.keys(i18n.services.resourceStore.data)) {
      // Load label from specific namespace, in the other language resource.
      // Would avoid having to load full files if all the translations weren't all already loaded in memory
      langs.push({ value: localeCode, label: t("language:DisplayName", { lng: localeCode }) });
    }
    langs.sort((a, b) => a.label.localeCompare(b.label));
    return langs;
  }, [t, i18n.services.resourceStore.data]);

  const dateFormatModes = useMemo(
    () => [
      { value: "intl", label: t("settings.appearance.international") },
      { value: "locale", label: t("settings.appearance.locale") },
    ],
    [t],
  );

  const moveNotationData = useMemo(() => {
    const data = [
      { label: t("settings.symbols"), value: "symbols" },
      { label: t("settings.letters"), value: "letters" },
    ];

    if (hasTranslatedPieceChars(i18n)) {
      data.push({ label: t("settings.translatedLetters"), value: "letters-translated" });
    }

    return data;
  }, [t, i18n]);

  // Validate and change to an available option if we've switched to a language that doesn't have the option.
  const validatedMoveNotationType = useMemo(() => {
    if (moveNotationType === "letters-translated" && !hasTranslatedPieceChars(i18n)) {
      setMoveNotationType("letters");
      return "letters";
    }
    return moveNotationType;
  }, [moveNotationType, i18n, setMoveNotationType]);

  const waysToMoveData = useMemo(
    () => [
      { label: t("settings.drag"), value: "drag" },
      { label: t("settings.click"), value: "select" },
      { label: t("settings.both"), value: "both" },
    ],
    [t],
  );

  const titleBarData = useMemo(() => [t("settings.appearance.native"), t("settings.appearance.custom")], [t]);

  const allSettings = useMemo(
    (): SettingItem[] => [
      {
        id: "piece-dest",
        title: t("settings.board.pieceDest"),
        description: t("settings.board.pieceDestDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.board.pieceDest")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.board.pieceDestDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={showDestsAtom} />
          </Group>
        ),
      },
      {
        id: "arrows",
        title: t("settings.board.arrows"),
        description: t("settings.board.arrowsDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.board.arrows")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.board.arrowsDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={showArrowsAtom} />
          </Group>
        ),
      },
      {
        id: "move-notation",
        title: t("settings.moveNotation"),
        description: t("settings.moveNotationDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.moveNotation")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.moveNotationDesc")}
              </Text>
            </div>
            <Select
              data={moveNotationData}
              allowDeselect={false}
              value={validatedMoveNotationType}
              onChange={(val) => setMoveNotationType(val as "letters" | "symbols" | "letters-translated")}
            />
          </Group>
        ),
      },
      {
        id: "move-pieces",
        title: t("settings.waysToMovePieces"),
        description: t("settings.waysToMovePiecesDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.waysToMovePieces")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.waysToMovePiecesDesc")}
              </Text>
            </div>
            <Select
              data={waysToMoveData}
              allowDeselect={false}
              value={moveMethod}
              onChange={(val) => setMoveMethod(val as "drag" | "select" | "both")}
            />
          </Group>
        ),
      },
      {
        id: "snap-arrows",
        title: t("settings.board.snapArrows"),
        description: t("settings.board.snapArrowsDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.board.snapArrows")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.board.snapArrowsDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={snapArrowsAtom} />
          </Group>
        ),
      },
      {
        id: "consecutive-arrows",
        title: t("settings.board.consecutiveArrows"),
        description: t("settings.board.consecutiveArrowsDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.board.consecutiveArrows")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.board.consecutiveArrowsDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={showConsecutiveArrowsAtom} />
          </Group>
        ),
      },
      {
        id: "erase-drawables",
        title: t("settings.board.eraseDrawablesOnClick"),
        description: t("settings.board.eraseDrawablesOnClickDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.board.eraseDrawablesOnClick")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.board.eraseDrawablesOnClickDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={eraseDrawablesOnClickAtom} />
          </Group>
        ),
      },
      {
        id: "auto-promotion",
        title: t("settings.board.autoPromotion"),
        description: t("settings.board.autoPromotionDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.board.autoPromotion")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.board.autoPromotionDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={autoPromoteAtom} />
          </Group>
        ),
      },
      {
        id: "coordinates",
        title: t("settings.board.coordinates"),
        description: t("settings.board.coordinatesDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.board.coordinates")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.board.coordinatesDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={showCoordinatesAtom} />
          </Group>
        ),
      },
      {
        id: "auto-save",
        title: t("settings.board.autoSave"),
        description: t("settings.board.autoSaveDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.board.autoSave")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.board.autoSaveDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={autoSaveAtom} />
          </Group>
        ),
      },
      {
        id: "preview-board",
        title: t("settings.board.previewBoard"),
        description: t("settings.board.previewBoardDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.board.previewBoard")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.board.previewBoardDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={previewBoardOnHoverAtom} />
          </Group>
        ),
      },
      {
        id: "board-scroll",
        title: t("settings.board.scrollThroughMoves"),
        description: t("settings.board.scrollThroughMovesDesc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.board.scrollThroughMoves")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.board.scrollThroughMovesDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={enableBoardScrollAtom} />
          </Group>
        ),
      },
      {
        id: "text-input",
        title: t("settings.inputs.textInput"),
        description: t("settings.inputs.textInputDesc"),
        tab: "inputs",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.inputs.textInput")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.inputs.textInputDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={moveInputAtom} />
          </Group>
        ),
      },
      {
        id: "spell-check",
        title: t("settings.inputs.spellCheck"),
        description: t("settings.inputs.spellCheckDesc"),
        tab: "inputs",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.inputs.spellCheck")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.inputs.spellCheckDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={spellCheckAtom} />
          </Group>
        ),
      },
      {
        id: "forced-en-passant",
        title: t("settings.anarchy.forcedEnPassant"),
        description: t("settings.anarchy.forcedEnPassantDesc"),
        tab: "anarchy",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.anarchy.forcedEnPassant")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.anarchy.forcedEnPassantDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={forcedEnPassantAtom} />
          </Group>
        ),
      },
      {
        id: "percent-coverage",
        title: t("settings.openingReport.percentCoverage"),
        description: t("settings.openingReport.percentCoverageDesc"),
        tab: "report",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.openingReport.percentCoverage")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.openingReport.percentCoverageDesc")}
              </Text>
            </div>
            <SettingsNumberInput atom={percentageCoverageAtom} min={50} max={100} step={1} />
          </Group>
        ),
      },
      {
        id: "min-games",
        title: t("settings.openingReport.minGames"),
        description: t("settings.openingReport.minGamesDesc"),
        tab: "report",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.openingReport.minGames")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.openingReport.minGamesDesc")}
              </Text>
            </div>
            <SettingsNumberInput atom={minimumGamesAtom} min={0} step={1} />
          </Group>
        ),
      },
      {
        id: "color-scheme",
        title: t("settings.appearance.colorScheme"),
        description: t("settings.appearance.colorSchemeDesc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.appearance.colorScheme")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.appearance.colorSchemeDesc")}
              </Text>
            </div>
            <div>
              <ColorSchemeSettings />
            </div>
          </Group>
        ),
      },
      {
        id: "theme",
        title: t("settings.appearance.theme"),
        description: t("settings.appearance.themeDesc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.appearance.theme.theme")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.appearance.themeDesc")}
              </Text>
            </div>
            <div>
              <ThemeSelectionSettings />
            </div>
          </Group>
        ),
      },
      {
        id: "accent-color",
        title: t("settings.appearance.accentColor"),
        description: t("settings.appearance.accentColorDesc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.appearance.accentColor")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.appearance.accentColorDesc")}
              </Text>
            </div>
            <div>
              <ColorControl />
            </div>
          </Group>
        ),
      },
      {
        id: "font-size",
        title: t("settings.appearance.fontSize"),
        description: t("settings.appearance.fontSizeDesc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.appearance.fontSize")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.appearance.fontSizeDesc")}
              </Text>
            </div>
            <FontSizeSlider />
          </Group>
        ),
      },
      {
        id: "language",
        title: t("settings.appearance.language"),
        description: t("settings.appearance.languageDesc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.appearance.language")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.appearance.languageDesc")}
              </Text>
            </div>
            <Select
              allowDeselect={false}
              data={languages}
              value={i18n.language}
              onChange={(val) => {
                i18n.changeLanguage(val || "en-US");
                localStorage.setItem("lang", val || "en-US");
                setDirection(i18n.dir());
              }}
            />
          </Group>
        ),
      },
      {
        id: "date-format",
        title: t("settings.appearance.dateFormat"),
        description: t("settings.appearance.dateFormatDesc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.appearance.dateFormat")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.appearance.dateFormatDesc")}
              </Text>
            </div>
            <Select
              allowDeselect={false}
              data={dateFormatModes}
              value={dateFormatMode}
              onChange={(val) => {
                if (val) {
                  handleDateFormatModeChange(val as "intl" | "locale");
                }
              }}
            />
          </Group>
        ),
      },
      {
        id: "title-bar",
        title: t("settings.appearance.titleBar"),
        description: t("settings.appearance.titleBarDesc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.appearance.titleBar")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.appearance.titleBarDesc")}
              </Text>
            </div>
            <Select
              allowDeselect={false}
              data={titleBarData}
              value={isNative ? t("settings.appearance.native") : t("settings.appearance.custom")}
              onChange={(val) => {
                setIsNative(val === t("settings.appearance.native"));
              }}
            />
          </Group>
        ),
      },
      {
        id: "hide-dashboard",
        title: t("settings.appearance.hideDashboardOnStartup"),
        description: t("settings.appearance.hideDashboardOnStartupDesc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.appearance.hideDashboardOnStartup")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.appearance.hideDashboardOnStartupDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={hideDashboardOnStartupAtom} />
          </Group>
        ),
      },
      {
        id: "piece-set",
        title: t("settings.appearance.pieceSet"),
        description: t("settings.appearance.pieceSetDesc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.appearance.pieceSet")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.appearance.pieceSetDesc")}
              </Text>
            </div>
            <PiecesSelect />
          </Group>
        ),
      },
      {
        id: "blindfold-mode",
        title: t("settings.appearance.blindfold"),
        description: t("settings.appearance.blindfoldDesc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.appearance.blindfold")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.appearance.blindfoldDesc")}
              </Text>
            </div>
            <SettingsSwitch atom={blindfoldAtom} />
          </Group>
        ),
      },
      {
        id: "board-image",
        title: t("settings.appearance.boardImage"),
        description: t("settings.appearance.boardImageDesc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.appearance.boardImage")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.appearance.boardImageDesc")}
              </Text>
            </div>
            <BoardSelect />
          </Group>
        ),
      },
      {
        id: "volume",
        title: t("settings.sound.volume"),
        description: t("settings.sound.volumeDesc"),
        tab: "sound",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.sound.volume")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.sound.volumeDesc")}
              </Text>
            </div>
            <VolumeSlider />
          </Group>
        ),
      },
      {
        id: "sound-collection",
        title: t("settings.sound.collection"),
        description: t("settings.sound.collectionDesc"),
        tab: "sound",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.sound.collection")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.sound.collectionDesc")}
              </Text>
            </div>
            <SoundSelect />
          </Group>
        ),
      },
      {
        id: "files-directory",
        title: t("settings.directories.files"),
        description: t("settings.directories.filesDesc"),
        tab: "directories",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("settings.directories.files")}</Text>
              <Text size="xs" c="dimmed">
                {t("settings.directories.filesDesc")}
              </Text>
            </div>
            <FileInput
              onClick={async () => {
                const selected = await open({
                  multiple: false,
                  directory: true,
                });
                if (!selected || typeof selected !== "string") return;
                setFilesDirectory(selected);
                await updateDirectoriesCache();
              }}
              filename={filesDirectory || null}
            />
          </Group>
        ),
      },
      {
        id: "telemetry",
        title: t("settings.telemetry"),
        description: t("settings.telemetryDesc"),
        tab: "directories",
        component: <TelemetrySettings className={classes.item} />,
      },
      {
        id: "about",
        title: t("settings.about"),
        description: t("settings.aboutDesc"),
        tab: "directories",
        component: <AboutModal />,
      },
    ],
    [
      t,
      i18n.language,
      i18n.changeLanguage,
      i18n.dir,
      setDirection,
      isNative,
      setIsNative,
      moveMethod,
      setMoveMethod,
      validatedMoveNotationType,
      setMoveNotationType,
      filesDirectory,
      setFilesDirectory,
      dateFormatMode,
      dateFormatModes,
      handleDateFormatModeChange,
      languages,
      moveNotationData,
      waysToMoveData,
      titleBarData,
    ],
  );

  const filteredSettings = useMemo(() => {
    if (!search.trim()) return null;

    const searchTerm = search.toLowerCase();
    return allSettings.filter(
      (setting) =>
        setting.title.toLowerCase().includes(searchTerm) || setting.description.toLowerCase().includes(searchTerm),
    );
  }, [search, allSettings]);

  const settingsByTab = useMemo(() => {
    const grouped: Record<string, SettingItem[]> = {};
    allSettings.forEach((setting) => {
      if (!grouped[setting.tab]) {
        grouped[setting.tab] = [];
      }
      grouped[setting.tab].push(setting);
    });
    return grouped;
  }, [allSettings]);

  const filteredSettingsByTab = useMemo(() => {
    if (!filteredSettings) return {};

    const grouped: Record<string, SettingItem[]> = {};
    filteredSettings.forEach((setting) => {
      if (!grouped[setting.tab]) {
        grouped[setting.tab] = [];
      }
      grouped[setting.tab].push(setting);
    });
    return grouped;
  }, [filteredSettings]);

  const tabInfo = {
    board: { title: t("settings.board.title"), desc: t("settings.board.desc") },
    inputs: { title: t("settings.inputs.title"), desc: t("settings.inputs.desc") },
    anarchy: { title: t("settings.anarchy.title"), desc: t("settings.anarchy.desc") },
    report: { title: t("settings.openingReport.title"), desc: t("settings.openingReport.desc") },
    appearance: { title: t("settings.appearance.title"), desc: t("settings.appearance.desc") },
    sound: { title: t("settings.sound.title"), desc: t("settings.sound.desc") },
    directories: { title: t("settings.directories.title"), desc: t("settings.directories.desc") },
  };

  const tabConfig = [
    {
      value: "board",
      icon: <IconChess size="1rem" />,
      label: t("settings.board.title"),
      header: t("settings.gameplay"),
    },
    { value: "inputs", icon: <IconMouse size="1rem" />, label: t("settings.inputs.title") },
    { value: "anarchy", icon: <IconFlag size="1rem" />, label: t("settings.anarchy.title") },
    {
      value: "report",
      icon: <IconBook size="1rem" />,
      label: t("settings.openingReport.title"),
      header: t("settings.analysis"),
    },
    {
      value: "appearance",
      icon: <IconBrush size="1rem" />,
      label: t("settings.appearance.title"),
      header: t("settings.interface"),
    },
    { value: "sound", icon: <IconVolume size="1rem" />, label: t("settings.sound.title") },
    {
      value: "directories",
      icon: <IconFolder size="1rem" />,
      label: t("settings.directories.title"),
      header: t("settings.system"),
    },
  ];

  const renderTabs = (withHeaders: boolean = false) => {
    const elements: React.ReactNode[] = [];
    let currentHeader: string | undefined;

    tabConfig.forEach((tab) => {
      // Add header if it exists and we're rendering with headers
      if (withHeaders && tab.header && tab.header !== currentHeader) {
        elements.push(
          <Text key={`header-${tab.value}`} c="dimmed" size="sm" pl="lg" mt={currentHeader ? "md" : 0}>
            {tab.header}
          </Text>,
        );
        currentHeader = tab.header;
      }

      // Add tab
      elements.push(
        <Tabs.Tab
          key={tab.value}
          value={tab.value}
          leftSection={tab.icon}
          classNames={
            withHeaders
              ? {
                  tab: classes.tabItem,
                  tabLabel: classes.tabLabel,
                }
              : undefined
          }
        >
          {tab.label}
        </Tabs.Tab>,
      );
    });

    return <>{elements}</>;
  };

  const renderTabPanels = () => (
    <>
      {tabConfig.map((tab) => (
        <Tabs.Panel key={tab.value} value={tab.value}>
          {renderTabContent(tab.value, settingsByTab[tab.value as keyof typeof settingsByTab] || [])}
        </Tabs.Panel>
      ))}
    </>
  );

  const renderTabContent = (tabId: string, settings: SettingItem[]) => (
    <>
      <Title order={layout.settings.layoutType === "mobile" ? 2 : 1} fw={500} className={classes.title}>
        {tabInfo[tabId as keyof typeof tabInfo]?.title}
      </Title>
      <Text size="sm" c="dimmed" mt={3} mb="lg">
        {tabInfo[tabId as keyof typeof tabInfo]?.desc}
      </Text>
      <Stack gap="md">
        {settings.map((setting) => (
          <div key={setting.id}>{setting.component}</div>
        ))}
      </Stack>
    </>
  );

  return (
    <Box h="100%" style={{ overflow: "hidden" }}>
      <Title order={1} fw={500} p={{ base: "md", sm: "lg" }} className={classes.title}>
        {t("features.sidebar.settings")}
      </Title>
      <TextInput
        placeholder={t("settings.searchPlaceholder")}
        size="xs"
        mb="lg"
        px={{ base: "md", sm: "lg" }}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        visibleFrom="sm"
      />
      {filteredSettings ? (
        <Box h="calc(100vh - 170px)" style={{ overflow: "hidden" }}>
          <ScrollArea h="100%">
            <Card className={classes.card} w="100%" pl="lg" pr="xl">
              {Object.entries(filteredSettingsByTab).map(([tabId, settings]) => (
                <div key={tabId}>
                  <Title order={2} fw={500} mt="xl" mb="md">
                    {tabInfo[tabId as keyof typeof tabInfo]?.title} ({settings.length} result
                    {settings.length !== 1 ? "s" : ""})
                  </Title>
                  {settings.map((setting) => (
                    <div key={setting.id}>{setting.component}</div>
                  ))}
                </div>
              ))}
              {filteredSettings.length === 0 && (
                <Text c="dimmed" ta="center" py="xl">
                  {t("settings.noResultsFound")} "{search}"
                </Text>
              )}
            </Card>
          </ScrollArea>
        </Box>
      ) : (
        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab(value || "board")}
          orientation={layout.settings.layoutType === "mobile" ? "horizontal" : "vertical"}
          h="100%"
        >
          {layout.settings.layoutType === "mobile" ? (
            <ScrollArea scrollbarSize={0} scrollbars="x" type="auto" style={{ overflowX: "auto" }}>
              <Tabs.List
                variant="pills"
                mb="md"
                style={{
                  flexWrap: "nowrap",
                  minWidth: "max-content",
                  width: "max-content",
                }}
              >
                {renderTabs(false)}
              </Tabs.List>
            </ScrollArea>
          ) : (
            <Tabs.List w={160}>{renderTabs(true)}</Tabs.List>
          )}
          {layout.settings.layoutType === "mobile" ? (
            <ScrollArea h="calc(100vh - 210px)">
              <Box p="md" pt="0px">
                {renderTabPanels()}
              </Box>
            </ScrollArea>
          ) : (
            <Stack flex={1}>
              <ScrollArea h="calc(100vh - 170px)">
                <Card className={classes.card} w="100%" pl="lg" pr="xl">
                  {renderTabPanels()}
                </Card>
              </ScrollArea>
            </Stack>
          )}
        </Tabs>
      )}
    </Box>
  );
}
