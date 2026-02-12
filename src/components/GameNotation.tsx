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
  IconListTree,
  IconPoint,
  IconPointFilled,
} from "@tabler/icons-react";
import { INITIAL_FEN } from "chessops/fen";
import equal from "fast-deep-equal";
import { useAtom, useAtomValue } from "jotai";
import React, { useContext, useEffect, useRef, useState } from "react";
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

type VariationState = "mainline" | "variations" | "repertoire";

const variationRefs = {
  mainline: React.createRef<HTMLSpanElement>(),
  variations: React.createRef<HTMLSpanElement>(),
  repertoire: React.createRef<HTMLSpanElement>(),
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
    ...["mainline", "variations", "repertoire"].filter((v) => v !== initialVariationState),
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
                  : t("features.gameNotation.mainLine")
            }
          >
            <ActionIcon onClick={toggleVariationState}>
              {variationState === "variations" ? (
                <IconArrowsSplit size="1rem" />
              ) : variationState === "repertoire" ? (
                <IconListTree size="1rem" />
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

  const currentPath = childInPath ? path.slice(0, -1) : [...path];
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
              onMouseLeave={(event) => {
                setChevronClicked(false);
                event.currentTarget.style.opacity = "0";
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
              onMouseLeave={(event) => {
                setChevronClicked(false);
                event.currentTarget.style.opacity = "0";
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

export default GameNotation;
