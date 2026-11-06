import { create } from "zustand";

interface UiState {
  shellMaximized: boolean;
  focusTerminal: () => void;
  insertIntoTerminal: (text: string) => void;
  showHistory: () => void;
  setShowHistory: (show: () => void) => void;
  setFocusTerminal: (focus: () => void) => void;
  setInsertIntoTerminal: (insert: (text: string) => void) => void;
  toggleShellMaximized: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  shellMaximized: false,
  focusTerminal: () => {},
  insertIntoTerminal: () => {},
  showHistory: () => {},
  setShowHistory: (showHistory) => set({ showHistory }),
  setFocusTerminal: (focusTerminal) => set({ focusTerminal }),
  setInsertIntoTerminal: (insertIntoTerminal) => set({ insertIntoTerminal }),
  toggleShellMaximized: () => set((s) => ({ shellMaximized: !s.shellMaximized })),
}));
