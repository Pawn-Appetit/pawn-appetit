import { Skeleton, Stack } from "@mantine/core";
import React from "react";
import { useResponsiveLayout } from "@/common/hooks/useResponsiveLayout";

interface ResponsiveSkeletonProps {
  type?: "default" | "card" | "table" | "board";
}

const SkeletonVariants = {
  mobile: {
    card: { height: "120px", count: 1 },
    table: { height: "60px", count: 5 },
    board: { height: "300px", count: 1 },
    default: { height: "80px", count: 2 },
  },
  desktop: {
    card: { height: "150px", count: 3 },
    table: { height: "40px", count: 10 },
    board: { height: "400px", count: 1 },
    default: { height: "100px", count: 4 },
  },
};

export function ResponsiveSkeleton({ type = "default" }: ResponsiveSkeletonProps) {
  const { layout } = useResponsiveLayout();
  const isMobile = layout.sidebar.position === "footer";
  const variant = isMobile ? SkeletonVariants.mobile : SkeletonVariants.desktop;
  const config = variant[type];

  return (
    <div data-testid="responsive-skeleton">
      <Stack gap="md">
        {Array.from({ length: config.count }).map((_, index) => (
          <Skeleton key={index} height={config.height} radius="md" data-testid="skeleton-item" />
        ))}
      </Stack>
    </div>
  );
}
