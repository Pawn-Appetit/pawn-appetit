import { invoke } from "@tauri-apps/api/core";

export type VariantPosition = {
  fen: string;
  engine: string;
  recommended_move: string;
  ms: number;
};

export async function getVariantPosition(fen: string, engine: string): Promise<VariantPosition | null> {
  return invoke<VariantPosition | null>("get_variant_position", { fen, engine });
}

export async function upsertVariantPosition(
  fen: string,
  engine: string,
  recommended_move: string,
  ms: number,
): Promise<void> {
  await invoke("upsert_variant_position", { fen, engine, recommendedMove: recommended_move, ms });
}
