import { create } from "zustand";

import * as api from "@/api";
import type { Entry } from "@/types";

interface HistoryState {
  entries: Entry[];
  error: string | null;
  selectedKey: string | null;
  select: (key: string | null) => void;
  refresh: () => Promise<void>;
}

let latestRefresh = 0;

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: [],
  error: null,
  selectedKey: null,
  select: (selectedKey) => set({ selectedKey }),
  refresh: async () => {
    const seq = ++latestRefresh;
    try {
      const entries = await api.history();
      if (seq === latestRefresh) set({ entries, error: null });
    } catch (e) {
      if (seq === latestRefresh) set({ error: api.errorMessage(e) });
    }
  },
}));
