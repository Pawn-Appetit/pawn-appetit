import { Badge, Code, Group, Modal, ScrollArea, Stack, Table, Text, Title, Divider, Tabs, Select, ActionIcon, Tooltip, Button, SegmentedControl } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { IconExternalLink, IconCopy } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { tabsAtom, activeTabAtom } from "@/state/atoms";
import { createTab } from "@/utils/tabs";
import { parsePGN } from "@/utils/chess";
import type { AnalysisResult, ErrorKind } from "@/utils/playerMistakes";

interface PlayerStatsModalProps {
  opened: boolean;
  onClose: () => void;
  result: AnalysisResult | null;
  debugPgns?: string;
}

export function PlayerStatsModal({ opened, onClose, result, debugPgns }: PlayerStatsModalProps) {
  const { t } = useTranslation();
  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useAtom(activeTabAtom)[1];
  const navigate = useNavigate();
  
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"cpSwing" | "moveNumber" | "kind" | "severity">("cpSwing");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [openingsColorFilter, setOpeningsColorFilter] = useState<"all" | "white" | "black">("all");

  // Get unique values for filters (must be before early return)
  const uniqueKinds = useMemo(() => {
    if (!result) return [];
    const kinds = new Set(result.issues.map((i) => i.kind));
    return Array.from(kinds).sort();
  }, [result]);
  
  const uniqueSeverities = useMemo(() => {
    if (!result) return [];
    const severities = new Set(result.issues.map((i) => i.severity));
    return Array.from(severities).sort();
  }, [result]);
  
  // Filter and sort issues (must be before early return)
  const filteredAndSortedIssues = useMemo(() => {
    if (!result) return [];
    let filtered = result.issues;
    
    // Apply filters
    if (kindFilter) {
      filtered = filtered.filter((i) => i.kind === kindFilter);
    }
    if (severityFilter) {
      filtered = filtered.filter((i) => i.severity === severityFilter);
    }
    
    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "cpSwing":
          const aSwing = a.evidence.cpSwingAbs ?? 0;
          const bSwing = b.evidence.cpSwingAbs ?? 0;
          comparison = aSwing - bSwing;
          break;
        case "moveNumber":
          comparison = a.moveNumber - b.moveNumber;
          break;
        case "kind":
          comparison = a.kind.localeCompare(b.kind);
          break;
        case "severity":
          const severityOrder = { blunder: 0, mistake: 1, inaccuracy: 2, info: 3 };
          comparison = (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99);
          break;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });
    
    return sorted;
  }, [result, kindFilter, severityFilter, sortBy, sortOrder]);

  // Group issues by color for overview display
  const issuesByColor = useMemo(() => {
    if (!result) return { white: [], black: [] };
    return {
      white: result.issues.filter((i) => i.playerColor === "white"),
      black: result.issues.filter((i) => i.playerColor === "black"),
    };
  }, [result]);

  // Calculate stats by color
  const statsByColor = useMemo(() => {
    if (!result) {
      return {
        white: { issueCounts: {} as Record<ErrorKind, number>, themeCounts: {} as Record<string, number> },
        black: { issueCounts: {} as Record<ErrorKind, number>, themeCounts: {} as Record<string, number> },
      };
    }
    
    const whiteIssues = issuesByColor.white;
    const blackIssues = issuesByColor.black;
    
    const whiteIssueCounts: Record<ErrorKind, number> = {
      tactical_blunder: 0,
      tactical_mistake: 0,
      tactical_inaccuracy: 0,
      material_blunder: 0,
      opening_principle: 0,
      piece_inactivity: 0,
      positional_misplay: 0,
      unknown: 0,
    };
    const whiteThemeCounts: Record<string, number> = {};
    
    const blackIssueCounts: Record<ErrorKind, number> = {
      tactical_blunder: 0,
      tactical_mistake: 0,
      tactical_inaccuracy: 0,
      material_blunder: 0,
      opening_principle: 0,
      piece_inactivity: 0,
      positional_misplay: 0,
      unknown: 0,
    };
    const blackThemeCounts: Record<string, number> = {};
    
    whiteIssues.forEach((issue) => {
      whiteIssueCounts[issue.kind] = (whiteIssueCounts[issue.kind] || 0) + 1;
      whiteThemeCounts[issue.theme] = (whiteThemeCounts[issue.theme] || 0) + 1;
    });
    
    blackIssues.forEach((issue) => {
      blackIssueCounts[issue.kind] = (blackIssueCounts[issue.kind] || 0) + 1;
      blackThemeCounts[issue.theme] = (blackThemeCounts[issue.theme] || 0) + 1;
    });
    
    return {
      white: { issueCounts: whiteIssueCounts, themeCounts: whiteThemeCounts },
      black: { issueCounts: blackIssueCounts, themeCounts: blackThemeCounts },
    };
  }, [result, issuesByColor]);

  // Filter and sort openings by color and games count (must be before early return)
  const filteredAndSortedOpenings = useMemo(() => {
    if (!result) return [];
    let filtered = result.stats.byOpening;
    
    // Apply color filter
    if (openingsColorFilter !== "all") {
      filtered = filtered.filter((o) => o.playerColor === openingsColorFilter);
    }
    
    // Sort by games count descending (most played first)
    return [...filtered].sort((a, b) => b.games - a.games);
  }, [result, openingsColorFilter]);

  if (!result) {
    return null;
  }

  const { player, gamesAnalyzed, gamesMatchedPlayer, issues, stats } = result;
  
  const copyFenToClipboard = (fen: string) => {
    navigator.clipboard.writeText(fen);
    notifications.show({
      title: t("features.dashboard.fenCopied", "FEN Copied"),
      message: t("features.dashboard.fenCopiedMessage", "FEN copied to clipboard"),
      color: "green",
    });
  };
  
  const openGameInNewTab = async (gameId: string, fenBefore: string, gameIndex: number) => {
    // Try to find the game in debugPgns
    if (debugPgns) {
      const games = debugPgns.split("\n\n").filter((g) => g.trim().length > 0);
      
      // Try to find by gameIndex first (more reliable)
      let game = games[gameIndex];
      
      // If not found by index, try to find by gameId in headers
      if (!game) {
        const foundGame = games.find((g) => {
          const siteMatch = g.match(/\[Site\s+"([^"]+)"/);
          const eventMatch = g.match(/\[Event\s+"([^"]+)"/);
          const roundMatch = g.match(/\[Round\s+"([^"]+)"/);
          return (
            siteMatch?.[1] === gameId ||
            eventMatch?.[1] === gameId ||
            roundMatch?.[1] === gameId ||
            g.includes(gameId)
          );
        });
        if (foundGame) {
          game = foundGame;
        }
      }
      
      if (game) {
        try {
          // Parse the PGN to get the position at the FEN
          const tree = await parsePGN(game);
          
          // Find the position in the tree that matches fenBefore
          let targetPosition: number[] = [];
          const findPosition = (node: any, path: number[] = []): boolean => {
            if (node.fen === fenBefore) {
              targetPosition = path;
              return true;
            }
            for (let i = 0; i < node.children.length; i++) {
              if (findPosition(node.children[i], [...path, i])) {
                return true;
              }
            }
            return false;
          };
          
          findPosition(tree.root);
          
          // Create a new tab with the game at the specific position
          await createTab({
            tab: {
              name: `Game ${gameIndex + 1} - Move ${fenBefore.split(" ")[5] || ""}`,
              type: "analysis",
            },
            setTabs,
            setActiveTab: () => {}, // Don't change active tab
            pgn: game,
            position: targetPosition.length > 0 ? targetPosition : undefined,
          });
          
          notifications.show({
            title: t("features.dashboard.gameOpened", "Game Opened"),
            message: t("features.dashboard.gameOpenedMessage", "Game opened in new tab"),
            color: "green",
          });
        } catch (error) {
          console.error("Error opening game:", error);
          notifications.show({
            title: t("features.dashboard.error", "Error"),
            message: t("features.dashboard.errorOpeningGame", "Failed to open game"),
            color: "red",
          });
        }
      } else {
        notifications.show({
          title: t("features.dashboard.gameNotFound", "Game Not Found"),
          message: t("features.dashboard.gameNotFoundMessage", "Could not find game in PGNs"),
          color: "orange",
        });
      }
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`${t("features.dashboard.playerStats", "Player Statistics")}: ${player}`}
      size="90%"
      styles={{
        body: { minHeight: "80vh", padding: "20px" },
        content: { maxHeight: "90vh", height: "90vh" },
        inner: { height: "90vh" },
      }}
    >
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">{t("features.dashboard.overview", "Overview")}</Tabs.Tab>
          <Tabs.Tab value="issues">{t("features.dashboard.issues", "Issues")}</Tabs.Tab>
          <Tabs.Tab value="openings">{t("features.dashboard.openings", "Openings")}</Tabs.Tab>
          <Tabs.Tab value="debug">{t("features.dashboard.debug", "Debug")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <ScrollArea h="calc(90vh - 180px)">
            <Stack gap="md">
              <Group>
                <Text size="sm" c="dimmed">{t("features.dashboard.gamesAnalyzed", "Games Analyzed")}:</Text>
                <Text fw={600}>{gamesAnalyzed}</Text>
              </Group>
              <Group>
                <Text size="sm" c="dimmed">{t("features.dashboard.gamesMatched", "Games Matched")}:</Text>
                <Text fw={600}>{gamesMatchedPlayer}</Text>
              </Group>
              <Group>
                <Text size="sm" c="dimmed">{t("features.dashboard.totalIssues", "Total Issues")}:</Text>
                <Text fw={600}>{issues.length}</Text>
              </Group>

              <Divider />

              <Title order={4}>{t("features.dashboard.issueCounts", "Issue Counts")}</Title>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 150 }}>{t("features.dashboard.issueType", "Issue Type")}</Table.Th>
                    <Table.Th style={{ width: 120 }}>{t("features.dashboard.count", "Count")}</Table.Th>
                    <Table.Th style={{ width: 200 }}>{t("features.dashboard.byColor", "By Color")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {Object.entries(stats.global.issueCounts)
                    .filter(([_, count]) => count > 0)
                    .sort(([_, a], [__, b]) => b - a)
                    .map(([kind, count]) => {
                      const whiteCount = statsByColor.white.issueCounts[kind as ErrorKind] || 0;
                      const blackCount = statsByColor.black.issueCounts[kind as ErrorKind] || 0;
                      return (
                        <Table.Tr key={kind}>
                          <Table.Td style={{ width: 150 }}>{kind.replace(/_/g, " ")}</Table.Td>
                          <Table.Td style={{ width: 120 }}>{count}</Table.Td>
                          <Table.Td style={{ width: 200 }}>
                            <Group gap="xs">
                              <Badge size="sm" variant="light" color="gray" style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}>
                                ♔ {whiteCount}
                              </Badge>
                              <Badge size="sm" variant="light" color="dark" style={{ backgroundColor: "rgba(0, 0, 0, 0.1)" }}>
                                ♚ {blackCount}
                              </Badge>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                </Table.Tbody>
              </Table>

              <Divider />

              <Title order={4}>{t("features.dashboard.themeCounts", "Theme Counts")}</Title>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 150 }}>{t("features.dashboard.theme", "Theme")}</Table.Th>
                    <Table.Th style={{ width: 120 }}>{t("features.dashboard.count", "Count")}</Table.Th>
                    <Table.Th style={{ width: 200 }}>{t("features.dashboard.byColor", "By Color")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {Object.entries(stats.global.themeCounts)
                    .filter(([_, count]) => count > 0)
                    .sort(([_, a], [__, b]) => b - a)
                    .map(([theme, count]) => {
                      const whiteCount = statsByColor.white.themeCounts[theme] || 0;
                      const blackCount = statsByColor.black.themeCounts[theme] || 0;
                      return (
                        <Table.Tr key={theme}>
                          <Table.Td style={{ width: 150 }}>{theme.replace(/_/g, " ")}</Table.Td>
                          <Table.Td style={{ width: 120 }}>{count}</Table.Td>
                          <Table.Td style={{ width: 200 }}>
                            <Group gap="xs">
                              <Badge size="sm" variant="light" color="gray" style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}>
                                ♔ {whiteCount}
                              </Badge>
                              <Badge size="sm" variant="light" color="dark" style={{ backgroundColor: "rgba(0, 0, 0, 0.1)" }}>
                                ♚ {blackCount}
                              </Badge>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                </Table.Tbody>
              </Table>

              <Divider />

              <Title order={4}>{t("features.dashboard.mostCommonSchemes", "Most Common Schemes")}</Title>
              <Stack gap="xs">
                {stats.global.mostCommonSchemes.slice(0, 10).map((scheme, idx) => (
                  <Group key={idx} justify="space-between">
                    <Text size="sm" style={{ fontFamily: "monospace" }}>{scheme.schemeSignature}</Text>
                    <Badge>{scheme.count}</Badge>
                  </Group>
                ))}
              </Stack>
            </Stack>
          </ScrollArea>
        </Tabs.Panel>

        <Tabs.Panel value="issues" pt="md">
          <Stack gap="md">
            {/* Filters and Sort */}
            <Group gap="md" wrap="wrap">
              <Select
                label={t("features.dashboard.filterByKind", "Filter by Kind")}
                placeholder={t("features.dashboard.allKinds", "All Kinds")}
                data={uniqueKinds.map((k) => ({ value: k, label: k.replace(/_/g, " ") }))}
                value={kindFilter}
                onChange={setKindFilter}
                clearable
                style={{ flex: 1, minWidth: 150 }}
              />
              <Select
                label={t("features.dashboard.filterBySeverity", "Filter by Severity")}
                placeholder={t("features.dashboard.allSeverities", "All Severities")}
                data={uniqueSeverities.map((s) => ({ value: s, label: s }))}
                value={severityFilter}
                onChange={setSeverityFilter}
                clearable
                style={{ flex: 1, minWidth: 150 }}
              />
              <Select
                label={t("features.dashboard.sortBy", "Sort By")}
                data={[
                  { value: "cpSwing", label: t("features.dashboard.cpSwing", "CP Swing") },
                  { value: "moveNumber", label: t("features.dashboard.moveNumber", "Move Number") },
                  { value: "kind", label: t("features.dashboard.kind", "Kind") },
                  { value: "severity", label: t("features.dashboard.severity", "Severity") },
                ]}
                value={sortBy}
                onChange={(v) => v && setSortBy(v as typeof sortBy)}
                style={{ flex: 1, minWidth: 150 }}
              />
              <Select
                label={t("features.dashboard.order", "Order")}
                data={[
                  { value: "desc", label: t("features.dashboard.descending", "Descending") },
                  { value: "asc", label: t("features.dashboard.ascending", "Ascending") },
                ]}
                value={sortOrder}
                onChange={(v) => v && setSortOrder(v as typeof sortOrder)}
                style={{ flex: 1, minWidth: 120 }}
              />
            </Group>
            
            <Text size="sm" c="dimmed">
              {t("features.dashboard.showingIssues", "Showing {{count}} of {{total}} issues", {
                count: filteredAndSortedIssues.length,
                total: issues.length,
              })}
            </Text>
            
            <ScrollArea h="calc(90vh - 180px)">
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("features.dashboard.game", "Game")}</Table.Th>
                    <Table.Th>{t("features.dashboard.move", "Move")}</Table.Th>
                    <Table.Th>{t("features.dashboard.played", "Played")}</Table.Th>
                    <Table.Th>{t("features.dashboard.kind", "Kind")}</Table.Th>
                    <Table.Th>{t("features.dashboard.severity", "Severity")}</Table.Th>
                    <Table.Th>{t("features.dashboard.cpSwing", "CP Swing")}</Table.Th>
                    <Table.Th>{t("features.dashboard.fen", "FEN")}</Table.Th>
                    <Table.Th>{t("features.dashboard.actions", "Actions")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredAndSortedIssues.slice(0, 100).map((issue, idx) => (
                    <Table.Tr key={idx}>
                      <Table.Td>
                        <Text size="xs" style={{ maxWidth: 150 }} truncate>
                          {issue.gameId}
                        </Text>
                      </Table.Td>
                      <Table.Td>{issue.moveNumber}. {issue.playedSan}</Table.Td>
                      <Table.Td>{issue.playedSan}</Table.Td>
                      <Table.Td>{issue.kind.replace(/_/g, " ")}</Table.Td>
                      <Table.Td>
                        <Badge
                          color={
                            issue.severity === "blunder"
                              ? "red"
                              : issue.severity === "mistake"
                                ? "orange"
                                : issue.severity === "inaccuracy"
                                  ? "yellow"
                                  : "gray"
                          }
                        >
                          {issue.severity}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {issue.evidence.cpSwingPlayer !== undefined
                          ? issue.evidence.cpSwingPlayer > 0
                            ? `+${issue.evidence.cpSwingPlayer}`
                            : issue.evidence.cpSwingPlayer
                          : "-"}
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label={issue.fenBefore}>
                          <Text size="xs" style={{ maxWidth: 200 }} truncate>
                            {issue.fenBefore}
                          </Text>
                        </Tooltip>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Tooltip label={t("features.dashboard.copyFen", "Copy FEN")}>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              onClick={() => copyFenToClipboard(issue.fenBefore)}
                            >
                              <IconCopy size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t("features.dashboard.openGame", "Open Game")}>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              onClick={() => openGameInNewTab(issue.gameId, issue.fenBefore, issue.gameIndex)}
                            >
                              <IconExternalLink size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              {filteredAndSortedIssues.length > 100 && (
                <Text size="sm" c="dimmed" mt="md" ta="center">
                  {t("features.dashboard.showingFirst100", "Showing first 100 of {{total}} issues", {
                    total: filteredAndSortedIssues.length,
                  })}
                </Text>
              )}
            </ScrollArea>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="openings" pt="md">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Text size="sm" fw={500}>{t("features.dashboard.filterByColor", "Filter by Color")}:</Text>
              <SegmentedControl
                value={openingsColorFilter}
                onChange={(value) => setOpeningsColorFilter(value as "all" | "white" | "black")}
                data={[
                  { label: t("features.dashboard.all", "All"), value: "all" },
                  { label: "♔ " + t("features.dashboard.white", "White"), value: "white" },
                  { label: "♚ " + t("features.dashboard.black", "Black"), value: "black" },
                ]}
                size="sm"
              />
            </Group>
            <ScrollArea h="calc(90vh - 180px)">
              <Stack gap="md">
                {filteredAndSortedOpenings.map((opening, idx) => (
                <Stack 
                  key={idx} 
                  gap="xs"
                  style={{
                    padding: "8px",
                    borderRadius: "4px",
                    backgroundColor: opening.playerColor === "white" 
                      ? "rgba(255, 255, 255, 0.05)" 
                      : "rgba(0, 0, 0, 0.05)",
                    borderLeft: `3px solid ${opening.playerColor === "white" ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.3)"}`,
                  }}
                >
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Text fw={600}>
                        {opening.opening || opening.eco || t("features.dashboard.unknownOpening", "Unknown Opening")}
                      </Text>
                      <Badge 
                        size="xs" 
                        variant="light" 
                        color={opening.playerColor === "white" ? "gray" : "dark"}
                        style={{ 
                          backgroundColor: opening.playerColor === "white" 
                            ? "rgba(255, 255, 255, 0.1)" 
                            : "rgba(0, 0, 0, 0.1)" 
                        }}
                      >
                        {opening.playerColor === "white" ? "♔" : "♚"}
                      </Badge>
                    </Group>
                    <Badge>{opening.games} {t("features.dashboard.games", "games")}</Badge>
                  </Group>
                  {opening.variation && (
                    <Text size="sm" c="dimmed">{opening.variation}</Text>
                  )}
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">
                      {t("features.dashboard.pliesAnalyzed", "Plies Analyzed")}: {opening.pliesAnalyzed}
                    </Text>
                  </Group>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("features.dashboard.issueType", "Issue Type")}</Table.Th>
                        <Table.Th>{t("features.dashboard.count", "Count")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {Object.entries(opening.issueCounts)
                        .filter(([_, count]) => count > 0)
                        .sort(([_, a], [__, b]) => b - a)
                        .slice(0, 5)
                        .map(([kind, count]) => (
                          <Table.Tr key={kind}>
                            <Table.Td>{kind.replace(/_/g, " ")}</Table.Td>
                            <Table.Td>{count}</Table.Td>
                          </Table.Tr>
                        ))}
                    </Table.Tbody>
                  </Table>
                  {opening.frequentMistakes.length > 0 && (
                    <Stack gap="xs" mt="xs">
                      <Text size="xs" fw={600}>{t("features.dashboard.frequentMistakes", "Frequent Mistakes")}:</Text>
                      {opening.frequentMistakes.slice(0, 3).map((mistake, mIdx) => (
                        <Text key={mIdx} size="xs" c="dimmed">
                          {mistake.moveNumber}. {mistake.playedSan} ({mistake.count}x) - {mistake.kind.replace(/_/g, " ")}
                        </Text>
                      ))}
                    </Stack>
                  )}
                  <Divider />
                </Stack>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="debug" pt="md">
          <ScrollArea h="calc(90vh - 180px)">
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>{t("features.dashboard.debugPgns", "Debug PGNs")}</Title>
                {debugPgns && (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconCopy size={16} />}
                    onClick={() => {
                      navigator.clipboard.writeText(debugPgns);
                      notifications.show({
                        title: t("features.dashboard.copied", "Copied"),
                        message: t("features.dashboard.pgnsCopied", "PGNs copied to clipboard"),
                        color: "green",
                      });
                    }}
                  >
                    {t("features.dashboard.copy", "Copy")}
                  </Button>
                )}
              </Group>
              <Text size="sm" c="dimmed">
                {t("features.dashboard.debugPgnsDescription", "PGNs passed to the analysis function:")}
              </Text>
              {debugPgns ? (
                <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "11px" }}>
                  {debugPgns}
                </Code>
              ) : (
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  {t("features.dashboard.noDebugPgns", "No PGNs available for debug")}
                </Text>
              )}
            </Stack>
          </ScrollArea>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

