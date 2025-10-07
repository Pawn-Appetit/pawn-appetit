import { atomWithStorage } from "jotai/utils";
import type { SyncStorage, SyncStringStorage } from "jotai/vanilla/utils/atomWithStorage";

const keys = {
  // === File Operations ===
  OPEN_FILE: { name: "keybindings.openFile", keys: "mod+o" },
  SAVE_FILE: { name: "keybindings.saveFile", keys: "mod+s" },
  APP_RELOAD: { name: "keybindings.appReload", keys: "mod+r" },
  EXIT_APP: { name: "keybindings.exitApp", keys: "mod+q" },
  SPOTLIGHT_SEARCH: { name: "keybindings.spotlightSearch", keys: "mod+k" },

  // === Board Tabs ===
  NEW_BOARD_TAB: { name: "keybindings.newBoardTab", keys: "mod+t" },
  CLOSE_BOARD_TAB: { name: "keybindings.closeBoardTab", keys: "mod+w" },
  CYCLE_BOARD_TABS: { name: "keybindings.cycleBoardTabs", keys: "ctrl+tab" },
  REVERSE_CYCLE_BOARD_TABS: { name: "keybindings.reverseCycleBoardTabs", keys: "ctrl+shift+tab" },

  BOARD_TAB_ONE: { name: "keybindings.boardTabOne", keys: "ctrl+alt+1" },
  BOARD_TAB_TWO: { name: "keybindings.boardTabTwo", keys: "ctrl+alt+2" },
  BOARD_TAB_THREE: { name: "keybindings.boardTabThree", keys: "ctrl+alt+3" },
  BOARD_TAB_FOUR: { name: "keybindings.boardTabFour", keys: "ctrl+alt+4" },
  BOARD_TAB_FIVE: { name: "keybindings.boardTabFive", keys: "ctrl+alt+5" },
  BOARD_TAB_SIX: { name: "keybindings.boardTabSix", keys: "ctrl+alt+6" },
  BOARD_TAB_SEVEN: { name: "keybindings.boardTabSeven", keys: "ctrl+alt+7" },
  BOARD_TAB_EIGHT: { name: "keybindings.boardTabEight", keys: "ctrl+alt+8" },
  BOARD_TAB_LAST: { name: "keybindings.boardTabLast", keys: "ctrl+alt+9" },

  // === Mode Switching ===
  PLAY_BOARD: { name: "keybindings.playBoard", keys: "mod+1" },
  ANALYZE_BOARD: { name: "keybindings.analyzeBoard", keys: "mod+2" },
  TRAIN_BOARD: { name: "keybindings.trainBoard", keys: "mod+3" },

  IMPORT_BOARD: { name: "keybindings.importBoard", keys: "mod+i" },

  // === Move Navigation ===
  NEXT_MOVE: { name: "keybindings.nextMove", keys: "arrowright" },
  PREVIOUS_MOVE: { name: "keybindings.previousMove", keys: "arrowleft" },
  GO_TO_BRANCH_START: { name: "keybindings.goToBranchStart", keys: "arrowup" },
  GO_TO_BRANCH_END: { name: "keybindings.goToBranchEnd", keys: "arrowdown" },
  GO_TO_START: { name: "keybindings.goToStart", keys: "shift+arrowup" },
  GO_TO_END: { name: "keybindings.goToEnd", keys: "shift+arrowdown" },
  NEXT_BRANCHING: { name: "keybindings.nextBranching", keys: "shift+arrowright" },
  PREVIOUS_BRANCHING: { name: "keybindings.previousBranching", keys: "shift+arrowleft" },
  NEXT_BRANCH: { name: "keybindings.nextBranch", keys: "n" },
  PREVIOUS_BRANCH: { name: "keybindings.previousBranch", keys: "p" },

  // === Annotations ===
  ANNOTATION_BRILLIANT: { name: "keybindings.annotationBrilliant", keys: "ctrl+1" },
  ANNOTATION_GOOD: { name: "keybindings.annotationGood", keys: "ctrl+2" },
  ANNOTATION_INTERESTING: { name: "keybindings.annotationInteresting", keys: "ctrl+3" },
  ANNOTATION_DUBIOUS: { name: "keybindings.annotationDubious", keys: "ctrl+4" },
  ANNOTATION_MISTAKE: { name: "keybindings.annotationMistake", keys: "ctrl+5" },
  ANNOTATION_BLUNDER: { name: "keybindings.annotationBlunder", keys: "ctrl+6" },

  DELETE_MOVE: { name: "keybindings.deleteMove", keys: "delete" },

  // === Views ===
  PRACTICE_TAB: { name: "keybindings.practiceTab", keys: "shift+p" },
  ANALYSIS_TAB: { name: "keybindings.analysisTab", keys: "shift+a" },
  DATABASE_TAB: { name: "keybindings.databaseTab", keys: "shift+b" },
  ANNOTATE_TAB: { name: "keybindings.annotateTab", keys: "shift+d" },
  INFO_TAB: { name: "keybindings.infoTab", keys: "shift+i" },

  // === Toggles / Tools ===
  TOGGLE_EVAL_BAR: { name: "keybindings.toggleEvalBar", keys: "e" },
  TOGGLE_ALL_ENGINES: { name: "keybindings.toggleAllEngines", keys: "shift+e" },
  TOGGLE_BLUR: { name: "keybindings.toggleBlur", keys: "mod+shift+b" },

  SWAP_ORIENTATION: { name: "keybindings.swapOrientation", keys: "f" },
  CLEAR_SHAPES: { name: "keybindings.clearShapes", keys: "mod+l" },
  BLINDFOLD: { name: "keybindings.blindfold", keys: "mod+b" },

  // === Game Browsing ===
  PREVIOUS_GAME: { name: "keybindings.previousGame", keys: "pageup" },
  NEXT_GAME: { name: "keybindings.nextGame", keys: "pagedown" },
};

export const keyMapAtom = atomWithStorage("keybindings", keys, defaultStorage(keys, localStorage));

function defaultStorage<T>(keys: T, storage: SyncStringStorage): SyncStorage<T> {
  return {
    getItem(key, initialValue) {
      const storedValue = storage.getItem(key);
      if (storedValue === null) {
        return initialValue;
      }
      const parsed = JSON.parse(storedValue);
      for (const key in keys) {
        if (!(key in parsed)) {
          parsed[key] = keys[key];
        }
      }
      return parsed;
    },
    setItem(key, value) {
      storage.setItem(key, JSON.stringify(value));
    },
    removeItem(key) {
      storage.removeItem(key);
    },
  };
}
