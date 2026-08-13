import {
    IconChartLine,
    IconChess,
    type Icon,
    IconCpu,
    IconDatabase,
    IconLayoutDashboard,
    IconSettings,
    IconTarget,
    IconUsers,
} from "@tabler/icons-react";

export type AppNavigationItem = {
    id:
        | "dashboard"
        | "analysis"
        | "games"
        | "accounts"
        | "databases"
        | "openings"
        | "repertoire"
        | "training"
        | "engines"
        | "files"
        | "settings";
    labelKey: string;
    descriptionKey?: string;
    icon: Icon;
    url: string;
    activeMatch?: "exact" | "fuzzy";
    section: "workbench" | "library" | "system";
};

export const appNavigationItems: AppNavigationItem[] = [
    {
        id: "dashboard",
        labelKey: "features.sidebar.dashboard",
        icon: IconLayoutDashboard,
        url: "/",
        section: "workbench",
    },
    {
        id: "analysis",
        labelKey: "features.sidebar.analysis",
        icon: IconChartLine,
        url: "/boards",
        section: "workbench",
    },
    {
        id: "games",
        labelKey: "features.sidebar.games",
        icon: IconChess,
        url: "/files",
        section: "library",
    },
    {
        id: "accounts",
        labelKey: "features.sidebar.accounts",
        icon: IconUsers,
        url: "/accounts",
        section: "library",
    },
    {
        id: "databases",
        labelKey: "features.sidebar.databases",
        icon: IconDatabase,
        url: "/databases",
        section: "library",
    },
    {
        id: "training",
        labelKey: "features.sidebar.train",
        icon: IconTarget,
        url: "/train",
        section: "workbench",
    },
    {
        id: "engines",
        labelKey: "features.sidebar.engines",
        icon: IconCpu,
        url: "/engines",
        section: "system",
    },
    {
        id: "settings",
        labelKey: "features.sidebar.settings",
        icon: IconSettings,
        url: "/settings",
        section: "system",
    },
];
