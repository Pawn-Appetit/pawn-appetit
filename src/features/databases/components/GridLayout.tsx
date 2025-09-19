import { Box } from "@mantine/core";
import type { JSX } from "react";
import { type LayoutType, SidePanelDrawerLayout } from "@/common/components/SidePanelDrawerLayout";
import * as classes from "./GridLayout.css";

function GridLayout({
  search,
  table,
  preview,
  isDrawerOpen = false,
  onDrawerClose = () => {},
  drawerTitle = "Details",
  layoutType,
}: {
  search: JSX.Element;
  table: JSX.Element;
  preview: JSX.Element;
  isDrawerOpen?: boolean;
  onDrawerClose?: () => void;
  drawerTitle?: string;
  layoutType: LayoutType;
}) {
  const mainContent = (
    <Box
      style={{
        display: "flex",
        gap: "1rem",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <Box className={classes.search}>{search}</Box>
      {table}
    </Box>
  );

  return (
    <SidePanelDrawerLayout
      mainContent={mainContent}
      detailContent={preview}
      isDetailOpen={isDrawerOpen}
      onDetailClose={onDrawerClose}
      detailTitle={drawerTitle}
      layoutType={layoutType}
    />
  );
}

export default GridLayout;
