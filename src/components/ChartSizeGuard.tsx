import { Box, type BoxProps } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import React, { memo } from "react";

type ChartSizeGuardProps = Omit<BoxProps, "children"> & {
  height: number;
  children: React.ReactNode;
};

export const ChartSizeGuard = memo(function ChartSizeGuard({ height, children, style, ...boxProps }: ChartSizeGuardProps) {
  const { ref, width, height: measuredHeight } = useElementSize();
  const isReady = width > 0 && measuredHeight > 0;

  return (
    <Box
      ref={ref}
      {...boxProps}
      style={{
        width: "100%",
        height,
        minWidth: 0,
        minHeight: 0,
        ...(style ?? {}),
      }}
    >
      {isReady ? children : null}
    </Box>
  );
});

