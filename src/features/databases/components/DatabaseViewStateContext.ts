import { createContext } from "react";
import { activeDatabaseViewStore, type DatabaseViewStore } from "@/state/store/database";

export const DatabaseViewStateContext = createContext<typeof activeDatabaseViewStore | null>(activeDatabaseViewStore);
