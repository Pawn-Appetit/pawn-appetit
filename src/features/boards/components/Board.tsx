import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Piece } from "@lichess-org/chessground/types";
import { Box, Group, Text, useMantineTheme } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { makeSquare, type NormalMove, parseSquare, parseUci, type SquareName } from "chessops";
import { chessgroundDests, chessgroundMove } from "chessops/compat";
import { makeSan } from "chessops/san";
import domtoimage from "dom-to-image";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { memo, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import BoardControlsMenu from "@/components/BoardControlsMenu";
import { Chessground } from "@/components/Chessground";
import Clock from "@/components/Clock";
import MoveControls from "@/components/MoveControls";
import { arrowColors } from "@/components/panels/analysis/BestMoves";
import ShowMaterial from "@/components/ShowMaterial";
import { TreeStateContext } from "@/components/TreeStateContext";
import { updateCardPerformance } from "@/features/files/utils/opening";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import {
  autoPromoteAtom,
  bestMovesFamily,
  blindfoldAtom,
  currentEvalOpenAtom,
  currentTabAtom,
  deckAtomFamily,
  enableBoardScrollAtom,
  eraseDrawablesOnClickAtom,
  forcedEnPassantAtom,
  moveInputAtom,
  showArrowsAtom,
  showConsecutiveArrowsAtom,
  showCoordinatesAtom,
  showDestsAtom,
  snapArrowsAtom,
} from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import { blindfold, chessboard } from "@/styles/Chessboard.css";
import { annotationColors, isBasicAnnotation } from "@/utils/annotation";
import { getMaterialDiff, getVariationLine } from "@/utils/chess";
import { chessopsError, forceEnPassant, positionFromFen } from "@/utils/chessops";
import { getDocumentDir } from "@/utils/documentDir";
import AnnotationHint from "./AnnotationHint";
import EvalBar from "./EvalBar";
import MoveInput from "./MoveInput";
import PromotionModal from "./PromotionModal";

const LARGE_BRUSH = 11;
const MEDIUM_BRUSH = 7.5;
const SMALL_BRUSH = 4;

interface ChessboardProps {
  dirty: boolean;
  editingMode: boolean;
  toggleEditingMode: () => void;
  viewOnly?: boolean;
  disableVariations?: boolean;
  movable?: "both" | "white" | "black" | "turn" | "none";
  boardRef: React.MutableRefObject<HTMLDivElement | null>;
  saveFile?: () => void;
  reload?: () => void;
  addGame?: () => void;
  canTakeBack?: boolean;
  whiteTime?: number;
  blackTime?: number;
  practicing?: boolean;
  // Board controls props
  viewPawnStructure?: boolean;
  setViewPawnStructure?: (value: boolean) => void;
  takeSnapshot?: () => void;
  deleteMove?: () => void;
  changeTabType?: () => void;
  currentTabType?: "analysis" | "play";
  eraseDrawablesOnClick?: boolean;
  clearShapes?: () => void;
  toggleOrientation?: () => void;
  currentTabSourceType?: string;
  selectedPiece?: Piece | null;
  setSelectedPiece?: (piece: Piece | null) => void;
  // Start Game props
  startGame?: () => void;
  gameState?: "settingUp" | "playing" | "gameOver";
  startGameDisabled?: boolean;
  // Hide clock spaces for compact mode (e.g., PlayVsEngineBoard)
  hideClockSpaces?: boolean;
  // Hide eval bar and footer controls for game mode (e.g., PlayVsEngineBoard)
  hideEvalBar?: boolean;
  hideFooterControls?: boolean;
}

function Board({
  dirty,
  editingMode,
  toggleEditingMode,
  viewOnly,
  disableVariations,
  movable = "turn",
  boardRef,
  saveFile,
  reload,
  addGame,
  canTakeBack,
  whiteTime,
  blackTime,
  practicing,
  // Board controls props
  viewPawnStructure,
  setViewPawnStructure,
  takeSnapshot,
  deleteMove,
  changeTabType,
  currentTabType,
  eraseDrawablesOnClick,
  clearShapes,
  toggleOrientation,
  currentTabSourceType,
  selectedPiece,
  setSelectedPiece,
  // Start Game props
  startGame,
  gameState,
  startGameDisabled,
  hideClockSpaces = false,
  hideEvalBar = false,
  hideFooterControls = false,
}: ChessboardProps) {
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();

  const store = useContext(TreeStateContext)!;

  const rootFen = useStore(store, (s) => s.root.fen);
  const position = useStore(store, (s) => s.position);
  const headers = useStore(store, (s) => s.headers);
  const currentNode = useStore(store, (s) => s.currentNode());

  const goToNext = useStore(store, (s) => s.goToNext);
  const goToPrevious = useStore(store, (s) => s.goToPrevious);
  const storeMakeMove = useStore(store, (s) => s.makeMove);
  const setHeaders = useStore(store, (s) => s.setHeaders);
  const storeDeleteMove = useStore(store, (s) => s.deleteMove);
  const storeClearShapes = useStore(store, (s) => s.clearShapes);
  const setShapes = useStore(store, (s) => s.setShapes);
  const setFen = useStore(store, (s) => s.setFen);

  const [pos, error] = useMemo(() => positionFromFen(currentNode.fen), [currentNode.fen]);

  const moveInput = useAtomValue(moveInputAtom);
  const showDests = useAtomValue(showDestsAtom);
  const showArrows = useAtomValue(showArrowsAtom);
  const showConsecutiveArrows = useAtomValue(showConsecutiveArrowsAtom);
  const storeEraseDrawablesOnClick = useAtomValue(eraseDrawablesOnClickAtom);
  const autoPromote = useAtomValue(autoPromoteAtom);
  const forcedEP = useAtomValue(forcedEnPassantAtom);
  const showCoordinates = useAtomValue(showCoordinatesAtom);
  const isBlindfold = useAtomValue(blindfoldAtom);
  const setBlindfold = useSetAtom(blindfoldAtom);

  const dests: Map<SquareName, SquareName[]> = useMemo(() => {
    if (!pos) return new Map();
    let nextDests = chessgroundDests(pos);
    if (forcedEP) {
      nextDests = forceEnPassant(nextDests, pos);
    }
    return nextDests;
  }, [forcedEP, pos]);

  const [localViewPawnStructure, setLocalViewPawnStructure] = useState(false);
  const [pendingMove, setPendingMove] = useState<NormalMove | null>(null);

  const turn = pos?.turn || "white";
  const orientation = headers.orientation || "white";
  const localToggleOrientation = () =>
    setHeaders({
      ...headers,
      fen: rootFen, // Keep current board setup
      orientation: orientation === "black" ? "white" : "black",
    });

  const localTakeSnapshot = async () => {
    const ref = boardRef?.current;
    if (ref == null) return;

    // We must get the first children three levels below, as it has the right dimensions.
    const refChildNode = ref.children[0].children[0].children[0] as HTMLElement;
    if (refChildNode == null) return;

    domtoimage.toBlob(refChildNode).then(async (blob) => {
      if (blob == null) return;
      const documentsDirPath: string = await getDocumentDir();

      const filePath = await save({
        title: "Save board snapshot",
        defaultPath: documentsDirPath,
        filters: [
          {
            name: "Png image",
            extensions: ["png"],
          },
        ],
      });
      const arrayBuffer = await blob.arrayBuffer();
      if (filePath == null) return;
      await writeFile(filePath, new Uint8Array(arrayBuffer));
    });
  };

  const keyMap = useAtomValue(keyMapAtom);
  useHotkeys([[keyMap.SWAP_ORIENTATION.keys, () => (toggleOrientation ?? localToggleOrientation)()]]);
  const [currentTab, setCurrentTab] = useAtom(currentTabAtom);
  const [evalOpen, setEvalOpen] = useAtom(currentEvalOpenAtom);

  const emptyMoves = useMemo(() => [] as string[], []);
  const arrowMoves = useMemo(() => {
    if (!showArrows || !evalOpen) return emptyMoves;
    return getVariationLine(store.getState().root, position, headers.variant === "Chess960");
  }, [emptyMoves, evalOpen, headers.variant, position, rootFen, showArrows, store]);

  const arrows = useAtomValue(
    bestMovesFamily({
      fen: rootFen,
      gameMoves: arrowMoves,
    }),
  );

  const [deck, setDeck] = useAtom(
    deckAtomFamily({
      file: currentTab?.source?.type === "file" ? currentTab.source.path : "",
      game: currentTab?.gameNumber || 0,
    }),
  );

  async function makeMove(move: NormalMove) {
    if (!pos) return;
    const san = makeSan(pos, move);
    if (practicing) {
      const c = deck.positions.find((c) => c.fen === currentNode.fen);
      if (!c) {
        return;
      }

      let isRecalled = true;
      if (san !== c?.answer) {
        isRecalled = false;
      }
      const i = deck.positions.indexOf(c);

      if (!isRecalled) {
        notifications.show({
          title: t("common.incorrect"),
          message: t("features.board.practice.correctMoveWas", { move: c.answer }),
          color: "red",
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        goToNext();
      } else {
        storeMakeMove({
          payload: move,
        });
        setPendingMove(null);
      }

      updateCardPerformance(setDeck, i, c.card, isRecalled ? 4 : 1);
    } else {
      storeMakeMove({
        payload: move,
        clock: pos.turn === "white" ? whiteTime : blackTime,
      });
      setPendingMove(null);
    }
  }

  const shapes = useMemo(() => {
    const nextShapes: DrawShape[] = [];
    if (showArrows && evalOpen && arrows.size > 0 && pos) {
      const entries = Array.from(arrows.entries()).sort((a, b) => a[0] - b[0]);
      for (const [engineIndex, bestMoves] of entries) {
        if (engineIndex >= 4) continue;
        const bestWinChance = bestMoves[0]?.winChance;
        if (bestWinChance == null) continue;

        for (const [variationIndex, { pv, winChance }] of bestMoves.entries()) {
          const posClone = pos.clone();
          let prevSquare: string | null = null;

          for (const [moveIndex, uci] of pv.entries()) {
            const move = parseUci(uci) as NormalMove | undefined;
            if (!move) break;

            posClone.play(move);
            const from = makeSquare(move.from);
            const to = makeSquare(move.to);
            if (!from || !to) break;

            if (prevSquare === null) {
              prevSquare = from;
            }

            const brushSize = match(bestWinChance - winChance)
              .when(
                (d) => d < 2.5,
                () => LARGE_BRUSH,
              )
              .when(
                (d) => d < 5,
                () => MEDIUM_BRUSH,
              )
              .otherwise(() => SMALL_BRUSH);

            const shouldDraw =
              moveIndex === 0 || (showConsecutiveArrows && variationIndex === 0 && moveIndex % 2 === 0);
            if (!shouldDraw) continue;

            const isDuplicate = nextShapes.some((s) => s.orig === from && s.dest === to);
            const isContinuation = prevSquare === from;
            if (!isContinuation || isDuplicate) break;

            if (moveIndex >= 5) break; // cap arrow count per line

            const arrowColor = variationIndex === 0 ? arrowColors[engineIndex].strong : arrowColors[engineIndex].pale;

            nextShapes.push({
              orig: from,
              dest: to,
              brush: arrowColor,
              modifiers: {
                lineWidth: brushSize,
              },
            });
            prevSquare = to;
          }
        }
      }
    }

    if (currentNode.shapes.length > 0) {
      nextShapes.push(...currentNode.shapes);
    }

    return nextShapes;
  }, [arrows, currentNode.shapes, evalOpen, pos, showArrows, showConsecutiveArrows]);

  const hasClock =
    whiteTime !== undefined ||
    blackTime !== undefined ||
    headers.time_control !== undefined ||
    headers.white_time_control !== undefined ||
    headers.black_time_control !== undefined;

  function localChangeTabType() {
    setCurrentTab((t) => {
      return {
        ...t,
        type: t.type === "analysis" ? "play" : "analysis",
      };
    });
  }

  const materialDiff = getMaterialDiff(currentNode.fen);
  const practiceLock = !!practicing && !deck.positions.find((c) => c.fen === currentNode.fen);

  const movableColor: "white" | "black" | "both" | undefined = useMemo(() => {
    return practiceLock
      ? undefined
      : editingMode
        ? "both"
        : match(movable)
            .with("white", () => "white" as const)
            .with("black", () => "black" as const)
            .with("turn", () => turn)
            .with("both", () => "both" as const)
            .with("none", () => undefined)
            .exhaustive();
  }, [practiceLock, editingMode, movable, turn]);

  const theme = useMantineTheme();
  const annotationColor = annotationColors[currentNode.annotations[0]] || "#6B7280";
  // Use the hex color directly for both light and dark variants
  const lightColor = annotationColor;
  const darkColor = annotationColor;

  const [enableBoardScroll] = useAtom(enableBoardScrollAtom);
  const [snapArrows] = useAtom(snapArrowsAtom);

  const setBoardFen = useCallback(
    (fen: string) => {
      if (!fen || !editingMode) {
        return;
      }
      const newFen = `${fen} ${currentNode.fen.split(" ").slice(1).join(" ")}`;

      if (newFen !== currentNode.fen) {
        setFen(newFen);
      }
    },
    [editingMode, currentNode, setFen],
  );

  useEffect(() => {
    const linkId = "view-pawn-structure-css";

    if (viewPawnStructure) {
      if (!document.getElementById(linkId)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/pieces/view-pawn-structure.css";
        link.id = linkId;

        document.head.appendChild(link);
      }
    } else {
      const existingLink = document.getElementById(linkId);
      if (existingLink) {
        document.head.removeChild(existingLink);
      }
    }

    return () => {
      const existingLink = document.getElementById(linkId);
      if (existingLink) {
        document.head.removeChild(existingLink);
      }
    };
  }, [viewPawnStructure]);

  useHotkeys([
    [keyMap.TOGGLE_EVAL_BAR.keys, () => setEvalOpen((e) => !e)],
    [keyMap.BLINDFOLD.keys, () => setBlindfold((v) => !v)],
  ]);

  const square = match(currentNode)
    .with({ san: "O-O" }, ({ halfMoves }) => parseSquare(halfMoves % 2 === 1 ? "g1" : "g8"))
    .with({ san: "O-O-O" }, ({ halfMoves }) => parseSquare(halfMoves % 2 === 1 ? "c1" : "c8"))
    .otherwise((node) => node.move?.to);

  const lastMove =
    currentNode.move && square !== undefined ? [chessgroundMove(currentNode.move)[0], makeSquare(square)!] : undefined;

  return (
    <Box w="100%" h="100%">
      <Box
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          gap: hideClockSpaces ? "0" : "0.5rem",
          flexWrap: "nowrap",
          overflow: "hidden",
          // Let the board use available space - responsive sizing is handled by the container
          maxWidth: "100%",
          maxHeight: "100%",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {!hideClockSpaces && materialDiff && (
          <Group ml="2.5rem" h="2.125rem">
            {hasClock && (
              <Clock
                color={orientation === "black" ? "white" : "black"}
                turn={turn}
                whiteTime={whiteTime}
                blackTime={blackTime}
              />
            )}
            <ShowMaterial
              diff={materialDiff.diff}
              pieces={materialDiff.pieces}
              color={orientation === "white" ? "black" : "white"}
            />
          </Group>
        )}
        <Group
          style={{
            position: "relative",
            flexWrap: "nowrap",
            flex: hideClockSpaces ? "1 1 0" : undefined,
            minHeight: 0,
            minWidth: 0,
            height: hideClockSpaces ? "100%" : undefined,
          }}
          gap="sm"
        >
          {currentNode.annotations.length > 0 && currentNode.move && square !== undefined && (
            <Box pl="2.5rem" w="100%" h="100%" pos="absolute">
              <Box pos="relative" w="100%" h="100%">
                <AnnotationHint orientation={orientation} square={square} annotation={currentNode.annotations[0]} />
              </Box>
            </Box>
          )}
          {!hideEvalBar && (
            <Box
              h="100%"
              style={{
                width: 25,
              }}
              onClick={() => setEvalOpen((prevState) => !prevState)}
            >
              <EvalBar score={currentNode.score?.value || null} orientation={orientation} />
            </Box>
          )}
          <Box
            style={
              isBasicAnnotation(currentNode.annotations[0])
                ? {
                    "--light-color": lightColor,
                    "--dark-color": darkColor,
                  }
                : undefined
            }
            className={`${chessboard} ${isBlindfold ? blindfold : ""}`}
            ref={boardRef}
            onClick={() => {
              (eraseDrawablesOnClick ?? storeEraseDrawablesOnClick) && (clearShapes ?? storeClearShapes)();
            }}
            onWheel={(e) => {
              if (enableBoardScroll) {
                if (e.deltaY > 0) {
                  goToNext();
                } else {
                  goToPrevious();
                }
              }
            }}
          >
            <PromotionModal
              pendingMove={pendingMove}
              cancelMove={() => setPendingMove(null)}
              confirmMove={(p) => {
                if (pendingMove) {
                  makeMove({
                    from: pendingMove.from,
                    to: pendingMove.to,
                    promotion: p,
                  });
                }
              }}
              turn={turn}
              orientation={orientation}
            />

            <Chessground
              selectedPiece={selectedPiece}
              setSelectedPiece={setSelectedPiece}
              setBoardFen={setBoardFen}
              orientation={orientation}
              fen={currentNode.fen}
              animation={{ enabled: !editingMode }}
              coordinates={showCoordinates !== "none"}
              coordinatesOnSquares={showCoordinates === "all"}
              movable={{
                free: editingMode,
                color: movableColor,
                dests:
                  editingMode || viewOnly
                    ? undefined
                    : disableVariations && currentNode.children.length > 0
                      ? undefined
                      : dests,
                showDests,
                events: {
                  after(orig, dest, metadata) {
                    if (!editingMode) {
                      const from = parseSquare(orig)!;
                      const to = parseSquare(dest)!;

                      if (pos) {
                        if (
                          pos.board.get(from)?.role === "pawn" &&
                          ((dest[1] === "8" && turn === "white") || (dest[1] === "1" && turn === "black"))
                        ) {
                          if (autoPromote && !metadata.ctrlKey) {
                            makeMove({
                              from,
                              to,
                              promotion: "queen",
                            });
                          } else {
                            setPendingMove({
                              from,
                              to,
                            });
                          }
                        } else {
                          makeMove({
                            from,
                            to,
                          });
                        }
                      }
                    }
                  },
                },
              }}
              turnColor={turn}
              check={pos?.isCheck()}
              lastMove={editingMode ? undefined : lastMove}
              premovable={{
                enabled: false,
              }}
              // Leverage Chessground's built-in touch optimization
              draggable={{
                enabled: !viewPawnStructure && !layout.chessBoard.touchOptimized,
                deleteOnDropOff: editingMode,
              }}
              selectable={{
                enabled: layout.chessBoard.touchOptimized,
              }}
              drawable={{
                enabled: true,
                visible: true,
                defaultSnapToValidMove: snapArrows,
                autoShapes: shapes,
                onChange: (shapes) => {
                  setShapes(shapes);
                },
              }}
            />
          </Box>
        </Group>
        <Group justify="space-between" h={hideClockSpaces ? "auto" : "2.125rem"}>
          {!hideClockSpaces && materialDiff && (
            <Group ml="2.5rem">
              {hasClock && <Clock color={orientation} turn={turn} whiteTime={whiteTime} blackTime={blackTime} />}
              <ShowMaterial diff={materialDiff.diff} pieces={materialDiff.pieces} color={orientation} />
            </Group>
          )}

          {error && (
            <Text ta="center" c="red">
              {t(chessopsError(error))}
            </Text>
          )}

          {moveInput && <MoveInput currentNode={currentNode} />}

          {!hideFooterControls && layout.chessBoard.layoutType !== "mobile" && (
            <BoardControlsMenu
              viewPawnStructure={viewPawnStructure ?? localViewPawnStructure}
              setViewPawnStructure={setViewPawnStructure ?? setLocalViewPawnStructure}
              takeSnapshot={takeSnapshot ?? localTakeSnapshot}
              canTakeBack={canTakeBack}
              deleteMove={deleteMove ?? storeDeleteMove}
              changeTabType={changeTabType ?? localChangeTabType}
              currentTabType={currentTabType}
              eraseDrawablesOnClick={eraseDrawablesOnClick ?? storeEraseDrawablesOnClick}
              clearShapes={clearShapes ?? storeClearShapes}
              disableVariations={disableVariations}
              editingMode={editingMode}
              toggleEditingMode={toggleEditingMode}
              saveFile={saveFile}
              reload={reload}
              addGame={addGame}
              toggleOrientation={toggleOrientation ?? localToggleOrientation}
              currentTabSourceType={currentTabSourceType}
              count={currentTabType === "play" ? 3 : 6}
            />
          )}
        </Group>

        {/* MoveControls with board controls menu */}
        {!hideFooterControls && layout.chessBoard.layoutType === "mobile" && (
          <MoveControls
            viewPawnStructure={viewPawnStructure ?? localViewPawnStructure}
            setViewPawnStructure={setViewPawnStructure ?? setLocalViewPawnStructure}
            takeSnapshot={takeSnapshot ?? localTakeSnapshot}
            canTakeBack={canTakeBack}
            deleteMove={deleteMove ?? storeDeleteMove}
            changeTabType={changeTabType ?? localChangeTabType}
            currentTabType={currentTabType}
            eraseDrawablesOnClick={eraseDrawablesOnClick ?? storeEraseDrawablesOnClick}
            clearShapes={clearShapes ?? storeClearShapes}
            disableVariations={disableVariations}
            editingMode={editingMode}
            toggleEditingMode={toggleEditingMode}
            saveFile={saveFile}
            dirty={dirty}
            autoSave={false} // Board component doesn't have autoSave context
            reload={reload}
            addGame={addGame}
            toggleOrientation={toggleOrientation ?? localToggleOrientation}
            currentTabSourceType={currentTabSourceType}
            // Start Game props
            startGame={startGame}
            gameState={gameState}
            startGameDisabled={startGameDisabled}
          />
        )}
      </Box>
    </Box>
  );
}

export default memo(Board);
