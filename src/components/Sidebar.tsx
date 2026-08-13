import {
  ActionIcon,
  AppShellSection,
  Box,
  Divider,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconChartLine,
  type Icon,
  IconKeyboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
  IconPlayerPlay,
  IconPuzzle,
  IconSettings,
} from "@tabler/icons-react";
import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router";
import cx from "clsx";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { appNavigationItems, type AppNavigationItem } from "@/app/navigation";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import {
  activeTabAtom,
  showAnalyzeInSidebarAtom,
  showDashboardOnStartupAtom,
  showPlayInSidebarAtom,
  showPuzzlesInSidebarAtom,
  sidebarCollapsedAtom,
  tabsAtom,
} from "@/state/atoms";
import { createTab } from "@/utils/tabs";
import * as classes from "./Sidebar.css";

const labelFallbacks: Record<AppNavigationItem["id"], string> = {
  dashboard: "Dashboard",
  analysis: "Analysis",
  games: "Games",
  accounts: "Accounts",
  databases: "Databases",
  openings: "Openings",
  repertoire: "Repertoire",
  training: "Training",
  engines: "Engines",
  files: "Files",
  settings: "Settings",
};

interface SidebarItemProps {
  item: AppNavigationItem;
  collapsed: boolean;
}

function SidebarItem({ item, collapsed }: SidebarItemProps) {
  const matchesRoute = useMatchRoute();
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();
  const Icon = item.icon;
  const label = t(item.labelKey, labelFallbacks[item.id]);
  const active = Boolean(
    matchesRoute({ to: item.url, fuzzy: item.activeMatch !== "exact" }),
  );

  const content = (
    <Link
      to={item.url}
      className={cx(classes.link, classes.navItem, {
        [classes.active]: active,
        [classes.collapsedItem]: collapsed,
      })}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      <Icon size="1.25rem" stroke={1.6} />
      {!collapsed && (
        <Text component="span" size="sm" truncate>
          {label}
        </Text>
      )}
    </Link>
  );

  if (!collapsed && layout.sidebar.position !== "footer") {
    return content;
  }

  return (
    <Tooltip label={label} position={layout.sidebar.position === "footer" ? "top" : "right"}>
      {content}
    </Tooltip>
  );
}

function QuickActionLink({
  icon: Icon,
  label,
  tabName,
  tabType,
  collapsed,
}: {
  icon: Icon;
  label: string;
  tabName: string;
  tabType: "play" | "analysis" | "puzzles";
  collapsed: boolean;
}) {
  const navigate = useNavigate();
  const { layout } = useResponsiveLayout();
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    createTab({
      tab: { name: tabName, type: tabType },
      setTabs,
      setActiveTab,
    });
    navigate({ to: "/boards" });
  };

  const content = (
    <Link
      to="/boards"
      onClick={handleClick}
      className={cx(classes.link, classes.navItem, classes.quickAction, {
        [classes.collapsedItem]: collapsed,
      })}
      aria-label={label}
    >
      <Icon size="1.25rem" stroke={1.6} />
      {!collapsed && (
        <Text component="span" size="sm" truncate>
          {label}
        </Text>
      )}
    </Link>
  );

  return (
    <Tooltip label={label} position={layout.sidebar.position === "footer" ? "top" : "right"}>
      {content}
    </Tooltip>
  );
}

export function SideBar() {
  const matchesRoute = useMatchRoute();
  const { t } = useTranslation();
  const [showDashboardOnStartup] = useAtom(showDashboardOnStartupAtom);
  const [showPlayInSidebar] = useAtom(showPlayInSidebarAtom);
  const [showAnalyzeInSidebar] = useAtom(showAnalyzeInSidebarAtom);
  const [showPuzzlesInSidebar] = useAtom(showPuzzlesInSidebarAtom);
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const { layout } = useResponsiveLayout();

  const visibleItems = appNavigationItems.filter(
    (item) => showDashboardOnStartup || item.id !== "dashboard",
  );
  const groupedItems = {
    workbench: visibleItems.filter((item) => item.section === "workbench"),
    library: visibleItems.filter((item) => item.section === "library"),
    system: visibleItems.filter((item) => item.section === "system" && item.id !== "settings"),
  };

  const quickActionLinks: React.ReactNode[] = [];
  if (showPlayInSidebar) {
    quickActionLinks.push(
      <QuickActionLink
        key="quick-play"
        icon={IconPlayerPlay}
        label={t("features.sidebar.quickPlay")}
        tabName="Play"
        tabType="play"
        collapsed={collapsed}
      />,
    );
  }
  if (showAnalyzeInSidebar) {
    quickActionLinks.push(
      <QuickActionLink
        key="quick-analyze"
        icon={IconChartLine}
        label={t("features.sidebar.quickAnalyze")}
        tabName={t("features.tabs.analysisBoard.title")}
        tabType="analysis"
        collapsed={collapsed}
      />,
    );
  }
  if (showPuzzlesInSidebar) {
    quickActionLinks.push(
      <QuickActionLink
        key="quick-puzzles"
        icon={IconPuzzle}
        label={t("features.sidebar.quickPuzzles")}
        tabName={t("features.tabs.puzzle.title")}
        tabType="puzzles"
        collapsed={collapsed}
      />,
    );
  }

  if (layout.sidebar.position === "footer") {
    const footerItems = visibleItems.slice(0, 4);

    return (
      <AppShellSection grow>
        <Group justify="center" gap="md">
          {footerItems.map((item) => (
            <SidebarItem key={item.id} item={item} collapsed />
          ))}
          <Menu shadow="md" position="top">
            <Menu.Target>
              <Tooltip label={t("sidebar.more")} position="top">
                <ActionIcon
                  variant="subtle"
                  size="xl"
                  className={classes.link}
                  aria-label={t("sidebar.more")}
                >
                  <IconMenu2 size="2rem" stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              {visibleItems.slice(4).map((item) => (
                <Menu.Item
                  key={item.id}
                  component={Link}
                  to={item.url}
                  leftSection={<item.icon size="1.2rem" stroke={1.5} />}
                >
                  {t(item.labelKey, labelFallbacks[item.id])}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item
                component={Link}
                to="/settings/keyboard-shortcuts"
                leftSection={<IconKeyboard size="1.2rem" stroke={1.5} />}
              >
                {t("features.sidebar.keyboardShortcuts")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShellSection>
    );
  }

  return (
    <>
      <AppShellSection grow>
        <Stack gap={0} p={collapsed ? 0 : "xs"}>
          <Group justify={collapsed ? "center" : "space-between"} px={collapsed ? 0 : "xs"} py="xs">
            {!collapsed && (
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                Workbench
              </Text>
            )}
            <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} position="right">
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={() => setCollapsed((value) => !value)}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? (
                  <IconLayoutSidebarLeftExpand size="1rem" />
                ) : (
                  <IconLayoutSidebarLeftCollapse size="1rem" />
                )}
              </ActionIcon>
            </Tooltip>
          </Group>

          {groupedItems.workbench.map((item) => (
            <SidebarItem key={item.id} item={item} collapsed={collapsed} />
          ))}

          <Divider my="xs" />
          {!collapsed && (
            <Text size="xs" c="dimmed" fw={700} tt="uppercase" px="xs" py={4}>
              Library
            </Text>
          )}
          {groupedItems.library.map((item) => (
            <SidebarItem key={item.id} item={item} collapsed={collapsed} />
          ))}

          {quickActionLinks.length > 0 && (
            <>
              <Divider my="xs" />
              {!collapsed && (
                <Text size="xs" c="dimmed" fw={700} tt="uppercase" px="xs" py={4}>
                  Quick Actions
                </Text>
              )}
              {quickActionLinks}
            </>
          )}

          <Divider my="xs" />
          {!collapsed && (
            <Text size="xs" c="dimmed" fw={700} tt="uppercase" px="xs" py={4}>
              System
            </Text>
          )}
          {groupedItems.system.map((item) => (
            <SidebarItem key={item.id} item={item} collapsed={collapsed} />
          ))}
        </Stack>
      </AppShellSection>

      <AppShellSection visibleFrom="sm">
        <Stack gap={0} p={collapsed ? 0 : "xs"}>
          <Tooltip label={t("features.sidebar.keyboardShortcuts")} position="right">
            <Link
              to="/settings/keyboard-shortcuts"
              className={cx(classes.link, classes.navItem, {
                [classes.active]: matchesRoute({ to: "/settings/keyboard-shortcuts", fuzzy: true }),
                [classes.collapsedItem]: collapsed,
              })}
              aria-label={t("features.sidebar.keyboardShortcuts")}
            >
              <IconKeyboard size="1.25rem" stroke={1.6} />
              {!collapsed && <Text size="sm">{t("features.sidebar.keyboardShortcuts")}</Text>}
            </Link>
          </Tooltip>
          <SidebarItem
            item={{
              id: "settings",
              labelKey: "features.sidebar.settings",
              icon: IconSettings,
              url: "/settings",
              section: "system",
            }}
            collapsed={collapsed}
          />
        </Stack>
      </AppShellSection>
      {!collapsed && <Box h="xs" />}
    </>
  );
}
