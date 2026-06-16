import { getNodeAtPath, type TreeNode } from "./treeReducer";

/** The children of the node at `position` — i.e. the available continuations. */
export function forkCandidates(root: TreeNode, position: number[]): TreeNode[] {
    const node = getNodeAtPath(root, position);
    return node?.children ?? [];
}

/** A position is a "fork" when it has more than one continuation. */
export function isForkPosition(root: TreeNode, position: number[]): boolean {
    return forkCandidates(root, position).length >= 2;
}

/** Whether the chooser should auto-open right now. */
export function shouldAutoOpen(p: {
    candidateCount: number;
    autoEnabled: boolean;
    practiceActive: boolean;
    dismissed: boolean;
}): boolean {
    return p.autoEnabled && !p.practiceActive && !p.dismissed && p.candidateCount >= 2;
}

/** Move the highlighted index by `delta`, wrapping; safe when `length` is 0. */
export function cycleIndex(current: number, length: number, delta: number): number {
    if (length <= 0) return 0;
    return (current + delta + length) % length;
}

/** The tree path reached by following child `index` from `position`. */
export function followPath(position: number[], index: number): number[] {
    return [...position, index];
}
