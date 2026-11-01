import { load } from "@tauri-apps/plugin-store";
import { create } from "zustand";

import { EngineName } from "@/types";

interface Settings {
  engine: EngineName;
}

const DEFAULTS: Settings = { engine: EngineName.Xterm };
const STORE_FILE = "settings.json";

interface SettingsState extends Settings {
  loaded: boolean;
  init: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  init: async () => {
    const store = await load(STORE_FILE);
    const saved = await store.get<Partial<Settings>>("settings");
    set({ engine: saved?.engine ?? DEFAULTS.engine, loaded: true });
  },
  update: async (patch) => {
    set(patch);
    const store = await load(STORE_FILE);
    await store.set("settings", { engine: get().engine });
  },
}));
