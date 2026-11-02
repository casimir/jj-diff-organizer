import { useEffect, useState } from "react";
import { Group, Panel, usePanelRef } from "react-resizable-panels";

import { errorMessage } from "@/api";
import { DetailsPane } from "@/components/DetailsPane";
import { DragLayer } from "@/components/DragLayer";
import { GraphPane } from "@/components/GraphPane";
import { Handle } from "@/components/Handle";
import { HistoryPane } from "@/components/HistoryPane";
import { SettingsDialog } from "@/components/SettingsDialog";
import { TerminalPane } from "@/components/TerminalPane";
import { handleKey } from "@/keys";
import { useSettingsStore } from "@/store/settings";
import { startSync } from "@/store/sync";
import { useUiStore } from "@/store/ui";

export function App() {
  const loaded = useSettingsStore((s) => s.loaded);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const [startupError, setStartupError] = useState<string | null>(null);
  const historyPanel = usePanelRef();

  useEffect(() => {
    useUiStore.getState().setShowHistory(() => {
      if (historyPanel.current?.isCollapsed()) historyPanel.current.expand();
    });
  }, [historyPanel]);

  useEffect(() => {
    useSettingsStore.getState().init().catch((e) => setStartupError(errorMessage(e)));
    const stopSync = startSync().catch((e) => {
      setStartupError(errorMessage(e));
      return () => {};
    });
    return () => void stopSync.then((stop) => stop());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleKey(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  if (startupError) return <pre className="p-4 whitespace-pre-wrap text-danger">{startupError}</pre>;
  if (!loaded) return null;

  return (
    <>
      <DragLayer>
        <Group orientation="vertical" className="h-full">
          <Panel defaultSize="62%" minSize="15%">
            <Group orientation="horizontal">
              <Panel defaultSize="50%" minSize="15%">
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
