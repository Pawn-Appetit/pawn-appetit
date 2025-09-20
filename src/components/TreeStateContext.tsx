import { createContext, useMemo } from "react";
import { createTreeStore, type TreeStore } from "@/state/store/tree";
import type { TreeState } from "@/utils/treeReducer";

export const TreeStateContext = createContext<TreeStore | null>(null);

export function TreeStateProvider({
  id,
  initial,
  children,
}: {
  id?: string;
  initial?: TreeState;
  children: React.ReactNode;
}) {
  const store = useMemo(() => createTreeStore(id, initial), [id, initial]);

  return <TreeStateContext.Provider value={store}>{children}</TreeStateContext.Provider>;
}
