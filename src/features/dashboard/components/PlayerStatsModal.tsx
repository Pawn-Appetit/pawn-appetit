import { Badge, Code, Group, Modal, Progress, ScrollArea, Stack, Table, Text, Title, Divider, Tabs, Select, MultiSelect, ActionIcon, Tooltip, Button, SegmentedControl } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useState, useMemo, useEffect, Fragment } from "react";
import { IconExternalLink, IconCopy, IconSearch } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import type { NormalizedGame } from "@/bindings";
import { tabsAtom, activeTabAtom } from "@/state/atoms";
import { createTab } from "@/utils/tabs";
import { parsePGN } from "@/utils/chess";
import { splitPgnGames } from "@/utils/pgnUtils";
import type { AnalysisResult, ErrorKind, PawnStructureStat } from "@/utils/playerMistakes";
import { generateAnalysisResult } from "@/utils/playerMistakes";
import { Chessground } from "@/components/Chessground";
import { getAllAnalyzedGames } from "@/utils/analyzedGames";
import { getDatabases, query_games } from "@/utils/db";
import { getAllGames } from "@/utils/gameRecords";
import { createPgnFromLocalGame } from "@/features/dashboard/utils/gameHelpers";

interface PlayerStatsModalProps {
  opened: boolean;
  onClose: () => void;
  result: AnalysisResult | null;
  debugPgns?: string;
  pgnText?: string;
  statsGameType?: "local" | "chesscom" | "lichess";
  statsAccountName?: string;
}

export function PlayerStatsModal({
  opened,
  onClose,
  result,
  debugPgns,
  pgnText,
  statsGameType,
  statsAccountName,
}: PlayerStatsModalProps) {
  const { t } = useTranslation();
  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useAtom(activeTabAtom)[1];
  const navigate = useNavigate();
  
  const [themeFilter, setThemeFilter] = useState<string[]>([]);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"cpSwing" | "moveNumber" | "theme" | "severity">("cpSwing");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [openingsColorFilter, setOpeningsColorFilter] = useState<"all" | "white" | "black">("all");

  const [pawnMoveFilter, setPawnMoveFilter] = useState<number>(10);
  const [pawnColorFilter, setPawnColorFilter] = useState<"white" | "black" | "any">("white");
  const [pawnStructureMode, setPawnStructureMode] = useState<"player" | "both">("player");
  const [pawnStructures, setPawnStructures] = useState<PawnStructureStat[]>([]);
  const [pawnSortBy, setPawnSortBy] = useState<"frequency" | "winRate">("frequency");
  const [pawnScope, setPawnScope] = useState<"analyzed" | "all">("analyzed");
  const [pawnLoading, setPawnLoading] = useState(false);
  const [pawnProgress, setPawnProgress] = useState<number | null>(null);
  const [expandedStructure, setExpandedStructure] = useState<string | null>(null);
  const [expandedFen, setExpandedFen] = useState<string | null>(null);
  const [pawnSearchPgns, setPawnSearchPgns] = useState<string | null>(null);
  const fallbackFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  // Get unique values for filters (must be before early return)
  const uniqueThemes = useMemo(() => {
    const issues = result?.issues ?? [];
    const themes = new Set<string>();
    issues.forEach((issue) => {
      issue.tags?.forEach((tag) => themes.add(tag));
    });
    return Array.from(themes).sort();
  }, [result]);

  const uniqueSeverities = useMemo(() => {
    const issues = result?.issues ?? [];
    const severities = new Set(issues.map((i) => i.severity));
    return Array.from(severities).sort();
  }, [result]);
  
  // Filter and sort issues (must be before early return)
  const filteredAndSortedIssues = useMemo(() => {
    const issues = result?.issues ?? [];
    let filtered = issues;
    
    // Apply filters
    if (themeFilter.length > 0) {
      filtered = filtered.filter((i) => i.tags?.some((tag) => themeFilter.includes(tag)));
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
        case "theme":
          comparison = (a.tags?.join(", ") ?? "").localeCompare(b.tags?.join(", ") ?? "");
          break;
        case "severity":
          const severityOrder = { blunder: 0, mistake: 1, inaccuracy: 2, info: 3 };
          comparison = (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99);
          break;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });
    
    return sorted;
  }, [result, themeFilter, severityFilter, sortBy, sortOrder]);

  // Group issues by color for overview display
  const issuesByColor = useMemo(() => {
    const issues = result?.issues ?? [];
    return {
      white: issues.filter((i) => i.playerColor === "white"),
      black: issues.filter((i) => i.playerColor === "black"),
    };
  }, [result]);

  // Calculate stats by color
  const statsByColor = useMemo(() => {
    // Initialise counts even when result is null so that destructuring does not
    // crash downstream.  Counts are keyed by ErrorKind; themeCounts are
    // keyed by ThemeId (string).
    const baseIssueCounts: Record<ErrorKind, number> = {
      tactical_blunder: 0,
      tactical_mistake: 0,
      tactical_inaccuracy: 0,
      material_blunder: 0,
      opening_principle: 0,
      piece_inactivity: 0,
      positional_misplay: 0,
      unknown: 0,
    };
    const whiteIssues = issuesByColor.white ?? [];
    const blackIssues = issuesByColor.black ?? [];
    const whiteIssueCounts: Record<ErrorKind, number> = { ...baseIssueCounts };
    const whiteThemeCounts: Record<string, number> = {};
    const blackIssueCounts: Record<ErrorKind, number> = { ...baseIssueCounts };
    const blackThemeCounts: Record<string, number> = {};
    whiteIssues.forEach((issue) => {
      whiteIssueCounts[issue.kind] = (whiteIssueCounts[issue.kind] || 0) + 1;
      // Issue may have multiple tags
      issue.tags?.forEach((tag: string) => {
        whiteThemeCounts[tag] = (whiteThemeCounts[tag] || 0) + 1;
      });
    });
    blackIssues.forEach((issue) => {
      blackIssueCounts[issue.kind] = (blackIssueCounts[issue.kind] || 0) + 1;
      issue.tags?.forEach((tag: string) => {
        blackThemeCounts[tag] = (blackThemeCounts[tag] || 0) + 1;
      });
    });
    return {
      white: { issueCounts: whiteIssueCounts, themeCounts: whiteThemeCounts },
      black: { issueCounts: blackIssueCounts, themeCounts: blackThemeCounts },
    };
  }, [issuesByColor]);

  // Filter and sort openings by color and games count (must be before early return)
  const filteredAndSortedOpenings = useMemo(() => {
    const openings = result?.stats?.byOpening ?? [];
    let filtered = openings;
    
    // Apply color filter
    if (openingsColorFilter !== "all") {
      filtered = filtered.filter((o) => o.playerColor === openingsColorFilter);
    }
    
    // Sort by games count descending (most played first)
    return [...filtered].sort((a, b) => b.games - a.games);
  }, [result, openingsColorFilter]);

  useEffect(() => {
    if (result?.pawnStructures) {
      setPawnStructures(result.pawnStructures);
    }
  }, [result]);

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

  const toggleStructureDetails = (structure: PawnStructureStat) => {
    const key = structure.structure;
    if (expandedStructure === key) {
      setExpandedStructure(null);
      setExpandedFen(null);
      return;
    }
    setExpandedStructure(key);
    const firstFen = structure.sampleFen ?? structure.games?.[0]?.fen ?? null;
    setExpandedFen(firstFen);
  };
  
  const openGameInNewTab = async (fenBefore: string, gameIndex: number) => {
    const sourcePgns = pawnSearchPgns ?? debugPgns ?? pgnText ?? null;
    console.debug("[pawn-structures] openGameInNewTab", {
      gameIndex,
      hasDebugPgns: Boolean(debugPgns),
      hasPawnSearchPgns: Boolean(pawnSearchPgns),
      hasPgnText: Boolean(pgnText),
      sourceLength: sourcePgns?.length ?? 0,
      fenBefore,
    });
    if (sourcePgns) {
      const games = splitPgnGames(sourcePgns);
      console.debug("[pawn-structures] splitPgnGames", { count: games.length });
      
      let game = games[gameIndex];
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

      if (!game && games.length > 0) {
        console.debug("[pawn-structures] game index missing, scanning for fen match");
        for (let i = 0; i < games.length; i++) {
          try {
            const tree = await parsePGN(games[i]);
            targetPosition = [];
            if (findPosition(tree.root)) {
              game = games[i];
              console.debug("[pawn-structures] found fen match in game index", { index: i });
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (!game) {
        console.debug("[pawn-structures] game not found in PGNs", { gameIndex });
        notifications.show({
          title: t("features.dashboard.gameNotFound", "Game Not Found"),
          message: t("features.dashboard.gameNotFoundMessage", "Could not find game in PGNs"),
          color: "orange",
        });
        return;
      }

      try {
        if (game) {
          try {
            const tree = await parsePGN(game);
            findPosition(tree.root);
          } catch {
            targetPosition = [];
          }
        }

        await createTab({
          tab: {
            name: `Game ${gameIndex + 1} - Move ${fenBefore.split(" ")[5] || ""}`,
            type: "analysis",
          },
          setTabs,
          setActiveTab,
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
  };

  const normalizeName = (name?: string): string => (name ?? "").toLowerCase().trim();
  const matchesName = (candidate: string | undefined, target: string) => {
    if (!candidate || !target) return false;
    const cand = candidate.toLowerCase();
    const normalizedTarget = target.toLowerCase();
    return cand.includes(normalizedTarget) || normalizedTarget.includes(cand);
  };

  const findDatabaseFileForAccount = async (
    accountName: string,
    type: "chesscom" | "lichess",
  ): Promise<string | null> => {
    const normalizedAccountName = accountName.trim();
    if (!normalizedAccountName) return null;

    const databases = await getDatabases();
    const targetFilename = `${normalizedAccountName}_${type}.db3`;
    const targetLower = targetFilename.toLowerCase();

    const match = databases.find(
      (db) =>
        db.type === "success" &&
        db.filename &&
        (db.filename === targetFilename || db.filename.toLowerCase() === targetLower),
    );

    return match && match.type === "success" ? match.file : null;
  };

  const getPgnHeaderValue = (pgn: string, header: string): string => {
    const regex = new RegExp(`\\[${header}\\s+"([^"]+)"`, "i");
    const match = pgn.match(regex);
    return match?.[1] ?? "";
  };

  const detectPgnSourceFromPgn = (pgn: string): "chesscom" | "lichess" | null => {
    const site = getPgnHeaderValue(pgn, "Site").toLowerCase();
    if (site.includes("chess.com")) return "chesscom";
    if (site.includes("lichess")) return "lichess";
    return null;
  };

  const collectAnalyzedPgnsFromStorage = async (
    target: string,
    type: "chesscom" | "lichess",
  ): Promise<string[]> => {
    if (!target) return [];
    const normalizedTarget = normalizeName(target);
    if (!normalizedTarget) return [];

    try {
      const stored = await getAllAnalyzedGames();
      const matches: string[] = [];

      for (const pgn of Object.values(stored)) {
        if (!pgn) continue;
        const source = detectPgnSourceFromPgn(pgn);
        if (source !== type) continue;
        const whiteName = getPgnHeaderValue(pgn, "White");
        const blackName = getPgnHeaderValue(pgn, "Black");
        const isWhite = matchesName(whiteName, normalizedTarget);
        const isBlack = matchesName(blackName, normalizedTarget);
        const matchesColor =
          pawnColorFilter === "white"
            ? isWhite
            : pawnColorFilter === "black"
              ? isBlack
              : isWhite || isBlack;
        if (matchesColor) {
          matches.push(pgn);
        }
      }

      return matches;
    } catch (error) {
      console.error("Failed to collect analyzed PGNs from storage:", error);
      return [];
    }
  };

  const createPgnFromNormalizedGame = (game: NormalizedGame): string => {
    const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const resultTag = game.result || "*";
    const movesText = (game.moves || "").trim();
    const hasResult = /(?:1-0|0-1|1\/2-1\/2|\*)$/.test(movesText);
    const movetext = movesText ? (hasResult ? movesText : `${movesText} ${resultTag}`) : resultTag;

    let pgn = `[Event "${game.event || "Online Game"}"]\n`;
    pgn += `[Site "${game.site || "Online"}"]\n`;
    pgn += `[Date "${game.date || "????.??.??"}"]\n`;
    if (game.round) {
      pgn += `[Round "${game.round}"]\n`;
    }
    pgn += `[White "${game.white || "White"}"]\n`;
    pgn += `[Black "${game.black || "Black"}"]\n`;
    pgn += `[Result "${resultTag}"]\n`;
    if (game.white_elo) {
      pgn += `[WhiteElo "${game.white_elo}"]\n`;
    }
    if (game.black_elo) {
      pgn += `[BlackElo "${game.black_elo}"]\n`;
    }
    if (game.time_control) {
      pgn += `[TimeControl "${game.time_control}"]\n`;
    }
    if (game.eco) {
      pgn += `[ECO "${game.eco}"]\n`;
    }
    // Avoid injecting final FEN from the database as a starting position.
    pgn += "\n";
    pgn += movetext;
    return pgn;
  };

  const fetchLocalPgns = async (target: string): Promise<string[]> => {
    const games = await getAllGames();
    const filtered = games.filter((game) => {
      const targetName = target;
      const whiteMatch = matchesName(game.white.name, targetName);
      const blackMatch = matchesName(game.black.name, targetName);
      if (pawnColorFilter === "white" && !whiteMatch) return false;
      if (pawnColorFilter === "black" && !blackMatch) return false;
      return whiteMatch || blackMatch;
    });
    return filtered
      .map((game) => game.pgn || createPgnFromLocalGame(game))
      .filter(Boolean) as string[];
  };

  const queryAllGamesFromDb = async (
    dbFile: string,
    target: string,
    onProgress?: (value: number) => void,
  ): Promise<string[]> => {
    const pageSize = 200;
    let page = 1;
    let loaded = 0;
    let totalCount: number | null = null;
    const collected: string[] = [];
    const normalizedTarget = normalizeName(target);

    while (true) {
      const response = await query_games(dbFile, {
        sides: "Any",
        options: {
          skipCount: page !== 1,
          page,
          pageSize,
          sort: "date",
          direction: "desc",
        },
      });
      const data = response.data ?? [];
      if (!data.length) break;
      if (page === 1 && typeof response.count === "number") {
        totalCount = response.count;
      }

      for (const game of data) {
        const isWhite = matchesName(game.white, normalizedTarget);
        const isBlack = matchesName(game.black, normalizedTarget);
        const matchesColorFilter =
          pawnColorFilter === "white"
            ? isWhite
            : pawnColorFilter === "black"
              ? isBlack
              : isWhite || isBlack;
        if (!matchesColorFilter) continue;
        if (game.moves) {
          collected.push(createPgnFromNormalizedGame(game));
        }
      }

      loaded += data.length;
      if (onProgress && totalCount && totalCount > 0) {
        onProgress(Math.min(100, Math.round((loaded / totalCount) * 100)));
      }

      if (data.length < pageSize) break;
      page += 1;
    }

    return collected;
  };

  const fetchOnlinePgns = async (
    type: "chesscom" | "lichess",
    target: string,
    onProgress?: (value: number) => void,
  ): Promise<string[]> => {
    const dbFile = await findDatabaseFileForAccount(target, type);
    if (!dbFile) return [];
    return queryAllGamesFromDb(dbFile, target, onProgress);
  };

  const gatherPawnPgns = async (onProgress?: (value: number) => void): Promise<string[]> => {
    if (pawnScope === "analyzed") {
      const pgnSource = debugPgns ?? pgnText;
      return pgnSource ? [pgnSource] : [];
    }
    if (!statsGameType || !statsAccountName) return [];
    const normalizedPlayer = normalizeName(statsAccountName ?? result.player);
    if (!normalizedPlayer) return [];
    if (statsGameType === "local") {
      return fetchLocalPgns(normalizedPlayer);
    }
    if (statsGameType === "chesscom") {
      const fetched = await fetchOnlinePgns("chesscom", normalizedPlayer, onProgress);
      return fetched.length
        ? fetched
        : await collectAnalyzedPgnsFromStorage(normalizedPlayer, "chesscom");
    }
    if (statsGameType === "lichess") {
      const fetched = await fetchOnlinePgns("lichess", normalizedPlayer, onProgress);
      return fetched.length
        ? fetched
        : await collectAnalyzedPgnsFromStorage(normalizedPlayer, "lichess");
    }
    return [];
  };

  const handlePawnSearch = async () => {
    setPawnLoading(true);
    setPawnProgress(0);
    try {
      const pgns = await gatherPawnPgns((value) => setPawnProgress(value));
      if (!pgns.length) {
        notifications.show({
          title: t("features.dashboard.noPawnStructures", "No pawn structures found."),
          message: t("features.dashboard.noPawnStructuresMessage", "No games available for the selected filter."),
          color: "orange",
        });
        setPawnStructures([]);
        return;
      }
      const combined = pgns.join("\n\n");
      setPawnSearchPgns(combined);
      const analysisResult = await generateAnalysisResult(combined, result.player, {
        maxMove: pawnMoveFilter,
        playerColor: pawnColorFilter,
        pawnStructureMode,
      });
      setPawnStructures(analysisResult.pawnStructures || []);
      setPawnProgress(100);
    } catch (error) {
      console.error("Error analyzing pawn structures:", error);
      notifications.show({
        title: t("features.dashboard.error", "Error"),
        message: t("features.dashboard.errorAnalyzingPawns", "Failed to analyze pawn structures"),
        color: "red",
      });
    } finally {
      setPawnLoading(false);
      setPawnProgress(null);
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
          <Tabs.Tab value="pawn-structures">{t("features.dashboard.pawnStructures", "Pawn Structures")}</Tabs.Tab>
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
              <MultiSelect
                label={t("features.dashboard.filterByTheme", "Filter by Theme")}
                placeholder={t("features.dashboard.allThemes", "All Themes")}
                data={uniqueThemes}
                value={themeFilter}
                onChange={setThemeFilter}
                searchable
                clearable
                style={{ flex: 1, minWidth: 180 }}
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
                  { value: "theme", label: t("features.dashboard.theme", "Theme") },
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
                    <Table.Th>{t("features.dashboard.bestLine", "Best Line")}</Table.Th>
                    <Table.Th>{t("features.dashboard.theme", "Theme")}</Table.Th>
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
                          {issue.game.index}
                        </Text>
                      </Table.Td>
                      <Table.Td>{issue.moveNumber}. {issue.playedSan}</Table.Td>
                      <Table.Td>
                        {issue.bestAlternative?.san
                          ? `${issue.bestAlternative.san} — ${issue.tags?.join(", ") ?? ""}`
                          : issue.tags?.length
                            ? issue.tags.join(", ")
                            : "-"}
                      </Table.Td>
                      <Table.Td>
                        {issue.tags && issue.tags.length > 0 ? issue.tags.join(", ") : "-"}
                      </Table.Td>
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
                        {issue.evidence.cpSwingAbs !== undefined
                          ? issue.evidence.cpSwingAbs > 0
                            ? `+${issue.evidence.cpSwingAbs}`
                            : issue.evidence.cpSwingAbs
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
                              onClick={() => openGameInNewTab(issue.fenBefore, issue.game.index)}
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
                      <Table>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>{t("features.dashboard.move", "Move")}</Table.Th>
                            <Table.Th>{t("features.dashboard.kind", "Kind")}</Table.Th>
                            <Table.Th>{t("features.dashboard.count", "Count")}</Table.Th>
                            <Table.Th>{t("features.dashboard.fen", "FEN")}</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {opening.frequentMistakes.slice(0, 5).map((mistake, mIdx) => (
                            <Table.Tr key={mIdx}>
                              <Table.Td>{mistake.moveNumber}. {mistake.playedSan}</Table.Td>
                              <Table.Td>{mistake.kind.replace(/_/g, " ")}</Table.Td>
                              <Table.Td>{mistake.count ?? 1}</Table.Td>
                              <Table.Td>
                                <Tooltip label={mistake.fenBefore}>
                                  <ActionIcon
                                    size="sm"
                                    variant="subtle"
                                    onClick={() => copyFenToClipboard(mistake.fenBefore)}
                                  >
                                    <IconCopy size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Stack>
                  )}
                  <Divider />
                </Stack>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="pawn-structures" pt="md">
          <ScrollArea h="calc(90vh - 180px)">
            <Stack gap="md">
              <Title order={4}>{t("features.dashboard.pawnStructures", "Pawn Structures")}</Title>
              
              <Group>
              <Select
                label={t("features.dashboard.inMove", "In Move")}
                data={Array.from({ length: 100 }, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                value={pawnMoveFilter.toString()}
                onChange={(value) => setPawnMoveFilter(parseInt(value || "10"))}
                style={{ width: 120 }}
              />
              <Select
                label={t("features.dashboard.playerColor", "Player Color")}
                data={[
                  { value: "white", label: t("features.dashboard.white", "White") },
                  { value: "black", label: t("features.dashboard.black", "Black") },
                  { value: "any", label: t("features.dashboard.any", "Any") },
                ]}
                value={pawnColorFilter}
                onChange={(value) => setPawnColorFilter((value as "white" | "black" | "any") || "any")}
                style={{ width: 120 }}
              />
              <SegmentedControl
                value={pawnScope}
                onChange={(value) => setPawnScope(value as typeof pawnScope)}
                data={[
                  { value: "analyzed", label: t("features.dashboard.analyzed", "Analizadas") },
                  { value: "all", label: t("features.dashboard.all", "Todas") },
                ]}
              />
              <SegmentedControl
                value={pawnStructureMode}
                onChange={(value) => setPawnStructureMode(value as typeof pawnStructureMode)}
                data={[
                  { value: "player", label: t("features.dashboard.playerStructure", "Solo jugador") },
                  { value: "both", label: t("features.dashboard.bothStructures", "Ambas estructuras") },
                ]}
              />
              <Button
                leftSection={<IconSearch size={16} />}
                onClick={handlePawnSearch}
                loading={pawnLoading}
              >
                {t("features.dashboard.search", "Search")}
              </Button>
            </Group>
            {pawnLoading && (
              <Progress value={pawnProgress ?? 0} size="xs" />
            )}

              {pawnStructures.length > 0 && (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 200 }}>{t("features.dashboard.structure", "Structure")}</Table.Th>
                      <Table.Th
                        style={{ width: 120, cursor: "pointer" }}
                        onClick={() => setPawnSortBy("frequency")}
                      >
                        {t("features.dashboard.frequency", "Frequency")} {pawnSortBy === "frequency" ? "^" : ""}
                      </Table.Th>
                      <Table.Th
                        style={{ width: 120, cursor: "pointer" }}
                        onClick={() => setPawnSortBy("winRate")}
                      >
                        {t("features.dashboard.winRate", "Win Rate")} {pawnSortBy === "winRate" ? "^" : ""}
                      </Table.Th>
                      <Table.Th style={{ width: 120 }}>{t("features.dashboard.actions", "Actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pawnStructures
                      .sort((a, b) => pawnSortBy === "frequency" ? b.frequency - a.frequency : b.winRate - a.winRate)
                      .map((structure, index) => {
                        const displayFen = expandedFen ?? structure.sampleFen ?? structure.games?.[0]?.fen ?? fallbackFen;
                        return (
                          <Fragment key={index}>
                            <Table.Tr>
                              <Table.Td>{structure.structure}</Table.Td>
                              <Table.Td>{structure.frequency}</Table.Td>
                              <Table.Td>{(structure.winRate * 100).toFixed(1)}%</Table.Td>
                              <Table.Td>
                                <Button
                                  size="xs"
                                  variant="light"
                                  onClick={() => toggleStructureDetails(structure)}
                                >
                                  {expandedStructure === structure.structure
                                    ? t("features.dashboard.hide", "Hide")
                                    : t("features.dashboard.view", "View")}
                                </Button>
                              </Table.Td>
                            </Table.Tr>
                            {expandedStructure === structure.structure && (
                              <Table.Tr>
                                <Table.Td colSpan={4}>
                                  <Group align="flex-start" wrap="wrap">
                                    <Stack gap="xs" style={{ width: 240 }}>
                                      <Chessground
                                        fen={displayFen}
                                        coordinates={false}
                                        viewOnly
                                        orientation={pawnColorFilter === "any" ? "white" : pawnColorFilter}
                                      />
                                      {displayFen && (
                                        <Button
                                          size="xs"
                                          variant="light"
                                          leftSection={<IconCopy size={14} />}
                                          onClick={() => copyFenToClipboard(displayFen)}
                                        >
                                          {t("features.dashboard.copyFen", "Copy FEN")}
                                        </Button>
                                      )}
                                    </Stack>
                                    <Stack gap="xs" style={{ flex: 1 }}>
                                      <Group gap="md">
                                        <Text size="sm" fw={600}>
                                          {structure.structure}
                                        </Text>
                                        <Badge size="sm" variant="light">
                                          {structure.frequency}
                                        </Badge>
                                        <Text size="sm" c="dimmed">
                                          {(structure.winRate * 100).toFixed(1)}%
                                        </Text>
                                      </Group>
                                      {structure.games && structure.games.length > 0 ? (
                                        <ScrollArea h={220} style={{ minHeight: 200 }}>
                                          <Table>
                                            <Table.Thead>
                                              <Table.Tr>
                                                <Table.Th>{t("features.dashboard.game", "Game")}</Table.Th>
                                                <Table.Th>{t("features.dashboard.white", "White")}</Table.Th>
                                                <Table.Th>{t("features.dashboard.black", "Black")}</Table.Th>
                                                <Table.Th>{t("features.dashboard.result", "Result")}</Table.Th>
                                                <Table.Th>{t("features.dashboard.actions", "Actions")}</Table.Th>
                                              </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                              {structure.games.map((game, gIdx) => (
                                                <Table.Tr key={`${game.gameIndex}-${gIdx}`}>
                                                  <Table.Td>{game.gameIndex + 1}</Table.Td>
                                                  <Table.Td>
                                                    {game.white || "-"}
                                                    {game.whiteElo ? ` (${game.whiteElo})` : ""}
                                                  </Table.Td>
                                                  <Table.Td>
                                                    {game.black || "-"}
                                                    {game.blackElo ? ` (${game.blackElo})` : ""}
                                                  </Table.Td>
                                                  <Table.Td>{game.result || "-"}</Table.Td>
                                                  <Table.Td>
                                                    <Group gap="xs" wrap="nowrap">
                                                      <Button
                                                        size="xs"
                                                        variant="light"
                                                        onClick={() => setExpandedFen(game.fen)}
                                                      >
                                                        {t("features.dashboard.show", "Show")}
                                                      </Button>
                                                      <ActionIcon
                                                        size="sm"
                                                        variant="subtle"
                                                        onClick={() => copyFenToClipboard(game.fen)}
                                                      >
                                                        <IconCopy size={14} />
                                                      </ActionIcon>
                                                      <ActionIcon
                                                        size="sm"
                                                        variant="subtle"
                                                        onClick={() => openGameInNewTab(game.fen, game.gameIndex)}
                                                      >
                                                        <IconExternalLink size={14} />
                                                      </ActionIcon>
                                                    </Group>
                                                  </Table.Td>
                                                </Table.Tr>
                                              ))}
                                            </Table.Tbody>
                                          </Table>
                                        </ScrollArea>
                                      ) : (
                                        <Text size="sm" c="dimmed">
                                          {t("features.dashboard.noGamesFound", "No games found")}
                                        </Text>
                                      )}
                                    </Stack>
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            )}
                          </Fragment>
                        );
                      })}
                  </Table.Tbody>
                </Table>
              )}

              {pawnStructures.length === 0 && (
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  {t("features.dashboard.noPawnStructures", "No pawn structures found. Click search to analyze.")}
                </Text>
              )}
            </Stack>
          </ScrollArea>
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
