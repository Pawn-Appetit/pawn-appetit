import {
  ActionIcon,
  Box,
  Divider,
  Group,
  Overlay,
  Paper,
  rgba,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useColorScheme, useHotkeys, useToggle } from "@mantine/hooks";
import {
  IconArrowRight,
  IconArrowsSplit,
  IconArticle,
  IconArticleOff,
  IconChevronDown,
  IconChevronRight,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconListTree,
  IconPoint,
  IconPointFilled,
} from "@tabler/icons-react";
import { INITIAL_FEN } from "chessops/fen";
import equal from "fast-deep-equal";
import { useAtom, useAtomValue } from "jotai";
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { Comment } from "@/components/Comment";
import { TreeStateContext } from "@/components/TreeStateContext";
import { currentInvisibleAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import type { TreeNode } from "@/utils/treeReducer";
import CompleteMoveCell from "./CompleteMoveCell";
import * as styles from "./GameNotation.css";
import * as moveStyles from "./MoveCell.css";
import OpeningName from "./OpeningName";

type VariationState = "mainline" | "variations" | "repertoire" | "report";

const variationRefs = {
  mainline: React.createRef<HTMLSpanElement>(),
  variations: React.createRef<HTMLSpanElement>(),
  repertoire: React.createRef<HTMLSpanElement>(),
  report: React.createRef<HTMLSpanElement>(),
};

function isOnNextDivergenceFromMainline(node: TreeNode, remainingPath: number[]): boolean {
  if (remainingPath.length === 0) return false;
  if (!node.children) return false;
  if (node.children.length > 1) {
    if (remainingPath[0] > node.children.length) return false;
    return remainingPath[0] !== 0;
  }
  const nextNode = node.children[remainingPath[0]];
  if (!nextNode) return false;
  return isOnNextDivergenceFromMainline(nextNode, remainingPath.slice(1));
}

function hasMultipleChildrenInChain(node: TreeNode): boolean {
  if (!node.children) return false;
  if (node.children.length > 1) return true;
  if (node.children.length === 1) {
    return hasMultipleChildrenInChain(node.children[0]);
  }
  return false;
}

function hasMultipleChildrenUntilPosition(node: TreeNode, remainingPath: number[]): boolean {
  if (remainingPath.length === 0) return false;
  if (!node.children) return false;
  if (node.children.length > 1) return true;
  const nextNode = node.children[remainingPath[0]];
  if (!nextNode) return false;
  return hasMultipleChildrenUntilPosition(nextNode, remainingPath.slice(1));
}

/**
 * ------------------------------------------------------------------
 * Report helpers (pairs + variations like ShowVariations)
 * ------------------------------------------------------------------
 */

type MoveItem = { node: TreeNode; path: number[] };
type ReportRow = {
  key: string;
  white?: MoveItem;
  black?: MoveItem;
  rowStarter?: MoveItem; // first move in this row (white if present, else black)
};

function isPositionInAltChild(position: number[], parentPath: number[]) {
  if (position.length <= parentPath.length) return false;
  for (let i = 0; i < parentPath.length; i++) {
    if (position[i] !== parentPath[i]) return false;
  }
  return position[parentPath.length] > 0;
}

function buildMainlineItems(tree: TreeNode, path: number[]): MoveItem[] {
  const items: MoveItem[] = [];

  let cur: TreeNode | undefined = tree;
  let curPath = [...path];

  // If this is a root-like node (no san), jump into its mainline child 0.
  if (!cur.san) {
    if (!cur.children?.length) return items;
    cur = cur.children[0];
    curPath = [...curPath, 0];
  }

  while (cur) {
    if (cur.san) items.push({ node: cur, path: curPath });
    if (!cur.children?.length) break;
    cur = cur.children[0];
    curPath = [...curPath, 0];
  }

  return items;
}

function buildReportRows(items: MoveItem[]): ReportRow[] {
  const rows: ReportRow[] = [];
  let i = 0;

  while (i < items.length) {
    const a = items[i];
    if (!a) break;

    const aIsWhite = a.node.halfMoves % 2 === 1;

    if (aIsWhite) {
      const white = a;
      const next = items[i + 1];
      const nextIsBlackSameMove =
        next &&
        next.node.halfMoves % 2 === 0 &&
        Math.ceil(next.node.halfMoves / 2) === Math.ceil(white.node.halfMoves / 2);

      const black = nextIsBlackSameMove ? next : undefined;

      rows.push({
        key: white.node.fen,
        white,
        black,
        rowStarter: white,
      });

      i += black ? 2 : 1;
    } else {
      // Row starts with black (typical for variations starting at black)
      rows.push({
        key: a.node.fen,
        white: undefined,
        black: a,
        rowStarter: a,
      });
      i += 1;
    }
  }

  return rows;
}

function GameNotation({
  topBar,
  initialVariationState = "mainline",
}: {
  topBar?: boolean;
  initialVariationState?: VariationState;
}) {
  const store = useContext(TreeStateContext);
  if (!store) {
    throw new Error("GameNotation must be used within a TreeStateProvider");
  }

  const root = useStore(store, (s) => s.root);
  const currentFen = useStore(store, (s) => s.currentNode().fen);
  const headers = useStore(store, (s) => s.headers);

  const viewport = useRef<HTMLDivElement>(null);

  const [invisibleValue, setInvisible] = useAtom(currentInvisibleAtom);
  const [variationState, toggleVariationState] = useToggle([
    initialVariationState,
    ...["mainline", "variations", "repertoire", "report"].filter((v) => v !== initialVariationState),
  ]) as [VariationState, () => void];
  const [showComments, toggleComments] = useToggle([true, false]);

  const invisible = topBar && invisibleValue;
  const { colorScheme } = useMantineColorScheme();
  const osColorScheme = useColorScheme();
  const keyMap = useAtomValue(keyMapAtom);
  const { t } = useTranslation();

  useHotkeys([[keyMap.TOGGLE_BLUR.keys, () => setInvisible((prev: boolean) => !prev)]]);

  useEffect(() => {
    if (viewport.current) {
      if (currentFen === INITIAL_FEN) {
        viewport.current.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const currentRef = variationRefs[variationState];
        if (currentRef?.current) {
          viewport.current.scrollTo({
            top: currentRef.current.offsetTop - 65,
            behavior: "smooth",
          });
        }
      }
    }
  }, [currentFen, variationState]);

  return (
    <Paper withBorder p="md" flex={1} style={{ position: "relative", overflow: "hidden" }}>
      <Stack h="100%" gap={0}>
        {topBar && (
          <NotationHeader
            showComments={showComments}
            toggleComments={toggleComments}
            variationState={variationState}
            toggleVariationState={toggleVariationState}
          />
        )}
        <ScrollArea flex={1} offsetScrollbars viewportRef={viewport}>
          <Stack pt="md">
            <Box>
              {invisible && (
                <Overlay
                  backgroundOpacity={0.6}
                  color={
                    colorScheme === "dark" || (osColorScheme === "dark" && colorScheme === "auto")
                      ? "#1a1b1e"
                      : undefined
                  }
                  blur={8}
                  zIndex={2}
                />
              )}
              {showComments && root.comment && <Comment comment={root.comment} />}
              <Box
                style={{
                  display: variationState === "mainline" ? "block" : "none",
                }}
              >
                <RenderMainline
                  tree={root}
                  depth={0}
                  path={[]}
                  start={headers.start}
                  first={true}
                  showComments={showComments}
                  // @ts-expect-error
                  targetRef={variationRefs.mainline}
                  toggleVariationState={toggleVariationState}
                />
              </Box>
              <Box
                style={{
                  display: variationState === "variations" ? "block" : "none",
                }}
              >
                <RenderVariations
                  tree={root}
                  depth={0}
                  path={[]}
                  start={headers.start}
                  first={true}
                  showComments={showComments}
                  renderMoves={false}
                  nextLevelExpanded={true}
                  // @ts-expect-error
                  targetRef={variationRefs.variations}
                  variationState={variationState}
                  childInPath={false}
                />
              </Box>
              <Box
                style={{
                  display: variationState === "repertoire" ? "block" : "none",
                }}
              >
                <RenderRepertoire
                  tree={root}
                  depth={0}
                  path={[]}
                  start={headers.start}
                  showComments={showComments}
                  nextLevelExpanded={true}
                  // @ts-expect-error
                  targetRef={variationRefs.repertoire}
                  variationState={variationState}
                />
              </Box>
              <Box
                style={{
                  display: variationState === "report" ? "block" : "none",
                }}
              >
                <RenderReport
                  tree={root}
                  depth={0}
                  path={[]}
                  start={headers.start}
                  showComments={showComments}
                  // @ts-expect-error
                  targetRef={variationRefs.report}
                  variationState={variationState}
                />
              </Box>
            </Box>
            {headers.result && headers.result !== "*" && (
              <Text ta="center">
                {headers.result}
                <br />
                <Text span fs="italic">
                  {headers.result === "1/2-1/2"
                    ? t("chess.outcome.draw")
                    : headers.result === "1-0"
                      ? t("chess.outcome.whiteWins")
                      : t("chess.outcome.blackWins")}
                </Text>
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    </Paper>
  );
}

function NotationHeader({
  showComments,
  toggleComments,
  variationState,
  toggleVariationState,
}: {
  showComments: boolean;
  toggleComments: () => void;
  variationState: VariationState;
  toggleVariationState: () => void;
}) {
  const [invisible, setInvisible] = useAtom(currentInvisibleAtom);
  const { t } = useTranslation();

  return (
    <Stack>
      <Group justify="space-between">
        <OpeningName />
        <Group gap="sm">
          <Tooltip label={invisible ? t("features.gameNotation.showMoves") : t("features.gameNotation.hideMoves")}>
            <ActionIcon onClick={() => setInvisible((prev: boolean) => !prev)}>
              {invisible ? <IconEyeOff size="1rem" /> : <IconEye size="1rem" />}
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={showComments ? t("features.gameNotation.hideComments") : t("features.gameNotation.showComments")}
          >
            <ActionIcon onClick={toggleComments}>
              {showComments ? <IconArticle size="1rem" /> : <IconArticleOff size="1rem" />}
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={
              variationState === "variations"
                ? t("features.gameNotation.showVariations")
                : variationState === "repertoire"
                  ? t("features.gameNotation.repertoireView")
                  : variationState === "report"
                    ? t("features.gameNotation.reportView")
                    : t("features.gameNotation.mainLine")
            }
          >
            <ActionIcon onClick={toggleVariationState}>
              {variationState === "variations" ? (
                <IconArrowsSplit size="1rem" />
              ) : variationState === "repertoire" ? (
                <IconListTree size="1rem" />
              ) : variationState === "report" ? (
                <IconFileText size="1rem" />
              ) : (
                <IconArrowRight size="1rem" />
              )}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Divider />
    </Stack>
  );
}

function RenderMainline({
  tree,
  depth,
  path,
  start,
  first,
  showComments,
  targetRef,
  toggleVariationState,
}: {
  tree: TreeNode;
  depth: number;
  start?: number[];
  first?: boolean;
  showComments: boolean;
  targetRef: React.RefObject<HTMLSpanElement>;
  path: number[];
  toggleVariationState: () => void;
}) {
  const store = useContext(TreeStateContext);
  if (!store) {
    throw new Error("RenderMainline must be used within a TreeStateProvider");
  }
  const currentPosition = useStore(store, (s) => s.position);
  const theme = useMantineTheme();
  const { t } = useTranslation();

  const variations = tree.children;
  if (!variations?.length) return null;

  const newPath = [...path, 0];
  const isAtDivergence =
    currentPosition.length > path.length &&
    currentPosition.slice(0, path.length).every((v, i) => path[i] === v) &&
    currentPosition[path.length] > 0;

  return (
    <>
      {isAtDivergence && (
        <Box
          component="span"
          style={{
            display: "inline-block",
            fontSize: "80%",
          }}
        >
          <Tooltip label={t("features.gameNotation.showVariationsTooltip")}>
            <Box
              component="button"
              className={moveStyles.cell}
              onClick={toggleVariationState}
              style={{
                backgroundColor: rgba(theme.colors.gray[6], 0.2),
              }}
            >
              <IconArrowsSplit size="1rem" style={{ verticalAlign: "text-bottom" }} />
            </Box>
          </Tooltip>
        </Box>
      )}
      <CompleteMoveCell
        annotations={variations[0].annotations}
        comment={variations[0].comment}
        halfMoves={variations[0].halfMoves}
        move={variations[0].san}
        fen={variations[0].fen}
        movePath={newPath}
        showComments={showComments}
        isStart={equal(newPath, start)}
        first={first}
        targetRef={targetRef}
      />
      <RenderMainline
        tree={variations[0]}
        depth={depth}
        start={start}
        showComments={showComments}
        targetRef={targetRef}
        path={newPath}
        toggleVariationState={toggleVariationState}
      />
    </>
  );
}

function RenderVariations({
  tree,
  depth,
  path,
  start,
  first,
  showComments,
  renderMoves,
  nextLevelExpanded,
  childInPath,
  targetRef,
  variationState,
}: {
  tree: TreeNode;
  depth: number;
  path: number[];
  start?: number[];
  first?: boolean;
  showComments: boolean;
  renderMoves: boolean;
  nextLevelExpanded: boolean;
  childInPath: boolean;
  targetRef: React.RefObject<HTMLSpanElement>;
  variationState: VariationState;
}) {
  if (!renderMoves) {
    const variationCells = [];
    let currentNode = tree;
    let currentPath = [...path];
    let parentNode = currentNode;

    if (!currentNode.children?.length) return null;

    variationCells.push(
      <VariationCell
        key={currentNode.fen}
        variation={currentNode}
        path={currentPath}
        variationState={variationState}
        targetRef={targetRef}
        start={start}
        showComments={showComments}
        depth={depth + 1}
        startsMainline={true}
        childInPath={childInPath}
        nextLevelExpanded={nextLevelExpanded}
      />,
    );

    let pathIncludesChild = childInPath;
    while (currentNode.children.length > 0) {
      parentNode = currentNode;
      currentNode = currentNode.children[0];
      if (!pathIncludesChild) {
        currentPath = [...currentPath, 0];
      } else {
        pathIncludesChild = false;
      }

      if (parentNode.children.length > 1 && currentNode.children.length > 0) {
        variationCells.push(
          <VariationCell
            key={currentNode.fen}
            variation={currentNode}
            path={currentPath}
            variationState={variationState}
            targetRef={targetRef}
            start={start}
            showComments={showComments}
            depth={depth + 1}
            startsMainline={false}
            childInPath={false}
            nextLevelExpanded={nextLevelExpanded}
          />,
        );
      }
    }

    return <>{variationCells}</>;
  }

  const variations = tree.children;
  if (!variations?.length) return null;

  const newMainlinePath = childInPath ? [...path] : [...path, 0];

  if (variations.length === 1) {
    return (
      <>
        <CompleteMoveCell
          targetRef={targetRef}
          annotations={variations[0].annotations}
          comment={variations[0].comment}
          halfMoves={variations[0].halfMoves}
          move={variations[0].san}
          fen={variations[0].fen}
          movePath={newMainlinePath}
          showComments={showComments}
          isStart={equal(newMainlinePath, start)}
          first={first}
        />
        <RenderVariations
          tree={variations[0]}
          depth={depth}
          start={start}
          showComments={showComments}
          targetRef={targetRef}
          path={newMainlinePath}
          variationState={variationState}
          renderMoves={true}
          childInPath={false}
          nextLevelExpanded={nextLevelExpanded}
        />
      </>
    );
  }

  return (
    <>
      <CompleteMoveCell
        targetRef={targetRef}
        annotations={variations[0].annotations}
        comment={variations[0].comment}
        halfMoves={variations[0].halfMoves}
        move={variations[0].san}
        fen={variations[0].fen}
        movePath={newMainlinePath}
        showComments={showComments}
        isStart={equal(newMainlinePath, start)}
        first={first}
      />
      {variations.slice(1).map((variation, index) => (
        <RenderVariations
          key={variation.fen}
          tree={{ ...variation, children: [variation] }}
          depth={depth}
          start={start}
          showComments={showComments}
          targetRef={targetRef}
          path={[...newMainlinePath.slice(0, -1), index + 1]}
          variationState={variationState}
          renderMoves={false}
          childInPath={true}
          nextLevelExpanded={nextLevelExpanded}
        />
      ))}
    </>
  );
}

function VariationCell({
  variation,
  path,
  depth,
  start,
  showComments,
  startsMainline,
  childInPath,
  nextLevelExpanded,
  targetRef,
  variationState,
}: {
  variation: TreeNode;
  path: number[];
  variationState: VariationState;
  targetRef: React.RefObject<HTMLSpanElement>;
  start?: number[];
  showComments: boolean;
  depth: number;
  startsMainline: boolean;
  childInPath: boolean;
  nextLevelExpanded: boolean;
}) {
  const store = useContext(TreeStateContext);
  if (!store) {
    throw new Error("VariationCell must be used within a TreeStateProvider");
  }
  const positionPath = useStore(store, (s) => s.position);

  const currentPath = childInPath ? [...path.slice(0, -1)] : [...path];
  const childIndex = childInPath ? path[path.length - 1] : 0;
  const remainingPositionPath = positionPath.slice(currentPath.length);

  const isOnPath = currentPath.every((value, i) => positionPath[i] === value);
  const isPositionDeeper = positionPath.length > currentPath.length;
  const isDiverging =
    remainingPositionPath.length > 0 &&
    ((remainingPositionPath[0] !== 0 && childIndex === 0) ||
      (remainingPositionPath[0] === childIndex &&
        isOnNextDivergenceFromMainline(variation, [0, ...remainingPositionPath.slice(1)])));
  const isInCurrentPath = isOnPath && isPositionDeeper && isDiverging;

  const [expanded, setExpanded] = useState(() => isInCurrentPath);
  const [chevronClicked, setChevronClicked] = useState(false);

  useEffect(() => {
    if (!expanded && variationState === "variations" && isInCurrentPath) {
      setExpanded(true);
    }
  }, [variationState, expanded, isInCurrentPath]);

  if (depth > 1 && !nextLevelExpanded) {
    return null;
  }

  return (
    <Box className={depth === 1 ? undefined : styles.variationBorder}>
      {hasMultipleChildrenInChain(variation) ? (
        expanded ? (
          isInCurrentPath ? (
            <span style={{ width: "0.6rem", display: "inline-block" }} />
          ) : (
            <IconChevronDown
              size="0.6rem"
              style={{
                opacity: chevronClicked ? 1 : 0,
                transition: "opacity 0.4s",
                cursor: "pointer",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={() => {
                setChevronClicked(false);
              }}
              onClick={() => setExpanded(false)}
            />
          )
        ) : (
          <IconChevronRight
            size="0.6rem"
            style={{
              cursor: "pointer",
            }}
            onClick={() => {
              setChevronClicked(true);
              setExpanded(true);
            }}
          />
        )
      ) : (
        <span style={{ width: "0.6rem", display: "inline-block" }} />
      )}
      {startsMainline ? <IconPointFilled size="0.6rem" /> : <IconPoint size="0.6rem" />}
      <RenderVariations
        tree={variation}
        depth={depth}
        path={path}
        start={start}
        showComments={showComments}
        first={true}
        renderMoves={true}
        nextLevelExpanded={expanded}
        targetRef={targetRef}
        variationState={variationState}
        childInPath={childInPath}
      />
    </Box>
  );
}

function RenderRepertoire({
  tree,
  depth,
  path,
  start,
  first,
  showComments,
  nextLevelExpanded,
  targetRef,
  variationState,
}: {
  tree: TreeNode;
  depth: number;
  start?: number[];
  path: number[];
  first?: boolean;
  showComments: boolean;
  nextLevelExpanded?: boolean;
  targetRef: React.RefObject<HTMLSpanElement>;
  variationState: VariationState;
}) {
  const variations = tree.children;
  if (!variations?.length) return null;

  if (variations.length === 1 && depth > 0) {
    const newPath = [...path, 0];
    return (
      <>
        <CompleteMoveCell
          targetRef={targetRef}
          annotations={variations[0].annotations}
          comment={variations[0].comment}
          halfMoves={variations[0].halfMoves}
          move={variations[0].san}
          fen={variations[0].fen}
          movePath={newPath}
          showComments={showComments}
          isStart={equal(newPath, start)}
          first={first}
        />
        <RenderRepertoire
          targetRef={targetRef}
          tree={variations[0]}
          depth={depth}
          start={start}
          showComments={showComments}
          path={newPath}
          variationState={variationState}
          nextLevelExpanded={nextLevelExpanded}
        />
      </>
    );
  }

  return (
    <>
      {variations.map((variation, index) => (
        <RepertoireCell
          key={variation.fen}
          variation={variation}
          path={[...path, index]}
          targetRef={targetRef}
          start={start}
          showComments={showComments}
          depth={depth + 1}
          variationState={variationState}
          nextLevelExpanded={nextLevelExpanded}
        />
      ))}
    </>
  );
}

function RepertoireCell({
  variation,
  path,
  depth,
  start,
  showComments,
  nextLevelExpanded,
  targetRef,
  variationState,
}: {
  variation: TreeNode;
  path: number[];
  variationState: VariationState;
  targetRef: React.RefObject<HTMLSpanElement>;
  start?: number[];
  showComments: boolean;
  depth: number;
  nextLevelExpanded?: boolean;
}) {
  const store = useContext(TreeStateContext);
  if (!store) {
    throw new Error("RepertoireCell must be used within a TreeStateProvider");
  }
  const position = useStore(store, (s) => s.position);

  const isOnPath = path.every((value, i) => position[i] === value);
  const isPositionDeeper = position.length > path.length;
  const remainingPath = position.slice(path.length);
  const isInCurrentPath = isPositionDeeper && isOnPath && hasMultipleChildrenUntilPosition(variation, remainingPath);

  const [expanded, setExpanded] = useState(() => isInCurrentPath);
  const [chevronClicked, setChevronClicked] = useState(false);

  useEffect(() => {
    if (!expanded && variationState === "repertoire" && isInCurrentPath) {
      setExpanded(true);
    }
  }, [variationState, expanded, isInCurrentPath]);

  if (depth > 1 && !nextLevelExpanded) {
    return null;
  }

  return (
    <Box className={depth === 1 ? undefined : styles.variationBorder}>
      {hasMultipleChildrenInChain(variation) ? (
        expanded ? (
          isInCurrentPath ? (
            <span style={{ width: "0.6rem", display: "inline-block" }} />
          ) : (
            <IconChevronDown
              size="0.6rem"
              style={{
                opacity: chevronClicked ? 1 : 0,
                transition: "opacity 0.4s",
                cursor: "pointer",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={() => {
                setChevronClicked(false);
              }}
              onClick={() => setExpanded(false)}
            />
          )
        ) : (
          <IconChevronRight
            size="0.6rem"
            style={{
              cursor: "pointer",
            }}
            onClick={() => {
              setChevronClicked(true);
              setExpanded(true);
            }}
          />
        )
      ) : (
        <span style={{ width: "0.6rem", display: "inline-block" }} />
      )}
      <IconPointFilled size="0.6rem" />
      <CompleteMoveCell
        annotations={variation.annotations}
        comment={variation.comment}
        halfMoves={variation.halfMoves}
        move={variation.san}
        fen={variation.fen}
        movePath={path}
        showComments={showComments}
        isStart={equal(path, start)}
        first={true}
        targetRef={targetRef}
      />
      <RenderRepertoire
        tree={variation}
        depth={depth}
        path={path}
        start={start}
        showComments={showComments}
        nextLevelExpanded={expanded}
        targetRef={targetRef}
        variationState={variationState}
      />
    </Box>
  );
}

/**
 * ------------------------------------------------------------------
 * REPORT VIEW (pairs like chess.com + nested variations like ShowVariations)
 * ------------------------------------------------------------------
 */

function RenderReport({
  tree,
  path,
  start,
  showComments,
  targetRef,
  variationState,
}: {
  tree: TreeNode;
  depth: number; // kept for signature compatibility (unused)
  path: number[];
  start?: number[];
  showComments: boolean;
  targetRef: React.RefObject<HTMLSpanElement>;
  variationState: VariationState;
}) {
  const store = useContext(TreeStateContext);
  if (!store) {
    throw new Error("RenderReport must be used within a TreeStateProvider");
  }

  // Root-level alternative first moves (children[1..]) — like ShowVariations
  const rootChildren = tree.children || [];
  const hasRootAlternatives = rootChildren.length > 1;

  return (
    <Stack gap="xs">
      {hasRootAlternatives && (
        <ReportRootAlternatives
          tree={tree}
          path={path}
          start={start}
          showComments={showComments}
          targetRef={targetRef}
          variationState={variationState}
        />
      )}

      {/* Mainline as rows (pairs). This also renders nested variations inline. */}
      <ReportBranch
        tree={tree}
        path={path}
        start={start}
        showComments={showComments}
        targetRef={targetRef}
        variationState={variationState}
        indentRem={0}
      />
    </Stack>
  );
}

function ReportRootAlternatives({
  tree,
  path,
  start,
  showComments,
  targetRef,
  variationState,
}: {
  tree: TreeNode;
  path: number[];
  start?: number[];
  showComments: boolean;
  targetRef: React.RefObject<HTMLSpanElement>;
  variationState: VariationState;
}) {
  const store = useContext(TreeStateContext);
  if (!store) throw new Error("ReportRootAlternatives must be used within a TreeStateProvider");
  const position = useStore(store, (s) => s.position);
  const { t } = useTranslation();

  const children = tree.children || [];
  if (children.length <= 1) return null;

  const isInAlt = isPositionInAltChild(position, path);
  const [expanded, setExpanded] = useState(() => isInAlt);

  useEffect(() => {
    if (!expanded && variationState === "report" && isInAlt) setExpanded(true);
  }, [expanded, variationState, isInAlt]);

  return (
    <Box>
      <Group gap="xs" align="center">
        <Tooltip label={t("features.gameNotation.showVariationsTooltip")}>
          <ActionIcon
            variant="subtle"
            size="xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? <IconChevronDown size="0.9rem" /> : <IconChevronRight size="0.9rem" />}
          </ActionIcon>
        </Tooltip>
        <Text size="sm" c="dimmed">
          {t("features.gameNotation.showVariations")}
        </Text>
      </Group>

      {expanded && (
        <Box mt="xs" style={{ marginLeft: "1.25rem" }}>
          {children.slice(1).map((child, idx) => {
            const childIndex = idx + 1; // actual index inside children
            return (
              <Box
                key={child.fen}
                style={{
                  display: "flex",
                  gap: "0.35rem",
                  alignItems: "flex-start",
                  marginBottom: "0.35rem",
                }}
              >
                <Box style={{ width: "0.8rem", paddingTop: "0.35rem" }}>
                  <IconPoint size="0.6rem" />
                </Box>
                <Box style={{ flex: 1 }}>
                  <ReportBranch
                    tree={child}
                    path={[...path, childIndex]}
                    start={start}
                    showComments={showComments}
                    targetRef={targetRef}
                    variationState={variationState}
                    indentRem={0}
                  />
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function ReportBranch({
  tree,
  path,
  start,
  showComments,
  targetRef,
  variationState,
  indentRem,
}: {
  tree: TreeNode;
  path: number[];
  start?: number[];
  showComments: boolean;
  targetRef: React.RefObject<HTMLSpanElement>;
  variationState: VariationState;
  indentRem: number;
}) {
  const items = useMemo(() => buildMainlineItems(tree, path), [tree, path]);
  const rows = useMemo(() => buildReportRows(items), [items]);

  if (rows.length === 0) return null;

  return (
    <Stack gap={2} style={{ marginLeft: indentRem ? `${indentRem}rem` : undefined }}>
      {rows.map((row) => (
        <ReportRowLine
          key={row.key}
          row={row}
          start={start}
          showComments={showComments}
          targetRef={targetRef}
          variationState={variationState}
        />
      ))}
    </Stack>
  );
}

function ReportRowLine({
  row,
  start,
  showComments,
  targetRef,
  variationState,
}: {
  row: ReportRow;
  start?: number[];
  showComments: boolean;
  targetRef: React.RefObject<HTMLSpanElement>;
  variationState: VariationState;
}) {
  const store = useContext(TreeStateContext);
  if (!store) throw new Error("ReportRowLine must be used within a TreeStateProvider");
  const position = useStore(store, (s) => s.position);

  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const { t } = useTranslation();

  const white = row.white;
  const black = row.black;

  const whiteHasVars = !!white?.node.children && white.node.children.length > 1;
  const blackHasVars = !!black?.node.children && black.node.children.length > 1;

  const whiteIsInAlt = white ? isPositionInAltChild(position, white.path) : false;
  const blackIsInAlt = black ? isPositionInAltChild(position, black.path) : false;

  const [whiteExpanded, setWhiteExpanded] = useState(() => (whiteHasVars ? whiteIsInAlt : false));
  const [blackExpanded, setBlackExpanded] = useState(() => (blackHasVars ? blackIsInAlt : false));

  useEffect(() => {
    if (!whiteExpanded && variationState === "report" && whiteIsInAlt) setWhiteExpanded(true);
  }, [whiteExpanded, variationState, whiteIsInAlt]);

  useEffect(() => {
    if (!blackExpanded && variationState === "report" && blackIsInAlt) setBlackExpanded(true);
  }, [blackExpanded, variationState, blackIsInAlt]);

  const moveNo =
    white?.node?.halfMoves != null
      ? Math.ceil(white.node.halfMoves / 2)
      : black?.node?.halfMoves != null
        ? Math.ceil(black.node.halfMoves / 2)
        : 0;

  const rowStartsWithBlack = !white && !!black;
  const moveLabel = rowStartsWithBlack ? `${moveNo}...` : `${moveNo}.`;

  const isActiveWhite = white ? equal(position, white.path) : false;
  const isActiveBlack = black ? equal(position, black.path) : false;
  const isActiveRow = isActiveWhite || isActiveBlack;

  const zebra = moveNo % 2 === 0;

  const baseBg = zebra
    ? rgba(theme.colors.gray[6], colorScheme === "dark" ? 0.08 : 0.06)
    : "transparent";

  const activeBg = rgba(theme.colors[theme.primaryColor][6], colorScheme === "dark" ? 0.22 : 0.14);

  return (
    <Box>
      {/* Row like chess.com: [moveNo] [white] [black] */}
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "4ch minmax(0, 1fr) minmax(0, 1fr)",
          columnGap: "0.9rem",
          alignItems: "center",
          paddingBlock: "0.25rem",
          paddingInline: "0.25rem",
          borderRadius: 8,
          background: isActiveRow ? activeBg : baseBg,
        }}
      >
        {/* Move number */}
        <Text
          size="sm"
          c="dimmed"
          style={{
            textAlign: "right",
            userSelect: "none",
            fontVariantNumeric: "tabular-nums",
            paddingRight: "0.25rem",
          }}
        >
          {moveNo > 0 ? moveLabel : ""}
        </Text>

        {/* White move */}
        <ReportMoveCell
          item={white}
          showComments={showComments}
          targetRef={targetRef}
          start={start}
          first={true}
          chevron={{
            has: whiteHasVars,
            expanded: whiteExpanded,
            onToggle: () => setWhiteExpanded((v) => !v),
            tooltip: t("features.gameNotation.showVariationsTooltip"),
          }}
        />

        {/* Black move */}
        <ReportMoveCell
          item={black}
          showComments={showComments}
          targetRef={targetRef}
          start={start}
          first={rowStartsWithBlack}
          chevron={{
            has: blackHasVars,
            expanded: blackExpanded,
            onToggle: () => setBlackExpanded((v) => !v),
            tooltip: t("features.gameNotation.showVariationsTooltip"),
          }}
        />
      </Box>

      {/* Comments: align under moves (skip moveNo col) */}
      {showComments && (white?.node.comment || black?.node.comment) && (
        <Box style={{ marginLeft: "4ch", paddingLeft: "0.9rem", marginTop: "0.15rem" }}>
          {white?.node.comment && <Comment comment={white.node.comment} />}
          {black?.node.comment && <Comment comment={black.node.comment} />}
        </Box>
      )}

      {/* Variations branching from WHITE */}
      {whiteHasVars && whiteExpanded && white && (
        <Box mt={6} style={{ marginLeft: "4ch", paddingLeft: "0.9rem" }}>
          {white.node.children!.slice(1).map((child, idx) => {
            const childIndex = idx + 1;
            return (
              <Box
                key={child.fen}
                style={{
                  display: "flex",
                  gap: "0.35rem",
                  alignItems: "flex-start",
                  marginBottom: "0.5rem",
                }}
              >
                <Box style={{ width: "0.9rem", paddingTop: "0.35rem" }}>
                  <IconPoint size="0.65rem" />
                </Box>
                <Box style={{ flex: 1 }}>
                  <ReportBranch
                    tree={child}
                    path={[...white.path, childIndex]}
                    start={start}
                    showComments={showComments}
                    targetRef={targetRef}
                    variationState={variationState}
                    indentRem={0}
                  />
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Variations branching from BLACK */}
      {blackHasVars && blackExpanded && black && (
        <Box mt={6} style={{ marginLeft: "4ch", paddingLeft: "0.9rem" }}>
          {black.node.children!.slice(1).map((child, idx) => {
            const childIndex = idx + 1;
            return (
              <Box
                key={child.fen}
                style={{
                  display: "flex",
                  gap: "0.35rem",
                  alignItems: "flex-start",
                  marginBottom: "0.5rem",
                }}
              >
                <Box style={{ width: "0.9rem", paddingTop: "0.35rem" }}>
                  <IconPointFilled size="0.65rem" />
                </Box>
                <Box style={{ flex: 1 }}>
                  <ReportBranch
                    tree={child}
                    path={[...black.path, childIndex]}
                    start={start}
                    showComments={showComments}
                    targetRef={targetRef}
                    variationState={variationState}
                    indentRem={0}
                  />
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function ReportMoveCell({
  item,
  showComments,
  targetRef,
  start,
  first,
  chevron,
}: {
  item?: MoveItem;
  start?: number[];
  showComments: boolean;
  targetRef: React.RefObject<HTMLSpanElement>;
  first: boolean;
  chevron: { has: boolean; expanded: boolean; onToggle: () => void; tooltip: string };
}) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();

  if (!item) return <Box />;

  return (
    <Box
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "0.35rem",
        minWidth: 0,
      }}
    >
      {/* Chevron area (fixed width) */}
      <Box style={{ width: "1.2rem", display: "flex", justifyContent: "center" }}>
        {chevron.has ? (
          <Tooltip label={chevron.tooltip}>
            <ActionIcon
              variant="subtle"
              size="xs"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                chevron.onToggle();
              }}
              style={{
                color: colorScheme === "dark" ? theme.colors.gray[2] : theme.colors.gray[7],
              }}
            >
              {chevron.expanded ? <IconChevronDown size="0.9rem" /> : <IconChevronRight size="0.9rem" />}
            </ActionIcon>
          </Tooltip>
        ) : (
          <span />
        )}
      </Box>

      {/* Move cell (tight, chess.com-ish) */}
      <Box style={{ minWidth: 0 }}>
        <CompleteMoveCell
          targetRef={targetRef}
          annotations={item.node.annotations}
          comment={item.node.comment}
          halfMoves={item.node.halfMoves}
          move={item.node.san}
          fen={item.node.fen}
          movePath={item.path}
          showComments={showComments}
          isStart={equal(item.path, start)}
          first={first}
        />
      </Box>
    </Box>
  );
}

export default GameNotation;
