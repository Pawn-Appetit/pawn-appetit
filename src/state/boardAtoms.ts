/**
 * Board appearance and behavior atoms.
 * Covers piece set, board image, coordinate display, move interaction settings,
 * arrow/highlight display, and blindfold mode.
 */
import { atomWithStorage } from "jotai/utils";

// Move interaction
export const showDestsAtom = atomWithStorage<boolean>("show-dests", true);
export const snapArrowsAtom = atomWithStorage<boolean>("snap-dests", true);
export const showArrowsAtom = atomWithStorage<boolean>("show-arrows", true);
export const showConsecutiveArrowsAtom = atomWithStorage<boolean>("show-consecutive-arrows", false);
export const eraseDrawablesOnClickAtom = atomWithStorage<boolean>("erase-drawables-on-click", false);
export const autoPromoteAtom = atomWithStorage<boolean>("auto-promote", true);
export const autoSaveAtom = atomWithStorage<boolean>("auto-save", true);
export const previewBoardOnHoverAtom = atomWithStorage<boolean>("preview-board-on-hover", true);
export const enableBoardScrollAtom = atomWithStorage<boolean>("board-scroll", true);
export const forcedEnPassantAtom = atomWithStorage<boolean>("forced-ep", false);

// Display
export const showCoordinatesAtom = atomWithStorage<"none" | "inside" | "all">("coordinates-mode", "inside", undefined, {
  getOnInit: true,
});
export const pieceSetAtom = atomWithStorage<string>("piece-set", "staunty");
export const boardImageAtom = atomWithStorage<string>("board-image", "gray.svg");
export const blindfoldAtom = atomWithStorage<boolean>("blindfold-mode", false);
