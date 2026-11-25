import * as api from "@/api";
import { useDiffStore } from "@/store/diff";
import { useGraphStore } from "@/store/graph";
import { useHistoryStore } from "@/store/history";
import { useSelectionStore } from "@/store/selection";
import type { RepoInfo } from "@/types";

const refreshAll = async () => {
  const history = useHistoryStore.getState().refresh();
  await useGraphStore.getState().refresh();
  await Promise.all([useDiffStore.getState().refresh(), history]);
};

/** Listeners live as long as the window: a window shows one repository. */
export async function startSync(info: RepoInfo): Promise<void> {
  await Promise.all([useGraphStore.getState().init(info), useHistoryStore.getState().refresh()]);
  useSelectionStore.getState().selectWorkingCopy();
  await Promise.all([
    api.onRepoChanged(refreshAll),
    api.onReviewChanged((ids) => void useDiffStore.getState().reloadMarks(ids)),
  ]);
}
