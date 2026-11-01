import { create } from "zustand";

interface UiState {
  shellMaximized: boolean;
  settingsOpen: boolean;
  focusTerminal: () => void;
  showHistory: () => void;
  setShowHistory: (show: () => void) => void;
  setFocusTerminal: (focus: () => void) => void;
  toggleShellMaximized: () => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  shellMaximized: false,
  settingsOpen: false,
  focusTerminal: () => {},
  showHistory: () => {},
  setShowHistory: (showHistory) => set({ showHistory }),
  setFocusTerminal: (focusTerminal) => set({ focusTerminal }),
  toggleShellMaximized: () => set((s) => ({ shellMaximized: !s.shellMaximized })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
