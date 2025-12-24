import { ActionIcon, AppShellSection, Divider, Group, Menu, Stack, Tooltip } from "@mantine/core";
import {
  type Icon,
  IconChartLine,
  IconChess,
  IconCpu,
  IconDatabase,
  IconFiles,
  IconKeyboard,
  IconLayoutDashboard,
  IconMenu2,
  IconPlayerPlay,
  IconPuzzle,
  IconSchool,
  IconSettings,
  IconTrophy,
  IconUsers,
} from "@tabler/icons-react";
import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router";
import cx from "clsx";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import {
  activeTabAtom,
  showAnalyzeInSidebarAtom,
  showDashboardOnStartupAtom,
  showPlayInSidebarAtom,
  showPuzzlesInSidebarAtom,
  tabsAtom,
} from "@/state/atoms";
import { createTab } from "@/utils/tabs";
import * as classes from "./Sidebar.css";

interface NavbarLinkProps {
  icon: Icon;
  label: string;
  url: string;
  active?: boolean;
}

function NavbarLink({ url, icon: Icon, label }: NavbarLinkProps) {
  const matchesRoute = useMatchRoute();
  const { layout } = useResponsiveLayout();
  return (
    <Tooltip label={label} position={layout.sidebar.position === "footer" ? "top" : "right"}>
      <Link
        to={url}
        className={cx(classes.link, {
          [classes.active]: matchesRoute({ to: url, fuzzy: true }),
        })}
      >
        <Icon size={layout.sidebar.position === "footer" ? "2.0rem" : "1.5rem"} stroke={1.5} />
      </Link>
    </Tooltip>
  );
}

function QuickActionLink({
  icon: Icon,
  label,
  tabName,
  tabType,
}: {
  icon: Icon;
  label: string;
  tabName: string;
  tabType: "play" | "analysis" | "puzzles";
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
      ...(tabType === "analysis" && {
        initialAnalysisTab: "analysis",
        initialAnalysisSubTab: "report",
        initialNotationView: "report" as const,
      }),
    });
    navigate({ to: "/boards" });
  };

  return (
    <Tooltip label={label} position={layout.sidebar.position === "footer" ? "top" : "right"}>
      <Link to="/boards" onClick={handleClick} className={cx(classes.link)}>
        <Icon size={layout.sidebar.position === "footer" ? "2.0rem" : "1.5rem"} stroke={1.5} />
      </Link>
    </Tooltip>
  );
}

export const linksdata = [
  { icon: IconLayoutDashboard, label: "dashboard", url: "/" },
  { icon: IconChess, label: "board", url: "/boards" },
  { icon: IconCpu, label: "engines", url: "/engines" },
  {
    icon: IconDatabase,
    label: "databases",
    url: "/databases",
  },
  { icon: IconFiles, label: "files", url: "/files" },
  { icon: IconUsers, label: "accounts", url: "/accounts" },
  { icon: IconTrophy, label: "tournaments", url: "/tournaments" },
  { icon: IconSchool, label: "learn", url: "/learn" },
];

export function SideBar() {
  const matchesRoute = useMatchRoute();
  const { t } = useTranslation();
  const [showDashboardOnStartup] = useAtom(showDashboardOnStartupAtom);
  const [showPlayInSidebar] = useAtom(showPlayInSidebarAtom);
  const [showAnalyzeInSidebar] = useAtom(showAnalyzeInSidebarAtom);
  const [showPuzzlesInSidebar] = useAtom(showPuzzlesInSidebarAtom);
  const { layout } = useResponsiveLayout();

  const mainLinks = linksdata
    .filter((link) => {
      if (!showDashboardOnStartup && link.url === "/") return false;
      return link;
    })
    .map((link) => {
      return <NavbarLink {...link} label={t(`features.sidebar.${link.label}`)} key={link.label} />;
    });

  // Create quick action links based on settings
  const quickActionLinks: React.ReactNode[] = [];
  if (showPlayInSidebar) {
    quickActionLinks.push(
      <QuickActionLink
        key="quick-play"
        icon={IconPlayerPlay}
        label={t("features.sidebar.quickPlay")}
        tabName="Play"
        tabType="play"
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
      />,
    );
  }

  const allMainLinks = [...mainLinks, ...quickActionLinks];

  if (layout.sidebar.position === "footer") {
    // Show only first 4 links on mobile
    const visibleLinks = allMainLinks.slice(0, 4);

    // For burger menu, we need to render Menu.Items directly
    const renderBurgerMenuItem = (link: React.ReactNode, index: number) => {
      if (!link || typeof link !== "object" || !("props" in link)) {
        return null;
      }

      const linkProps = link.props as {
        icon: Icon;
        label: string;
        url?: string;
        onClick?: (e: React.MouseEvent) => void;
      };
      const IconComponent = linkProps.icon;
      const linkKey = (link as { key?: string }).key || `menu-item-${index}`;

      // If there's no URL, it's a quick action - use onClick
      if (!linkProps.url) {
        return (
          <Menu.Item
            key={linkKey}
            onClick={(e) => {
              if (linkProps.onClick) {
                linkProps.onClick(e);
              }
            }}
            leftSection={<IconComponent size="1.2rem" stroke={1.5} />}
          >
            {linkProps.label}
          </Menu.Item>
        );
      }

      // Regular navigation link
      return (
        <Menu.Item
          key={linkKey}
          component={Link}
          to={linkProps.url}
          leftSection={<IconComponent size="1.2rem" stroke={1.5} />}
        >
          {linkProps.label}
        </Menu.Item>
      );
    };

    return (
      <AppShellSection grow>
        <Group justify="center" gap="md">
          {visibleLinks}
          <Menu shadow="md" position="top">
            <Menu.Target>
              <Tooltip label={t("sidebar.more")} position="top">
                <ActionIcon variant="subtle" size="xl" className={classes.link}>
                  <IconMenu2 size="2.0rem" stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              {allMainLinks.slice(4).map((link, index) => renderBurgerMenuItem(link, index))}
              <Menu.Item
                key="settings"
                component={Link}
                to="/settings"
                leftSection={<IconSettings size="1.2rem" stroke={1.5} />}
              >
                {t("features.sidebar.settings")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShellSection>
    );
  }

  // Desktop layout
  return (
    <>
      <AppShellSection grow>
        <Stack justify="center" gap={0}>
          {mainLinks}
          {!!quickActionLinks.length && <Divider />}
          {quickActionLinks}
        </Stack>
      </AppShellSection>
      <AppShellSection visibleFrom="sm">
        <Stack justify="center" gap={0}>
          <Tooltip label={t("features.sidebar.keyboardShortcuts")} position="right">
            <Link
              to="/settings/keyboard-shortcuts"
              className={cx(classes.link, {
                [classes.active]: matchesRoute({ to: "/settings/keyboard-shortcuts", fuzzy: true }),
              })}
            >
              <IconKeyboard size="1.5rem" stroke={1.5} />
            </Link>
          </Tooltip>
          <Tooltip label={t("features.sidebar.settings")} position="right">
            <Link
              to="/settings"
              className={cx(classes.link, {
                [classes.active]: matchesRoute({ to: "/settings" }),
              })}
            >
              <IconSettings size="1.5rem" stroke={1.5} />
            </Link>
          </Tooltip>
        </Stack>
      </AppShellSection>
    </>
  );
}
