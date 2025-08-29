import { Box, Card, Group, ScrollArea, Select, Stack, Tabs, Text, TextInput, Title, useDirection } from "@mantine/core";
import { IconBook, IconBrush, IconChess, IconFlag, IconFolder, IconMouse, IconVolume } from "@tabler/icons-react";
import { useLoaderData } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import FileInput from "@/common/components/FileInput";
import {
  autoPromoteAtom,
  autoSaveAtom,
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
  showConsecutiveArrowsAtom,
  showCoordinatesAtom,
  showDestsAtom,
  snapArrowsAtom,
  spellCheckAtom,
  storedDocumentDirAtom,
} from "@/state/atoms";
import { ThemeSettings } from "@/themes";
import { computedThemeAtom } from "@/themes/state";
import type { ThemeDefinition } from "@/themes/types";
import { hasTranslatedPieceChars } from "@/utils/format";
import BoardSelect from "./components/BoardSelect";
import ColorControl from "./components/ColorControl";
import FontSizeSlider from "./components/FontSizeSlider";
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
  const { setDirection, dir } = useDirection();
  const [search, setSearch] = useState("");

  console.log(dir);

  const [isNative, setIsNative] = useAtom(nativeBarAtom);
  const {
    dirs: { documentDir },
  } = useLoaderData({ from: "/settings" });
  let [filesDirectory, setFilesDirectory] = useAtom(storedDocumentDirAtom);
  filesDirectory = filesDirectory || documentDir;

  const [moveMethod, setMoveMethod] = useAtom(moveMethodAtom);
  const [moveNotationType, setMoveNotationType] = useAtom(moveNotationTypeAtom);
  const [computedTheme] = useAtom<ThemeDefinition | null>(computedThemeAtom);
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
      // Not sure why it's an exception in the init of our i18n. But to produce the same list I'll normalize it
      const normalizedCode = localeCode === "en" ? "en_US" : localeCode;
      // Load label from specific namespace, in the other language resource.
      // Would avoid having to load full files if all the translations weren't all already loaded in memory
      langs.push({ value: normalizedCode, label: t("language:DisplayName", { lng: normalizedCode }) });
    }
    langs.sort((a, b) => a.label.localeCompare(b.label));
    return langs;
  }, [t, i18n.services.resourceStore.data]);

  const dateFormatModes = useMemo(
    () => [
      { value: "intl", label: t("Settings.Appearance.DateFormat.International") },
      { value: "locale", label: t("Settings.Appearance.DateFormat.Locale") },
    ],
    [t],
  );

  const moveNotationData = useMemo(() => {
    const data = [
      { label: t("Settings.MoveNotation.Symbols"), value: "symbols" },
      { label: t("Settings.MoveNotation.Letters"), value: "letters" },
    ];

    if (hasTranslatedPieceChars(i18n)) {
      data.push({ label: t("Settings.MoveNotation.TranslatedLetters"), value: "letters-translated" });
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
      { label: t("Settings.WaysToMovePieces.Drag"), value: "drag" },
      { label: t("Settings.WaysToMovePieces.Click"), value: "select" },
      { label: t("Settings.WaysToMovePieces.Both"), value: "both" },
    ],
    [t],
  );

  const titleBarData = useMemo(
    () => [t("Settings.Appearance.TitleBar.Native"), t("Settings.Appearance.TitleBar.Custom")],
    [t],
  );

  const allSettings = useMemo(
    (): SettingItem[] => [
      {
        id: "piece-dest",
        title: t("Settings.PieceDest"),
        description: t("Settings.PieceDest.Desc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.PieceDest")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.PieceDest.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={showDestsAtom} />
          </Group>
        ),
      },
      {
        id: "move-notation",
        title: t("Settings.MoveNotation"),
        description: t("Settings.MoveNotation.Desc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.MoveNotation")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.MoveNotation.Desc")}
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
        title: t("Settings.WaysToMovePieces"),
        description: t("Settings.WaysToMovePieces.Desc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.WaysToMovePieces")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.WaysToMovePieces.Desc")}
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
        title: t("Settings.SnapArrows"),
        description: t("Settings.SnapArrows.Desc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.SnapArrows")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.SnapArrows.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={snapArrowsAtom} />
          </Group>
        ),
      },
      {
        id: "consecutive-arrows",
        title: t("Settings.ConsecutiveArrows"),
        description: t("Settings.ConsecutiveArrows.Desc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.ConsecutiveArrows")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.ConsecutiveArrows.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={showConsecutiveArrowsAtom} />
          </Group>
        ),
      },
      {
        id: "erase-drawables",
        title: t("Settings.EraseDrawablesOnClick"),
        description: t("Settings.EraseDrawablesOnClick.Desc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.EraseDrawablesOnClick")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.EraseDrawablesOnClick.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={eraseDrawablesOnClickAtom} />
          </Group>
        ),
      },
      {
        id: "auto-promotion",
        title: t("Settings.AutoPromition"),
        description: t("Settings.AutoPromition.Desc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.AutoPromition")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.AutoPromition.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={autoPromoteAtom} />
          </Group>
        ),
      },
      {
        id: "coordinates",
        title: t("Settings.Coordinates"),
        description: t("Settings.Coordinates.Desc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Coordinates")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Coordinates.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={showCoordinatesAtom} />
          </Group>
        ),
      },
      {
        id: "auto-save",
        title: t("Settings.AutoSave"),
        description: t("Settings.AutoSave.Desc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.AutoSave")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.AutoSave.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={autoSaveAtom} />
          </Group>
        ),
      },
      {
        id: "preview-board",
        title: t("Settings.PreviewBoard"),
        description: t("Settings.PreviewBoard.Desc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.PreviewBoard")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.PreviewBoard.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={previewBoardOnHoverAtom} />
          </Group>
        ),
      },
      {
        id: "board-scroll",
        title: t("Settings.ScrollThroughMoves"),
        description: t("Settings.ScrollThroughMoves.Desc"),
        tab: "board",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.ScrollThroughMoves")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.ScrollThroughMoves.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={enableBoardScrollAtom} />
          </Group>
        ),
      },
      {
        id: "text-input",
        title: t("Settings.Inputs.TextInput"),
        description: t("Settings.Inputs.TextInput.Desc"),
        tab: "inputs",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Inputs.TextInput")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Inputs.TextInput.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={moveInputAtom} />
          </Group>
        ),
      },
      {
        id: "spell-check",
        title: t("Settings.Inputs.SpellCheck"),
        description: t("Settings.Inputs.SpellCheck.Desc"),
        tab: "inputs",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Inputs.SpellCheck")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Inputs.SpellCheck.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={spellCheckAtom} />
          </Group>
        ),
      },
      {
        id: "forced-en-passant",
        title: t("Settings.Anarchy.ForcedEnPassant"),
        description: t("Settings.Anarchy.ForcedEnPassant.Desc"),
        tab: "anarchy",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Anarchy.ForcedEnPassant")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Anarchy.ForcedEnPassant.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={forcedEnPassantAtom} />
          </Group>
        ),
      },
      {
        id: "percent-coverage",
        title: t("Settings.OpeningReport.PercentCoverage"),
        description: t("Settings.OpeningReport.PercentCoverage.Desc"),
        tab: "report",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.OpeningReport.PercentCoverage")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.OpeningReport.PercentCoverage.Desc")}
              </Text>
            </div>
            <SettingsNumberInput atom={percentageCoverageAtom} min={50} max={100} step={1} />
          </Group>
        ),
      },
      {
        id: "min-games",
        title: t("Settings.OpeningReport.MinGames"),
        description: t("Settings.OpeningReport.MinGames.Desc"),
        tab: "report",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.OpeningReport.MinGames")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.OpeningReport.MinGames.Desc")}
              </Text>
            </div>
            <SettingsNumberInput atom={minimumGamesAtom} min={0} step={1} />
          </Group>
        ),
      },
      {
        id: "theme",
        title: t("Settings.Appearance.Theme"),
        description: t("Settings.Appearance.Theme.Desc"),
        tab: "appearance",
        component: <ThemeSettings />,
      },
      {
        id: "accent-color",
        title: t("Settings.Appearance.AccentColor"),
        description: t("Settings.Appearance.AccentColor.Desc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Appearance.AccentColor")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Appearance.AccentColor.Desc")}
              </Text>
            </div>
            <div>
              <ColorControl
                disabled={computedTheme?.name !== "classic-light" && computedTheme?.name !== "classic-dark"}
              />
            </div>
          </Group>
        ),
      },
      {
        id: "language",
        title: t("Settings.Appearance.Language"),
        description: t("Settings.Appearance.Language.Desc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Appearance.Language")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Appearance.Language.Desc")}
              </Text>
            </div>
            <Select
              allowDeselect={false}
              data={languages}
              value={i18n.language}
              onChange={(val) => {
                i18n.changeLanguage(val || "en_US");
                localStorage.setItem("lang", val || "en_US");

                if (val === "ar_SA") {
                  setDirection("rtl");
                } else {
                  setDirection("ltr");
                }
              }}
            />
          </Group>
        ),
      },
      {
        id: "date-format",
        title: t("Settings.Appearance.DateFormat"),
        description: t("Settings.Appearance.DateFormat.Desc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Appearance.DateFormat")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Appearance.DateFormat.Desc")}
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
        title: t("Settings.Appearance.TitleBar"),
        description: t("Settings.Appearance.TitleBar.Desc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Appearance.TitleBar")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Appearance.TitleBar.Desc")}
              </Text>
            </div>
            <Select
              allowDeselect={false}
              data={titleBarData}
              value={isNative ? t("Settings.Appearance.TitleBar.Native") : t("Settings.Appearance.TitleBar.Custom")}
              onChange={(val) => {
                setIsNative(val === t("Settings.Appearance.TitleBar.Native"));
              }}
            />
          </Group>
        ),
      },
      {
        id: "hide-dashboard",
        title: t("Settings.Appearance.hideDashboardOnStartup"),
        description: t("Settings.Appearance.hideDashboardOnStartup.Desc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Appearance.hideDashboardOnStartup")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Appearance.hideDashboardOnStartup.Desc")}
              </Text>
            </div>
            <SettingsSwitch atom={hideDashboardOnStartupAtom} />
          </Group>
        ),
      },
      {
        id: "font-size",
        title: t("Settings.Appearance.FontSize"),
        description: t("Settings.Appearance.FontSize.Desc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Appearance.FontSize")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Appearance.FontSize.Desc")}
              </Text>
            </div>
            <FontSizeSlider />
          </Group>
        ),
      },
      {
        id: "piece-set",
        title: t("Settings.Appearance.PieceSet"),
        description: t("Settings.Appearance.PieceSet.Desc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Appearance.PieceSet")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Appearance.PieceSet.Desc")}
              </Text>
            </div>
            <PiecesSelect />
          </Group>
        ),
      },
      {
        id: "board-image",
        title: t("Settings.Appearance.BoardImage"),
        description: t("Settings.Appearance.BoardImage.Desc"),
        tab: "appearance",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Appearance.BoardImage")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Appearance.BoardImage.Desc")}
              </Text>
            </div>
            <BoardSelect />
          </Group>
        ),
      },
      {
        id: "volume",
        title: t("Settings.Sound.Volume"),
        description: t("Settings.Sound.Volume.Desc"),
        tab: "sound",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Sound.Volume")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Sound.Volume.Desc")}
              </Text>
            </div>
            <VolumeSlider />
          </Group>
        ),
      },
      {
        id: "sound-collection",
        title: t("Settings.Sound.Collection"),
        description: t("Settings.Sound.Collection.Desc"),
        tab: "sound",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Sound.Collection")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Sound.Collection.Desc")}
              </Text>
            </div>
            <SoundSelect />
          </Group>
        ),
      },
      {
        id: "files-directory",
        title: t("Settings.Directories.Files"),
        description: t("Settings.Directories.Files.Desc"),
        tab: "directories",
        component: (
          <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
            <div>
              <Text>{t("Settings.Directories.Files")}</Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Directories.Files.Desc")}
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
              }}
              filename={filesDirectory || null}
            />
          </Group>
        ),
      },
      {
        id: "telemetry",
        title: t("Settings.Telemetry"),
        description: t("Settings.Telemetry.Desc"),
        tab: "directories",
        component: <TelemetrySettings className={classes.item} />,
      },
    ],
    [
      t,
      i18n.language,
      i18n.changeLanguage,
      isNative,
      setIsNative,
      moveMethod,
      setMoveMethod,
      validatedMoveNotationType,
      setMoveNotationType,
      filesDirectory,
      setFilesDirectory,
      computedTheme,
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
    board: { title: t("Settings.Board"), desc: t("Settings.Board.Desc") },
    inputs: { title: t("Settings.Inputs"), desc: t("Settings.Inputs.Desc") },
    anarchy: { title: t("Settings.Anarchy"), desc: t("Settings.Anarchy.Desc") },
    report: { title: t("Settings.OpeningReport"), desc: t("Settings.OpeningReport.Desc") },
    appearance: { title: t("Settings.Appearance"), desc: t("Settings.Appearance.Desc") },
    sound: { title: t("Settings.Sound"), desc: t("Settings.Sound.Desc") },
    directories: { title: t("Settings.Directories"), desc: t("Settings.Directories.Desc") },
  };

  const renderTabContent = (tabId: string, settings: SettingItem[]) => (
    <>
      <Title order={1} fw={500} className={classes.title}>
        {tabInfo[tabId as keyof typeof tabInfo]?.title}
      </Title>
      <Text size="xs" c="dimmed" mt={3} mb="lg">
        {tabInfo[tabId as keyof typeof tabInfo]?.desc}
      </Text>
      {settings.map((setting) => (
        <div key={setting.id}>{setting.component}</div>
      ))}
    </>
  );

  return (
    <Box h="100%" style={{ overflow: "hidden" }}>
      <Title order={1} fw={500} p="lg" className={classes.title}>
        {t("Settings")}
      </Title>
      <TextInput
        placeholder={t("Settings.SearchPlaceholder")}
        size="xs"
        mb="lg"
        px="lg"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
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
                  {t("Settings.NoResultsFound")} "{search}"
                </Text>
              )}
            </Card>
          </ScrollArea>
        </Box>
      ) : (
        <Tabs defaultValue="board" orientation="vertical" h="100%">
          <Tabs.List>
            <Text c="dimmed" size="sm" pl="lg">
              {t("Settings.Gameplay")}
            </Text>
            <Tabs.Tab
              value="board"
              leftSection={<IconChess size="1rem" />}
              classNames={{
                tab: classes.tabItem,
                tabLabel: classes.tabLabel,
              }}
            >
              {t("Settings.Board")}
            </Tabs.Tab>
            <Tabs.Tab
              value="inputs"
              leftSection={<IconMouse size="1rem" />}
              classNames={{
                tab: classes.tabItem,
                tabLabel: classes.tabLabel,
              }}
            >
              {t("Settings.Inputs")}
            </Tabs.Tab>
            <Tabs.Tab
              value="anarchy"
              leftSection={<IconFlag size="1rem" />}
              classNames={{
                tab: classes.tabItem,
                tabLabel: classes.tabLabel,
              }}
            >
              {t("Settings.Anarchy")}
            </Tabs.Tab>
            <Text c="dimmed" size="sm" mt="md" pl="lg">
              {t("Settings.Analysis")}
            </Text>
            <Tabs.Tab
              value="report"
              leftSection={<IconBook size="1rem" />}
              classNames={{
                tab: classes.tabItem,
                tabLabel: classes.tabLabel,
              }}
            >
              {t("Settings.OpeningReport")}
            </Tabs.Tab>
            <Text c="dimmed" size="sm" mt="md" pl="lg">
              {t("Settings.Interface")}
            </Text>
            <Tabs.Tab
              value="appearance"
              leftSection={<IconBrush size="1rem" />}
              classNames={{
                tab: classes.tabItem,
                tabLabel: classes.tabLabel,
              }}
            >
              {t("Settings.Appearance")}
            </Tabs.Tab>
            <Tabs.Tab
              value="sound"
              leftSection={<IconVolume size="1rem" />}
              classNames={{
                tab: classes.tabItem,
                tabLabel: classes.tabLabel,
              }}
            >
              {t("Settings.Sound")}
            </Tabs.Tab>
            <Text c="dimmed" size="sm" mt="md" pl="lg">
              System
            </Text>
            <Tabs.Tab
              value="directories"
              leftSection={<IconFolder size="1rem" />}
              classNames={{
                tab: classes.tabItem,
                tabLabel: classes.tabLabel,
              }}
            >
              {t("Settings.Directories")}
            </Tabs.Tab>
          </Tabs.List>
          <Stack flex={1}>
            <ScrollArea h="calc(100vh - 170px)">
              <Card className={classes.card} w="100%" pl="lg" pr="xl">
                <Tabs.Panel value="board">{renderTabContent("board", settingsByTab.board || [])}</Tabs.Panel>

                <Tabs.Panel value="inputs">{renderTabContent("inputs", settingsByTab.inputs || [])}</Tabs.Panel>

                <Tabs.Panel value="anarchy">{renderTabContent("anarchy", settingsByTab.anarchy || [])}</Tabs.Panel>

                <Tabs.Panel value="report">{renderTabContent("report", settingsByTab.report || [])}</Tabs.Panel>

                <Tabs.Panel value="appearance">
                  {renderTabContent("appearance", settingsByTab.appearance || [])}
                </Tabs.Panel>

                <Tabs.Panel value="sound">{renderTabContent("sound", settingsByTab.sound || [])}</Tabs.Panel>

                <Tabs.Panel value="directories">
                  {renderTabContent("directories", settingsByTab.directories || [])}
                </Tabs.Panel>
              </Card>
            </ScrollArea>
          </Stack>
        </Tabs>
      )}
    </Box>
  );
}
