import type { DrawShape } from "@lichess-org/chessground/draw";
import { isNormal, type Move, makeUci, parseUci } from "chessops";
import { INITIAL_FEN, makeFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import { type Draft, produce } from "immer";
import { createStore, type StateCreator } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BestMoves, Outcome, Score } from "@/bindings";
import { ANNOTATION_INFO, type Annotation } from "@/utils/annotation";
import { getPGN } from "@/utils/chess";
import { parseSanOrUci, positionFromFen } from "@/utils/chessops";
import { isPrefix } from "@/utils/misc";
import { getAnnotation } from "@/utils/score";
import { playSound } from "@/utils/sound";
import {
  createNode,
  defaultTree,
  type GameHeaders,
  getNodeAtPath,
  type TreeNode,
  type TreeState,
  treeIteratorMainLine,
} from "@/utils/treeReducer";

export interface TreeStoreState extends TreeState {
  currentNode: () => TreeNode;

  goToNext: () => void;
  goToPrevious: () => void;
  goToStart: () => void;
  goToEnd: () => void;
  goToMove: (move: number[]) => void;
  goToBranchStart: () => void;
  goToBranchEnd: () => void;
  nextBranch: () => void;
  previousBranch: () => void;
  nextBranching: () => void;
  previousBranching: () => void;

  goToAnnotation: (annotation: Annotation, color: "white" | "black") => void;

  makeMove: (args: {
    payload: string | Move;
    changePosition?: boolean;
    mainline?: boolean;
    clock?: number;
    changeHeaders?: boolean;
  }) => void;

  appendMove: (args: { payload: Move; clock?: number }) => void;

  makeMoves: (args: { payload: string[]; mainline?: boolean; changeHeaders?: boolean }) => void;
  deleteMove: (path?: number[]) => void;
  promoteVariation: (path: number[]) => void;
  promoteToMainline: (path: number[]) => void;
  copyVariationPgn: (path: number[]) => void;

  setStart: (start: number[]) => void;

  setAnnotation: (payload: Annotation) => void;
  setComment: (payload: string) => void;
  setHeaders: (payload: GameHeaders) => void;
  setResult: (payload: Outcome) => void;
  setShapes: (shapes: DrawShape[]) => void;
  setScore: (score: Score) => void;

  clearShapes: () => void;

  setFen: (fen: string) => void;

  addAnalysis: (
    analysis: {
      best: BestMoves[];
      novelty: boolean;
      is_sacrifice: boolean;
    }[],
  ) => void;

  setReportProgress: (progress: number) => void;
  setReportCompleted: (isCompleted: boolean) => void;
  setReportInProgress: (value: boolean) => void;

  setState: (state: TreeState) => void;
  reset: () => void;
  save: () => void;
}

export type TreeStore = ReturnType<typeof createTreeStore>;

export const createTreeStore = (id?: string, initialTree?: TreeState) => {
  const stateCreator: StateCreator<TreeStoreState> = (set, get) => ({
    ...(initialTree ?? defaultTree()),

    currentNode: () => getNodeAtPath(get().root, get().position),

    setState: (state) => {
      set(() => state);
    },

    reset: () =>
      set(() => {
        return defaultTree();
      }),

    save: () => {
      set((state) => ({
        ...state,
        dirty: false,
      }));
    },

    setFen: (fen) =>
      set(
        produce((state) => {
          state.dirty = true;
          state.root = defaultTree(fen).root;
          state.position = [];
        }),
      ),

    goToNext: () =>
      set((state) => {
        const node = getNodeAtPath(state.root, state.position);
        const [pos] = positionFromFen(node.fen);
        if (!pos || !node.children[0]?.move) return state;
        const san = makeSan(pos, node.children[0].move);
        playSound(san.includes("x"), san.includes("+"));
        if (node && node.children.length > 0) {
          return {
            ...state,
            position: [...state.position, 0],
          };
        }
        return state;
      }),
    goToPrevious: () => set((state) => ({ ...state, position: state.position.slice(0, -1) })),

    goToAnnotation: (annotation, color) =>
      set(
        produce((state) => {
          const colorN = color === "white" ? 1 : 0;

          let p: number[] = state.position;
          let node = getNodeAtPath(state.root, p);
          while (true) {
            if (node.children.length === 0) {
              p = [];
            } else {
              p.push(0);
            }

            node = getNodeAtPath(state.root, p);

            if (node.annotations.includes(annotation) && node.halfMoves % 2 === colorN) {
              break;
            }
          }

          state.position = p;
        }),
      ),

    makeMove: ({ payload, changePosition, mainline, clock, changeHeaders = true }) => {
      set(
        produce((state) => {
          if (typeof payload === "string") {
            const node = getNodeAtPath(state.root, state.position);
            if (!node) return;
            const [pos] = positionFromFen(node.fen);
            if (!pos) return;
            const move = parseSan(pos, payload);
            if (!move) return;
            payload = move;
          }
          makeMove({
            state,
            move: payload,
            last: false,
            changePosition,
            changeHeaders,
            mainline,
            clock,
          });
        }),
      );
    },

    appendMove: ({ payload, clock }) =>
      set(
        produce((state) => {
          makeMove({ state, move: payload, last: true, clock });
        }),
      ),

    makeMoves: ({ payload, mainline, changeHeaders = true }) =>
      set(
        produce((state) => {
          state.dirty = true;
          const node = getNodeAtPath(state.root, state.position);
          const [pos] = positionFromFen(node.fen);
          if (!pos) return;
          for (const [i, move] of payload.entries()) {
            const m = parseSanOrUci(pos, move);
            if (!m) return;
            pos.play(m);
            makeMove({
              state,
              move: m,
              last: false,
              mainline,
              sound: i === payload.length - 1,
              changeHeaders,
            });
          }
        }),
      ),
    goToEnd: () =>
      set(
        produce((state) => {
          const endPosition: number[] = [];
          let currentNode = state.root;
          while (currentNode.children.length > 0) {
            endPosition.push(0);
            currentNode = currentNode.children[0];
          }
          state.position = endPosition;
        }),
      ),
    goToStart: () =>
      set((state) => ({
        ...state,
        position: state.headers.start || [],
      })),
    goToMove: (move) =>
      set((state) => ({
        ...state,
        position: move,
      })),
    goToBranchStart: () => {
      set(
        produce((state) => {
          if (state.position.length > 0 && state.position[state.position.length - 1] !== 0) {
            state.position = state.position.slice(0, -1);
          }

          while (state.position.length > 0 && state.position[state.position.length - 1] === 0) {
            state.position = state.position.slice(0, -1);
          }
        }),
      );
    },

    goToBranchEnd: () => {
      set(
        produce((state) => {
          let currentNode = getNodeAtPath(state.root, state.position);
          while (currentNode.children.length > 0) {
            state.position.push(0);
            currentNode = currentNode.children[0];
          }
        }),
      );
    },

    nextBranch: () =>
      set(
        produce((state) => {
          if (state.position.length === 0) return;

          const parent = getNodeAtPath(state.root, state.position.slice(0, -1));
          const branchIndex = state.position[state.position.length - 1];
          const node = parent.children[branchIndex];

          // Makes the navigation more fluid and compatible with next/previous branching
          if (node.children.length >= 2 && parent.children.length <= 1) {
            state.position.push(0);
          }

          state.position = [...state.position.slice(0, -1), (branchIndex + 1) % parent.children.length];
        }),
      ),
    previousBranch: () =>
      set(
        produce((state) => {
          if (state.position.length === 0) return;

          const parent = getNodeAtPath(state.root, state.position.slice(0, -1));
          const branchIndex = state.position[state.position.length - 1];
          const node = parent.children[branchIndex];

          // Makes the navigation more fluid and compatible with next/previous branching
          if (node.children.length >= 2 && parent.children.length <= 1) {
            state.position.push(0);
          }

          state.position = [
            ...state.position.slice(0, -1),
            (branchIndex + parent.children.length - 1) % parent.children.length,
          ];
        }),
      ),

    nextBranching: () =>
      set(
        produce((state) => {
          let node = getNodeAtPath(state.root, state.position);
          let branchCount = node.children.length;

          if (branchCount === 0) return;

          do {
            state.position.push(0);
            node = node.children[0];
            branchCount = node.children.length;
          } while (branchCount === 1);
        }),
      ),

    previousBranching: () =>
      set(
        produce((state) => {
          let node = getNodeAtPath(state.root, state.position);
          let branchCount = node.children.length;

          if (state.position.length === 0) return;

          do {
            state.position = state.position.slice(0, -1);
            node = getNodeAtPath(state.root, state.position);
            branchCount = node.children.length;
          } while (branchCount === 1 && state.position.length > 0);
        }),
      ),

    deleteMove: (path) =>
      set(
        produce((state) => {
          state.dirty = true;
          deleteMove(state, path ?? state.position);
        }),
      ),
    promoteVariation: (path) =>
      set(
        produce((state) => {
          state.dirty = true;
          promoteVariation(state, path);
        }),
      ),
    promoteToMainline: (path) =>
      set(
        produce((state) => {
          state.dirty = true;
          while (path.some((v) => v !== 0)) {
            promoteVariation(state, path);
            path = state.position;
          }
        }),
      ),
    copyVariationPgn: (path) => {
      const { root } = get();
      const pgn = getPGN(root, {
        headers: null,
        comments: false,
        extraMarkups: false,
        glyphs: true,
        variations: false,
        path,
      });
      navigator.clipboard.writeText(pgn);
    },
    setStart: (start) =>
      set(
        produce((state) => {
          state.dirty = true;
          state.headers.start = start;
        }),
      ),
    setAnnotation: (payload) =>
      set(
        produce((state) => {
          state.dirty = true;
          const node = getNodeAtPath(state.root, state.position);
          if (node) {
            if (node.annotations.includes(payload)) {
              node.annotations = node.annotations.filter((a) => a !== payload);
            } else {
              const newAnnotations = node.annotations.filter(
                (a) => !ANNOTATION_INFO[a].group || ANNOTATION_INFO[a].group !== ANNOTATION_INFO[payload].group,
              );
              node.annotations = [...newAnnotations, payload].sort((a, b) => {
                const aInfo = ANNOTATION_INFO[a];
                const bInfo = ANNOTATION_INFO[b];
                if (!aInfo || !bInfo) return 0;
                return aInfo.nag > bInfo.nag ? 1 : -1;
              });
            }
          }
        }),
      ),
    setComment: (payload) =>
      set(
        produce((state) => {
          state.dirty = true;
          const node = getNodeAtPath(state.root, state.position);
          if (node) {
            node.comment = payload;
          }
        }),
      ),
    setHeaders: (headers) =>
      set(
        produce((state) => {
          state.dirty = true;
          // Only update headers metadata, don't reset tree if it has moves
          // This prevents losing game history when headers are updated
          const hasMoves = state.root.children.length > 0;

          // Only reset tree if:
          // 1. The FEN is different AND
          // 2. There are no moves in the tree (fresh start)
          // This allows updating headers without losing game history
          if (headers.fen && headers.fen !== state.root.fen && !hasMoves) {
            state.root = defaultTree(headers.fen).root;
            state.position = [];
          }

          // Always update headers metadata
          state.headers = { ...state.headers, ...headers };
        }),
      ),
    setResult: (result) =>
      set(
        produce((state) => {
          state.dirty = true;
          state.headers.result = result;
        }),
      ),
    setShapes: (shapes) =>
      set(
        produce((state) => {
          state.dirty = true;
          setShapes(state, shapes);
        }),
      ),
    setScore: (score) =>
      set(
        produce((state) => {
          // Engine evaluations update frequently; marking the tree as dirty here can trigger
          // auto-save loops and heavy IO while analyzing. Score is ephemeral UI state.
          const node = getNodeAtPath(state.root, state.position);
          if (node) {
            node.score = score;
          }
        }),
      ),
    addAnalysis: (analysis) =>
      set(
        produce((state) => {
          state.dirty = true;
          addAnalysis(state, analysis);
        }),
      ),
    setReportProgress: (value: number) => {
      set(
        produce((state: Draft<TreeStoreState>) => {
          state.report.progress = value;
        }),
      );
    },
    setReportCompleted: (value: boolean) => {
      set(
        produce((state: Draft<TreeStoreState>) => {
          state.report.isCompleted = value;
        }),
      );
    },
    setReportInProgress: (value: boolean) => {
      set(
        produce((state: Draft<TreeStoreState>) => {
          state.report.inProgress = value;
        }),
      );
    },
    clearShapes: () =>
      set(
        produce((state) => {
          const node = getNodeAtPath(state.root, state.position);
          if (node && node.shapes.length > 0) {
            state.dirty = true;
            node.shapes = [];
          }
        }),
      ),
  });

  if (id) {
    return createStore<TreeStoreState>()(
      persist(stateCreator, {
        name: id,
        storage: createJSONStorage(() => sessionStorage),
      }),
    );
  }
  return createStore<TreeStoreState>()(stateCreator);
};

function makeMove({
  state,
  move,
  last,
  changePosition = true,
  changeHeaders = true,
  mainline = false,
  clock,
  sound = true,
}: {
  state: TreeState;
  move: Move;
  last: boolean;
  changePosition?: boolean;
  changeHeaders?: boolean;
  mainline?: boolean;
  clock?: number;
  sound?: boolean;
}) {
  const mainLine = Array.from(treeIteratorMainLine(state.root));
  const position = last ? mainLine[mainLine.length - 1].position : state.position;
  const moveNode = getNodeAtPath(state.root, position);
  if (!moveNode) return;
  const [pos] = positionFromFen(moveNode.fen);
  if (!pos) return;
  const san = makeSan(pos, move);
  if (san === "--") return; // invalid move
  pos.play(move);
  if (sound) {
    playSound(san.includes("x"), san.includes("+"));
  }
  if (changeHeaders && pos.isEnd()) {
    if (pos.isCheckmate()) {
      state.headers.result = pos.turn === "white" ? "0-1" : "1-0";
    }
    if (pos.isStalemate() || pos.isInsufficientMaterial()) {
      state.headers.result = "1/2-1/2";
    }
  }

  const newFen = makeFen(pos.toSetup());

  if ((changeHeaders && isThreeFoldRepetition(state, newFen)) || is50MoveRule(state)) {
    state.headers.result = "1/2-1/2";
  }

  const i = moveNode.children.findIndex((n) => n.san === san);
  if (i !== -1) {
    if (changePosition) {
      if (state.position === position) {
        state.position.push(i);
      } else {
        state.position = [...position, i];
      }
    }
  } else {
    state.dirty = true;
    const newMoveNode = createNode({
      fen: newFen,
      move,
      san,
      halfMoves: moveNode.halfMoves + 1,
      clock,
    });
    if (mainline) {
      moveNode.children.unshift(newMoveNode);
    } else {
      moveNode.children.push(newMoveNode);
    }
    if (changePosition) {
      if (state.position === position) {
        if (mainline) {
          state.position.push(0);
        } else {
          state.position.push(moveNode.children.length - 1);
        }
      } else {
        state.position = [...position, moveNode.children.length - 1];
      }
    }
  }
}

function isThreeFoldRepetition(state: TreeState, fen: string) {
  let node = state.root;
  const fens = [INITIAL_FEN.split(" - ")[0]];
  for (const i of state.position) {
    node = node.children[i];
    fens.push(node.fen.split(" - ")[0]);
  }
  return fens.filter((f) => f === fen.split(" - ")[0]).length >= 2;
}

function is50MoveRule(state: TreeState) {
  let node = state.root;
  let count = 0;
  for (const i of state.position) {
    count += 1;
    const [pos] = positionFromFen(node.fen);
    if (!pos) return false;
    if (
      node.move &&
      isNormal(node.move) &&
      (node.move.promotion || node.san?.includes("x") || pos.board.get(node.move.from)?.role === "pawn")
    ) {
      count = 0;
    }
    node = node.children[i];
  }
  return count >= 100;
}

function deleteMove(state: TreeState, path: number[]) {
  const node = getNodeAtPath(state.root, path);
  if (!node) return;
  const parent = getNodeAtPath(state.root, path.slice(0, -1));
  if (!parent) return;
  const index = parent.children.findIndex((n) => n === node);
  parent.children.splice(index, 1);
  if (isPrefix(path, state.position)) {
    state.position = path.slice(0, -1);
  } else if (isPrefix(path.slice(0, -1), state.position)) {
    if (state.position.length >= path.length) {
      state.position[path.length - 1] = 0;
    }
  }
}

function promoteVariation(state: TreeState, path: number[]) {
  // get last element different from 0
  const i = path.findLastIndex((v) => v !== 0);
  if (i === -1) return state;

  const v = path[i];
  const promotablePath = path.slice(0, i);
  const node = getNodeAtPath(state.root, promotablePath);
  if (!node) return state;
  node.children.unshift(node.children.splice(v, 1)[0]);
  state.position = path;
  state.position[i] = 0;
}

function setShapes(state: TreeState, shapes: DrawShape[]) {
  const node = getNodeAtPath(state.root, state.position);
  if (!node) return state;

  const [shape] = shapes;
  if (shape) {
    const index = node.shapes.findIndex((s) => s.orig === shape.orig && s.dest === shape.dest);

    if (index !== -1) {
      node.shapes.splice(index, 1);
    } else {
      node.shapes.push(shape);
    }
  } else {
    node.shapes = [];
  }

  return state;
}

export function addAnalysis(
  state: TreeState,
  analysis: {
    best: BestMoves[];
    novelty: boolean;
    is_sacrifice: boolean;
  }[],
) {
  // Recursively clear all auto-generated annotations and variations from the entire tree
  // This ensures we start fresh with each analysis run
  function clearAllAutoGenerated(node: TreeNode) {
    // Remove auto-generated annotations (basic annotations and novelty)
    // Keep user-added annotations (advantage annotations and others)
    node.annotations = node.annotations.filter((ann) => {
      const info = ANNOTATION_INFO[ann];
      // Keep annotations that are not basic (group !== "basic") and not novelty ("N")
      return ann !== "N" && (!info.group || info.group !== "basic");
    });

    // Remove all auto-generated variations (all children except the first one, which is the main line)
    // We keep the main line structure but remove variations that were added by previous analysis
    // This is safe because we'll regenerate them if needed
    if (node.children.length > 1) {
      // Keep only the main line (first child), remove all variations
      const mainLine = node.children[0];
      node.children = [mainLine];
    }

    // Recursively clear all children (main line and any remaining variations)
    for (const child of node.children) {
      clearAllAutoGenerated(child);
    }
  }

  clearAllAutoGenerated(state.root);

  // Now add the new analysis annotations
  let cur = state.root;
  let i = 0;
  // Continue until we reach the end of the game tree, not just the end of analysis
  // This ensures the PGN is not cut off
  while (cur !== undefined) {
    // Only apply analysis if we have analysis data for this position
    if (i < analysis.length && analysis[i].best.length > 0) {
      const [pos] = positionFromFen(cur.fen);
      if (pos && !pos.isEnd()) {
        cur.score = analysis[i].best[0].score;
        if (analysis[i].novelty) {
          cur.annotations = [...new Set([...cur.annotations, "N" as const])];
        }
        let prevScore = null;
        let prevprevScore = null;
        let prevMoves: BestMoves[] = [];
        if (i > 0) {
          prevScore = analysis[i - 1].best[0].score;
          prevMoves = analysis[i - 1].best;
        }
        if (i > 1) {
          prevprevScore = analysis[i - 2].best[0].score;
        }
        const curScore = analysis[i].best[0].score;
        const color = cur.halfMoves % 2 === 1 ? "white" : "black";
        const annotation = getAnnotation(
          prevprevScore?.value || null,
          prevScore?.value || null,
          curScore.value,
          color,
          prevMoves,
          analysis[i].is_sacrifice,
          cur.san || "",
        );
        if (annotation) {
          // Remove ALL basic annotations before adding the new one
          // This prevents multiple annotations from accumulating
          const filteredAnnotations = cur.annotations.filter((ann) => {
            const annInfo = ANNOTATION_INFO[ann];
            // Remove all basic annotations (group === "basic")
            return !annInfo || annInfo.group !== "basic";
          });
          cur.annotations = [...filteredAnnotations, annotation];

          // If annotation is negative (dubious, mistake, or blunder), add engine suggestion as variation
          if (annotation === "?!" || annotation === "?" || annotation === "??") {
            // Get best moves from the previous position (before the current move)
            const prevBestMoves = i > 0 ? analysis[i - 1].best : [];

            // Find the best alternative move (not the move that was actually played)
            let bestMovesToUse: BestMoves | null = null;
            const currentMoveUci = cur.move ? makeUci(cur.move) : null;

            if (prevBestMoves.length > 0) {
              // Look for the first best move that is different from the current move
              for (const bestMove of prevBestMoves) {
                if (bestMove.uciMoves.length > 0) {
                  const firstMove = bestMove.uciMoves[0];
                  // If it's different from current move, use it
                  if (!currentMoveUci || firstMove !== currentMoveUci) {
                    bestMovesToUse = bestMove;
                    break;
                  }
                }
              }
              // If all best moves match current move, use the first one anyway (it's still the best line)
              if (!bestMovesToUse && prevBestMoves[0].uciMoves.length > 0) {
                bestMovesToUse = prevBestMoves[0];
              }
            }

            if (bestMovesToUse && bestMovesToUse.uciMoves.length > 0) {
              // Get the parent node (the node before the current move)
              // We need to find the parent by going back in the tree
              let parentNode: TreeNode | undefined;
              if (i > 0) {
                // Find parent by traversing back from root
                let tempCur = state.root;
                let tempIdx = 0;
                while (tempCur !== undefined && tempIdx < i - 1) {
                  tempCur = tempCur.children[0];
                  tempIdx++;
                }
                parentNode = tempCur;
              }

              if (parentNode) {
                const [parentPos] = positionFromFen(parentNode.fen);
                if (parentPos) {
                  // Check if variation already exists (avoid duplicates)
                  // Exclude the main line (children[0]) from the check
                  const firstUciMove = bestMovesToUse.uciMoves[0];
                  const variationExists = parentNode.children.slice(1).some((child) => {
                    if (!child.move) return false;
                    const childUci = makeUci(child.move);
                    return childUci === firstUciMove;
                  });

                  if (!variationExists) {
                    let variationNode: TreeNode | undefined;
                    const currentPos = parentPos.clone();
                    let currentHalfMoves = parentNode.halfMoves;

                    // Create variation nodes from engine's best moves (limit to 5 moves)
                    for (let moveIdx = 0; moveIdx < bestMovesToUse.uciMoves.length && moveIdx < 5; moveIdx++) {
                      const uciMove = bestMovesToUse.uciMoves[moveIdx];
                      const move = parseUci(uciMove);
                      if (!move) break;

                      const san = makeSan(currentPos, move);
                      currentPos.play(move);
                      currentHalfMoves++;

                      const newNode = createNode({
                        fen: makeFen(currentPos.toSetup()),
                        move,
                        san,
                        halfMoves: currentHalfMoves,
                      });

                      if (!variationNode) {
                        // First move of variation - add to parent node's children (as variation, not main line)
                        parentNode.children.push(newNode);
                        variationNode = newNode;
                      } else {
                        // Subsequent moves - add to previous variation node
                        variationNode.children.push(newNode);
                        variationNode = newNode;
                      }

                      // Stop if position is game over
                      if (currentPos.isEnd()) break;
                    }
                  }
                }
              }
            }
          }
        }
        // Increment analysisIdx only after processing this position
        i++;
      } else {
        // Position is end of game, but still increment to stay in sync
        i++;
      }
    } else {
      // Position is end of game or no analysis data, but still increment to stay in sync
      if (i < analysis.length) {
        i++;
      }
    }
    // Move to next node in main line
    // Always advance to next node, even if we don't have analysis data for it
    // This ensures we don't cut off the PGN
    cur = cur.children[0];
  }
}
