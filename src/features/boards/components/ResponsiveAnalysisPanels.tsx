import { ActionIcon, Collapse, Group, Paper, Stack, Tabs, Text } from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import {
  IconChevronDown,
  IconChevronUp,
  IconDatabase,
  IconGraphFilled,
  IconInfoCircle,
  IconNotes,
  IconTargetArrow,
  IconZoomCheck,
} from "@tabler/icons-react";
import { memo, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AnalysisPanel from "@/components/panels/analysis/AnalysisPanel";
import AnnotationPanel from "@/components/panels/annotation/AnnotationPanel";
import DatabasePanel from "@/components/panels/database/DatabasePanel";
import InfoPanel from "@/components/panels/info/InfoPanel";
import GraphPanel from "@/components/panels/practice/GraphPanel";
import PracticePanel from "@/components/panels/practice/PracticePanel";
import { ResponsiveLoadingWrapper } from "@/components/ResponsiveLoadingWrapper";
import { ResponsiveSkeleton } from "@/components/ResponsiveSkeleton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

interface ResponsiveAnalysisPanelsProps {
  currentTab?: string;
  onTabChange?: (value: string | null) => void;
  isRepertoire?: boolean;
  isPuzzle?: boolean;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

function ResponsiveAnalysisPanels({
  currentTab = "info",
  onTabChange,
  isRepertoire = false,
  isPuzzle = false,
  isLoading = false,
  error = null,
  onRetry,
}: ResponsiveAnalysisPanelsProps) {
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<Error | null>(null);
  const [isCollapsed, toggleCollapsed] = useToggle([false, true]);

  // Handle analysis panels initialization
  useEffect(() => {
    const initializePanels = async () => {
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

    initializePanels();
  }, []);

  // Error handling for analysis panels initialization
  const handleRetry = useCallback(() => {
    setInitializationError(null);
    setIsInitializing(true);
    onRetry?.();
  }, [onRetry]);

  // Determine if panels should be collapsible
  const shouldCollapse = layout.chessBoard.touchOptimized;

  // Set default collapsed state based on layout
  useEffect(() => {
    if (shouldCollapse) {
      toggleCollapsed(true); // Collapse by default on mobile
    } else {
      toggleCollapsed(false); // Expand by default on desktop
    }
  }, [shouldCollapse, toggleCollapsed]);

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
        <div>{t("errors.failedToLoadAnalysisPanels")}</div>
        <button type="button" onClick={handleRetry}>
          {t("common.reset")}
        </button>
      </Stack>
    );
  }

  // Render the analysis panels
  const analysisContent = (
    <Paper
      withBorder
      p="xs"
      style={{
        height: "100%",
      }}
      pos="relative"
    >
      <Tabs
        w="100%"
        h="100%"
        value={currentTab}
        onChange={onTabChange}
        keepMounted={false}
        activateTabWithKeyboard={false}
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Tabs.List grow mb="1rem">
          {isRepertoire && (
            <Tabs.Tab value="practice" leftSection={<IconTargetArrow size="1rem" />}>
              {t("features.board.tabs.practice")}
            </Tabs.Tab>
          )}
          {isRepertoire && (
            <Tabs.Tab value="graph" leftSection={<IconGraphFilled size="1rem" />}>
              {t("features.board.tabs.graph.label")}
            </Tabs.Tab>
          )}
          {!isPuzzle && (
            <Tabs.Tab value="analysis" leftSection={<IconZoomCheck size="1rem" />}>
              {t("features.board.tabs.analysis")}
            </Tabs.Tab>
          )}
          {!isPuzzle && (
            <Tabs.Tab value="database" leftSection={<IconDatabase size="1rem" />}>
              {t("features.board.tabs.database")}
            </Tabs.Tab>
          )}
          {!isPuzzle && (
            <Tabs.Tab value="annotate" leftSection={<IconNotes size="1rem" />}>
              {t("features.board.tabs.annotate")}
            </Tabs.Tab>
          )}
          <Tabs.Tab value="info" leftSection={<IconInfoCircle size="1rem" />}>
            {t("features.board.tabs.info")}
          </Tabs.Tab>
        </Tabs.List>
        {isRepertoire && (
          <Tabs.Panel value="practice" flex={1} style={{ overflowY: "hidden" }}>
            <Suspense>
              <PracticePanel />
            </Suspense>
          </Tabs.Panel>
        )}
        {isRepertoire && (
          <Tabs.Panel value="graph" flex={1} style={{ overflowY: "hidden" }}>
            <Suspense>
              <GraphPanel />
            </Suspense>
          </Tabs.Panel>
        )}
        <Tabs.Panel value="info" flex={1} style={{ overflowY: "hidden" }}>
          <InfoPanel />
        </Tabs.Panel>
        <Tabs.Panel value="database" flex={1} style={{ overflowY: "hidden" }}>
          <DatabasePanel />
        </Tabs.Panel>
        <Tabs.Panel value="annotate" flex={1} style={{ overflowY: "hidden" }}>
          <AnnotationPanel />
        </Tabs.Panel>
        <Tabs.Panel value="analysis" flex={1} style={{ overflowY: "hidden" }}>
          <Suspense>
            <AnalysisPanel />
          </Suspense>
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );

  // If panels should be collapsible, wrap in collapsible container
  if (shouldCollapse) {
    return (
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Text size="sm" fw={500}>
            Analysis Panels
          </Text>
          <ActionIcon variant="subtle" size="sm" onClick={() => toggleCollapsed()}>
            {isCollapsed ? <IconChevronDown size="1rem" /> : <IconChevronUp size="1rem" />}
          </ActionIcon>
        </Group>
        <Collapse in={!isCollapsed}>{analysisContent}</Collapse>
      </Stack>
    );
  }

  // Return full panels for desktop
  return analysisContent;
}

export default memo(ResponsiveAnalysisPanels);
