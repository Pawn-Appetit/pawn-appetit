import { AppShellSection, Stack, Tooltip } from "@mantine/core";
import {
  type Icon,
  IconChess,
  IconCpu,
  IconDatabase,
  IconFiles,
  IconKeyboard,
  IconLayoutDashboard,
  IconSchool,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { Link, useMatchRoute } from "@tanstack/react-router";
import cx from "clsx";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { hideDashboardOnStartupAtom } from "@/state/atoms";
import * as classes from "./Sidebar.css";

interface NavbarLinkProps {
  icon: Icon;
  label: string;
  url: string;
  active?: boolean;
}

function NavbarLink({ url, icon: Icon, label }: NavbarLinkProps) {
  const matcesRoute = useMatchRoute();
  return (
    <Tooltip label={label} position="right">
      <Link
        to={url}
        className={cx(classes.link, {
          [classes.active]: matcesRoute({ to: url, fuzzy: true }),
        })}
      >
        <Icon size="1.5rem" stroke={1.5} />
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
  const matcesRoute = useMatchRoute();
  const { t } = useTranslation();
  const [hideDashboardOnStartup] = useAtom(hideDashboardOnStartupAtom);

  const links = linksdata
    .filter((link) => {
      if (hideDashboardOnStartup && link.url === "/") return false;
      return link;
    })
    .map((link) => <NavbarLink {...link} label={t(`features.sidebar.${link.label}`)} key={link.label} />);

  return (
    <>
      <AppShellSection grow>
        <Stack justify="center" gap={0}>
          {links}
        </Stack>
      </AppShellSection>
      <AppShellSection>
        <Stack justify="center" gap={0}>
          <Tooltip label={t("features.sidebar.keyboardShortcuts")} position="right">
            <Link
              to="/settings/keyboard-shortcuts"
              className={cx(classes.link, {
                [classes.active]: matcesRoute({ to: "/settings/keyboard-shortcuts", fuzzy: true }),
              })}
            >
              <IconKeyboard size="1.5rem" stroke={1.5} />
            </Link>
          </Tooltip>
          <Tooltip label={t("features.sidebar.settings")} position="right">
            <Link
              to="/settings"
              className={cx(classes.link, {
                [classes.active]: matcesRoute({ to: "/settings" }),
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
