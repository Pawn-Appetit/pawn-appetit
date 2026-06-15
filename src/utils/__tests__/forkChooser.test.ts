import { expect, test } from "vitest";
import {
    cycleIndex,
    followPath,
    forkCandidates,
    isForkPosition,
    shouldAutoOpen,
} from "../forkChooser";
import type { TreeNode } from "../treeReducer";

let fenCounter = 0;
function mk(san: string | null, children: TreeNode[] = []): TreeNode {
    fenCounter += 1;
    return {
        fen: `fen-${fenCounter}`,
        san,
        children,
        halfMoves: 0,
        annotations: [],
        comment: "",
    } as unknown as TreeNode;
}

test("forkCandidates returns the children of the node at the position", () => {
    const root = mk(null, [mk("e4", [mk("e5"), mk("c5"), mk("e6")])]);
    expect(forkCandidates(root, [0]).map((c) => c.san)).toEqual(["e5", "c5", "e6"]);
});

test("forkCandidates is empty at a leaf", () => {
    const root = mk(null, [mk("e4")]);
    expect(forkCandidates(root, [0])).toEqual([]);
});

test("isForkPosition is true only with >= 2 children", () => {
    const root = mk(null, [mk("e4", [mk("e5"), mk("c5")])]);
    expect(isForkPosition(root, [0])).toBe(true); // e4 has two replies
    expect(isForkPosition(root, [])).toBe(false); // root has one child
});

test("cycleIndex wraps in both directions and is safe at length 0", () => {
    expect(cycleIndex(0, 3, 1)).toBe(1);
    expect(cycleIndex(2, 3, 1)).toBe(0);
    expect(cycleIndex(0, 3, -1)).toBe(2);
    expect(cycleIndex(0, 0, 1)).toBe(0);
});

test("followPath appends the chosen child index", () => {
    expect(followPath([0, 1], 2)).toEqual([0, 1, 2]);
});

test("shouldAutoOpen gates on every condition", () => {
    const base = { candidateCount: 3, autoEnabled: true, practiceActive: false, dismissed: false };
    expect(shouldAutoOpen(base)).toBe(true);
    expect(shouldAutoOpen({ ...base, autoEnabled: false })).toBe(false);
    expect(shouldAutoOpen({ ...base, practiceActive: true })).toBe(false);
    expect(shouldAutoOpen({ ...base, dismissed: true })).toBe(false);
    expect(shouldAutoOpen({ ...base, candidateCount: 1 })).toBe(false);
});
