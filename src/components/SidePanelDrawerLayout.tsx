import { Drawer, Group, Paper, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { type LayoutType, useResponsiveLayout } from "@/hooks/useResponsiveLayout";

export type { LayoutType };

interface SidePanelDrawerLayoutProps {
  /** Content for the main area (list/table) */
  mainContent: ReactNode;
  /** Content for the detail panel */
  detailContent: ReactNode;
  /** Whether the detail panel should be shown */
  isDetailOpen: boolean;
  /** Callback when detail panel should be closed */
  onDetailClose: () => void;
  /** Title for the detail panel */
  detailTitle?: string;
  /** Layout type to determine mobile vs desktop behavior */
  layoutType: LayoutType;
  /** Additional props for the main content container */
  mainContentProps?: Record<string, unknown>;
  /** Additional props for the detail content container */
  detailContentProps?: Record<string, unknown>;
}

/**
 * A layout component that automatically switches between
 * sidepanel (Group + Paper) and drawer layouts based on the responsive layout configuration.
 */
export function SidePanelDrawerLayout({
  mainContent,
  detailContent,
  isDetailOpen,
  onDetailClose,
  detailTitle = "Details",
  layoutType,
  mainContentProps = {},
  detailContentProps = {},
}: SidePanelDrawerLayoutProps) {
  const { layout } = useResponsiveLayout();

  // Use sidepanel layout when:
  // 1. panelsType is "sidepanel" AND layoutType is "desktop"
  // 2. This allows desktop to use drawer when panelsType is "drawer"
  const useSidePanel = layout.panels.type === "sidepanel" && layoutType === "desktop";

  if (useSidePanel) {
    return (
      <Group grow h="100%" p="md" {...mainContentProps} align="start">
        <Stack h="100%">{mainContent}</Stack>
        <Paper h="100%" {...detailContentProps}>
          {detailContent}
        </Paper>
      </Group>
    );
  }

  return (
    <Stack h="100%" p="md" data-testid="mobile-layout-container" {...mainContentProps}>
      {mainContent}
      <Drawer
        opened={isDetailOpen}
        onClose={onDetailClose}
        position={layout.panels.drawer.position}
        size={layout.panels.drawer.size}
        title={detailTitle}
        overlayProps={{ opacity: 0.5, blur: 4 }}
        radius="md"
      >
        {detailContent}
      </Drawer>
    </Stack>
  );
}

/**
 * A specialized version for database/file layouts with common styling
 */
export function DatabaseSidePanelDrawerLayout({
  mainContent,
  detailContent,
  isDetailOpen,
  onDetailClose,
  detailTitle = "Details",
  layoutType,
}: Omit<SidePanelDrawerLayoutProps, "mainContentProps" | "detailContentProps">) {
  return (
    <SidePanelDrawerLayout
      mainContent={mainContent}
      detailContent={detailContent}
      isDetailOpen={isDetailOpen}
      onDetailClose={onDetailClose}
      detailTitle={detailTitle}
      layoutType={layoutType}
      mainContentProps={{
        style: { overflow: "hidden" },
        // No additional padding needed since base component provides p="md"
      }}
    />
  );
}
