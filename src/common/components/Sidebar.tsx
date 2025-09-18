import { ActionIcon, AppShellSection, Group, Menu, Stack, Tooltip } from "@mantine/core";
import {
  type Icon,
  IconChess,
  IconCpu,
  IconDatabase,
  IconFiles,
  IconKeyboard,
  IconLayoutDashboard,
  IconMenu2,
  IconSchool,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { Link, useMatchRoute } from "@tanstack/react-router";
import cx from "clsx";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { hideDashboardOnStartupAtom } from "@/state/atoms";
import { useResponsiveLayout } from "@/common/hooks/useResponsiveLayout";
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
  { icon: IconSchool, label: "learn", url: "/learn" },
];

export function SideBar() {
  const matchesRoute = useMatchRoute();
  const { t } = useTranslation();
  const [hideDashboardOnStartup] = useAtom(hideDashboardOnStartupAtom);
  const { layout } = useResponsiveLayout();

  const mainLinks = linksdata
    .filter((link) => {
      if (hideDashboardOnStartup && link.url === "/") return false;
      return link;
    })
    .map((link) => <NavbarLink {...link} label={t(`features.sidebar.${link.label}`)} key={link.label} />);

  if (layout.sidebar.position === "footer") {
    // Show only first 4 links on mobile
    const visibleLinks = mainLinks.slice(0, 4);

    // Remaining links go in burger menu
    const burgerMenuLinks = [
      ...mainLinks.slice(4),
      <NavbarLink key="settings" icon={IconSettings} label={t("features.sidebar.settings")} url="/settings" />,
    ];

    return (
      <AppShellSection grow>
        <Group justify="center" gap="md">
          {visibleLinks}
          <Menu shadow="md" position="top">
            <Menu.Target>
              <Tooltip label="More" position="top">
                <ActionIcon variant="subtle" size="xl" className={classes.link}>
                  <IconMenu2 size="2.0rem" stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              {burgerMenuLinks.map((link) => {
                const IconComponent = link.props.icon;
                return (
                  <Menu.Item
                    key={link.key}
                    component={Link}
                    to={link.props.url}
                    leftSection={
                      <IconComponent size={layout.sidebar.position === "footer" ? "2.0rem" : "1.2rem"} stroke={1.5} />
                    }
                  >
                    {link.props.label}
                  </Menu.Item>
                );
              })}
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
