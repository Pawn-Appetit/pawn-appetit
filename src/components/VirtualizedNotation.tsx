import { ActionIcon, Box, Overlay, ScrollArea, Text } from "@mantine/core";
import { useColorScheme } from "@mantine/hooks";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import equal from "fast-deep-equal";
import { type ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { Comment } from "@/components/Comment";
import { TreeStateContext } from "@/components/TreeStateContext";
import {
  filterCollapsedRows,
  findRowIndex,
  flattenForView,
  isMultilineComment,
  type NotationViewMode,
  type TableNotationRow,
} from "@/utils/notationFlatten";
import { getNodeAtPath } from "@/utils/treeReducer";
import CompleteMoveCell from "./CompleteMoveCell";
import ForkChooser from "./ForkChooser";
import * as styles from "./GameNotation.css";

const MAX_LINE_PLIES = 40;
const ESTIMATED_ROW_HEIGHT = 28;

type DisplayRow =
  | TableNotationRow
  | { type: "root-comment"; key: string; comment: string }
  | { type: "result"; key: string; result: string };

// Re-create the nested variation "swimlanes". Because rows are windowed (there is no wrapping
// container spanning a whole variation), each row paints its full set of ancestor depth guides;
// rows are vertically flush and the vertical padding lives inside the guides, so the left borders
// connect into continuous lanes across consecutive rows.
function Lanes({ depth, children }: { depth: number; children: ReactNode }) {
  let node = children;
  for (let d = 0; d < depth; d++) {
    node = <div className={styles.variationBorder}>{node}</div>;
  }
  return <>{node}</>;
}

function LineRow({
  row,
  showComments,
  collapsed,
  onToggle,
}: {
  row: Extract<TableNotationRow, { type: "line" }>;
  showComments: boolean;
  collapsed: Set<string>;
  onToggle: (branchHead: number[]) => void;
}) {
  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);
  const branchHead = row.branchHead;
  const isCollapsed = branchHead ? collapsed.has(branchHead.join(",")) : false;
  return (
    <Box px="sm">
      <Lanes depth={row.depth}>
        <Box pt={4}>
          {branchHead && (
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              aria-label={isCollapsed ? "Expand variation" : "Collapse variation"}
              onClick={() => onToggle(branchHead)}
              style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 4 }}
            >
              {isCollapsed ? <IconPlus size="0.6rem" /> : <IconMinus size="0.6rem" />}
            </ActionIcon>
          )}
          {!isCollapsed &&
            row.paths.map((path, i) => {
              const node = getNodeAtPath(root, path);
              return (
                <CompleteMoveCell
                  key={path.join(",")}
                  movePath={path}
                  halfMoves={node.halfMoves}
                  move={node.san}
                  fen={node.fen}
                  // multi-line comments render as their own row; only inline (single-line) ones stay on the move
                  comment={isMultilineComment(node.comment) ? "" : node.comment}
                  annotations={node.annotations}
                  showComments={showComments}
                  first={i === 0 && row.first}
                  isStart={equal(path, headers.start)}
                />
              );
            })}
        </Box>
      </Lanes>
    </Box>
  );
}

function NotationRowView({
  row,
  showComments,
  collapsed,
  onToggle,
}: {
  row: DisplayRow;
  showComments: boolean;
  collapsed: Set<string>;
  onToggle: (branchHead: number[]) => void;
}) {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);

  if (row.type === "root-comment") {
    return (
      <Box p="sm" fz="sm" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
        <Comment comment={row.comment} />
      </Box>
    );
  }
  if (row.type === "result") {
    return (
      <Text ta="center" py="md">
        {row.result}
        <br />
        <Text span fs="italic">
          {row.result === "1/2-1/2"
            ? t("chess.outcome.draw")
            : row.result === "1-0"
              ? t("chess.outcome.whiteWins")
              : t("chess.outcome.blackWins")}
        </Text>
      </Text>
    );
  }
  if (row.type === "comment") {
    return (
      <Box px="sm" fz="sm" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
        <Lanes depth={row.depth}>
          <Box pt={4}>
            <Comment comment={row.comment} />
          </Box>
        </Lanes>
      </Box>
    );
  }
  if (row.type === "line") {
    return (
      <LineRow row={row} showComments={showComments} collapsed={collapsed} onToggle={onToggle} />
    );
  }
  // pair row — not used in VirtualizedNotation (no table view in PA)
  const node = getNodeAtPath(root, row.whitePath ?? row.blackPath ?? []);
  const path = row.whitePath ?? row.blackPath ?? [];
  return (
    <Box px="sm">
      <CompleteMoveCell
        movePath={path}
        halfMoves={node.halfMoves}
        move={node.san}
        fen={node.fen}
        comment={node.comment}
        annotations={node.annotations}
        showComments={showComments}
      />
    </Box>
  );
}

function VirtualizedNotation({
  mode,
  showComments,
  invisible,
  setMode,
}: {
  mode: NotationViewMode;
  showComments: boolean;
  invisible?: boolean;
  setMode?: (mode: NotationViewMode) => void;
}) {
  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const position = useStore(store, (s) => s.position);
  const result = useStore(store, (s) => s.headers.result);
  const colorScheme = useColorScheme();

  // Collapsed variation branch points (path keys). Local state, default all-expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const onToggle = (branchHead: number[]) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const key = branchHead.join(",");
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const moveRows = flattenForView(root, { mode, showComments, maxLineLength: MAX_LINE_PLIES });
  const visibleMoveRows = filterCollapsedRows(moveRows, collapsed);

  // The root comment renders as a static block above the virtualized list (see the return), not as
  // row 0: it can be tall (e.g. an [%evp ...] array when "Extra Markups" is on), and a tall
  // dynamically-measured row at the top desynced the virtualizer's offsets and overlapped the moves.
  const rows: DisplayRow[] = [...visibleMoveRows];
  if (result && result !== "*") {
    rows.push({ type: "result", key: "result", result });
  }

  const parentRef = useRef<HTMLDivElement>(null);

  // Measure the static root-comment block so the virtualizer's scrollMargin accounts for the space
  // it occupies above the list — keeping scrollToIndex offsets correct.
  const rootCommentRef = useRef<HTMLDivElement>(null);
  const showRootComment = showComments && !!root.comment;
  const [rootCommentHeight, setRootCommentHeight] = useState(0);
  useLayoutEffect(() => {
    const el = rootCommentRef.current;
    if (!showRootComment || !el) {
      setRootCommentHeight(0);
      return;
    }
    const measure = () => setRootCommentHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showRootComment, root.comment]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 16,
    // Track measured heights by row identity, not index, so toggling comments / variations /
    // collapse (which adds, removes, or resizes rows) never reuses a stale neighbour height.
    getItemKey: (index) => rows[index].key,
    // The static root-comment block shares the scroll viewport above the list.
    scrollMargin: rootCommentHeight,
  });

  // A toggle can also change a row's height in place (inline comments appear/disappear, a head
  // row collapses to just its +/-), which identity keying alone wouldn't catch — re-measure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    virtualizer.measure();
  }, [showComments, mode, collapsed, virtualizer]);

  // Bring the current move's row into the window when the row changes.
  const moveRowIndex = findRowIndex(visibleMoveRows, position);
  const currentRowIndex = moveRowIndex;
  useEffect(() => {
    if (currentRowIndex >= 0) {
      virtualizer.scrollToIndex(currentRowIndex, { align: "center" });
    } else {
      virtualizer.scrollToOffset(0);
    }
  }, [currentRowIndex, virtualizer]);

  // Then scroll the exact active move into view: a line row packs up to MAX_LINE_PLIES, so
  // stepping within a row needs cell-level follow. rAF lets a freshly scrolled row mount first;
  // block: "nearest" follows the move without re-centering the row on every step.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      parentRef.current?.querySelector("[data-current-move]")?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [position]);

  return (
    <ScrollArea
      flex={1}
      offsetScrollbars
      scrollbars="y"
      viewportRef={parentRef}
      style={{ minHeight: 0 }}
    >
      {invisible && (
        <Overlay
          backgroundOpacity={0.6}
          color={colorScheme === "dark" ? "#1a1b1e" : undefined}
          blur={8}
          zIndex={2}
        />
      )}
      {showRootComment && (
        <Box
          ref={rootCommentRef}
          p="sm"
          fz="sm"
          style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
        >
          <Comment comment={root.comment} />
        </Box>
      )}
      <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          return (
            <div
              key={row.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <NotationRowView
                row={row}
                showComments={showComments}
                collapsed={collapsed}
                onToggle={onToggle}
              />
            </div>
          );
        })}
      </div>
      <ForkChooser parentRef={parentRef} mode={mode} setMode={setMode} />
    </ScrollArea>
  );
}

export default VirtualizedNotation;
