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
  IconArticle,
  IconArticleOff,
  IconChevronDown,
  IconChevronRight,
  IconEye,
  IconEyeOff,
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
import CompleteMoveCell from "@/components/CompleteMoveCell";
import * as styles from "@/components/GameNotation.css";
import * as moveStyles from "@/components/MoveCell.css";
import OpeningName from "@/components/OpeningName";
import { TreeStateContext } from "@/components/TreeStateContext";
import { currentInvisibleAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import type { TreeNode } from "@/utils/treeReducer";

const variationRefs = {
  variants: React.createRef<HTMLSpanElement>(),
};

function hasMultipleChildrenInChain(node: TreeNode): boolean {
  if (!node.children) return false;
  if (node.children.length > 1) return true;
  if (node.children.length === 1) {
    return hasMultipleChildrenInChain(node.children[0]);
  }
  return false;
}

function VariantsNotation({ topBar, editingMode }: { topBar?: boolean; editingMode?: boolean }) {
  const store = useContext(TreeStateContext);
  if (!store) {
    throw new Error("VariantsNotation must be used within a TreeStateProvider");
  }

  const root = useStore(store, (s) => s.root);
  const currentFen = useStore(store, (s) => s.currentNode().fen);
  const headers = useStore(store, (s) => s.headers);
  const position = useStore(store, (s) => s.position);

  const viewport = useRef<HTMLDivElement>(null);
  const [invisibleValue, setInvisible] = useAtom(currentInvisibleAtom);
  const [showComments, toggleComments] = useToggle([true, false]);
  const invisible = topBar && invisibleValue;
  const { colorScheme } = useMantineColorScheme();
  const osColorScheme = useColorScheme();
  const keyMap = useAtomValue(keyMapAtom);
  const { t } = useTranslation();
  const theme = useMantineTheme();

  useHotkeys([[keyMap.TOGGLE_BLUR.keys, () => setInvisible((prev: boolean) => !prev)]]);

  useEffect(() => {
    if (viewport.current && variationRefs.variants.current) {
      viewport.current.scrollTo({
        top: variationRefs.variants.current.offsetTop - 65,
        behavior: "smooth",
      });
    }
  }, [currentFen]);

  // Collect all variations from a tree node (all children except the first one)
  // This function traverses the main line and collects all variations that branch off
  function collectAllVariations(
    node: TreeNode,
    currentPath: number[],
  ): Array<{ variation: TreeNode; path: number[]; parentHalfMoves: number }> {
    const variations: Array<{ variation: TreeNode; path: number[]; parentHalfMoves: number }> = [];

    // If this node has multiple children, add the variations (all except the first one)
    if (node.children.length > 1) {
      node.children.slice(1).forEach((variation, index) => {
        variations.push({
          variation,
          path: [...currentPath, index + 1],
          parentHalfMoves: node.halfMoves,
        });
      });
    }

    // Recursively collect variations from the main line (first child)
    if (node.children.length > 0) {
      const mainLineVariations = collectAllVariations(node.children[0], [...currentPath, 0]);
      variations.push(...mainLineVariations);
    }

    return variations;
  }

  // Render a complete variation line (continuation of a variation)
  // This renders the main line continuation and shows variations after each move
  function RenderVariationLine({
    tree,
    path,
    depth = 0,
    first = false,
    targetRef,
    showVariationsAfter = true,
    indentSize = 0,
  }: {
    tree: TreeNode;
    path: number[];
    depth?: number;
    first?: boolean;
    targetRef: React.RefObject<HTMLSpanElement>;
    showVariationsAfter?: boolean;
    indentSize?: number;
  }) {
    // If this node has a move (san), render it
    if (tree.san) {
      const currentPath = path;
      const variations = tree.children;
      const subVariations = variations && variations.length > 1 ? variations.slice(1) : [];

      return (
        <>
          <CompleteMoveCell
            // @ts-expect-error - ref type compatibility
            targetRef={depth === 0 && path.length === 0 ? targetRef : variationRefs.variants}
            annotations={tree.annotations}
            comment={tree.comment}
            halfMoves={tree.halfMoves}
            move={tree.san}
            fen={tree.fen}
            movePath={currentPath}
            showComments={showComments}
            isStart={equal(currentPath, headers.start)}
            first={first}
          />
          {/* If this node has multiple children, all should be shown as variations (no main line) */}
          {variations && variations.length > 1 ? (
            // Multiple children: show all as variations
            <>
              {variations.map((childVariation, index) => (
                <VariationBranch
                  key={childVariation.fen}
                  variation={childVariation}
                  path={[...path, index]}
                  depth={depth + 1}
                  start={headers.start}
                  targetRef={targetRef}
                  parentHalfMoves={tree.halfMoves}
                  isRootLevel={false}
                />
              ))}
            </>
          ) : variations && variations.length === 1 ? (
            // Single child: continue the line
            <RenderVariationLine
              tree={variations[0]}
              path={[...path, 0]}
              depth={depth + 1}
              targetRef={targetRef}
              showVariationsAfter={showVariationsAfter}
              indentSize={indentSize}
            />
          ) : null}
        </>
      );
    }

    // If no move but has children, render the first child
    const variations = tree.children;
    if (!variations?.length) return null;

    const newPath = [...path, 0];
    const subVariations = variations.length > 1 ? variations.slice(1) : [];

    return (
      <>
        <CompleteMoveCell
          // @ts-expect-error - ref type compatibility
          targetRef={depth === 0 && path.length === 0 ? targetRef : variationRefs.variants}
          annotations={variations[0].annotations}
          comment={variations[0].comment}
          halfMoves={variations[0].halfMoves}
          move={variations[0].san}
          fen={variations[0].fen}
          movePath={newPath}
          showComments={showComments}
          isStart={equal(newPath, headers.start)}
          first={first}
        />
        {/* If this node has multiple children, all should be shown as variations (no main line) */}
        {variations.length > 1 ? (
          // Multiple children: show all as variations
          <>
            {variations.map((childVariation, index) => (
              <VariationBranch
                key={childVariation.fen}
                variation={childVariation}
                path={[...path, index]}
                depth={depth + 1}
                start={headers.start}
                targetRef={targetRef}
                parentHalfMoves={root.halfMoves}
                isRootLevel={false}
              />
            ))}
          </>
        ) : (
          // Single child: continue the line
          <RenderVariationLine
            tree={variations[0]}
            path={newPath}
            depth={depth + 1}
            targetRef={targetRef}
            showVariationsAfter={showVariationsAfter}
            indentSize={indentSize}
          />
        )}
      </>
    );
  }

  // Render a variation branch in PGN format with parentheses and indentation
  // Each move is rendered as an interactive CompleteMoveCell
  // This function handles both root-level variations and nested variations
  function VariationBranch({
    variation,
    path,
    depth,
    start,
    targetRef,
    parentHalfMoves,
    isRootLevel = false,
  }: {
    variation: TreeNode;
    path: number[];
    depth: number;
    start?: number[];
    targetRef: React.RefObject<HTMLSpanElement>;
    parentHalfMoves?: number;
    isRootLevel?: boolean;
  }) {
    // Don't render if variation has no move and no children
    if (!variation.san && !variation.children?.length) return null;

    const firstMoveHalfMoves = variation.halfMoves;
    const moveNumber = Math.floor((firstMoveHalfMoves - 1) / 2) + 1;
    const isBlackMove = (firstMoveHalfMoves - 1) % 2 === 1;

    // Render the first move of the variation
    const firstMovePath = path;
    const firstMoveSan = variation.san;

    // Get sub-variations from this variation (all children except the first one)
    const subVariations = variation.children.length > 1 ? variation.children.slice(1) : [];

    // Calculate indentation based on depth (each level adds 0.75rem for subtle code-like indentation)
    const indentSize = depth * 0.75;
    const marginLeft = `${indentSize}rem`;

    // Render the variation line with its continuation and sub-variations
    const renderVariationContent = () => (
      <>
        {/* Render the first move */}
        {isBlackMove && (
          <Text component="span" c="dimmed" style={{ marginRight: "0.25rem" }}>
            {moveNumber}...
          </Text>
        )}
        <CompleteMoveCell
          // @ts-expect-error - ref type compatibility
          targetRef={depth === 0 && path.length === 0 ? targetRef : variationRefs.variants}
          annotations={variation.annotations}
          comment={variation.comment}
          halfMoves={variation.halfMoves}
          move={firstMoveSan}
          fen={variation.fen}
          movePath={firstMovePath}
          showComments={showComments}
          isStart={equal(firstMovePath, start)}
          first={false}
        />
        {/* If this variation has multiple children, all should be shown as variations (no main line) */}
        {variation.children.length > 1 ? (
          // Multiple children: show all as variations
          <>
            {variation.children.map((childVariation, index) => (
              <VariationBranch
                key={childVariation.fen}
                variation={childVariation}
                path={[...path, index]}
                depth={depth + 1}
                start={start}
                targetRef={targetRef}
                parentHalfMoves={variation.halfMoves}
                isRootLevel={false}
              />
            ))}
          </>
        ) : variation.children.length === 1 ? (
          // Single child: continue the line, but check if it has branches
          <RenderVariationLine
            tree={variation.children[0]}
            path={[...path, 0]}
            depth={depth + 1}
            targetRef={targetRef}
            showVariationsAfter={true}
            indentSize={indentSize}
          />
        ) : null}
      </>
    );

    // ALL variations should be wrapped in parentheses, including root level ones
    // This ensures no "main line" is shown - everything is a variation
    // Use block display for proper code-like indentation
    return (
      <Box
        style={{
          marginLeft,
          marginTop: "0.125rem",
          marginBottom: "0.125rem",
          display: "block",
          lineHeight: "1.5",
        }}
      >
        <Text component="span" c="dimmed" style={{ marginRight: "0.25rem" }}>
          (
        </Text>
        <Box component="span" style={{ display: "inline" }}>
          {renderVariationContent()}
        </Box>
        <Text component="span" c="dimmed" style={{ marginLeft: "0.25rem" }}>
          )
        </Text>
      </Box>
    );
  }

  return (
    <Paper withBorder p="md" flex={1} style={{ position: "relative", overflow: "hidden" }}>
      <Stack h="100%" gap={0}>
        {topBar && (
          <NotationHeader
            showComments={showComments}
            toggleComments={toggleComments}
            invisible={invisible ?? false}
            setInvisible={setInvisible}
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
              {root.children.length === 0 ? (
                <Text c="dimmed" size="sm">
                  {t("features.gameNotation.noMoves")}
                </Text>
              ) : (
                <Box>
                  {root.children.length > 0 && (
                    <>
                      {/* Render all root children as variations (no main line, all are equal) */}
                      {/* All root variations should be shown with parentheses - no main line */}
                      {root.children.map((variation, index) => (
                        <VariationBranch
                          key={`root-variation-${index}-${variation.fen}`}
                          variation={variation}
                          path={[index]}
                          depth={0}
                          start={headers.start}
                          // @ts-expect-error - ref type compatibility
                          targetRef={variationRefs.variants}
                          parentHalfMoves={root.halfMoves}
                          isRootLevel={false}
                        />
                      ))}
                    </>
                  )}
                </Box>
              )}
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
  invisible,
  setInvisible,
}: {
  showComments: boolean;
  toggleComments: () => void;
  invisible: boolean;
  setInvisible: (value: boolean | ((prev: boolean) => boolean)) => void;
}) {
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
        </Group>
      </Group>
      <Divider />
    </Stack>
  );
}

export default VariantsNotation;
