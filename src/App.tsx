import { useEffect, useState } from "react";
import { Group, Panel } from "react-resizable-panels";

import { DragLayer } from "@/DragLayer";
import { errorMessage } from "@/error";
import { handleKey } from "@/keys";
import { RepoStatus, useRepoStore } from "@/store/repo";
import { useSettingsStore } from "@/store/settings";
import { ErrorText } from "@/ui/components/ErrorText";
import { Handle } from "@/ui/components/Handle";
import { DetailsPane } from "@/DetailsPane";
import { GraphPane } from "@/GraphPane";
import { HistoryPane } from "@/HistoryPane";
import { RunningNotice } from "@/ui/widgets/RunningNotice";
import { TerminalPane } from "@/TerminalPane";
import { WelcomePage } from "@/WelcomePage";

export function App() {
  const loaded = useSettingsStore((s) => s.loaded);
  const repoStatus = useRepoStore((s) => s.status);
  const repoFatal = useRepoStore((s) => s.fatal);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    useSettingsStore
      .getState()
      .init()
      .then(() => useRepoStore.getState().start())
      .catch((e) => setStartupError(errorMessage(e)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleKey(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  const fatal = startupError ?? repoFatal;
  if (fatal) return <ErrorText>{fatal}</ErrorText>;
  if (!loaded || repoStatus === RepoStatus.Pending) return null;
  if (repoStatus === RepoStatus.Welcome) return <WelcomePage />;

  return (
    <>
      <DragLayer>
        <Group orientation="vertical" className="h-full">
          <Panel defaultSize="62%" minSize="15%">
            <Group orientation="horizontal">
              <Panel defaultSize="384px" minSize="15%">
                <GraphPane />
              </Panel>
              <Handle orientation="horizontal" />
              <Panel minSize="15%">
                <DetailsPane />
              </Panel>
            </Group>
          </Panel>
          <Handle orientation="vertical" />
          <Panel minSize="10%">
            <Group orientation="horizontal">
              <Panel defaultSize="62%" minSize="20%">
                <TerminalPane />
              </Panel>
              <Handle orientation="horizontal" />
              <Panel minSize="15%">
                <HistoryPane />
              </Panel>
            </Group>
          </Panel>
        </Group>
      </DragLayer>
      <RunningNotice />
    </>
  );
}
