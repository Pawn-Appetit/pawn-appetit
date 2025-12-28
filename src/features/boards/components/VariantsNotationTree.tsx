import { Box, Text } from "@mantine/core";
import equal from "fast-deep-equal";
import React, { memo } from "react";
import CompleteMoveCell from "@/components/CompleteMoveCell";
import type { TreeNode } from "@/utils/treeReducer";

type RenderVariationLineProps = {
  tree: TreeNode;
  path: number[];
  depth: number;
  first: boolean;
  showComments: boolean;
  start?: number[];
  targetRef: React.RefObject<HTMLSpanElement | null>;
};

type VariationBranchProps = {
  variation: TreeNode;
  path: number[];
  depth: number;
  showComments: boolean;
  start?: number[];
  targetRef: React.RefObject<HTMLSpanElement | null>;
};

function RenderVariationLineBase({ tree, path, depth, first, showComments, start, targetRef }: RenderVariationLineProps) {
  if (tree.san) {
    const variations = tree.children;
    return (
      <>
        <CompleteMoveCell
          targetRef={targetRef}
          annotations={tree.annotations}
          comment={tree.comment}
          halfMoves={tree.halfMoves}
          move={tree.san}
          fen={tree.fen}
          movePath={path}
          showComments={showComments}
          isStart={equal(path, start)}
          first={first}
          enableTranspositions={false}
        />
        {variations && variations.length > 1 ? (
          <>
            {variations.map((childVariation, index) => (
              <VariationBranch
                key={`${childVariation.fen}-${index}`}
                variation={childVariation}
                path={[...path, index]}
                depth={depth + 1}
                start={start}
                showComments={showComments}
                targetRef={targetRef}
              />
            ))}
          </>
        ) : variations && variations.length === 1 ? (
          <RenderVariationLine
            tree={variations[0]}
            path={[...path, 0]}
            depth={depth + 1}
            first={false}
            start={start}
            showComments={showComments}
            targetRef={targetRef}
          />
        ) : null}
      </>
    );
  }

  const variations = tree.children;
  if (!variations?.length) return null;

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
        enableTranspositions={false}
      />
      {variations.length > 1 ? (
        <>
          {variations.map((childVariation, index) => (
            <VariationBranch
              key={`${childVariation.fen}-${index}`}
              variation={childVariation}
              path={[...path, index]}
              depth={depth + 1}
              start={start}
              showComments={showComments}
              targetRef={targetRef}
            />
          ))}
        </>
      ) : (
        <RenderVariationLine
          tree={variations[0]}
          path={newPath}
          depth={depth + 1}
          first={false}
          start={start}
          showComments={showComments}
          targetRef={targetRef}
        />
      )}
    </>
  );
}

const RenderVariationLine = memo(RenderVariationLineBase, (prev, next) => {
  return (
    prev.tree === next.tree &&
    prev.depth === next.depth &&
    prev.first === next.first &&
    prev.showComments === next.showComments &&
    prev.targetRef === next.targetRef &&
    equal(prev.path, next.path) &&
    equal(prev.start, next.start)
  );
});

function VariationBranchBase({ variation, path, depth, showComments, start, targetRef }: VariationBranchProps) {
  if (!variation.san && !variation.children?.length) return null;

  const firstMoveHalfMoves = variation.halfMoves;
  const moveNumber = Math.floor((firstMoveHalfMoves - 1) / 2) + 1;
  const isBlackMove = (firstMoveHalfMoves - 1) % 2 === 1;
  const indentSize = depth * 0.75;
  const marginLeft = `${indentSize}rem`;

  const renderVariationContent = () => (
    <>
      {isBlackMove && (
        <Text component="span" c="dimmed" style={{ marginRight: "0.25rem" }}>
          {moveNumber}...
        </Text>
      )}
      <CompleteMoveCell
        targetRef={targetRef}
        annotations={variation.annotations}
        comment={variation.comment}
        halfMoves={variation.halfMoves}
        move={variation.san}
        fen={variation.fen}
        movePath={path}
        showComments={showComments}
        isStart={equal(path, start)}
        first={false}
        enableTranspositions={false}
      />
      {variation.children.length > 1 ? (
        <>
          {variation.children.map((childVariation, index) => (
            <VariationBranch
              key={`${childVariation.fen}-${index}`}
              variation={childVariation}
              path={[...path, index]}
              depth={depth + 1}
              start={start}
              showComments={showComments}
              targetRef={targetRef}
            />
          ))}
        </>
      ) : variation.children.length === 1 ? (
        <RenderVariationLine
          tree={variation.children[0]}
          path={[...path, 0]}
          depth={depth + 1}
          first={false}
          start={start}
          showComments={showComments}
          targetRef={targetRef}
        />
      ) : null}
    </>
  );

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

const VariationBranch = memo(VariationBranchBase, (prev, next) => {
  return (
    prev.variation === next.variation &&
    prev.depth === next.depth &&
    prev.showComments === next.showComments &&
    prev.targetRef === next.targetRef &&
    equal(prev.path, next.path) &&
    equal(prev.start, next.start)
  );
});

export function VariantsNotationTree({
  root,
  start,
  showComments,
  targetRef,
}: {
  root: TreeNode;
  start?: number[];
  showComments: boolean;
  targetRef: React.RefObject<HTMLSpanElement | null>;
}) {
  return (
    <>
      {root.children.map((variation, index) => (
        <VariationBranch
          key={`${variation.fen}-${index}`}
          variation={variation}
          path={[index]}
          depth={0}
          start={start}
          showComments={showComments}
          targetRef={targetRef}
        />
      ))}
    </>
  );
}
