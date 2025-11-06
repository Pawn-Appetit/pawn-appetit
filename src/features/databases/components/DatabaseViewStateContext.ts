import { createContext } from "react";
import { activeDatabaseViewStore } from "@/state/store/database";

export const DatabaseViewStateContext = createContext<typeof activeDatabaseViewStore | null>(activeDatabaseViewStore);
