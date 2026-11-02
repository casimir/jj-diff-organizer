import { getCurrentWindow } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";
import { create } from "zustand";

import { Theme } from "@/types";

interface Settings {
  theme: Theme | null;
}

const DEFAULTS: Settings = { theme: null };
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
    const theme = saved?.theme ?? DEFAULTS.theme;
    await getCurrentWindow().setTheme(theme);
    set({ theme, loaded: true });
  },
  update: async (patch) => {
    set(patch);
    const { theme } = get();
    await getCurrentWindow().setTheme(theme);
    const store = await load(STORE_FILE);
    await store.set("settings", { theme });
  },
}));
