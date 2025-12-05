import { Grid, Group, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import { IconZoomCheck } from "@tabler/icons-react";
import cx from "clsx";
import equal from "fast-deep-equal";
import { useAtomValue } from "jotai";
import React, { memo, Suspense, useContext, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import EvalChart from "@/components/EvalChart";
import ProgressButton from "@/components/ProgressButtonWithOutState";
import { TreeStateContext } from "@/components/TreeStateContext";
import { activeTabAtom } from "@/state/atoms";
import { saveAnalyzedGame, saveGameStats, getGameStats as getSavedGameStats } from "@/utils/analyzedGames";
import { ANNOTATION_INFO, annotationColors, isBasicAnnotation } from "@/utils/annotation";
import { getGameStats, getMainLine, getPGN } from "@/utils/chess";
import { calculateEstimatedElo } from "@/utils/eloEstimation";
import { updateGameRecord, type GameStats } from "@/utils/gameRecords";
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

  const stats = useMemo(() => getGameStats(root), [root]);

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
            const { getRecentGames } = await import("@/utils/gameRecords");
            const games = await getRecentGames(1000); // Get enough games to find ours
            const gameRecord = games.find(g => g.id === localGameId);
            
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
                const chessComUsername = typeof window !== "undefined" 
                  ? sessionStorage.getItem(`${activeTab}_chessComUsername`) 
                  : null;
                
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
                    const stats: GameStats = {
                      accuracy,
                      acpl,
                      estimatedElo: acpl > 0 ? calculateEstimatedElo(acpl) : undefined,
                    };
                    await saveGameStats(chessComGameUrl, stats);
                  }
                }
              } catch (error) {
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
                const lichessUsername = typeof window !== "undefined" 
                  ? sessionStorage.getItem(`${activeTab}_lichessUsername`) 
                  : null;
                
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
                    const stats: GameStats = {
                      accuracy,
                      acpl,
                      estimatedElo: acpl > 0 ? calculateEstimatedElo(acpl) : undefined,
                    };
                    await saveGameStats(lichessGameId, stats);
                  }
                }
              } catch (error) {
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

const GameStats = memo(
  function GameStats({ whiteAnnotations, blackAnnotations }: Stats) {
    const { t } = useTranslation();

    const store = useContext(TreeStateContext)!;
    const goToAnnotation = useStore(store, (s) => s.goToAnnotation);

    return (
      <Paper withBorder>
        <Grid columns={11} justify="space-between" p="md">
          {Object.keys(ANNOTATION_INFO)
            .filter((a) => isBasicAnnotation(a))
            .sort((a, b) => {
              // Order like Chess.com: Brilliant, Great, Best, Interesting, Dubious, Mistake, Blunder
              const order: Record<string, number> = {
                "!!": 1, // Brilliant
                "!": 2, // Great
                Best: 3, // Best
                "!?": 4, // Interesting
                "?!": 5, // Dubious
                "?": 6, // Mistake
                "??": 7, // Blunder
              };
              return (order[a] || 99) - (order[b] || 99);
            })
            .map((annotation) => {
              const s = annotation as "??" | "?" | "?!" | "!!" | "!" | "!?" | "Best";
              const { name, translationKey } = ANNOTATION_INFO[s];
              const color = annotationColors[s];
              const w = whiteAnnotations[s];
              const b = blackAnnotations[s];
              return (
                <React.Fragment key={annotation}>
                  <Grid.Col
                    className={cx(w > 0 && label)}
                    span={4}
                    style={{ textAlign: "center", color: w > 0 ? color : undefined }}
                    onClick={() => {
                      if (w > 0) {
                        goToAnnotation(s, "white");
                      }
                    }}
                  >
                    {w}
                  </Grid.Col>
                  <Grid.Col span={1} style={{ color: w + b > 0 ? color : undefined }}>
                    {annotation === "Best" ? (
                      <svg
                        viewBox="0 0 100 100"
                        style={{ width: "1em", height: "1em", display: "inline-block", verticalAlign: "middle" }}
                      >
                        <path
                          fill="currentColor"
                          d="M 50 15 L 55.9 38.1 L 80 38.1 L 60.5 52.4 L 66.4 75.5 L 50 61.2 L 33.6 75.5 L 39.5 52.4 L 20 38.1 L 44.1 38.1 Z"
                        />
                      </svg>
                    ) : (
                      annotation
                    )}
                  </Grid.Col>
                  <Grid.Col span={4} style={{ color: w + b > 0 ? color : undefined }}>
                    {translationKey ? t(`chess.annotate.${translationKey}`) : name}
                  </Grid.Col>
                  <Grid.Col
                    className={cx(b > 0 && label)}
                    span={2}
                    style={{ color: b > 0 ? color : undefined }}
                    onClick={() => {
                      if (b > 0) {
                        goToAnnotation(s, "black");
                      }
                    }}
                  >
                    {b}
                  </Grid.Col>
                </React.Fragment>
              );
            })}
        </Grid>
      </Paper>
    );
  },
  (prev, next) => {
    return equal(prev.whiteAnnotations, next.whiteAnnotations) && equal(prev.blackAnnotations, next.blackAnnotations);
  },
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
