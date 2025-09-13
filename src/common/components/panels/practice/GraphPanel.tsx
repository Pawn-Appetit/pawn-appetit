import { ActionIcon, Paper, Tooltip } from "@mantine/core";
import { IconFocus } from "@tabler/icons-react";
import * as d3 from "d3";
import { t } from "i18next";
import { useContext, useEffect, useRef } from "react";
import { useStore } from "zustand";
import { TreeStateContext } from "@/common/components/TreeStateContext";
import type { TreeNode } from "@/utils/treeReducer";

const COLORS = {
  link: "#555",
  highlight: "orange",
  root: "#f9a825",
  white: "#ffffff",
  black: "#2c2c2c",
  text: "#333",
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

type NodeWithPath = d3.HierarchyNode<TreeNode> & { movePath?: number[] };

const getNodeColor = (d: d3.HierarchyNode<TreeNode>) =>
  d.depth === 0 ? COLORS.root : d.data.halfMoves % 2 === 1 ? COLORS.white : COLORS.black;

const getTextColor = (d: d3.HierarchyNode<TreeNode>) =>
  d.depth === 0 ? COLORS.text : d.data.halfMoves % 2 === 1 ? COLORS.text : COLORS.white;

function GraphPanel() {
  const store = useContext(TreeStateContext)!;
  const rootData = useStore(store, (s) => s.root);
  const currentPosition = useStore(store, (s) => s.position);
  const goToMove = useStore(store, (s) => s.goToMove);

  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const hierarchyRef = useRef<d3.HierarchyNode<TreeNode> | null>(null);

  const addMovePaths = (root: d3.HierarchyNode<TreeNode>) => {
    root.each((d: NodeWithPath) => {
      const path: number[] = [];
      let current = d;
      while (current.parent) {
        path.unshift(current.parent.children!.indexOf(current));
        current = current.parent;
      }
      d.movePath = path;
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

  useEffect(() => {
    if (!svgRef.current || !rootData) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = svg.node()!.getBoundingClientRect();
    const g = svg.append("g");
    const root = d3.hierarchy(rootData, (d) => d.children);

    hierarchyRef.current = root;
    addMovePaths(root);

    // Layout tree
    d3.tree<TreeNode>().nodeSize(DIMS.nodeSpacing)(root);

    // Setup zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .filter((event) => event.type === "wheel" || !event.target.closest("g[data-node]"))
      .on("zoom", (event) => g.attr("transform", event.transform));

    zoomRef.current = zoom;
    svg.call(zoom);

    // Center on current move
    svg
      .transition()
      .duration(DIMS.transitionDuration)
      .call(zoom.transform, createCenterTransform(findCurrentNode(root), width, height));

    // Draw links
    const linkGenerator = d3
      .linkHorizontal<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
      .x((d) => d.y)
      .y((d) => d.x);

    g.append("g")
      .selectAll("path")
      .data(root.links())
      .join("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("stroke", COLORS.link)
      .attr("stroke-width", DIMS.strokeWidth.link)
      .attr("d", linkGenerator as any);

    // Draw nodes
    const nodes = g
      .append("g")
      .selectAll("g")
      .data(root.descendants())
      .join("g")
      .attr("transform", (d) => `translate(${d.y},${d.x})`)
      .attr("data-node", "true")
      .style("cursor", "pointer")
      .on("click", (event, d: NodeWithPath) => {
        event.stopPropagation();
        goToMove(d.depth === 0 ? [] : d.movePath || []);
      });

    // Node rectangles
    nodes
      .append("rect")
      .attr("width", DIMS.nodeWidth)
      .attr("height", DIMS.nodeHeight)
      .attr("x", -DIMS.nodeWidth / 2)
      .attr("y", -DIMS.nodeHeight / 2)
      .attr("rx", DIMS.borderRadius)
      .attr("fill", getNodeColor)
      .attr("stroke", COLORS.link)
      .attr("stroke-width", DIMS.strokeWidth.node);

    // Node text
    nodes
      .append("text")
      .attr("dy", "0.31em")
      .attr("text-anchor", "middle")
      .text((d) => d.data.san || "")
      .attr("fill", getTextColor)
      .style("pointer-events", "none");

    updateSelection(root);
  }, [rootData, currentPosition, goToMove]);

  return (
    <Paper flex={1} h="100%" style={{ overflow: "hidden", position: "relative" }}>
      <svg ref={svgRef} width="100%" height="100%" />
      <Tooltip label={t("features.board.tabs.graph.CenterGraph")} position="top">
        <ActionIcon
          variant="filled"
          size="lg"
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            zIndex: 10,
          }}
          onClick={centerOnCurrentMove}
        >
          <IconFocus size={18} />
        </ActionIcon>
      </Tooltip>
    </Paper>
  );
}

export default GraphPanel;
