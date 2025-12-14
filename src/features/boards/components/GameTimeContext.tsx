import { createContext, type Dispatch, type ReactNode, type SetStateAction, useContext, useState } from "react";

interface GameTimeContextValue {
  whiteTime: number | null;
  blackTime: number | null;
  setWhiteTime: Dispatch<SetStateAction<number | null>>;
  setBlackTime: Dispatch<SetStateAction<number | null>>;
}

const GameTimeContext = createContext<GameTimeContextValue | null>(null);

export function GameTimeProvider({ children }: { children: ReactNode }) {
  const [whiteTime, setWhiteTime] = useState<number | null>(null);
  const [blackTime, setBlackTime] = useState<number | null>(null);

  return (
    <GameTimeContext.Provider value={{ whiteTime, blackTime, setWhiteTime, setBlackTime }}>
      {children}
    </GameTimeContext.Provider>
  );
}

export function useGameTime() {
  const context = useContext(GameTimeContext);
  if (!context) {
    throw new Error("useGameTime must be used within GameTimeProvider");
  }
  return context;
}
