import React, { type ReactNode, useEffect, useState } from "react";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { ResponsiveSkeleton } from "./ResponsiveSkeleton";

interface ResponsiveLoadingProps {
  children: ReactNode;
  fallback?: ReactNode;
  loadingComponent?: ReactNode;
  isLoading?: boolean;
}

export function ResponsiveLoadingWrapper({
  children,
  fallback,
  loadingComponent,
  isLoading = false,
}: ResponsiveLoadingProps) {
  const { layout } = useResponsiveLayout();
  const [isLayoutCalculating, setIsLayoutCalculating] = useState(true);

  useEffect(() => {
    // Simulate layout calculation time
    const timer = setTimeout(() => {
      setIsLayoutCalculating(false);
    }, 50); // Minimal delay for smooth transitions

    return () => clearTimeout(timer);
  }, [layout]);

  if (isLoading || isLayoutCalculating) {
    return loadingComponent || <ResponsiveSkeleton />;
  }

  if (!layout) {
    return fallback || <div>Default Layout</div>;
  }

  return <>{children}</>;
}
