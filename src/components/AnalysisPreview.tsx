import { Box, Center, Group, Paper, Popover, Stack, Text, useMantineTheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { parsePGN, getGameStats } from "@/utils/chess";
import { TreeStateProvider } from "@/components/TreeStateContext";
import EvalChart from "@/components/EvalChart";
import { ANNOTATION_INFO, annotationColors, isBasicAnnotation } from "@/utils/annotation";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";

interface AnalysisPreviewProps {
  pgn: string | null;
  children: React.ReactNode;
}

function GameStatsPreview({ whiteAnnotations, blackAnnotations, headers }: { whiteAnnotations: any; blackAnnotations: any; headers?: any }) {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    return Object.keys(ANNOTATION_INFO)
      .filter((a) => isBasicAnnotation(a))
      .sort((a, b) => {
        const order: Record<string, number> = {
          "!!": 1,
          "!": 2,
          Best: 3,
          "!?": 4,
          "?!": 5,
          "?": 6,
          "??": 7,
        };
        return (order[a] || 99) - (order[b] || 99);
      })
      .map((annotation) => {
        const s = annotation as "??" | "?" | "?!" | "!!" | "!" | "!?" | "Best";
        const { name, translationKey } = ANNOTATION_INFO[s];
        const title = translationKey ? t(`chess.annotate.${translationKey}`) : name;

        return {
          annotation,
          s,
          title,
          color: annotationColors[s],
          w: whiteAnnotations[s],
          b: blackAnnotations[s],
        };
      });
  }, [whiteAnnotations, blackAnnotations, t]);

  return (
    <Paper withBorder radius="lg" p="md">
      {/* Header: auto | 1fr | auto */}
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: "1rem",
          paddingInline: "0.25rem",
          paddingBottom: "0.75rem",
        }}
      >
        <Center>
          <Text size="md" fw={700}>
            {(headers?.white && headers.white.trim() !== "") ? headers.white : t("chess.white")}
          </Text>
        </Center>

        <Center>
          <Text size="sm" fw={600} c="dimmed">
            Annotation
          </Text>
        </Center>

        <Center>
          <Text size="md" fw={700}>
            {(headers?.black && headers.black.trim() !== "") ? headers.black : t("chess.black")}
          </Text>
        </Center>
      </Box>

      <Stack gap="sm">
        {rows.map((r) => {
          const total = r.w + r.b;
          const wPct = total > 0 ? (r.w / total) * 100 : 0;
          const bPct = total > 0 ? (r.b / total) * 100 : 0;

          const hasAny = total > 0;

          return (
            <Paper
              key={r.annotation}
              withBorder
              radius="md"
              p="sm"
              style={{
                background: "var(--mantine-color-dark-7)",
                borderColor: "var(--mantine-color-dark-4)",
              }}
            >
              <Box
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                {/* WHITE */}
                <Center
                  style={{
                    textAlign: "center",
                    color: r.w > 0 ? r.color : undefined,
                  }}
                >
                  <Box
                    style={{
                      height: "1.8rem",
                      minWidth: "6ch",
                      paddingInline: "1.2ch",
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid var(--mantine-color-dark-4)",
                      background: r.w > 0 ? "var(--mantine-color-dark-6)" : "transparent",
                    }}
                  >
                    <Text
                      size="sm"
                      fw={r.w > 0 ? 700 : 400}
                      style={{
                        lineHeight: 1,
                        color: r.w > 0 ? r.color : undefined,
                      }}
                    >
                      {r.w}
                    </Text>
                  </Box>
                </Center>

                {/* CENTER */}
                <Box style={{ minWidth: 0, color: hasAny ? r.color : undefined }}>
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, marginBottom: "0.45rem" }}>
                    <Box style={{ color: hasAny ? r.color : undefined }}>
                      <Center>
                        {r.annotation === "Best" ? (
                          <svg viewBox="0 0 100 100" style={{ width: "1em", height: "1em", display: "block" }}>
                            <path
                              fill="currentColor"
                              d="M 50 15 L 55.9 38.1 L 80 38.1 L 60.5 52.4 L 66.4 75.5 L 50 61.2 L 33.6 75.5 L 39.5 52.4 L 20 38.1 L 44.1 38.1 Z"
                            />
                          </svg>
                        ) : (
                          <Text size="sm" style={{ lineHeight: 1 }}>
                            {r.annotation}
                          </Text>
                        )}
                      </Center>
                    </Box>

                    <Box
                      style={{
                        width: "0.45rem",
                        height: "1.1rem",
                        borderRadius: 999,
                        backgroundColor: hasAny ? r.color : "var(--mantine-color-gray-7)",
                        opacity: hasAny ? 0.95 : 0.35,
                        flex: "0 0 auto",
                      }}
                    />

                    <Text size="sm" truncate style={{ width: "100%" }}>
                      {r.title}
                    </Text>
                  </Group>

                  {/* Barra W vs B */}
                  <Box
                    style={{
                      position: "relative",
                      height: "0.6rem",
                      borderRadius: 999,
                      overflow: "hidden",
                      background: "var(--mantine-color-dark-6)",
                      border: "1px solid var(--mantine-color-dark-4)",
                    }}
                  >
                    <Box
                      style={{
                        position: "absolute",
                        insetInlineStart: 0,
                        top: 0,
                        bottom: 0,
                        width: `${wPct}%`,
                        background: hasAny ? r.color : "transparent",
                        opacity: 0.55,
                      }}
                    />
                    <Box
                      style={{
                        position: "absolute",
                        insetInlineEnd: 0,
                        top: 0,
                        bottom: 0,
                        width: `${bPct}%`,
                        background: hasAny ? r.color : "transparent",
                        opacity: 0.25,
                      }}
                    />
                  </Box>
                </Box>

                {/* BLACK */}
                <Center
                  style={{
                    textAlign: "center",
                    color: r.b > 0 ? r.color : undefined,
                  }}
                >
                  <Box
                    style={{
                      height: "1.8rem",
                      minWidth: "6ch",
                      paddingInline: "1.2ch",
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid var(--mantine-color-dark-4)",
                      background: r.b > 0 ? "var(--mantine-color-dark-6)" : "transparent",
                    }}
                  >
                    <Text
                      size="sm"
                      fw={r.b > 0 ? 700 : 400}
                      style={{
                        lineHeight: 1,
                        color: r.b > 0 ? r.color : undefined,
                      }}
                    >
                      {r.b}
                    </Text>
                  </Box>
                </Center>
              </Box>
            </Paper>
          );
        })}
      </Stack>
    </Paper>
  );
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

  const stats = useMemo(() => {
    if (!parsedGame) return null;
    return getGameStats(parsedGame.root);
  }, [parsedGame]);

  if (isLoading || !parsedGame || !stats) {
    return (
      <Box w={500} h={200} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Text size="sm" c="dimmed">Loading...</Text>
      </Box>
    );
  }

  return (
    <TreeStateProvider initial={parsedGame}>
      <Box w={500} p="sm">
        <Stack gap="xs">
          <Paper withBorder p="xs">
            <EvalChart isAnalysing={false} startAnalysis={() => {}} />
          </Paper>
          <GameStatsPreview 
            whiteAnnotations={stats.whiteAnnotations} 
            blackAnnotations={stats.blackAnnotations}
            headers={parsedGame.headers}
          />
        </Stack>
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
      width={550}
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

