import { ActionIcon, Group } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconPlayerPlay,
  IconPlayerStop,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { memo, useCallback, useContext, useEffect, useRef } from "react";
import { useStore } from "zustand";
import { keyMapAtom } from "@/state/keybindings";
import BoardControlsMenu from "./BoardControlsMenu";
import { TreeStateContext } from "./TreeStateContext";

interface MoveControlsProps {
  readOnly?: boolean;
  // Board controls props
  viewPawnStructure?: boolean;
  setViewPawnStructure?: (value: boolean) => void;
  takeSnapshot?: () => void;
  canTakeBack?: boolean;
  deleteMove?: () => void;
  changeTabType?: () => void;
  currentTabType?: "analysis" | "play";
  eraseDrawablesOnClick?: boolean;
  clearShapes?: () => void;
  disableVariations?: boolean;
  editingMode?: boolean;
  toggleEditingMode?: () => void;
  saveFile?: () => void;
  dirty?: boolean;
  autoSave?: boolean;
  reload?: () => void;
  addGame?: () => void;
  toggleOrientation?: () => void;
  currentTabSourceType?: string;
  // Start Game props for play tabs
  startGame?: () => void;
  endGame?: () => void;
  gameState?: "settingUp" | "playing" | "gameOver";
  startGameDisabled?: boolean;
}

function MoveControls({
  readOnly,
  viewPawnStructure,
  setViewPawnStructure,
  takeSnapshot,
  canTakeBack,
  deleteMove: deleteMoveProp,
  changeTabType,
  currentTabType,
  eraseDrawablesOnClick,
  clearShapes,
  disableVariations,
  editingMode,
  toggleEditingMode,
  saveFile,
  reload,
  addGame,
  toggleOrientation,
  currentTabSourceType,
  // Start Game props
  startGame,
  endGame,
  gameState,
  startGameDisabled,
}: MoveControlsProps) {
  const store = useContext(TreeStateContext)!;
  const nextRaw = useStore(store, (s) => s.goToNext);
  const previousRaw = useStore(store, (s) => s.goToPrevious);
  const start = useStore(store, (s) => s.goToStart);
  const end = useStore(store, (s) => s.goToEnd);
  const deleteMove = useStore(store, (s) => s.deleteMove);
  const startBranch = useStore(store, (s) => s.goToBranchStart);
  const endBranch = useStore(store, (s) => s.goToBranchEnd);
  const nextBranch = useStore(store, (s) => s.nextBranch);
  const previousBranch = useStore(store, (s) => s.previousBranch);
  const nextBranching = useStore(store, (s) => s.nextBranching);
  const previousBranching = useStore(store, (s) => s.previousBranching);

  // Handle smooth navigation when keys are held down
  const nextIntervalRef = useRef<number | null>(null);
  const previousIntervalRef = useRef<number | null>(null);
  const nextTimeoutRef = useRef<number | null>(null);
  const previousTimeoutRef = useRef<number | null>(null);

  // Cleanup intervals and timeouts on unmount
  useEffect(() => {
    return () => {
      if (nextIntervalRef.current !== null) {
        cancelAnimationFrame(nextIntervalRef.current);
      }
      if (previousIntervalRef.current !== null) {
        cancelAnimationFrame(previousIntervalRef.current);
      }
      if (nextTimeoutRef.current !== null) {
        clearTimeout(nextTimeoutRef.current);
      }
      if (previousTimeoutRef.current !== null) {
        clearTimeout(previousTimeoutRef.current);
      }
    };
  }, []);

  const stopNextNavigation = useCallback(() => {
    // Clear the timeout if it exists (key released before rapid navigation starts)
    if (nextTimeoutRef.current !== null) {
      clearTimeout(nextTimeoutRef.current);
      nextTimeoutRef.current = null;
    }
    // Clear the animation frame if it exists (key released during rapid navigation)
    if (nextIntervalRef.current !== null) {
      cancelAnimationFrame(nextIntervalRef.current);
      nextIntervalRef.current = null;
    }
  }, []);

  const stopPreviousNavigation = useCallback(() => {
    // Clear the timeout if it exists (key released before rapid navigation starts)
    if (previousTimeoutRef.current !== null) {
      clearTimeout(previousTimeoutRef.current);
      previousTimeoutRef.current = null;
    }
    // Clear the animation frame if it exists (key released during rapid navigation)
    if (previousIntervalRef.current !== null) {
      cancelAnimationFrame(previousIntervalRef.current);
      previousIntervalRef.current = null;
    }
  }, []);

  const next = useCallback(() => {
    // If interval is already running, ignore this call (key repeat)
    if (nextIntervalRef.current !== null) {
      return;
    }
    
    // First call: execute immediately with sound
    nextRaw(true); // Play sound on first call
    
    // Start interval for subsequent calls (key held down)
    // Use requestAnimationFrame with progressive acceleration for smoother experience
    let lastTime = performance.now();
    let interval = 50; // Start with 50ms interval
    let moveCount = 0;
    
    const animate = (timestamp: number) => {
      const now = performance.now();
      if (now - lastTime >= interval) {
        nextRaw(false); // No sound during rapid navigation
        lastTime = now;
        moveCount++;
        
        // Progressive acceleration: speed up after initial moves
        // Start at 50ms, accelerate to 25ms after 5 moves, then to 20ms after 10 moves
        if (moveCount === 5) {
          interval = 30;
        } else if (moveCount === 10) {
          interval = 25;
        } else if (moveCount === 20) {
          interval = 20; // Maximum speed
        }
      }
      
      if (nextIntervalRef.current !== null) {
        nextIntervalRef.current = requestAnimationFrame(animate);
      }
    };
    
    // Small delay before starting rapid navigation to distinguish single click from hold
    // Only start rapid navigation if the key is still held (timeout not cleared means key was released)
    nextTimeoutRef.current = window.setTimeout(() => {
      // Check if timeout was not cleared (meaning key is still held)
      if (nextTimeoutRef.current !== null && nextIntervalRef.current === null) {
        // Key is still held, start rapid navigation
        nextTimeoutRef.current = null; // Clear timeout ref
        nextIntervalRef.current = requestAnimationFrame(animate);
      }
    }, 150); // 150ms delay before rapid navigation starts
  }, [nextRaw]);

  const previous = useCallback(() => {
    // If interval is already running, ignore this call (key repeat)
    if (previousIntervalRef.current !== null) {
      return;
    }
    
    // First call: execute immediately
    previousRaw();
    
    // Start interval for subsequent calls (key held down)
    // Use requestAnimationFrame with progressive acceleration for smoother experience
    let lastTime = performance.now();
    let interval = 50; // Start with 50ms interval
    let moveCount = 0;
    
    const animate = (timestamp: number) => {
      const now = performance.now();
      if (now - lastTime >= interval) {
        previousRaw();
        lastTime = now;
        moveCount++;
        
        // Progressive acceleration: speed up after initial moves
        // Start at 50ms, accelerate to 30ms after 5 moves, then to 25ms after 10 moves
        if (moveCount === 5) {
          interval = 30;
        } else if (moveCount === 10) {
          interval = 25;
        } else if (moveCount === 20) {
          interval = 20; // Maximum speed
        }
      }
      
      if (previousIntervalRef.current !== null) {
        previousIntervalRef.current = requestAnimationFrame(animate);
      }
    };
    
    // Small delay before starting rapid navigation to distinguish single click from hold
    // Only start rapid navigation if the key is still held (timeout not cleared means key was released)
    previousTimeoutRef.current = window.setTimeout(() => {
      // Check if timeout was not cleared (meaning key is still held)
      if (previousTimeoutRef.current !== null && previousIntervalRef.current === null) {
        // Key is still held, start rapid navigation
        previousTimeoutRef.current = null; // Clear timeout ref
        previousIntervalRef.current = requestAnimationFrame(animate);
      }
    }, 150); // 150ms delay before rapid navigation starts
  }, [previousRaw]);

  // Listen for keyup events to stop navigation
  // Also listen for keydown to handle edge cases where keyup might be missed
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      // Only handle arrow keys
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (e.key === "ArrowRight") {
          stopNextNavigation();
        } else if (e.key === "ArrowLeft") {
          stopPreviousNavigation();
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // If a different arrow key is pressed while one is held, stop the current navigation
      if (e.key === "ArrowRight" && previousIntervalRef.current !== null) {
        stopPreviousNavigation();
      } else if (e.key === "ArrowLeft" && nextIntervalRef.current !== null) {
        stopNextNavigation();
      }
    };

    // Use capture phase to catch events early
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("keydown", handleKeyDown, true);
    
    // Also listen for blur events (when window loses focus) to stop navigation
    const handleBlur = () => {
      stopNextNavigation();
      stopPreviousNavigation();
    };
    window.addEventListener("blur", handleBlur);
    
    return () => {
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, [stopNextNavigation, stopPreviousNavigation]);

  // Separate handlers for button clicks (single move, no animation loop)
  const handlePreviousClick = useCallback(() => {
    // Stop any ongoing navigation first
    stopPreviousNavigation();
    stopNextNavigation();
    // Execute a single move
    previousRaw();
  }, [previousRaw, stopPreviousNavigation, stopNextNavigation]);

  const handleNextClick = useCallback(() => {
    // Stop any ongoing navigation first
    stopNextNavigation();
    stopPreviousNavigation();
    // Execute a single move with sound
    nextRaw(true);
  }, [nextRaw, stopNextNavigation, stopPreviousNavigation]);

  const keyMap = useAtomValue(keyMapAtom);

  useHotkeys([
    [keyMap.PREVIOUS_MOVE.keys, previous],
    [keyMap.NEXT_MOVE.keys, next],
    [keyMap.GO_TO_START.keys, start],
    [keyMap.GO_TO_END.keys, end],
    [keyMap.DELETE_MOVE.keys, readOnly ? () => {} : () => (deleteMoveProp || deleteMove)()],
    [keyMap.GO_TO_BRANCH_START.keys, startBranch],
    [keyMap.GO_TO_BRANCH_END.keys, endBranch],
    [keyMap.NEXT_BRANCH.keys, nextBranch],
    [keyMap.PREVIOUS_BRANCH.keys, previousBranch],
    [keyMap.NEXT_BRANCHING.keys, nextBranching],
    [keyMap.PREVIOUS_BRANCHING.keys, previousBranching],
  ]);

  return (
    <Group grow gap="xs">
      <ActionIcon
        variant="default"
        size="lg"
        onClick={start}
        disabled={currentTabType === "play" && gameState === "settingUp"}
      >
        <IconChevronsLeft />
      </ActionIcon>
      <ActionIcon
        variant="default"
        size="lg"
        onClick={handlePreviousClick}
        disabled={currentTabType === "play" && gameState === "settingUp"}
      >
        <IconChevronLeft />
      </ActionIcon>
      {currentTabType === "play" && (startGame || endGame) && (
        <ActionIcon
          variant="default"
          size="lg"
          onClick={gameState === "playing" ? endGame : startGame}
          disabled={gameState === "playing" ? false : startGameDisabled}
        >
          {gameState === "playing" ? <IconPlayerStop /> : <IconPlayerPlay />}
        </ActionIcon>
      )}
      <ActionIcon
        variant="default"
        size="lg"
        onClick={handleNextClick}
        disabled={currentTabType === "play" && gameState === "settingUp"}
      >
        <IconChevronRight />
      </ActionIcon>
      <ActionIcon
        variant="default"
        size="lg"
        onClick={end}
        disabled={currentTabType === "play" && gameState === "settingUp"}
      >
        <IconChevronsRight />
      </ActionIcon>
      {!readOnly && (
        <BoardControlsMenu
          viewPawnStructure={viewPawnStructure}
          setViewPawnStructure={setViewPawnStructure}
          takeSnapshot={takeSnapshot}
          canTakeBack={canTakeBack}
          deleteMove={deleteMoveProp}
          changeTabType={changeTabType}
          currentTabType={currentTabType}
          eraseDrawablesOnClick={eraseDrawablesOnClick}
          clearShapes={clearShapes}
          disableVariations={disableVariations}
          editingMode={editingMode}
          toggleEditingMode={toggleEditingMode}
          saveFile={saveFile}
          reload={reload}
          addGame={addGame}
          toggleOrientation={toggleOrientation}
          currentTabSourceType={currentTabSourceType}
        />
      )}
    </Group>
  );
}

export default memo(MoveControls);
