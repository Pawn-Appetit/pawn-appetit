import { Box, Center, Group, Paper, ScrollArea, Stack, Table, Text, UnstyledButton } from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import { IconStarFilled, IconZoomCheck } from "@tabler/icons-react";
import cx from "clsx";
import equal from "fast-deep-equal";
import { useAtomValue } from "jotai";
import React, { memo, Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import EvalChart from "@/components/EvalChart";
import ProgressButton from "@/components/ProgressButtonWithOutState";
import { TreeStateContext } from "@/components/TreeStateContext";
import { activeTabAtom } from "@/state/atoms";
import { saveAnalyzedGame, saveGameStats } from "@/utils/analyzedGames";
import { ANNOTATION_INFO, annotationColors, isBasicAnnotation } from "@/utils/annotation";
import { getGameStats, getMainLine, getPGN } from "@/utils/chess";
import { calculateEstimatedElo } from "@/utils/eloEstimation";
import { type GameStats, getGameRecordById, updateGameRecord } from "@/utils/gameRecords";
import { label } from "./AnalysisPanel.css";
import ReportModal from "./ReportModal";

function ReportPanel() {
  const { t } = useTranslation();

  const activeTab = useAtomValue(activeTabAtom);

  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);

  const progress = useStore(store, (s) => s.report.progress);
  const isCompleted = useStore(store, (s) => s.report.isCompleted);
  const inProgress = useStore(store, (s) => s.report.inProgress);
  const setInProgress = useStore(store, (s) => s.setReportInProgress);

  const [reportingMode, toggleReportingMode] = useToggle();

  const [stats, setStats] = useState(() => getGameStats(root));

  // Avoid recalculating stats on every tree mutation while the engine is actively analyzing.
  // Compute on idle/debounced to keep the UI responsive.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const compute = () => {
      if (cancelled) return;
      try {
        const next = getGameStats(root);
        if (!cancelled) setStats(next);
      } catch {
        // ignore
      }
    };

    if (!inProgress) {
      compute();
      return () => {
        cancelled = true;
      };
    }

    timeoutId = window.setTimeout(compute, 250);

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [root, inProgress]);

  // Track if we've already saved the PGN for this analysis completion
  const hasSavedPgnRef = useRef(false);

  // When analysis completes, save the PGN with evaluations if this is a local game, Chess.com, or Lichess game
  useEffect(() => {
    // Only save if analysis is completed, not in progress, and we haven't saved yet
    if (isCompleted && !inProgress && !hasSavedPgnRef.current && activeTab) {
      hasSavedPgnRef.current = true;

      // Generate PGN with all evaluations and annotations
      // Use a longer delay and get the latest root from the store to ensure the tree is fully updated
      const timeoutId = setTimeout(async () => {
        try {
          // CRITICAL: Get the latest root directly from the store, not from the closure
          // This ensures we have the most up-to-date tree after addAnalysis completes
          const latestRoot = store.getState().root;
          const latestHeaders = store.getState().headers;

          // Verify the tree has moves (not just the root)
          if (latestRoot.children.length === 0) {
            console.error("Tree has no moves, skipping save");
            hasSavedPgnRef.current = false;
            return;
          }

          // Count total moves in the main line to verify completeness
          let moveCount = 0;
          let tempNode: typeof latestRoot | undefined = latestRoot;
          while (tempNode && tempNode.children.length > 0) {
            moveCount++;
            tempNode = tempNode.children[0];
          }

          // If the tree seems incomplete (less than 5 moves), wait a bit more and retry
          let finalRoot = latestRoot;
          let finalHeaders = latestHeaders;
          if (moveCount < 5) {
            console.warn(`Tree has only ${moveCount} moves, waiting longer...`);
            // Wait another 300ms and try again
            await new Promise((resolve) => setTimeout(resolve, 300));
            const retryRoot = store.getState().root;
            const retryHeaders = store.getState().headers;
            const retryMoveCount = (() => {
              let count = 0;
              let node: typeof retryRoot | undefined = retryRoot;
              while (node && node.children.length > 0) {
                count++;
                node = node.children[0];
              }
              return count;
            })();

            if (retryMoveCount < 5) {
              console.error(`Tree still incomplete after retry (${retryMoveCount} moves), skipping save`);
              hasSavedPgnRef.current = false;
              return;
            }

            // Use the retry root and headers
            finalRoot = retryRoot;
            finalHeaders = retryHeaders;
          }

          // Generate PGN with all evaluations, annotations, and variations using the final root
          let pgnWithEvals = getPGN(finalRoot, {
            headers: finalHeaders,
            comments: true,
            extraMarkups: true, // This includes [%eval ...] annotations
            glyphs: true,
            variations: true,
          });

          // Validate PGN: ensure it's not empty
          if (!pgnWithEvals || pgnWithEvals.trim().length === 0) {
            console.error("Generated PGN is empty, skipping save");
            hasSavedPgnRef.current = false; // Reset flag so we can try again
            return;
          }

          // Ensure PGN has a result (required for valid PGN)
          // Check if result is in headers
          const hasResultInHeaders = /\[Result\s+"[^"]+"\]/.test(pgnWithEvals);
          const hasResultAtEnd = /\s+(1-0|0-1|1\/2-1\/2|\*)\s*$/.test(pgnWithEvals);

          if (!hasResultInHeaders && !hasResultAtEnd) {
            // If result is missing, add it from headers or use "*"
            const result = finalHeaders?.result || "*";
            pgnWithEvals = pgnWithEvals.trim() + ` ${result}`;
          } else if (!hasResultInHeaders && finalHeaders?.result) {
            // If result is at the end but not in headers, ensure headers have it
            // The getPGN function should already include it, but double-check
            if (!pgnWithEvals.includes(`[Result "${finalHeaders.result}"]`)) {
              // Find the last header and add Result before the blank line
              const headerEnd = pgnWithEvals.lastIndexOf('"\n');
              if (headerEnd > 0) {
                const beforeHeaders = pgnWithEvals.substring(0, headerEnd + 2);
                const afterHeaders = pgnWithEvals.substring(headerEnd + 2);
                pgnWithEvals = beforeHeaders + `[Result "${finalHeaders.result}"]\n` + afterHeaders;
              }
            }
          }

          // Final validation: ensure PGN is not just headers
          const moveText = pgnWithEvals.split("\n\n")[1] || "";
          if (!moveText || moveText.trim().length === 0) {
            console.error("Generated PGN has no moves, skipping save");
            hasSavedPgnRef.current = false;
            return;
          }

          // Additional validation: ensure PGN has a reasonable number of moves
          // Count moves in the PGN text (approximate)
          const moveMatches = moveText.match(/\d+\.\s+\S+/g) || [];
          if (moveMatches.length < 3 && moveCount > 3) {
            console.error(`PGN has only ${moveMatches.length} moves but tree has ${moveCount}, skipping save`);
            hasSavedPgnRef.current = false;
            return;
          }

          // Calculate stats from the analyzed game using the stats already calculated in the report
          // We can use the stats from the root node which are already calculated
          const reportStats = getGameStats(finalRoot);

          // Check if this tab is associated with a local game
          const localGameId = typeof window !== "undefined" ? sessionStorage.getItem(`${activeTab}_localGameId`) : null;

          if (localGameId) {
            // Get the game record to determine user color
            const gameRecord = await getGameRecordById(localGameId);

            if (gameRecord) {
              // Determine which color the user played
              const isUserWhite = gameRecord.white.type === "human";
              const userColor = isUserWhite ? "white" : "black";

              // Get stats for the user's color from the report
              const accuracy = userColor === "white" ? reportStats.whiteAccuracy : reportStats.blackAccuracy;
              const acpl = userColor === "white" ? reportStats.whiteCPL : reportStats.blackCPL;

              // Calculate estimated Elo
              let calculatedStats: GameStats | null = null;
              if (accuracy > 0 || acpl > 0) {
                calculatedStats = {
                  accuracy,
                  acpl,
                  estimatedElo: acpl > 0 ? calculateEstimatedElo(acpl) : undefined,
                };
              }

              // Update the GameRecord with the new PGN and calculated stats
              if (calculatedStats) {
                await updateGameRecord(localGameId, {
                  pgn: pgnWithEvals,
                  stats: calculatedStats,
                });
              } else {
                // If stats calculation failed, still update PGN
                await updateGameRecord(localGameId, { pgn: pgnWithEvals });
              }
            } else {
              // Fallback: just update PGN if game not found
              await updateGameRecord(localGameId, { pgn: pgnWithEvals });
            }

            // Trigger refresh of games list in dashboard
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("games:updated"));
            }
          } else {
            // Check if this tab is associated with a Chess.com or Lichess game
            const chessComGameUrl =
              typeof window !== "undefined" ? sessionStorage.getItem(`${activeTab}_chessComGameUrl`) : null;
            const lichessGameId =
              typeof window !== "undefined" ? sessionStorage.getItem(`${activeTab}_lichessGameId`) : null;

            if (chessComGameUrl) {
              // Save analyzed PGN for Chess.com game
              await saveAnalyzedGame(chessComGameUrl, pgnWithEvals);

              // Calculate and save stats using the stats already calculated in the report
              try {
                // Get the username from sessionStorage to determine which color the user played
                const chessComUsername =
                  typeof window !== "undefined" ? sessionStorage.getItem(`${activeTab}_chessComUsername`) : null;

                if (chessComUsername) {
                  // Extract usernames from PGN headers
                  const whiteMatch = pgnWithEvals.match(/\[White\s+"([^"]+)"/);
                  const blackMatch = pgnWithEvals.match(/\[Black\s+"([^"]+)"/);
                  const whiteName = whiteMatch ? whiteMatch[1] : "";
                  const blackName = blackMatch ? blackMatch[1] : "";

                  const isUserWhite = whiteName.toLowerCase() === chessComUsername.toLowerCase();
                  const userColor = isUserWhite ? "white" : "black";

                  // Use stats from the report (already calculated)
                  const accuracy = userColor === "white" ? reportStats.whiteAccuracy : reportStats.blackAccuracy;
                  const acpl = userColor === "white" ? reportStats.whiteCPL : reportStats.blackCPL;

                  if (accuracy > 0 || acpl > 0) {
                    const statsToSave: GameStats = {
                      accuracy,
                      acpl,
                      estimatedElo: acpl > 0 ? calculateEstimatedElo(acpl) : undefined,
                    };
                    await saveGameStats(chessComGameUrl, statsToSave);
                  }
                }
              } catch {
                // Silently handle errors
              }

              // Trigger refresh of Chess.com games list in dashboard
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("chesscom:games:updated"));
              }
            } else if (lichessGameId) {
              // Save analyzed PGN for Lichess game
              await saveAnalyzedGame(lichessGameId, pgnWithEvals);

              // Calculate and save stats using the stats already calculated in the report
              try {
                // Get the username from sessionStorage to determine which color the user played
                const lichessUsername =
                  typeof window !== "undefined" ? sessionStorage.getItem(`${activeTab}_lichessUsername`) : null;

                if (lichessUsername) {
                  // Extract usernames from PGN headers
                  const whiteMatch = pgnWithEvals.match(/\[White\s+"([^"]+)"/);
                  const blackMatch = pgnWithEvals.match(/\[Black\s+"([^"]+)"/);
                  const whiteName = whiteMatch ? whiteMatch[1] : "";
                  const blackName = blackMatch ? blackMatch[1] : "";

                  const isUserWhite = whiteName.toLowerCase() === lichessUsername.toLowerCase();
                  const userColor = isUserWhite ? "white" : "black";

                  // Use stats from the report (already calculated)
                  const accuracy = userColor === "white" ? reportStats.whiteAccuracy : reportStats.blackAccuracy;
                  const acpl = userColor === "white" ? reportStats.whiteCPL : reportStats.blackCPL;

                  if (accuracy > 0 || acpl > 0) {
                    const statsToSave: GameStats = {
                      accuracy,
                      acpl,
                      estimatedElo: acpl > 0 ? calculateEstimatedElo(acpl) : undefined,
                    };
                    await saveGameStats(lichessGameId, statsToSave);
                  }
                }
              } catch {
                // Silently handle errors
              }

              // Trigger refresh of Lichess games list in dashboard
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("lichess:games:updated"));
              }
            }
          }
        } catch (error) {
          console.error("Error saving analyzed PGN:", error);
          hasSavedPgnRef.current = false; // Reset flag on error
        }
      }, 500); // Increased delay to 500ms to ensure tree is fully updated after addAnalysis completes

      return () => {
        clearTimeout(timeoutId);
      };
    }

    // Reset the flag when analysis starts again
    if (inProgress) {
      hasSavedPgnRef.current = false;
    }
  }, [isCompleted, inProgress, activeTab, store]); // Removed root and headers from dependencies - we get them from store directly

  return (
    <ScrollArea offsetScrollbars>
      <Suspense>
        <ReportModal
          tab={activeTab!}
          initialFen={root.fen}
          moves={getMainLine(root, headers.variant === "Chess960")}
          is960={headers.variant === "Chess960"}
          reportingMode={reportingMode}
          toggleReportingMode={toggleReportingMode}
          setInProgress={setInProgress}
          inProgress={inProgress}
        />
      </Suspense>
      <Stack mb="lg" gap="0.4rem" mr="xs">
        <Group grow style={{ textAlign: "center" }}>
          {stats.whiteAccuracy && stats.blackAccuracy && (
            <>
              <AccuracyCard color={t("chess.white")} accuracy={stats.whiteAccuracy} cpl={stats.whiteCPL} />
              <AccuracyCard color={t("chess.black")} accuracy={stats.blackAccuracy} cpl={stats.blackCPL} />
            </>
          )}
          <div>
            <ProgressButton
              id={`report_${activeTab}`}
              onClick={() => toggleReportingMode()}
              leftIcon={<IconZoomCheck size="0.875rem" />}
              labels={{
                action: t("features.board.analysis.generateReport"),
                completed: t("features.board.analysis.reportGenerated"),
                inProgress: t("features.board.analysis.generatingReport"),
              }}
              disabled={root.children.length === 0}
              redoable
              inProgress={inProgress}
              progress={progress}
              completed={isCompleted}
            />
          </div>
        </Group>
        <Paper withBorder p="md">
          <EvalChart isAnalysing={inProgress} startAnalysis={toggleReportingMode} />
        </Paper>
        <GameStats {...stats} />
      </Stack>
    </ScrollArea>
  );
}

type Stats = ReturnType<typeof getGameStats>;

// -----------------------------
// CountPill (misma tipografía que tu componente original)
// - Text size="sm"
// - fw 700/400
// - color se pasa por style (como en tu Grid.Col original)
// -----------------------------
function CountPill({
  value,
  color,
  onClick,
  className,
}: {
  value: number;
  color?: string;
  onClick?: () => void;
  className?: string;
}) {
  const clickable = value > 0;

  const inner = (
    <Box
      className={className}
      style={{
        height: "1.8rem",
        minWidth: "6ch",
        paddingInline: "1.2ch",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid var(--mantine-color-dark-4)",
        background: clickable ? "var(--mantine-color-dark-6)" : "transparent",
      }}
    >
      <Text
        size="sm"
        fw={clickable ? 700 : 400}
        style={{
          lineHeight: 1,
          color: clickable ? color : undefined, // ✅ igual que tu original
        }}
      >
        {value}
      </Text>
    </Box>
  );

  if (!clickable) return inner;

  return (
    <UnstyledButton onClick={onClick} style={{ borderRadius: 999, cursor: "pointer" }}>
      {inner}
    </UnstyledButton>
  );
}

// -----------------------------
// TagGlyph (idéntico a tu estilo original)
// - usa el MISMO svg con currentColor
// - Text size="sm", lineHeight=1, sin monospace
// -----------------------------
function TagGlyph({ annotation }: { annotation: string }) {
  return (
    <Center>
      {annotation === "Best" ? (
        <svg viewBox="0 0 100 100" style={{ width: "1em", height: "1em", display: "block" }}>
          <path
            fill="currentColor"
            d="M 50 15 L 55.9 38.1 L 80 38.1 L 60.5 52.4 L 66.4 75.5 L 50 61.2 L 33.6 75.5 L 39.5 52.4 L 20 38.1 L 44.1 38.1 Z"
          />
        </svg>
      ) : (
        <Text size="sm" style={{ lineHeight: 1 }}>
          {annotation}
        </Text>
      )}
    </Center>
  );
}

// -----------------------------
// GameStats (layout bueno + tipografía original)
// -----------------------------
const GameStats = memo(
  function GameStats({ whiteAnnotations, blackAnnotations }: Stats) {
    const { t } = useTranslation();

    const store = useContext(TreeStateContext)!;
    const goToAnnotation = useStore(store, (s) => s.goToAnnotation);
    const headers = useStore(store, (s) => s.headers);

    type Row = {
      annotation: string;
      s: "??" | "?" | "?!" | "!!" | "!" | "!?" | "Best";
      title: string;
      color: string;
      w: number;
      b: number;
    };

    const rows: Row[] = useMemo(() => {
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
        }) as Row[];
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
              {headers?.white || t("chess.white")}
            </Text>
          </Center>

          <Center>
            <Text size="sm" fw={600} c="dimmed">
              Annotation
            </Text>
          </Center>

          <Center>
            <Text size="md" fw={700}>
              {headers?.black || t("chess.black")}
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
                      color: r.w > 0 ? r.color : undefined, // ✅ igual que tu original
                    }}
                  >
                    <CountPill
                      value={r.w}
                      color={r.color}
                      className={cx(r.w > 0 && label)}
                      onClick={() => goToAnnotation(r.s, "white")}
                    />
                  </Center>

                  {/* CENTER */}
                  <Box style={{ minWidth: 0, color: hasAny ? r.color : undefined }}>
                    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, marginBottom: "0.45rem" }}>
                      <Box style={{ color: hasAny ? r.color : undefined }}>
                        <TagGlyph annotation={r.annotation} />
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
                      color: r.b > 0 ? r.color : undefined, // ✅ igual que tu original
                    }}
                  >
                    <CountPill
                      value={r.b}
                      color={r.color}
                      className={cx(r.b > 0 && label)}
                      onClick={() => goToAnnotation(r.s, "black")}
                    />
                  </Center>
                </Box>
              </Paper>
            );
          })}
        </Stack>
      </Paper>
    );
  },
  (prev, next) =>
    equal(prev.whiteAnnotations, next.whiteAnnotations) && equal(prev.blackAnnotations, next.blackAnnotations),
);

function AccuracyCard({ color, cpl, accuracy }: { color: string; cpl: number; accuracy: number }) {
  const { t } = useTranslation();
  const estimatedElo = cpl > 0 ? calculateEstimatedElo(cpl) : undefined;

  return (
    <Paper withBorder p="xs">
      <Group justify="space-between">
        <Stack gap={0} align="start">
          <Text c="dimmed">{color}</Text>
          <Text fz="sm">{cpl.toFixed(1)} ACPL</Text>
          {estimatedElo !== undefined && (
            <Text fz="sm" c="dimmed">
              {Math.round(estimatedElo)} {t("dashboard.estimatedElo")}
            </Text>
          )}
        </Stack>
        <Stack gap={0} align="center">
          <Text fz="xl" lh="normal">
            {accuracy.toFixed(1)}%
          </Text>
          <Text fz="sm" c="dimmed" lh="normal">
            {t("features.board.analysis.accuracy")}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}

export default ReportPanel;
