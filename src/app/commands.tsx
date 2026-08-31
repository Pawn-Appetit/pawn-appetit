import type { SpotlightActionData, SpotlightActionGroupData } from "@mantine/spotlight";
import {
  IconCamera,
  IconChartLine,
  IconChess,
  IconClipboard,
  IconCopy,
  IconDatabaseSearch,
  IconDeviceFloppy,
  IconFileExport,
  IconFileImport,
  IconLayoutSidebar,
  IconPlayerPause,
  IconPlayerPlay,
  IconPuzzle,
  IconReload,
  IconRotateClockwise,
  IconSearch,
  IconSettings,
  IconSwitchVertical,
  IconTarget,
  IconTrash,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import type { NavigateFn } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import type { KeyDef } from "@/state/keybindings";
import { appNavigationItems, type AppNavigationItem } from "./navigation";

export type CommandContext = {
  navigate: NavigateFn;
  t: TFunction;
  keyMap: Record<string, KeyDef>;
  hasActiveTab: boolean;
  hasBoardTab: boolean;
  engineRunning: boolean;
  openImport: (source?: "PGN" | "FEN" | "Link") => void;
  createNewTab: () => void;
  createPlayTab: () => void;
  createAnalysisTab: () => void;
  createPuzzleTab: () => void;
  closeCurrentTab: () => void;
  closeOtherTabs: () => void;
  saveCurrentGame?: () => void;
  copyPgn?: () => void;
  copyFen?: () => void;
  flipBoard?: () => void;
  clearBoardAnnotations?: () => void;
  setupBoard?: () => void;
  takeSnapshot?: () => void;
  toggleEngine?: () => void;
  stopEngine?: () => void;
  resetWorkspaceLayout?: () => void;
};

export type AppCommand = {
  id: string;
  kind?: "navigation" | "action";
  group:
    | "Navigation"
    | "Game and File Actions"
    | "Board Actions"
    | "Engine Actions"
    | "Workspace Actions"
    | "Training Actions";
  label: string;
  description?: string;
  aliases?: string[];
  shortcut?: string;
  disabledReason?: string;
  menuPath?: string[];
  icon: Icon;
  disabled?: boolean;
  action: () => void;
};

export type CommandMenuAction = {
  id?: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  action?: () => void;
};

export type CommandMenuGroup = {
  label: string;
  options: CommandMenuAction[];
};

const commandIcon = (IconComponent: Icon): ReactNode => <IconComponent size={20} stroke={1.6} />;

const navLabelFallbacks: Record<AppNavigationItem["id"], string> = {
  accounts: "Accounts",
  dashboard: "Dashboard",
  analysis: "Analysis",
  games: "Games",
  databases: "Databases",
  openings: "Openings",
  repertoire: "Repertoire",
  training: "Training",
  engines: "Engines",
  files: "Files",
  settings: "Settings",
};

export function buildAppCommands(ctx: CommandContext): AppCommand[] {
  const navCommands: AppCommand[] = appNavigationItems.map((item) => {
    const label = ctx.t(item.labelKey, navLabelFallbacks[item.id]);

    return {
      id: `nav.${item.id}`,
      kind: "navigation",
      group: "Navigation",
      label,
      description: ctx.t("commands.navigation.openPage", {
        defaultValue: `Open ${label}`,
        page: label,
      }),
      aliases: [item.id, item.url.replace("/", "")],
      menuPath: [ctx.t("features.menu.go")],
      icon: item.icon,
      action: () => ctx.navigate({ to: item.url }),
    };
  });

  return [
    ...navCommands,
    {
      id: "game.newTab",
      kind: "action",
      group: "Game and File Actions",
      label: ctx.t("features.menu.newTab"),
      shortcut: ctx.keyMap.NEW_BOARD_TAB.keys,
      menuPath: [ctx.t("features.menu.file")],
      icon: IconChess,
      action: ctx.createNewTab,
    },
    {
      id: "game.importPgn",
      kind: "action",
      group: "Game and File Actions",
      label: ctx.t("features.menu.importPgn"),
      shortcut: ctx.keyMap.IMPORT_BOARD.keys,
      aliases: ["load pgn", "paste pgn"],
      menuPath: [ctx.t("features.menu.file")],
      icon: IconFileImport,
      action: () => ctx.openImport("PGN"),
    },
    {
      id: "game.importFen",
      kind: "action",
      group: "Game and File Actions",
      label: ctx.t("commands.importFen", "Import FEN"),
      aliases: ["position", "fen"],
      menuPath: [ctx.t("features.menu.file")],
      icon: IconClipboard,
      action: () => ctx.openImport("FEN"),
    },
    {
      id: "game.importUrl",
      kind: "action",
      group: "Game and File Actions",
      label: ctx.t("commands.importUrl", "Import from URL"),
      aliases: ["lichess", "chess.com", "link"],
      menuPath: [ctx.t("features.menu.file")],
      icon: IconFileImport,
      action: () => ctx.openImport("Link"),
    },
    {
      id: "game.save",
      kind: "action",
      group: "Game and File Actions",
      label: ctx.t("keybindings.saveFile"),
      shortcut: ctx.keyMap.SAVE_FILE.keys,
      disabled: !ctx.hasBoardTab || !ctx.saveCurrentGame,
      disabledReason: ctx.t("commands.disabled.noActiveBoard", "Open a board tab first"),
      menuPath: [ctx.t("features.menu.file")],
      icon: IconDeviceFloppy,
      action: () => ctx.saveCurrentGame?.(),
    },
    {
      id: "game.exportPgn",
      kind: "action",
      group: "Game and File Actions",
      label: ctx.t("keybindings.exportGame"),
      shortcut: ctx.keyMap.EXPORT_GAME.keys,
      disabled: !ctx.hasBoardTab || !ctx.saveCurrentGame,
      disabledReason: ctx.t("commands.disabled.noActiveBoard", "Open a board tab first"),
      menuPath: [ctx.t("features.menu.file")],
      icon: IconFileExport,
      action: () => ctx.saveCurrentGame?.(),
    },
    {
      id: "game.copyPgn",
      group: "Game and File Actions",
      label: ctx.t("keybindings.copyPgn"),
      shortcut: ctx.keyMap.COPY_PGN.keys,
      disabled: !ctx.hasBoardTab || !ctx.copyPgn,
      icon: IconCopy,
      action: () => ctx.copyPgn?.(),
    },
    {
      id: "game.copyFen",
      group: "Game and File Actions",
      label: ctx.t("keybindings.copyFen"),
      shortcut: ctx.keyMap.COPY_FEN.keys,
      disabled: !ctx.hasBoardTab || !ctx.copyFen,
      icon: IconCopy,
      action: () => ctx.copyFen?.(),
    },
    {
      id: "game.closeCurrentTab",
      kind: "action",
      group: "Game and File Actions",
      label: ctx.t("features.menu.closeTab"),
      shortcut: ctx.keyMap.CLOSE_BOARD_TAB.keys,
      disabled: !ctx.hasActiveTab,
      disabledReason: ctx.t("commands.disabled.noOpenTab", "No open tab"),
      menuPath: [ctx.t("features.menu.window")],
      icon: IconX,
      action: ctx.closeCurrentTab,
    },
    {
      id: "game.closeOtherTabs",
      kind: "action",
      group: "Game and File Actions",
      label: ctx.t("commands.closeOtherTabs", "Close other tabs"),
      disabled: !ctx.hasActiveTab,
      disabledReason: ctx.t("commands.disabled.noOpenTab", "No open tab"),
      menuPath: [ctx.t("features.menu.window")],
      icon: IconTrash,
      action: ctx.closeOtherTabs,
    },
    {
      id: "board.flip",
      kind: "action",
      group: "Board Actions",
      label: ctx.t("keybindings.flipBoard"),
      shortcut: ctx.keyMap.FLIP_BOARD.keys,
      disabled: !ctx.hasBoardTab || !ctx.flipBoard,
      disabledReason: ctx.t("commands.disabled.noActiveBoard", "Open a board tab first"),
      icon: IconSwitchVertical,
      action: () => ctx.flipBoard?.(),
    },
    {
      id: "board.clearAnnotations",
      group: "Board Actions",
      label: ctx.t("keybindings.clearShapes"),
      shortcut: ctx.keyMap.CLEAR_SHAPES.keys,
      disabled: !ctx.hasBoardTab || !ctx.clearBoardAnnotations,
      icon: IconReload,
      action: () => ctx.clearBoardAnnotations?.(),
    },
    {
      id: "board.setup",
      group: "Board Actions",
      label: ctx.t("keybindings.setupPosition"),
      shortcut: ctx.keyMap.SETUP_POSITION.keys,
      disabled: !ctx.hasBoardTab || !ctx.setupBoard,
      icon: IconSettings,
      action: () => ctx.setupBoard?.(),
    },
    {
      id: "board.snapshot",
      group: "Board Actions",
      label: ctx.t("features.board.actions.takeSnapshot"),
      disabled: !ctx.hasBoardTab || !ctx.takeSnapshot,
      icon: IconCamera,
      action: () => ctx.takeSnapshot?.(),
    },
    {
      id: "board.searchPosition",
      group: "Board Actions",
      label: ctx.t("commands.searchCurrentPosition", "Search current position"),
      shortcut: ctx.keyMap.FIND_POSITION.keys,
      disabled: !ctx.hasBoardTab,
      icon: IconDatabaseSearch,
      action: () => ctx.navigate({ to: "/databases" }),
    },
    {
      id: "engine.toggle",
      group: "Engine Actions",
      label: ctx.engineRunning
        ? ctx.t("commands.stopEngine", "Stop engine")
        : ctx.t("commands.startEngine", "Start engine"),
      shortcut: ctx.keyMap.TOGGLE_ENGINE.keys,
      disabled: !ctx.hasBoardTab || !ctx.toggleEngine,
      icon: ctx.engineRunning ? IconPlayerPause : IconPlayerPlay,
      action: () => ctx.toggleEngine?.(),
    },
    {
      id: "engine.stop",
      group: "Engine Actions",
      label: ctx.t("keybindings.stopEngine"),
      shortcut: ctx.keyMap.STOP_ENGINE.keys,
      disabled: !ctx.engineRunning || !ctx.stopEngine,
      icon: IconPlayerPause,
      action: () => ctx.stopEngine?.(),
    },
    {
      id: "engine.manage",
      group: "Engine Actions",
      label: ctx.t("features.engines.title"),
      aliases: ["select engine", "engine settings"],
      icon: IconSettings,
      action: () => ctx.navigate({ to: "/engines" }),
    },
    {
      id: "workspace.resetLayout",
      group: "Workspace Actions",
      label: ctx.t("commands.resetWorkspaceLayout", "Reset workspace layout"),
      disabled: !ctx.resetWorkspaceLayout,
      icon: IconRotateClockwise,
      action: () => ctx.resetWorkspaceLayout?.(),
    },
    {
      id: "workspace.focusBoard",
      group: "Workspace Actions",
      label: ctx.t("keybindings.focusBoard"),
      shortcut: ctx.keyMap.FOCUS_BOARD.keys,
      disabled: !ctx.hasBoardTab,
      icon: IconLayoutSidebar,
      action: () => document.getElementById("board")?.focus(),
    },
    {
      id: "training.continue",
      kind: "action",
      group: "Training Actions",
      label: ctx.t("commands.continueTraining", "Continue training"),
      aliases: ["resume practice", "continue practice"],
      icon: IconTarget,
      action: () => ctx.navigate({ to: "/train/practice", search: { category: undefined } }),
    },
    {
      id: "training.puzzles",
      group: "Training Actions",
      label: ctx.t("features.sidebar.quickPuzzles"),
      shortcut: ctx.keyMap.TRAIN_BOARD.keys,
      icon: IconPuzzle,
      action: ctx.createPuzzleTab,
    },
    {
      id: "training.repertoire",
      group: "Training Actions",
      label: ctx.t("commands.startRepertoireTraining", "Start repertoire training"),
      icon: IconChartLine,
      action: () => ctx.navigate({ to: "/train" }),
    },
    {
      id: "training.mistakes",
      kind: "action",
      group: "Training Actions",
      label: ctx.t("commands.startMistakeTraining", "Start mistake training"),
      disabled: true,
      disabledReason: ctx.t("commands.disabled.notAvailableYet", "Not available yet"),
      icon: IconSearch,
      action: () => undefined,
    },
  ];
}

export function commandsToMenuGroups(
  commands: AppCommand[],
  formatShortcut: (shortcut: string) => string,
): CommandMenuGroup[] {
  const groups = new Map<string, CommandMenuAction[]>();

  for (const command of commands) {
    const menuLabel = command.menuPath?.[0];
    if (!menuLabel) continue;

    const option: CommandMenuAction = {
      id: command.id,
      label: command.label,
      shortcut: command.shortcut ? formatShortcut(command.shortcut) : undefined,
      disabled: command.disabled,
      action: command.disabled ? undefined : command.action,
    };

    groups.set(menuLabel, [...(groups.get(menuLabel) ?? []), option]);
  }

  return Array.from(groups.entries()).map(([label, options]) => ({ label, options }));
}

export function commandsToSpotlightActions(
  commands: AppCommand[],
): (SpotlightActionGroupData | SpotlightActionData)[] {
  const groups = new Map<AppCommand["group"], SpotlightActionData[]>();

  for (const command of commands) {
    if (command.disabled) continue;
    const action: SpotlightActionData = {
      id: command.id,
      label: command.label,
      description: command.description ?? command.aliases?.join(" · "),
      keywords: command.aliases,
      leftSection: commandIcon(command.icon),
      rightSection: command.shortcut,
      onClick: command.action,
    };

    groups.set(command.group, [...(groups.get(command.group) ?? []), action]);
  }

  return Array.from(groups.entries()).map(([group, actions]) => ({ group, actions }));
}
