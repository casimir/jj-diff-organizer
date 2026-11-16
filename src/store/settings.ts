import { create } from "zustand";

import * as api from "@/api";
import type { Settings } from "@/types";

const DEFAULTS: Settings = { theme: null, recentRepos: [] };
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
    const settings = withDefaults(await api.loadSettings());
    await api.applyTheme(settings.theme);
    set({ ...settings, loaded: true });
    await api.onSettingsChanged((saved) => {
      const changed = withDefaults(saved);
      set(changed);
      void api.applyTheme(changed.theme);
    });
  },
  update: async (patch) => {
    set(patch);
    const { theme, recentRepos } = get();
    await api.applyTheme(theme);
    await api.saveSettings({ theme, recentRepos });
  },
  rememberRepo: (root) =>
    get().update({
      recentRepos: [root, ...get().recentRepos.filter((r) => r !== root)].slice(0, MAX_RECENT_REPOS),
    }),
  forgetRepo: (root) => get().update({ recentRepos: get().recentRepos.filter((r) => r !== root) }),
}));
