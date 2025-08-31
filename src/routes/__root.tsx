import { AppShell, ScrollArea } from "@mantine/core";
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
import { useScreenSize } from "@/styles/theme";
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
  const { isMobile, isMobileOrSmallScreen, smallScreenMax } = useScreenSize();

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
    if (isMobile) return;
    if (isNative) {
      menu.setAsAppMenu();
      getCurrentWebviewWindow().setDecorations(true);
    } else {
      Menu.new().then((m) => m.setAsAppMenu());
      getCurrentWebviewWindow().setDecorations(false);
    }
  }, [menu, isNative, isMobile]);

  return (
    <ModalsProvider modals={{ importModal: ImportModal, aboutModal: AboutModal }}>
      <AppShell
        mt={isMobile ? "3rem" : "0rem"}
        header={{
          height: "2.3rem",
          collapsed: isMobile || isNative,
          offset: true,
        }}
        navbar={{
          width: "3rem",
          breakpoint: "sm",
          collapsed: { desktop: false, mobile: true },
        }}
        footer={{
          height: isMobile ? "5rem" : smallScreenMax ? "3rem" : "0rem",
          collapsed: !isMobileOrSmallScreen,
          offset: true,
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
          <SideBar isMobile={false} />
        </AppShell.Navbar>
        <AppShell.Main>
          <ScrollArea
            style={{
              height: `calc(100vh - ${isNative ? "0rem" : "2.3rem"} - ${isMobile ? "5rem" : smallScreenMax ? "3rem" : "0rem"})`,
            }}
          >
            <Outlet />
          </ScrollArea>
        </AppShell.Main>
        <AppShell.Footer>
          <SideBar isMobile={true} />
        </AppShell.Footer>
      </AppShell>
    </ModalsProvider>
  );
}
