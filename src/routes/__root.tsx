import { AppShell } from "@mantine/core";
import { type HotkeyItem, useHotkeys } from "@mantine/hooks";
import { ModalsProvider, modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { spotlight } from "@mantine/spotlight";
import { useQuery } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useNavigate } from "@tanstack/react-router";
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { appLogDir, resolve } from "@tauri-apps/api/path";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ask, message, open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { exit, relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import type { Dirs } from "@/App";
import AboutModal from "@/components/About";
import { SideBar } from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import ImportModal from "@/features/boards/components/ImportModal";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import { openFile } from "@/utils/files";
import { formatHotkeyDisplay } from "@/utils/formatHotkey";
import { createTab } from "@/utils/tabs";

type MenuGroup = {
  label: string;
  options: MenuAction[];
};

type MenuAction = {
  id?: string;
  label: string;
  shortcut?: string;
  action?: () => void;
};

const INPUT_ELEMENT_TAGS = new Set(["INPUT", "TEXTAREA"]);
const CLIPBOARD_OPERATIONS = {
  CUT: "cut",
  COPY: "copy",
  PASTE: "paste",
  SELECT_ALL: "selectAll",
} as const;

const APP_CONSTANTS = {
  NAVBAR_WIDTH: "3rem",
  HEADER_HEIGHT: "35px",
  LOG_FILENAME: "pawn-appetit.log",
} as const;

const isInputElement = (element: Element): element is HTMLInputElement | HTMLTextAreaElement => {
  return INPUT_ELEMENT_TAGS.has(element.tagName);
};

const getSelectedText = (element: HTMLInputElement | HTMLTextAreaElement): string => {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  return element.value.substring(start, end);
};

const replaceSelection = (element: HTMLInputElement | HTMLTextAreaElement, newText: string): void => {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  const currentValue = element.value;

  element.value = currentValue.substring(0, start) + newText + currentValue.substring(end);
  element.setSelectionRange(start + newText.length, start + newText.length);

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const writeToClipboard = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error("Failed to write to clipboard:", error);
    throw error;
  }
};

const readFromClipboard = async (): Promise<string> => {
  try {
    return await navigator.clipboard.readText();
  } catch (error) {
    console.error("Failed to read from clipboard:", error);
    throw error;
  }
};

async function createMenu(menuActions: MenuGroup[]): Promise<Menu> {
  try {
    const items = await Promise.all(
      menuActions.map(async (group) => {
        const submenuItems = await Promise.all(
          group.options.map(async (option) => {
            return match(option.label)
              .with("divider", () =>
                PredefinedMenuItem.new({
                  item: "Separator",
                }),
              )
              .otherwise(() => {
                return MenuItem.new({
                  id: option.id,
                  text: option.label,
                  accelerator: option.shortcut,
                  action: option.action,
                });
              });
          }),
        );

        return Submenu.new({
          text: group.label,
          items: submenuItems,
        });
      }),
    );

    return Menu.new({ items });
  } catch (error) {
    console.error("Failed to create menu:", error);
    throw error;
  }
}

export const Route = createRootRouteWithContext<{
  loadDirs: () => Promise<Dirs>;
}>()({
  component: RootLayout,
});

function RootLayout() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();

  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);
  const [keyMap] = useAtom(keyMapAtom);

  const openNewFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "PGN file", extensions: ["pgn"] }],
      });

      if (typeof selected === "string") {
        navigate({ to: "/" });
        openFile(selected, setTabs, setActiveTab);
      }
    } catch (error) {
      console.error("Failed to open file:", error);
      notifications.show({
        title: t("common.error"),
        message: t("notifications.failedToOpenFile"),
        color: "red",
      });
    }
  }, [navigate, setActiveTab, setTabs, t]);

  const createNewTab = useCallback(() => {
    navigate({ to: "/boards" });
    createTab({
      tab: { name: t("features.tabs.newTab"), type: "new" },
      setTabs,
      setActiveTab,
    });
  }, [navigate, setActiveTab, setTabs, t]);

  const checkForUpdates = useCallback(async () => {
    try {
      const update = await check();
      if (update) {
        const shouldInstall = await ask(
          `A new version (${update.version}) is available. Do you want to install it now?`,
          { title: t("notifications.newVersionAvailable") },
        );

        if (shouldInstall) {
          notifications.show({
            title: t("notifications.updating"),
            message: t("notifications.downloadingUpdate"),
            loading: true,
          });

          await update.downloadAndInstall();
          await relaunch();
        }
      } else {
        await message("You're running the latest version!");
      }
    } catch (error) {
      console.error("Update check failed:", error);
      await message("Failed to check for updates. Please try again later.");
    }
  }, [t]);

  const handleCut = useCallback(async () => {
    const activeElement = document.activeElement;

    if (activeElement && isInputElement(activeElement)) {
      const selectedText = getSelectedText(activeElement);
      if (!selectedText) return;

      try {
        await writeToClipboard(selectedText);
        replaceSelection(activeElement, "");
      } catch {
        try {
          document.execCommand(CLIPBOARD_OPERATIONS.CUT);
        } catch (execError) {
          console.error("All cut operations failed:", execError);
        }
      }
    } else {
      try {
        document.execCommand(CLIPBOARD_OPERATIONS.CUT);
      } catch (error) {
        console.error("Cut operation failed:", error);
      }
    }
  }, []);

  const handleCopy = useCallback(async () => {
    const activeElement = document.activeElement;

    if (activeElement && isInputElement(activeElement)) {
      const selectedText = getSelectedText(activeElement);
      if (selectedText) {
        try {
          await writeToClipboard(selectedText);
        } catch {
          // Silent fallback - copy operations often fail silently anyway
        }
      }
    } else {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      if (selectedText) {
        try {
          await writeToClipboard(selectedText);
        } catch {
          try {
            document.execCommand(CLIPBOARD_OPERATIONS.COPY);
          } catch (error) {
            console.error("All copy operations failed:", error);
          }
        }
      }
    }
  }, []);

  const handlePaste = useCallback(async () => {
    const activeElement = document.activeElement;

    if (activeElement && isInputElement(activeElement)) {
      try {
        const clipboardText = await readFromClipboard();
        if (clipboardText) {
          replaceSelection(activeElement, clipboardText);
        }
      } catch {
        try {
          document.execCommand(CLIPBOARD_OPERATIONS.PASTE);
        } catch (error) {
          console.error("All paste operations failed:", error);
        }
      }
    } else {
      try {
        document.execCommand(CLIPBOARD_OPERATIONS.PASTE);
      } catch (error) {
        console.error("Paste operation failed:", error);
      }
    }
  }, []);

  const handleSelectAll = useCallback(() => {
    const activeElement = document.activeElement;

    if (activeElement && isInputElement(activeElement)) {
      activeElement.select();
    } else {
      try {
        document.execCommand(CLIPBOARD_OPERATIONS.SELECT_ALL);
      } catch (error) {
        console.error("Select all operation failed:", error);
      }
    }
  }, []);

  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (!ctrlOrCmd || e.shiftKey || e.altKey) return;

      const keyActions: Record<string, () => void> = {
        x: () => {
          e.preventDefault();
          handleCut();
        },
        c: () => {
          e.preventDefault();
          handleCopy();
        },
        v: () => {
          e.preventDefault();
          handlePaste();
        },
        a: () => {
          e.preventDefault();
          handleSelectAll();
        },
      };

      const action = keyActions[e.key.toLowerCase()];
      if (action) {
        action();
      }
    },
    [handleCut, handleCopy, handlePaste, handleSelectAll],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown, true);
  }, [handleGlobalKeyDown]);

  // When the window is hidden (minimised, or another app is in focus), add a
  // CSS class that pauses all CSS animations. This prevents any running
  // @keyframes from consuming GPU time and competing with Core Audio.
  useEffect(() => {
    const handleVisibilityChange = () => {
      document.documentElement.classList.toggle("app-hidden", document.hidden);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const hotkeyBindings = useMemo(
    () =>
      [
        [keyMap.NEW_BOARD_TAB.keys, createNewTab],
        [
          keyMap.PLAY_BOARD.keys,
          () => {
            navigate({ to: "/boards" });
            createTab({
              tab: { name: "Play", type: "play" },
              setTabs,
              setActiveTab,
            });
          },
        ],
        [
          keyMap.ANALYZE_BOARD.keys,
          () => {
            navigate({ to: "/boards" });
            createTab({
              tab: { name: t("features.tabs.analysisBoard.title"), type: "analysis" },
              setTabs,
              setActiveTab,
            });
          },
        ],
        [
          keyMap.IMPORT_BOARD.keys,
          () => {
            navigate({ to: "/boards" });
            modals.openContextModal({
              modal: "importModal",
              innerProps: {},
            });
          },
        ],
        [
          keyMap.TRAIN_BOARD.keys,
          () => {
            navigate({ to: "/boards" });
            createTab({
              tab: { name: t("features.tabs.puzzle.title"), type: "puzzles" },
              setTabs,
              setActiveTab,
            });
          },
        ],
        [keyMap.OPEN_FILE.keys, openNewFile],
        [keyMap.APP_RELOAD.keys, () => location.reload()],
        [keyMap.EXIT_APP.keys, () => exit(0)],
        [keyMap.OPEN_SETTINGS.keys, () => navigate({ to: "/settings" })],
        [keyMap.SHOW_KEYBINDINGS.keys, () => navigate({ to: "/settings/keyboard-shortcuts" })],
        [keyMap.TOGGLE_HELP.keys, () => navigate({ to: "/settings/keyboard-shortcuts" })],
      ] as HotkeyItem[],
    [keyMap, createNewTab, navigate, t, setTabs, setActiveTab, openNewFile],
  );

  useHotkeys(hotkeyBindings);

  const handleClearData = useCallback(async () => {
    const confirmed = await ask(
      "This will clear all saved data including settings, tabs, and preferences. This action cannot be undone.",
      { title: t("notifications.clearAllData") },
    );

    if (confirmed) {
      try {
        localStorage.clear();
        sessionStorage.clear();
        notifications.show({
          title: t("notifications.dataCleared"),
          message: t("notifications.dataClearedMessage"),
        });
        setTimeout(() => location.reload(), 1000);
      } catch (error) {
        console.error("Failed to clear data:", error);
        notifications.show({
          title: t("common.error"),
          message: t("notifications.failedToClearData"),
          color: "red",
        });
      }
    }
  }, [t]);

  const handleOpenLogs = useCallback(async () => {
    try {
      const logDir = await appLogDir();
      const logPath = await resolve(logDir, APP_CONSTANTS.LOG_FILENAME);

      notifications.show({
        title: t("notifications.openingLogs"),
        message: `Log file: ${logPath}`,
      });

      await openPath(logPath);
    } catch (error) {
      console.error("Failed to open logs:", error);
      notifications.show({
        title: t("common.error"),
        message: t("notifications.failedToOpenLogFile"),
        color: "red",
      });
    }
  }, [t]);

  const handleAbout = useCallback(() => {
    modals.openContextModal({
      modal: "aboutModal",
      title: t("notifications.aboutTitle"),
      innerProps: {},
    });
  }, [t]);

  const handleCloseTab = useCallback(() => {
    setTabs((prevTabs) => {
      const activeIndex = prevTabs.findIndex((tab) => tab.value === prevTabs.find((t) => t.value)?.value);
      if (activeIndex !== -1) {
        const newTabs = prevTabs.filter((_, i) => i !== activeIndex);
        if (newTabs.length > 0) {
          const newActiveIndex = Math.min(activeIndex, newTabs.length - 1);
          setActiveTab(newTabs[newActiveIndex].value);
        } else {
          setActiveTab(null);
        }
        return newTabs;
      }
      return prevTabs;
    });
  }, [setTabs, setActiveTab]);

  const handleCloseAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTab(null);
  }, [setTabs, setActiveTab]);

  const handleMinimizeWindow = useCallback(async () => {
    try {
      const webviewWindow = getCurrentWebviewWindow();
      await webviewWindow.minimize();
    } catch (error) {
      console.error("Failed to minimize window:", error);
    }
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    try {
      const webviewWindow = getCurrentWebviewWindow();
      await webviewWindow.toggleMaximize();
    } catch (error) {
      console.error("Failed to toggle maximize:", error);
    }
  }, []);

  const handleToggleFullScreen = useCallback(async () => {
    try {
      const webviewWindow = getCurrentWebviewWindow();
      const isFullscreen = await webviewWindow.isFullscreen();
      await webviewWindow.setFullscreen(!isFullscreen);
    } catch (error) {
      console.error("Failed to toggle fullscreen:", error);
    }
  }, []);

  const menuActions: MenuGroup[] = useMemo(
    () => [
      {
        label: t("features.menu.pawnAppetit"),
        options: [
          {
            label: t("features.menu.about"),
            id: "about",
            action: handleAbout,
          },
          { label: "divider" },
          {
            label: t("features.menu.checkUpdate"),
            id: "check_for_updates",
            action: checkForUpdates,
          },
          { label: "divider" },
          {
            label: t("features.menu.settings"),
            id: "settings",
            action: () => navigate({ to: "/settings" }),
          },
          { label: "divider" },
          {
            label: t("features.menu.quit"),
            id: "quit",
            shortcut: formatHotkeyDisplay(keyMap.EXIT_APP.keys),
            action: () => exit(0),
          },
        ],
      },
      {
        label: t("features.menu.file"),
        options: [
          {
            label: t("features.menu.newTab"),
            id: "new_tab",
            shortcut: formatHotkeyDisplay(keyMap.NEW_BOARD_TAB.keys),
            action: createNewTab,
          },
          {
            label: t("features.menu.newPlayBoard"),
            id: "new_play_board",
            shortcut: formatHotkeyDisplay(keyMap.PLAY_BOARD.keys),
            action: () => {
              navigate({ to: "/boards" });
              createTab({
                tab: { name: "Play", type: "play" },
                setTabs,
                setActiveTab,
              });
            },
          },
          {
            label: t("features.menu.newAnalysisBoard"),
            id: "new_analysis_board",
            shortcut: formatHotkeyDisplay(keyMap.ANALYZE_BOARD.keys),
            action: () => {
              navigate({ to: "/boards" });
              createTab({
                tab: { name: t("features.tabs.analysisBoard.title"), type: "analysis" },
                setTabs,
                setActiveTab,
              });
            },
          },
          { label: "divider" },
          {
            label: t("features.menu.openFile"),
            id: "open_file",
            shortcut: formatHotkeyDisplay(keyMap.OPEN_FILE.keys),
            action: openNewFile,
          },
          {
            label: t("features.menu.importPgn"),
            id: "import_pgn",
            shortcut: formatHotkeyDisplay(keyMap.IMPORT_BOARD.keys),
            action: () => {
              navigate({ to: "/boards" });
              modals.openContextModal({
                modal: "importModal",
                innerProps: {},
              });
            },
          },
        ],
      },
      {
        label: t("features.menu.edit"),
        options: [
          {
            label: t("features.menu.undo"),
            id: "undo",
            action: () => {
              document.execCommand("undo");
            },
          },
          {
            label: t("features.menu.redo"),
            id: "redo",
            action: () => {
              document.execCommand("redo");
            },
          },
          { label: "divider" },
          {
            label: t("features.menu.cut"),
            id: "cut",
            action: handleCut,
          },
          {
            label: t("features.menu.copy"),
            id: "copy",
            action: handleCopy,
          },
          {
            label: t("features.menu.paste"),
            id: "paste",
            action: handlePaste,
          },
          { label: "divider" },
          {
            label: t("features.menu.selectAll"),
            id: "select_all",
            action: handleSelectAll,
          },
        ],
      },
      {
        label: t("features.menu.view"),
        options: [
          {
            label: t("features.menu.commandPalette"),
            id: "command_palette",
            shortcut: formatHotkeyDisplay(keyMap.SPOTLIGHT_SEARCH.keys),
            action: () => spotlight.open(),
          },
          { label: "divider" },
          {
            label: t("features.menu.reload"),
            id: "reload",
            shortcut: formatHotkeyDisplay(keyMap.APP_RELOAD.keys),
            action: () => location.reload(),
          },
          {
            label: t("features.menu.forceReload"),
            id: "force_reload",
            action: () => location.reload(),
          },
        ],
      },
      {
        label: t("features.menu.go"),
        options: [
          {
            label: t("features.menu.goToDashboard"),
            id: "go_dashboard",
            action: () => navigate({ to: "/" }),
          },
          {
            label: t("features.menu.goToBoards"),
            id: "go_boards",
            action: () => navigate({ to: "/boards" }),
          },
          {
            label: t("features.menu.goToAccounts"),
            id: "go_accounts",
            action: () => navigate({ to: "/accounts" }),
          },
          {
            label: t("features.menu.goToFiles"),
            id: "go_files",
            action: () => navigate({ to: "/files" }),
          },
          {
            label: t("features.menu.goToDatabases"),
            id: "go_databases",
            action: () => navigate({ to: "/databases" }),
          },
          {
            label: t("features.menu.goToEngines"),
            id: "go_engines",
            action: () => navigate({ to: "/engines" }),
          },
          {
            label: t("features.menu.goToTrain"),
            id: "go_train",
            action: () => navigate({ to: "/train" }),
          },
          { label: "divider" },
          {
            label: t("features.menu.goToSettings"),
            id: "go_settings",
            action: () => navigate({ to: "/settings" }),
          },
          {
            label: t("features.menu.goToKeyboardShortcuts"),
            id: "go_keyboard_shortcuts",
            shortcut: formatHotkeyDisplay(keyMap.SHOW_KEYBINDINGS.keys),
            action: () => navigate({ to: "/settings/keyboard-shortcuts" }),
          },
        ],
      },
      {
        label: t("features.menu.window"),
        options: [
          {
            label: t("features.menu.minimize"),
            id: "minimize",
            action: handleMinimizeWindow,
          },
          {
            label: t("features.menu.zoom"),
            id: "zoom",
            action: handleToggleMaximize,
          },
          { label: "divider" },
          {
            label: t("features.menu.closeTab"),
            id: "close_tab",
            action: handleCloseTab,
          },
          {
            label: t("features.menu.closeAllTabs"),
            id: "close_all_tabs",
            action: handleCloseAllTabs,
          },
        ],
      },
      {
        label: t("features.menu.help"),
        options: [
          {
            label: t("features.menu.documentation"),
            id: "documentation",
            action: async () => {
              await openPath("https://pawnappetit.com/docs");
            },
          },
          {
            label: t("features.menu.reportIssue"),
            id: "report_issue",
            action: async () => {
              await openPath("https://github.com/Pawn-Appetit/pawn-appetit/issues/new");
            },
          },
          { label: "divider" },
          {
            label: t("features.menu.clearSavedData"),
            id: "clear_saved_data",
            action: handleClearData,
          },
          {
            label: t("features.menu.openLogs"),
            id: "logs",
            action: handleOpenLogs,
          },
        ],
      },
    ],
    [
      t,
      keyMap,
      createNewTab,
      openNewFile,
      handleClearData,
      handleOpenLogs,
      checkForUpdates,
      handleAbout,
      navigate,
      setTabs,
      setActiveTab,
      handleCut,
      handleCopy,
      handlePaste,
      handleSelectAll,
      handleCloseTab,
      handleCloseAllTabs,
      handleMinimizeWindow,
      handleToggleMaximize,
      handleToggleFullScreen,
    ],
  );

  const { data: menu, error: menuError } = useQuery({
    queryKey: ["menu", menuActions],
    queryFn: () => createMenu(menuActions),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (menuError) {
      console.error("Menu creation failed:", menuError);
      notifications.show({
        title: t("notifications.menuError"),
        message: t("notifications.failedToCreateMenu"),
        color: "red",
      });
    }
  }, [menuError, t]);

  useEffect(() => {
    if (!menu) return;

    const applyMenu = async () => {
      if (layout.menuBar.mode === "disabled") return;
      try {
        const webviewWindow = getCurrentWebviewWindow();

        if (layout.menuBar.mode === "native") {
          await menu.setAsAppMenu();
          await webviewWindow.setDecorations(true);
        } else {
          const emptyMenu = await Menu.new();
          await emptyMenu.setAsAppMenu();
          await webviewWindow.setDecorations(false);
        }
      } catch (error) {
        console.error("Failed to apply menu configuration:", error);
      }
    };

    applyMenu();
  }, [menu, layout.menuBar.mode]);

  return (
    <ModalsProvider modals={{ importModal: ImportModal, aboutModal: AboutModal }}>
      <AppShell
        {...layout.appShellProps}
        styles={{
          main: {
            height: "100vh",
            userSelect: "none",
          },
        }}
      >
        <AppShell.Header>
          <TopBar menuActions={menuActions} />
        </AppShell.Header>
        <AppShell.Navbar>{layout.sidebar.position === "navbar" && <SideBar />}</AppShell.Navbar>
        <AppShell.Main style={{ display: "flex", flexDirection: "column" }}>
          <Outlet />
        </AppShell.Main>
        <AppShell.Footer>{layout.sidebar.position === "footer" && <SideBar />}</AppShell.Footer>
      </AppShell>
    </ModalsProvider>
  );
}
