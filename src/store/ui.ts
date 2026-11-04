import { create } from "zustand";

interface UiState {
  shellMaximized: boolean;
  settingsOpen: boolean;
  focusTerminal: () => void;
  insertIntoTerminal: (text: string) => void;
  showHistory: () => void;
  setShowHistory: (show: () => void) => void;
  setFocusTerminal: (focus: () => void) => void;
  setInsertIntoTerminal: (insert: (text: string) => void) => void;
  toggleShellMaximized: () => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  shellMaximized: false,
  settingsOpen: false,
  focusTerminal: () => {},
  insertIntoTerminal: () => {},
  showHistory: () => {},
  setShowHistory: (showHistory) => set({ showHistory }),
  setFocusTerminal: (focusTerminal) => set({ focusTerminal }),
  setInsertIntoTerminal: (insertIntoTerminal) => set({ insertIntoTerminal }),
  toggleShellMaximized: () => set((s) => ({ shellMaximized: !s.shellMaximized })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
