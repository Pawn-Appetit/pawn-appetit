import type { JSX } from "react";
import type { MosaicNode } from "react-mosaic-component";

export const MOSAIC_PORTAL_IDS = {
  LEFT: "left",
  TOP_RIGHT: "topRight",
  BOTTOM_RIGHT: "bottomRight",
} as const;

export type ViewId = "left" | "topRight" | "bottomRight";

export const MOSAIC_PANE_CONSTRAINTS = {
  MINIMUM_PERCENTAGE: 20,
  MAXIMUM_PERCENTAGE: 50,
  DEFAULT_SPLIT_PERCENTAGE: 50,
} as const;

export const MOSAIC_RIGHT_COLUMN_SPLIT = 55;

export const MAX_TABS = 10;

export const DROPPABLE_IDS = {
  TABS: "droppable",
  ENGINES: "engines-droppable",
} as const;

export const SCROLL_AREA_CONFIG = {
  SCROLLBAR_SIZE: 8,
} as const;

export const STORAGE_KEYS = {
  WINDOWS_STATE: "windowsState",
} as const;

export const DEFAULT_MOSAIC_LAYOUT: MosaicNode<ViewId> = {
  direction: "row",
  first: MOSAIC_PORTAL_IDS.LEFT as ViewId,
  second: {
    direction: "column",
    first: MOSAIC_PORTAL_IDS.TOP_RIGHT as ViewId,
    second: MOSAIC_PORTAL_IDS.BOTTOM_RIGHT as ViewId,
    splitPercentage: MOSAIC_RIGHT_COLUMN_SPLIT,
  },
};

export const CUSTOM_EVENTS = {
  ENGINE_REORDER: "engineReorder",
} as const;

export const REPORT_ID_PREFIX = "report_";

export function createFullLayout(): { [viewId: string]: JSX.Element } {
  return {
    [MOSAIC_PORTAL_IDS.LEFT]: <div id={MOSAIC_PORTAL_IDS.LEFT} />,
    [MOSAIC_PORTAL_IDS.TOP_RIGHT]: <div id={MOSAIC_PORTAL_IDS.TOP_RIGHT} />,
    [MOSAIC_PORTAL_IDS.BOTTOM_RIGHT]: <div id={MOSAIC_PORTAL_IDS.BOTTOM_RIGHT} />,
  };
}

export function constrainSplitPercentage(splitPercentage?: number): number {
  const value = splitPercentage ?? MOSAIC_PANE_CONSTRAINTS.DEFAULT_SPLIT_PERCENTAGE;
  
  return Math.max(
    MOSAIC_PANE_CONSTRAINTS.MINIMUM_PERCENTAGE,
    Math.min(MOSAIC_PANE_CONSTRAINTS.MAXIMUM_PERCENTAGE, value),
  );
}
