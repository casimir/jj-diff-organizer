import * as api from "@/api";
import { useGraphStore } from "@/store/graph";
import { useHistoryStore } from "@/store/history";

const refreshAll = () =>
  Promise.all([useGraphStore.getState().refresh(), useHistoryStore.getState().refresh()]);

export async function startSync(): Promise<() => void> {
  await Promise.all([useGraphStore.getState().init(), useHistoryStore.getState().refresh()]);
  return api.onRepoChanged(refreshAll);
}
