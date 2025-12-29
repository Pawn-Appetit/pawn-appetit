import { useEffect, useRef } from "react";
import type { TreeStore } from "@/state/store/tree";

export function useDebouncedAutoSave({
  store,
  enabled,
  isFileTab,
  delayMs = 750,
  save,
}: {
  store: TreeStore;
  enabled: boolean;
  isFileTab: boolean;
  delayMs?: number;
  save: () => Promise<void> | void;
}) {
  const saveRef = useRef(save);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (!enabled || !isFileTab) {
      return;
    }

    const schedule = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (inFlightRef.current) return;

        inFlightRef.current = true;
        Promise.resolve(saveRef.current()).finally(() => {
          inFlightRef.current = false;
        });
      }, delayMs);
    };

    const unsubscribe = store.subscribe((state, prevState) => {
      if (!state.dirty) return;
      if (state.saveVersion !== prevState.saveVersion) {
        schedule();
      }
    });

    if (store.getState().dirty) {
      schedule();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      unsubscribe();
    };
  }, [delayMs, enabled, isFileTab, store]);
}

