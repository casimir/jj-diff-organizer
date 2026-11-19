import * as api from "@/api";
import { useDiffStore } from "@/store/diff";
import { useGraphStore } from "@/store/graph";
import { useHistoryStore } from "@/store/history";
import { useSelectionStore } from "@/store/selection";
import type { RepoInfo } from "@/types";

const refreshAll = () =>
  Promise.all([
    useGraphStore.getState().refresh(),
    useDiffStore.getState().refresh(),
    useHistoryStore.getState().refresh(),
  ]);

/** Listeners live as long as the window: a window shows one repository. */
export async function startSync(info: RepoInfo): Promise<void> {
  await Promise.all([useGraphStore.getState().init(info), useHistoryStore.getState().refresh()]);
  useSelectionStore.getState().selectWorkingCopy();
  await Promise.all([
    api.onRepoChanged(refreshAll),
    api.onReviewChanged((ids) => void useDiffStore.getState().reloadMarks(ids)),
  ]);
}
