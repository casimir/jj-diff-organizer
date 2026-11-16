import type { JjCommand } from "@/core/command";
import { errorMessage } from "@/error";
import { useGraphStore } from "@/store/graph";
import { useHistoryStore } from "@/store/history";
import { useRunStore } from "@/store/run";

export async function execute({ args, hunk }: JjCommand): Promise<void> {
  try {
    const run = await useRunStore.getState().run(args, hunk);
    if (run.exit_code !== 0) {
      useHistoryStore.getState().select(`failure-${run.id}`);
    }
  } catch (e) {
    useGraphStore.setState({ error: errorMessage(e) });
  }
}
