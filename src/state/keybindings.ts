import { atomWithStorage } from "jotai/utils";
import type { SyncStorage, SyncStringStorage } from "jotai/vanilla/utils/atomWithStorage";
export type KeyDef = { name: string; keys: string };

// Base key definitions using platform-agnostic tokens (e.g., "mod", "alt", lowercase keys)
const baseKeys: Record<string, KeyDef> = {
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

  // === Copy/Paste & PGN Operations ===
  COPY_FEN: { name: "keybindings.copyFen", keys: "mod+shift+f" },
  COPY_PGN: { name: "keybindings.copyPgn", keys: "mod+shift+c" },
  PASTE_FEN: { name: "keybindings.pasteFen", keys: "mod+shift+v" },
  EXPORT_GAME: { name: "keybindings.exportGame", keys: "mod+e" },

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

  // === Move & Variation Management ===
  PROMOTE_VARIATION: { name: "keybindings.promoteVariation", keys: "ctrl+shift+up" },
  DELETE_VARIATION: { name: "keybindings.deleteVariation", keys: "ctrl+shift+delete" },
  ADD_VARIATION: { name: "keybindings.addVariation", keys: "ctrl+shift+v" },
  COLLAPSE_VARIATIONS: { name: "keybindings.collapseVariations", keys: "ctrl+shift+c" },

  // === Comment & Annotation ===
  ADD_COMMENT: { name: "keybindings.addComment", keys: "ctrl+c" },
  EDIT_COMMENT: { name: "keybindings.editComment", keys: "ctrl+e" },

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

  // === Engine Controls ===
  TOGGLE_ENGINE: { name: "keybindings.toggleEngine", keys: "mod+shift+e" },
  STOP_ENGINE: { name: "keybindings.stopEngine", keys: "escape" },
  ANALYZE_POSITION: { name: "keybindings.analyzePosition", keys: "mod+a" },
  INFINITE_ANALYSIS: { name: "keybindings.infiniteAnalysis", keys: "mod+shift+i" },

  // === Board & Position Setup ===
  FLIP_BOARD: { name: "keybindings.flipBoard", keys: "shift+f" },
  RESET_POSITION: { name: "keybindings.resetPosition", keys: "mod+0" },
  SETUP_POSITION: { name: "keybindings.setupPosition", keys: "mod+shift+s" },

  SWAP_ORIENTATION: { name: "keybindings.swapOrientation", keys: "f" },
  CLEAR_SHAPES: { name: "keybindings.clearShapes", keys: "mod+l" },
  BLINDFOLD: { name: "keybindings.blindfold", keys: "mod+b" },

  // === Search & Database ===
  FIND_POSITION: { name: "keybindings.findPosition", keys: "mod+f" },
  QUICK_SEARCH: { name: "keybindings.quickSearch", keys: "mod+shift+k" },
  FILTER_GAMES: { name: "keybindings.filterGames", keys: "mod+shift+f" },

  // === Window & Panel Management ===
  TOGGLE_SIDEBAR: { name: "keybindings.toggleSidebar", keys: "mod+\\" },
  TOGGLE_NOTATION: { name: "keybindings.toggleNotation", keys: "mod+n" },
  TOGGLE_FULLSCREEN: { name: "keybindings.toggleFullscreen", keys: "f11" },
  FOCUS_BOARD: { name: "keybindings.focusBoard", keys: "mod+shift+1" },
  FOCUS_MOVES: { name: "keybindings.focusMoves", keys: "mod+shift+2" },

  // === Training & Practice ===
  SHOW_HINT: { name: "keybindings.showHint", keys: "h" },
  RETRY_POSITION: { name: "keybindings.retryPosition", keys: "r" },
  MARK_AS_CORRECT: { name: "keybindings.markAsCorrect", keys: "ctrl+enter" },
  SKIP_POSITION: { name: "keybindings.skipPosition", keys: "ctrl+shift+right" },

  // === Repertoire Management ===
  ADD_TO_REPERTOIRE: { name: "keybindings.addToRepertoire", keys: "ctrl+shift+r" },
  REMOVE_FROM_REPERTOIRE: { name: "keybindings.removeFromRepertoire", keys: "ctrl+shift+d" },

  // === Quick Actions ===
  UNDO: { name: "keybindings.undo", keys: "mod+z" },
  REDO: { name: "keybindings.redo", keys: "mod+shift+z" },
  NEW_GAME: { name: "keybindings.newGame", keys: "mod+n" },
  DUPLICATE_TAB: { name: "keybindings.duplicateTab", keys: "mod+shift+t" },

  // === Settings & Help ===
  OPEN_SETTINGS: { name: "keybindings.openSettings", keys: "mod+," },
  SHOW_KEYBINDINGS: { name: "keybindings.showKeybindings", keys: "mod+/" },
  TOGGLE_HELP: { name: "keybindings.toggleHelp", keys: "shift+?" },

  // === Navigation Enhancement ===
  JUMP_TO_MOVE: { name: "keybindings.jumpToMove", keys: "mod+g" },
  GO_TO_POSITION_NUMBER: { name: "keybindings.goToPositionNumber", keys: "mod+shift+g" },

  // === Game Browsing ===
  PREVIOUS_GAME: { name: "keybindings.previousGame", keys: "pageup" },
  NEXT_GAME: { name: "keybindings.nextGame", keys: "pagedown" },
};

// Build initial key map: raw keys only
const keys: Record<string, KeyDef> = { ...baseKeys };

export const keyMapAtom = atomWithStorage("keybindings", keys, defaultStorage(keys, localStorage));

function defaultStorage<T extends Record<string, { name: string; keys: string }>>(
  keys: T,
  storage: SyncStringStorage,
): SyncStorage<T> {
  return {
    getItem(key, initialValue) {
      const storedValue = storage.getItem(key);
      if (storedValue === null) {
        return initialValue;
      }
      const parsed = JSON.parse(storedValue);
      for (const k in keys) {
        if (!(k in parsed)) {
          parsed[k] = keys[k];
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
