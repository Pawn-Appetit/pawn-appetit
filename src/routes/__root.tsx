import { AppShell } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { ModalsProvider, modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { createRootRouteWithContext, Outlet, useNavigate } from "@tanstack/react-router";
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { appLogDir, resolve } from "@tauri-apps/api/path";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ask, message, open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { exit, relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import useSWRImmutable from "swr/immutable";
import { match } from "ts-pattern";
import type { Dirs } from "@/App";
import AboutModal from "@/common/components/About";
import { SideBar } from "@/common/components/Sidebar";
import TopBar from "@/common/components/TopBar";
import ImportModal from "@/features/boards/components/ImportModal";
import { activeTabAtom, nativeBarAtom, tabsAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import { openFile } from "@/utils/files";
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

async function createMenu(menuActions: MenuGroup[]) {
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

  return Menu.new({
    items: items,
  });
}

export const Route = createRootRouteWithContext<{
  loadDirs: () => Promise<Dirs>;
}>()({
  component: RootLayout,
});

function RootLayout() {
  const isNative = useAtomValue(nativeBarAtom);
  const navigate = useNavigate();

  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);

  const { t } = useTranslation();

  const openNewFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "PGN file", extensions: ["pgn"] }],
    });
    if (typeof selected === "string") {
      navigate({ to: "/" });
      openFile(selected, setTabs, setActiveTab);
    }
  }, [navigate, setActiveTab, setTabs]);

  const createNewTab = useCallback(() => {
    navigate({ to: "/boards" });
    createTab({
      tab: { name: t("Tab.NewTab"), type: "new" },
      setTabs,
      setActiveTab,
    });
  }, [navigate, setActiveTab, setTabs, t]);

  const checkForUpdates = useCallback(async () => {
    const update = await check();
    if (update) {
      const yes = await ask("Do you want to install them now?", {
        title: "New version available",
      });
      if (yes) {
        await update.downloadAndInstall();
        await relaunch();
      }
    } else {
      await message("No updates available");
    }
  }, []);

  const handleCut = useCallback(async () => {
    const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
    if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
      const selectedText = activeElement.value.substring(
        activeElement.selectionStart || 0,
        activeElement.selectionEnd || 0,
      );
      if (selectedText) {
        try {
          await navigator.clipboard.writeText(selectedText);
          const start = activeElement.selectionStart || 0;
          const end = activeElement.selectionEnd || 0;
          activeElement.value = activeElement.value.substring(0, start) + activeElement.value.substring(end);
          activeElement.setSelectionRange(start, start);
        } catch (err) {
          console.error("Failed to cut text: ", err);
        }
      }
    } else {
      document.execCommand("cut");
    }
  }, []);

  const handleCopy = useCallback(async () => {
    const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;

    if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
      const selectedText = activeElement.value.substring(
        activeElement.selectionStart || 0,
        activeElement.selectionEnd || 0,
      );
      if (selectedText) {
        try {
          await navigator.clipboard.writeText(selectedText);
        } catch (err) {
          console.error("Failed to copy text: ", err);
        }
      }
    } else {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        try {
          await navigator.clipboard.writeText(selection.toString());
        } catch (err) {
          console.error("Failed to copy text: ", err);
          try {
            document.execCommand("copy");
          } catch (execErr) {
            console.error("Failed to copy with execCommand: ", execErr);
          }
        }
      }
    }
  }, []);

  const handlePaste = useCallback(async () => {
    const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;

    if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
      try {
        const clipboardText = await navigator.clipboard.readText();
        if (clipboardText) {
          const start = activeElement.selectionStart || 0;
          const end = activeElement.selectionEnd || 0;
          const currentValue = activeElement.value;
          const newValue = currentValue.substring(0, start) + clipboardText + currentValue.substring(end);
          activeElement.value = newValue;
          activeElement.setSelectionRange(start + clipboardText.length, start + clipboardText.length);

          const inputEvent = new Event("input", { bubbles: true });
          activeElement.dispatchEvent(inputEvent);
          const changeEvent = new Event("change", { bubbles: true });
          activeElement.dispatchEvent(changeEvent);
        }
      } catch (err) {
        console.error("Failed to paste text: ", err);
        try {
          document.execCommand("paste");
        } catch (execErr) {
          console.error("Failed to paste with execCommand: ", execErr);
        }
      }
    } else {
      try {
        document.execCommand("paste");
      } catch (err) {
        console.error("Failed to paste with execCommand: ", err);
      }
    }
  }, []);

  const handleSelectAll = useCallback(() => {
    const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
    if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
      activeElement.select();
    }
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (ctrlOrCmd) {
        switch (e.key.toLowerCase()) {
          case "x":
            if (!e.shiftKey && !e.altKey) {
              e.preventDefault();
              handleCut();
            }
            break;
          case "c":
            if (!e.shiftKey && !e.altKey) {
              e.preventDefault();
              handleCopy();
            }
            break;
          case "v":
            if (!e.shiftKey && !e.altKey) {
              e.preventDefault();
              handlePaste();
            }
            break;
          case "a":
            if (!e.shiftKey && !e.altKey) {
              e.preventDefault();
              handleSelectAll();
            }
            break;
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown, true);
    };
  }, [handleCut, handleCopy, handlePaste, handleSelectAll]);

  const [keyMap] = useAtom(keyMapAtom);

  useHotkeys([
    [
      keyMap.NEW_BOARD_TAB.keys,
      () => {
        navigate({ to: "/boards" });
        createTab({
          tab: { name: t("Tab.NewTab"), type: "new" },
          setTabs,
          setActiveTab,
        });
      },
    ],
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
          tab: { name: t("Tab.AnalysisBoard.Title"), type: "analysis" },
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
          tab: { name: t("Tab.Puzzle.Title"), type: "puzzles" },
          setTabs,
          setActiveTab,
        });
      },
    ],
    [keyMap.OPEN_FILE.keys, openNewFile],
    [
      keyMap.APP_RELOAD.keys,
      () => {
        location.reload();
      },
    ],
    [keyMap.EXIT_APP.keys, () => exit(0)],
  ]);

  const menuActions: MenuGroup[] = useMemo(
    () => [
      {
        label: t("Menu.File"),
        options: [
          {
            label: t("Menu.File.NewTab"),
            id: "new_tab",
            shortcut: keyMap.NEW_BOARD_TAB.keys,
            action: createNewTab,
          },
          {
            label: t("Menu.File.OpenFile"),
            id: "open_file",
            shortcut: keyMap.OPEN_FILE.keys,
            action: openNewFile,
          },
          {
            label: t("Menu.File.Exit"),
            id: "exit",
            shortcut: keyMap.EXIT_APP.keys,
            action: () => exit(0),
          },
        ],
      },
      {
        label: t("Menu.View"),
        options: [
          {
            label: t("Menu.View.Reload"),
            id: "reload",
            shortcut: keyMap.APP_RELOAD.keys,
            action: () => location.reload(),
          },
        ],
      },
      {
        label: t("Menu.Help"),
        options: [
          {
            label: t("Menu.Help.ClearSavedData"),
            id: "clear_saved_data",
            action: () => {
              ask("Are you sure you want to clear all saved data?", {
                title: "Clear data",
              }).then((res) => {
                if (res) {
                  localStorage.clear();
                  sessionStorage.clear();
                  location.reload();
                }
              });
            },
          },
          {
            label: t("Menu.Help.OpenLogs"),
            id: "logs",
            action: async () => {
              const path = await resolve(await appLogDir(), "pawn-appetit.log");
              notifications.show({
                title: "Logs",
                message: `Opened logs in ${path}`,
              });
              await openPath(path);
            },
          },
          { label: "divider" },
          {
            label: t("Menu.Help.CheckUpdate"),
            id: "check_for_updates",
            action: checkForUpdates,
          },
          {
            label: t("Menu.Help.About"),
            id: "about",
            action: () => {
              modals.openContextModal({
                modal: "aboutModal",
                title: "Pawn Appétit",
                innerProps: {},
              });
            },
          },
        ],
      },
    ],
    [t, checkForUpdates, keyMap, openNewFile, createNewTab],
  );

  const { data: menu } = useSWRImmutable(["menu", menuActions], () => createMenu(menuActions));

  useEffect(() => {
    if (!menu) return;
    if (isNative) {
      menu.setAsAppMenu();
      getCurrentWebviewWindow().setDecorations(true);
    } else {
      Menu.new().then((m) => m.setAsAppMenu());
      getCurrentWebviewWindow().setDecorations(false);
    }
  }, [menu, isNative]);

  return (
    <ModalsProvider modals={{ importModal: ImportModal, aboutModal: AboutModal }}>
      <AppShell
        navbar={{
          width: "3rem",
          breakpoint: 0,
        }}
        header={{
          height: "35px",
        }}
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
        <AppShell.Navbar>
          <SideBar />
        </AppShell.Navbar>
        <AppShell.Main>
          <Outlet />
        </AppShell.Main>
      </AppShell>
    </ModalsProvider>
  );
}
