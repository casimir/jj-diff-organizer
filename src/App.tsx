import { useEffect, useState } from "react";
import { Group, Panel, usePanelRef } from "react-resizable-panels";

import { errorMessage } from "@/api";
import { DetailsPane } from "@/components/DetailsPane";
import { DragLayer } from "@/components/DragLayer";
import { GraphPane } from "@/components/GraphPane";
import { Handle } from "@/components/Handle";
import { HistoryPane } from "@/components/HistoryPane";
import { ErrorText } from "@/components/ui/ErrorText";
import { SettingsDialog } from "@/components/SettingsDialog";
import { TerminalPane } from "@/components/TerminalPane";
import { WelcomePage } from "@/components/WelcomePage";
import { handleKey } from "@/keys";
import { RepoStatus, useRepoStore } from "@/store/repo";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";

export function App() {
  const loaded = useSettingsStore((s) => s.loaded);
  const repoStatus = useRepoStore((s) => s.status);
  const repoFatal = useRepoStore((s) => s.fatal);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const [startupError, setStartupError] = useState<string | null>(null);
  const historyPanel = usePanelRef();

  useEffect(() => {
    useUiStore.getState().setShowHistory(() => {
      if (historyPanel.current?.isCollapsed()) historyPanel.current.expand();
    });
  }, [historyPanel]);

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
              <Panel panelRef={historyPanel} collapsible collapsedSize="0%" minSize="15%">
                <HistoryPane />
              </Panel>
            </Group>
          </Panel>
        </Group>
      </DragLayer>
      {settingsOpen && <SettingsDialog />}
    </>
  );
}
