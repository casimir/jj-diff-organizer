import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { Theme } from "@/types";

const SYSTEM = "system";

const toTheme = (value: string): Theme | null => Object.values(Theme).find((t) => t === value) ?? null;

export function SettingsDialog() {
  const theme = useSettingsStore((s) => s.theme);
  const { update } = useSettingsStore.getState();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim"
      onClick={() => useUiStore.getState().setSettingsOpen(false)}
    >
      <div
        className="w-96 space-y-3 rounded bg-canvas p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Settings</h2>
        <label className="block">
          Theme
          <select
            className="mt-1 block w-full rounded bg-subtle p-1"
            value={theme ?? SYSTEM}
            onChange={(e) => void update({ theme: toTheme(e.target.value) })}
          >
            <option value={SYSTEM}>System</option>
            <option value={Theme.Light}>Light</option>
            <option value={Theme.Dark}>Dark</option>
          </select>
        </label>
        <button
          className="rounded bg-selected px-3 py-1 hover:bg-strong"
          onClick={() => useUiStore.getState().setSettingsOpen(false)}
        >
          Close
        </button>
      </div>
    </div>
  );
}
