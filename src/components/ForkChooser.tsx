import { Portal, useMantineTheme } from "@mantine/core";
import { useAtomValue } from "jotai";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/TreeStateContext";
import { forkChooserAutoAtom } from "@/state/atoms";
import { ANNOTATION_INFO } from "@/utils/annotation";
import { cycleIndex, followPath, forkCandidates, shouldAutoOpen } from "@/utils/forkChooser";
import * as classes from "./ForkChooser.css";

// Anchored, portaled popover that lists the continuations at a fork. It mounts/unmounts only —
// it never participates in the notation panel's layout, so the move list, comments, and board
// are never re-laid-out when it appears.
export default function ForkChooser({
  parentRef,
}: {
  parentRef: { current: HTMLDivElement | null };
}) {
  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const position = useStore(store, (s) => s.position);
  const goToMove = useStore(store, (s) => s.goToMove);
  const autoEnabled = useAtomValue(forkChooserAutoAtom);
  const theme = useMantineTheme();
  const { t } = useTranslation();

  const candidates = forkCandidates(root, position);
  const posKey = position.join(",");
  const [selected, setSelected] = useState(0);
  const selectedRef = useRef(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);

  const open = shouldAutoOpen({
    candidateCount: candidates.length,
    autoEnabled,
    // PA has no per-tree practice path; the Practice/train feature does not use this notation
    // panel, so the chooser cannot appear mid-drill and this gate is always satisfied here.
    practiceActive: false,
    dismissed: dismissed === posKey,
  });

  // Reset selection + un-dismiss whenever we move to a different position.
  useEffect(() => {
    selectedRef.current = 0;
    setSelected(0);
    setDismissed(null);
  }, [posKey]);

  // Position the card under (or above) the current-move cell, following any scroll.
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const reposition = () => {
      const anchor = parentRef.current?.querySelector("[data-current-move]") as HTMLElement | null;
      if (!anchor) {
        setCoords(null);
        return;
      }
      const r = anchor.getBoundingClientRect();
      const gap = 6;
      const margin = 8;
      const popW = 214;
      const desired = 320;
      // Adapt the height to the room around the move so a long list never flips into a tall block
      // that covers unrelated panels — it opens snug to the move and scrolls inside instead.
      const spaceBelow = window.innerHeight - r.bottom - gap - margin;
      const spaceAbove = r.top - gap - margin;
      let top: number;
      let maxH: number;
      if (spaceBelow >= 90 || spaceBelow >= spaceAbove) {
        top = r.bottom + gap;
        maxH = Math.max(90, Math.min(desired, spaceBelow));
      } else {
        maxH = Math.max(90, Math.min(desired, spaceAbove));
        top = r.top - gap - maxH;
      }
      let left = r.left;
      if (left + popW > window.innerWidth - margin) left = window.innerWidth - margin - popW;
      if (left < margin) left = margin;
      setCoords({ top, left, maxH });
    };
    reposition();
    const viewport = parentRef.current;
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    viewport?.addEventListener("scroll", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      viewport?.removeEventListener("scroll", reposition);
    };
  }, [open, posKey, candidates.length, parentRef]);

  // Keyboard. Capture-phase + stopPropagation so we preempt the global move-navigation hotkeys
  // (arrows / branch keys) and the annotation digit keys while the chooser is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (/^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName) || tgt.isContentEditable)) return;
      if (e.key === "ArrowDown") {
        selectedRef.current = cycleIndex(selectedRef.current, candidates.length, 1);
        setSelected(selectedRef.current);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "ArrowUp") {
        selectedRef.current = cycleIndex(selectedRef.current, candidates.length, -1);
        setSelected(selectedRef.current);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        goToMove(followPath(position, selectedRef.current));
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "Escape") {
        setDismissed(posKey);
        e.preventDefault();
        e.stopPropagation();
      } else if (/^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < candidates.length) {
          goToMove(followPath(position, i));
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, candidates.length, posKey, position, goToMove]);

  // Clicking anywhere outside the card dismisses it (until the next move).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setDismissed(posKey);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, posKey]);

  // Keep the highlighted row visible inside the (possibly scrolling) list.
  useEffect(() => {
    if (!open) return;
    const el = rowsRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected, open]);

  if (!open) return null;

  return (
    <Portal>
      <div
        ref={popRef}
        className={classes.pop}
        style={{
          top: coords?.top ?? -9999,
          left: coords?.left ?? -9999,
          maxHeight: coords?.maxH,
          opacity: coords ? 1 : 0,
        }}
      >
        <div className={classes.header}>{t("forkChooser.replies", { n: candidates.length })}</div>
        <div className={classes.rows} ref={rowsRef}>
          {candidates.map((child, i) => {
            const ann = child.annotations[0] ?? "";
            const colorName = ANNOTATION_INFO[ann]?.color;
            const glyphColor =
              colorName && colorName !== "gray" ? theme.colors[colorName][6] : undefined;
            const moveText = t("formatters.moveNotation", { move: child.san ?? "" });
            return (
              <button
                type="button"
                key={`${i}-${child.san ?? ""}`}
                className={`${classes.row} ${i === selected ? classes.selected : ""}`}
                // mousemove (not mouseenter) so the popover opening under a stationary cursor
                // doesn't hijack the default highlight — only real cursor movement re-selects.
                onMouseMove={() => {
                  if (selectedRef.current === i) return;
                  selectedRef.current = i;
                  setSelected(i);
                }}
                onClick={() => goToMove(followPath(position, i))}
              >
                <span className={classes.idx}>{i + 1}</span>
                <span className={classes.san}>{moveText}</span>
                {ann && (
                  <span className={classes.nag} style={{ color: glyphColor }}>
                    {ann}
                  </span>
                )}
                {i === 0 && <span className={classes.main}>{t("forkChooser.main")}</span>}
              </button>
            );
          })}
        </div>
        <div className={classes.footer}>↑ ↓ · ↵ · esc</div>
      </div>
    </Portal>
  );
}
