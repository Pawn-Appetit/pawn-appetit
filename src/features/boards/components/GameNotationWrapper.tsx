import { Portal, Stack } from "@mantine/core";
import React, { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import GameNotation from "@/components/GameNotation";
import MoveControls from "@/components/MoveControls";
import { ResponsiveLoadingWrapper } from "@/components/ResponsiveLoadingWrapper";
import { ResponsiveSkeleton } from "@/components/ResponsiveSkeleton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

interface GameNotationWrapperProps {
  topBar?: boolean;
  editingMode?: boolean;
  editingCard?: React.ReactNode;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  children?: ReactNode;
}

function GameNotationWrapper({
  topBar = false,
  editingMode = false,
  editingCard,
  isLoading = false,
  error = null,
  onRetry,
  children = null,
}: GameNotationWrapperProps) {
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<Error | null>(null);

  // Handle analysis panel initialization
  useEffect(() => {
    const initializeAnalysis = async () => {
      try {
        setIsInitializing(true);
        setInitializationError(null);

        // Simulate initialization time for smooth UX
        await new Promise((resolve) => setTimeout(resolve, 50));

        setIsInitializing(false);
      } catch (error) {
        setInitializationError(error as Error);
        setIsInitializing(false);
      }
    };

    initializeAnalysis();
  }, []);

  // Error handling for analysis panel initialization
  const handleRetry = useCallback(() => {
    setInitializationError(null);
    setIsInitializing(true);
    onRetry?.();
  }, [onRetry]);

  // Calculate responsive positioning
  const positioning = useMemo(() => {
    const isNotationUnderBoard = layout.gameNotationUnderBoard;

    return {
      isNotationUnderBoard,
      portalTarget: isNotationUnderBoard ? "#bottom" : "#bottomRight",
      stackDirection: isNotationUnderBoard ? ("column" as const) : ("column" as const),
      gap: isNotationUnderBoard ? "md" : "xs",
    };
  }, [layout.gameNotationUnderBoard]);

  // Show loading state
  if (isLoading || isInitializing) {
    return (
      <ResponsiveLoadingWrapper isLoading={true}>
        <ResponsiveSkeleton type="default" />
      </ResponsiveLoadingWrapper>
    );
  }

  // Show error state
  if (error || initializationError) {
    return (
      <Stack align="center" gap="md">
        <div>{t("errors.failedToLoadGameAnalysis")}</div>
        <button type="button" onClick={handleRetry}>
          {t("common.reset")}
        </button>
      </Stack>
    );
  }

  // Render the analysis panels
  // If children are provided and they're not just MoveControls, render only those (like VariantsNotation)
  // Otherwise, render GameNotation with optional additional children (like MoveControls)
  const hasCustomNotation = React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && child.type !== MoveControls,
  );

  const analysisContent = (
    <Stack h="100%" gap={positioning.gap} style={{ flexDirection: positioning.stackDirection }}>
      {editingMode && editingCard ? (
        editingCard
      ) : hasCustomNotation ? (
        // Custom notation component (like VariantsNotation) - render only those
        children
      ) : (
        // Default: render GameNotation with optional additional children (like MoveControls)
        <>
          <GameNotation topBar={topBar} />
          {children}
        </>
      )}
    </Stack>
  );

  // Position the analysis content based on layout
  if (positioning.isNotationUnderBoard) {
    // Position under the board for mobile/small screens
    return (
      <Portal target={positioning.portalTarget} style={{ height: "100%" }}>
        {analysisContent}
      </Portal>
    );
  }

  // Position in side panel for desktop/large screens
  return (
    <Portal target={positioning.portalTarget} style={{ height: "100%" }}>
      {analysisContent}
    </Portal>
  );
}

export default memo(GameNotationWrapper);
