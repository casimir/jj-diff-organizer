import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { EngineName } from "@/types";

const toTheme = (value: string): Theme | null => Object.values(Theme).find((t) => t === value) ?? null;

export function SettingsDialog() {
  const engine = useSettingsStore((s) => s.engine);
  const { update } = useSettingsStore.getState();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={() => useUiStore.getState().setSettingsOpen(false)}
    >
      <div
        className="w-96 space-y-3 rounded bg-zinc-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Settings</h2>
        <label className="block">
          Terminal engine
          <select
            className="mt-1 block w-full rounded bg-zinc-800 p-1"
            value={engine}
            onChange={(e) => void update({ engine: e.target.value as EngineName })}
          >
            <option value={EngineName.Xterm}>xterm.js</option>
            <option value={EngineName.Ghostty}>ghostty-web</option>
          </select>
        </label>
        <button
          className="rounded bg-zinc-700 px-3 py-1 hover:bg-zinc-600"
          onClick={() => useUiStore.getState().setSettingsOpen(false)}
        >
          Close
        </button>
      </div>
    </div>
  );
}
