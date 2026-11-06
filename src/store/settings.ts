import { getCurrentWindow } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";
import { create } from "zustand";

import { Theme } from "@/types";

interface Settings {
  theme: Theme | null;
  recentRepos: string[];
}

const DEFAULTS: Settings = { theme: null, recentRepos: [] };
const STORE_FILE = "settings.json";
const STORE_KEY = "settings";
const MAX_RECENT_REPOS = 10;

interface SettingsState extends Settings {
  loaded: boolean;
  init: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  rememberRepo: (root: string) => Promise<void>;
  forgetRepo: (root: string) => Promise<void>;
}

const withDefaults = (saved: Partial<Settings> | undefined): Settings => ({
  theme: saved?.theme ?? DEFAULTS.theme,
  recentRepos: saved?.recentRepos ?? DEFAULTS.recentRepos,
});

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  init: async () => {
    const store = await load(STORE_FILE);
    const settings = withDefaults(await store.get<Partial<Settings>>(STORE_KEY));
    await getCurrentWindow().setTheme(settings.theme);
    set({ ...settings, loaded: true });
    await store.onKeyChange<Partial<Settings>>(STORE_KEY, (saved) => {
      const changed = withDefaults(saved);
      set(changed);
      void getCurrentWindow().setTheme(changed.theme);
    });
  },
  update: async (patch) => {
    set(patch);
    const { theme, recentRepos } = get();
    await getCurrentWindow().setTheme(theme);
    const store = await load(STORE_FILE);
    await store.set(STORE_KEY, { theme, recentRepos });
  },
  rememberRepo: (root) =>
    get().update({
      recentRepos: [root, ...get().recentRepos.filter((r) => r !== root)].slice(0, MAX_RECENT_REPOS),
    }),
  forgetRepo: (root) => get().update({ recentRepos: get().recentRepos.filter((r) => r !== root) }),
}));
