import { ActionIcon, Group, Paper, Tooltip } from "@mantine/core";
import { IconArrowsShuffle, IconFocus, IconListTree } from "@tabler/icons-react";
import * as d3 from "d3";
import { t } from "i18next";
import { useContext, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/TreeStateContext";
import { hasMorePriority, stripClock } from "@/utils/chess";
import type { TreeNode } from "@/utils/treeReducer";

const COLORS = {
  link: "#555",
  highlight: "orange",
  root: "#f9a825",
  white: "#ffffff",
  black: "#2c2c2c",
  text: "#333",
  transposition: "#00bcd4",
  collapsedBadge: "#ff9800",
};

const DIMS = {
  nodeWidth: 80,
  nodeHeight: 30,
  nodeSpacing: [40, 150] as [number, number],
  borderRadius: 10,
  strokeWidth: { link: 1.5, node: 2 },
  scale: 0.8,
  transitionDuration: 750,
};

type NodeWithPath = d3.HierarchyNode<TreeNode> & {
  movePath?: number[];
  _children?: NodeWithPath[];
  nodeId?: string;
};

type TranspositionLink = {
  source: NodeWithPath;
  target: NodeWithPath;
};

const getNodeColor = (d: d3.HierarchyNode<TreeNode>) =>
  d.depth === 0 ? COLORS.root : d.data.halfMoves % 2 === 1 ? COLORS.white : COLORS.black;

const getTextColor = (d: d3.HierarchyNode<TreeNode>) =>
  d.depth === 0 ? COLORS.text : d.data.halfMoves % 2 === 1 ? COLORS.text : COLORS.white;

// Generate unique node ID from path
const getNodeId = (path: number[]): string => path.join("-") || "root";

// Build a filtered tree based on collapsed state (main line only mode)
function filterToMainLine(node: TreeNode): TreeNode {
  if (node.children.length === 0) {
    return { ...node, children: [] };
  }
  // Only keep the first child (main line)
  return {
    ...node,
    children: [filterToMainLine(node.children[0])],
  };
}

// Count hidden children for a node
function countDescendants(node: TreeNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}

function GraphPanel() {
  const store = useContext(TreeStateContext)!;
  const rootData = useStore(store, (s) => s.root);
  const currentPosition = useStore(store, (s) => s.position);
  const goToMove = useStore(store, (s) => s.goToMove);

  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const hierarchyRef = useRef<d3.HierarchyNode<TreeNode> | null>(null);

  const [mainLineOnly, setMainLineOnly] = useState(false);
  const [showTranspositions, setShowTranspositions] = useState(true);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const addMovePaths = (root: d3.HierarchyNode<TreeNode>) => {
    root.each((d: NodeWithPath) => {
      const path: number[] = [];
      let current = d;
      while (current.parent) {
        path.unshift(current.parent.children!.indexOf(current));
        current = current.parent;
      }
      d.movePath = path;
      d.nodeId = getNodeId(path);
    });
  };

  const createCenterTransform = (node: d3.HierarchyNode<TreeNode>, width: number, height: number) =>
    d3.zoomIdentity
      .translate(width / 2 - (node.y || 0) * DIMS.scale, height / 2 - (node.x || 0) * DIMS.scale)
      .scale(DIMS.scale);

  const findCurrentNode = (root: d3.HierarchyNode<TreeNode>) => {
    if (!currentPosition.length) return root;
    return (
      root.descendants().find((d) => {
        const path = (d as NodeWithPath).movePath || [];
        return path.length === currentPosition.length && path.every((val, idx) => val === currentPosition[idx]);
      }) || root
    );
  };

  // Find transpositions (same FEN at different positions)
  // Uses stripClock to normalize FEN and hasMorePriority to find meaningful transpositions
  const findTranspositionLinks = (root: d3.HierarchyNode<TreeNode>): TranspositionLink[] => {
    const links: TranspositionLink[] = [];
    const fenToNodes = new Map<string, NodeWithPath[]>();

    // Group nodes by normalized FEN (without clock)
    root.each((d: NodeWithPath) => {
      // Skip root node
      if (d.depth === 0) return;

      const strippedFen = stripClock(d.data.fen);
      if (!fenToNodes.has(strippedFen)) {
        fenToNodes.set(strippedFen, []);
      }
      fenToNodes.get(strippedFen)!.push(d);
    });

    // For each FEN with multiple nodes, create transposition links
    for (const [, nodes] of fenToNodes) {
      if (nodes.length < 2) continue;

      // Sort by priority (main line first)
      nodes.sort((a, b) => {
        const pathA = a.movePath || [];
        const pathB = b.movePath || [];
        return hasMorePriority(pathA, pathB) ? -1 : 1;
      });

      // Link each node to the highest priority node (the "canonical" position)
      const canonical = nodes[0];
      for (let i = 1; i < nodes.length; i++) {
        links.push({ source: nodes[i], target: canonical });
      }
    }

    return links;
  };


  const updateSelection = (root: d3.HierarchyNode<TreeNode>) => {
    const ancestors = findCurrentNode(root).ancestors();

    // Reset all styles
    d3.selectAll("path.link, g[data-node] > rect")
      .attr("stroke", COLORS.link)
      .attr("stroke-width", (d: any) => (d.tagName === "path" ? DIMS.strokeWidth.link : DIMS.strokeWidth.node));

    // Highlight active path
    d3.selectAll("path.link")
      .filter((l: any) => ancestors.includes(l.target))
      .attr("stroke", COLORS.highlight)
      .attr("stroke-width", DIMS.strokeWidth.node);

    d3.selectAll("g[data-node]")
      .filter((n: any) => ancestors.includes(n))
      .select("rect")
      .attr("stroke", COLORS.highlight)
      .attr("stroke-width", DIMS.strokeWidth.node);
  };

  const centerOnCurrentMove = () => {
    if (!svgRef.current || !hierarchyRef.current || !zoomRef.current) return;

    const svg = d3.select(svgRef.current);
    const { width, height } = svg.node()!.getBoundingClientRect();

    svg
      .transition()
      .duration(DIMS.transitionDuration)
      .call(zoomRef.current.transform, createCenterTransform(findCurrentNode(hierarchyRef.current), width, height));
  };

  const toggleMainLineOnly = () => {
    setMainLineOnly((prev) => !prev);
    setCollapsedNodes(new Set()); // Reset manual collapses when toggling mode
  };

  const toggleNodeCollapse = (nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Check if a node should be hidden based on collapsed parent
  const isNodeVisible = (node: NodeWithPath, collapsedNodes: Set<string>): boolean => {
    let current = node.parent as NodeWithPath | null;
    while (current) {
      if (collapsedNodes.has(current.nodeId || "")) {
        return false;
      }
      current = current.parent as NodeWithPath | null;
    }
    return true;
  };

  // Track previous state to conditionally center
  const prevPositionIdRef = useRef<string | null>(null);
  const prevRootDataRef = useRef<TreeNode | null>(null);
  const prevMainLineOnlyRef = useRef<boolean>(false);

  useEffect(() => {
    if (!svgRef.current || !rootData) return;

    const svg = d3.select(svgRef.current);
    const { width, height } = svg.node()!.getBoundingClientRect();

    // Ensure main group and layers exist
    let g = svg.select<SVGGElement>("g.main-group");
    if (g.empty()) {
      g = svg.append("g").attr("class", "main-group");
      g.append("g").attr("class", "layer-transpositions");
      g.append("g").attr("class", "layer-links");
      g.append("g").attr("class", "layer-nodes");
    }

    const transLayer = g.select("g.layer-transpositions");
    const linkLayer = g.select("g.layer-links");
    const nodeLayer = g.select("g.layer-nodes");

    // Apply main line filter if enabled
    const treeData = mainLineOnly ? filterToMainLine(rootData) : rootData;
    const root = d3.hierarchy(treeData, (d) => d.children);

    hierarchyRef.current = root;
    addMovePaths(root);

    // Layout tree
    d3.tree<TreeNode>().nodeSize(DIMS.nodeSpacing)(root);

    // Get all descendants and filter by collapsed state
    const allNodes = root.descendants() as NodeWithPath[];
    const visibleNodes = mainLineOnly
      ? allNodes
      : allNodes.filter((d) => isNodeVisible(d, collapsedNodes));

    // Filter links to only show between visible nodes
    const visibleNodeSet = new Set(visibleNodes);
    const visibleLinks = root.links().filter(
      (l) => visibleNodeSet.has(l.source as NodeWithPath) && visibleNodeSet.has(l.target as NodeWithPath)
    );

    // Setup zoom
    // Only attach zoom if it doesn't exist to avoid resetting transform state unknowingly
    // D3 zoom stores state on the element, so re-calling is usually safe, but being explicit is better
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .filter((event) => event.type === "wheel" || !event.target.closest("g[data-node]"))
      .on("zoom", (event) => g.attr("transform", event.transform));

    zoomRef.current = zoom;
    svg.call(zoom);

    // Determine if we should center or maintain view
    const currentPositionId = getNodeId(currentPosition);
    const shouldCenter =
      currentPositionId !== prevPositionIdRef.current ||
      rootData !== prevRootDataRef.current ||
      mainLineOnly !== prevMainLineOnlyRef.current;

    if (shouldCenter) {
      // Center on current move
      svg
        .transition()
        .duration(DIMS.transitionDuration)
        .call(zoom.transform, createCenterTransform(findCurrentNode(root), width, height));

      // Update refs
      prevPositionIdRef.current = currentPositionId;
      prevRootDataRef.current = rootData;
      prevMainLineOnlyRef.current = mainLineOnly;
    } else {
      // Ensure the g transform matches current zoom state (important if we just created g)
      // If g was just created, it has no transform.
      const t = d3.zoomTransform(svg.node()!);
      if (t.k !== 1 || t.x !== 0 || t.y !== 0) {
        g.attr("transform", t.toString());
      }
    }

    const transpositionLinks = (showTranspositions && !mainLineOnly) ? findTranspositionLinks(root) : [];
    const visibleTranspositions = transpositionLinks.filter(
      l => visibleNodeSet.has(l.source) && visibleNodeSet.has(l.target)
    );

    transLayer
      .selectAll<SVGPathElement, TranspositionLink>("path.transposition-link")
      .data(visibleTranspositions, (d) => d.source.nodeId + "-" + d.target.nodeId)
      .join("path")
      .attr("class", "transposition-link")
      .attr("fill", "none")
      .attr("stroke", COLORS.transposition)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5")
      .attr("opacity", 0.6)
      .attr("d", (d) => {
        const source = d.source;
        const target = d.target;
        const midX = ((source.y || 0) + (target.y || 0)) / 2;
        const midY = ((source.x || 0) + (target.x || 0)) / 2;
        const curvature = Math.abs((source.x || 0) - (target.x || 0)) * 0.3;
        return `M ${source.y},${source.x} Q ${midX},${midY - curvature} ${target.y},${target.x}`;
      });

    const linkGenerator = d3
      .linkHorizontal<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
      .x((d) => d.y)
      .y((d) => d.x);

    linkLayer
      .selectAll<SVGPathElement, d3.HierarchyPointLink<TreeNode>>("path.link")
      .data(visibleLinks, (d) => {
        const s = d.source as NodeWithPath;
        const t = d.target as NodeWithPath;
        return (s.nodeId || "") + "->" + (t.nodeId || "");
      })
      .join("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("stroke", COLORS.link)
      .attr("stroke-width", DIMS.strokeWidth.link)
      .attr("d", linkGenerator as any);

    const nodeGroups = nodeLayer
      .selectAll<SVGGElement, NodeWithPath>("g.node")
      .data(visibleNodes, (d) => d.nodeId || "");

    const nodeEnter = nodeGroups.enter()
      .append("g")
      .attr("class", "node")
      .attr("data-node", "true")
      .style("cursor", "pointer")
      // Start at parent position if available, else current pos
      .attr("transform", (d) => {
        // For enter animation, could start at parent pos. 
        return `translate(${d.y},${d.x})`;
      });

    nodeEnter.append("rect")
      .attr("width", DIMS.nodeWidth)
      .attr("height", DIMS.nodeHeight)
      .attr("x", -DIMS.nodeWidth / 2)
      .attr("y", -DIMS.nodeHeight / 2)
      .attr("rx", DIMS.borderRadius)
      .attr("stroke-width", DIMS.strokeWidth.node);

    nodeEnter.append("text")
      .attr("dy", "0.31em")
      .attr("text-anchor", "middle")
      .style("pointer-events", "none");

    const nodesMerged = nodeEnter.merge(nodeGroups);

    // Update position and attributes
    nodesMerged
      .attr("transform", (d) => `translate(${d.y},${d.x})`)
      .on("click", (event, d: NodeWithPath) => {
        event.stopPropagation();
        goToMove(d.depth === 0 ? [] : d.movePath || []);
      })
      .on("dblclick", (event, d: NodeWithPath) => {
        event.stopPropagation();
        if (!mainLineOnly && d.data.children.length > 0) {
          toggleNodeCollapse(d.nodeId || "");
        }
      });

    nodesMerged.select("rect")
      .attr("fill", getNodeColor)
      .attr("stroke", COLORS.link);

    nodesMerged.select("text")
      .text((d) => d.data.san || "")
      .attr("fill", getTextColor);

    // For simplicity, remove old badges and re-add.
    nodesMerged.selectAll(".badge").remove();

    // Collapsed Badge (Orange)
    nodesMerged
      .filter((d) => {
        if (mainLineOnly) return false;
        const isCollapsed = collapsedNodes.has(d.nodeId || "");
        const hasChildren = d.data.children.length > 0;
        return hasChildren && isCollapsed;
      })
      .append("circle")
      .attr("class", "badge")
      .attr("cx", DIMS.nodeWidth / 2 - 5)
      .attr("cy", -DIMS.nodeHeight / 2 + 5)
      .attr("r", 11)
      .attr("fill", COLORS.collapsedBadge)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .style("pointer-events", "none");

    nodesMerged
      .filter((d) => {
        if (mainLineOnly) return false;
        const isCollapsed = collapsedNodes.has(d.nodeId || "");
        const hasChildren = d.data.children.length > 0;
        return hasChildren && isCollapsed;
      })
      .append("text")
      .attr("class", "badge")
      .attr("x", DIMS.nodeWidth / 2 - 5)
      .attr("y", -DIMS.nodeHeight / 2 + 5)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("fill", "#fff")
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .style("pointer-events", "none")
      .text((d) => {
        const hiddenCount = countDescendants(d.data);
        return hiddenCount > 99 ? "99+" : `+${hiddenCount}`;
      });

    // Variation Badge (Green)
    nodesMerged
      .filter((d) => {
        if (mainLineOnly) return false;
        const isCollapsed = collapsedNodes.has(d.nodeId || "");
        const hasAlternatives = d.data.children.length > 1;
        return hasAlternatives && !isCollapsed;
      })
      .append("circle")
      .attr("class", "badge")
      .attr("cx", DIMS.nodeWidth / 2 - 5)
      .attr("cy", -DIMS.nodeHeight / 2 + 5)
      .attr("r", 6)
      .attr("fill", "#4CAF50")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .attr("opacity", 0.8)
      .style("pointer-events", "none");

    nodesMerged
      .filter((d) => {
        if (mainLineOnly) return false;
        const isCollapsed = collapsedNodes.has(d.nodeId || "");
        const hasAlternatives = d.data.children.length > 1;
        return hasAlternatives && !isCollapsed;
      })
      .append("text")
      .attr("class", "badge")
      .attr("x", DIMS.nodeWidth / 2 - 5)
      .attr("y", -DIMS.nodeHeight / 2 + 5)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("fill", "#fff")
      .attr("font-size", "9px")
      .attr("font-weight", "bold")
      .style("pointer-events", "none")
      .text((d) => d.data.children.length);

    nodeGroups.exit().remove();

    updateSelection(root);
  }, [rootData, currentPosition, goToMove, mainLineOnly, showTranspositions, collapsedNodes]);



  return (
    <Paper flex={1} h="100%" style={{ overflow: "hidden", position: "relative" }}>
      <svg ref={svgRef} width="100%" height="100%" />
      <Group
        gap="xs"
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          zIndex: 10,
        }}
      >
        <Tooltip label={t("features.board.tabs.graph.Transpositions")} position="top">
          <ActionIcon
            variant={showTranspositions ? "filled" : "default"}
            size="lg"
            onClick={() => setShowTranspositions((prev) => !prev)}
            disabled={mainLineOnly}
          >
            <IconArrowsShuffle size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("features.board.tabs.graph.MainLineOnly")} position="top">
          <ActionIcon
            variant={mainLineOnly ? "filled" : "default"}
            size="lg"
            onClick={toggleMainLineOnly}
          >
            <IconListTree size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("features.board.tabs.graph.CenterGraph")} position="top">
          <ActionIcon variant="filled" size="lg" onClick={centerOnCurrentMove}>
            <IconFocus size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
  );
}

export default GraphPanel;
