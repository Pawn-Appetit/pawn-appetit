import { parseFen } from "chessops/fen";

export const MATERIAL_ROLES = ["queen", "rook", "bishop", "knight", "pawn"] as const;

/** Count non-king pieces placed on a partial-position query board. */
export function placedMaterialCounts(fen: string): Record<string, number> {
    const setup = parseFen(fen).unwrap();
    const counts: Record<string, number> = {};
    for (const square of setup.board.occupied) {
        const piece = setup.board.get(square);
        if (!piece || !MATERIAL_ROLES.includes(piece.role as (typeof MATERIAL_ROLES)[number])) {
            continue;
        }
        const key = `${piece.color}-${piece.role}`;
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

export function invalidExactMaterialCounts(
    fen: string,
    exactCounts: Record<string, number> | undefined,
): string[] {
    if (!exactCounts) return [];
    const placed = placedMaterialCounts(fen);
    return Object.entries(exactCounts)
        .filter(([key, count]) => count < (placed[key] ?? 0))
        .map(([key]) => key);
}
