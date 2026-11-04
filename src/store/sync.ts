import * as api from "@/api";
import { useGraphStore } from "@/store/graph";
import { useHistoryStore } from "@/store/history";
import type { RepoInfo } from "@/types";

const refreshAll = () =>
  Promise.all([useGraphStore.getState().refresh(), useHistoryStore.getState().refresh()]);

/** Listeners live as long as the window: a window shows one repository. */
export async function startSync(info: RepoInfo): Promise<void> {
  await Promise.all([useGraphStore.getState().init(info), useHistoryStore.getState().refresh()]);
  await Promise.all([
    api.onRepoChanged(refreshAll),
    api.onReviewChanged((ids) => void useGraphStore.getState().reloadMarks(ids)),
  ]);
}
