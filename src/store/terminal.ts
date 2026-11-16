import { create } from "zustand";

interface TerminalState {
  maximized: boolean;
  focusTerminal: () => void;
  insertIntoTerminal: (text: string) => void;
  setFocusTerminal: (focus: () => void) => void;
  setInsertIntoTerminal: (insert: (text: string) => void) => void;
  toggleMaximized: () => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  maximized: false,
  focusTerminal: () => {},
  insertIntoTerminal: () => {},
  setFocusTerminal: (focusTerminal) => set({ focusTerminal }),
  setInsertIntoTerminal: (insertIntoTerminal) => set({ insertIntoTerminal }),
  toggleMaximized: () => set((s) => ({ maximized: !s.maximized })),
}));
