import { X } from "lucide-react";

import { Button, ButtonVariant } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { ListRow } from "@/components/ui/ListRow";
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
        <Button
          disabled={opening}
          onClick={() => void useRepoStore.getState().pick()}
        >
          Open repository…
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {recentRepos.length > 0 && (
        <section className="min-h-0 flex-1 overflow-auto">
          <h2 className="mb-1 text-muted">Recent repositories</h2>
          {recentRepos.map((root) => (
            <ListRow key={root} className="flex items-center border-b border-line">
              <Button
                variant={ButtonVariant.Ghost}
                className="min-w-0 flex-1 truncate py-1 text-left font-mono text-fg"
                disabled={opening}
                title={root}
                onClick={() => void useRepoStore.getState().open(root)}
              >
                {root}
              </Button>
              <Button
                variant={ButtonVariant.Ghost}
                aria-label={`Remove ${root} from recent repositories`}
                onClick={() => void useSettingsStore.getState().forgetRepo(root)}
              >
                <X className="size-4" />
              </Button>
            </ListRow>
          ))}
        </section>
      )}
    </div>
  );
}
