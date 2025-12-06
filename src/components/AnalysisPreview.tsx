import { Box, Popover, useMantineTheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { parsePGN } from "@/utils/chess";
import { TreeStateProvider } from "@/components/TreeStateContext";
import EvalChart from "@/components/EvalChart";

interface AnalysisPreviewProps {
  pgn: string | null;
  children: React.ReactNode;
}

function AnalysisPreviewContent({ pgn }: { pgn: string }) {
  const theme = useMantineTheme();

  const { data: parsedGame, isLoading } = useQuery({
    queryKey: ["analysis-preview", pgn],
    queryFn: async () => {
      return await parsePGN(pgn);
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!pgn,
  });

  if (isLoading || !parsedGame) {
    return (
      <Box w={400} h={200} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        Loading...
      </Box>
    );
  }

  return (
    <TreeStateProvider initial={parsedGame}>
      <Box w={400} p="md">
        <EvalChart isAnalysing={false} startAnalysis={() => {}} />
      </Box>
    </TreeStateProvider>
  );
}

export function AnalysisPreview({ pgn, children }: AnalysisPreviewProps) {
  const [opened, { open, close }] = useDisclosure(false);

  if (!pgn) {
    return <>{children}</>;
  }

  return (
    <Popover
      width={450}
      position="right"
      withArrow
      shadow="md"
      withinPortal
      opened={opened}
    >
      <Popover.Target>
        <Box onMouseEnter={open} onMouseLeave={close}>
          {children}
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <AnalysisPreviewContent pgn={pgn} />
      </Popover.Dropdown>
    </Popover>
  );
}

