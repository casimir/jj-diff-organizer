import { useRepoStore } from "@/store/repo";
import { useSettingsStore } from "@/store/settings";

export function WelcomePage() {
  const recentRepos = useSettingsStore((s) => s.recentRepos);
  const error = useRepoStore((s) => s.error);
  const opening = useRepoStore((s) => s.opening);

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-4 p-8">
      <h1 className="text-lg font-semibold">Open a repository</h1>
      <div>
        <button
          className="rounded bg-selected px-3 py-1 hover:bg-strong disabled:opacity-50"
          disabled={opening}
          onClick={() => void useRepoStore.getState().pick()}
        >
          Open repository…
        </button>
      </div>
      {error && <pre className="whitespace-pre-wrap text-danger">{error}</pre>}
      {recentRepos.length > 0 && (
        <section className="min-h-0 flex-1 overflow-auto">
          <h2 className="mb-1 text-muted">Recent repositories</h2>
          {recentRepos.map((root) => (
            <div key={root} className="flex items-center border-b border-line hover:bg-subtle">
              <button
                className="min-w-0 flex-1 truncate px-2 py-1 text-left font-mono disabled:opacity-50"
                disabled={opening}
                title={root}
                onClick={() => void useRepoStore.getState().open(root)}
              >
                {root}
              </button>
              <button
                className="px-2 py-1 text-muted hover:text-danger"
                aria-label={`Remove ${root} from recent repositories`}
                onClick={() => void useSettingsStore.getState().forgetRepo(root)}
              >
                ✕
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
