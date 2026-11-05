import TimeAgo from "react-timeago";

import { ErrorText } from "@/components/ui/ErrorText";
import { KeyBadge } from "@/components/ui/KeyBadge";
import { ListRow } from "@/components/ui/ListRow";
import { StatusBar } from "@/components/ui/StatusBar";
import { MOD } from "@/keys";
import { useHistoryStore } from "@/store/history";

export function HistoryPane() {
  const entries = useHistoryStore((s) => s.entries);
  const error = useHistoryStore((s) => s.error);
  const selectedKey = useHistoryStore((s) => s.selectedKey);

  return (
    <div data-pane="history" tabIndex={-1} className="flex h-full flex-col outline-none">
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-auto">
        <div>
          {entries.map(({ id, time, command, gui, failed, detail }) => {
            const selected = id === selectedKey;
            return (
              <div key={id} className="border-b border-line">
                <ListRow
                  selected={selected}
                  className="flex cursor-default gap-2 px-2 py-1"
                  onClick={() => useHistoryStore.getState().select(selected ? null : id)}
                >
                  <span className={gui ? "text-accent" : "text-muted"}>
                    {gui ? "gui" : "op"}
                  </span>
                  <span className={`min-w-0 flex-1 truncate font-mono ${failed ? "text-danger" : ""}`}>
                    {command}
                  </span>
                  {failed && <span className="text-danger">failed</span>}
                  <span className="text-muted">
                    <TimeAgo date={time} title={new Date(time).toLocaleString()} />
                  </span>
                </ListRow>
                {selected && (
                  <pre className="px-2 pb-2 font-mono whitespace-pre-wrap text-dim">{detail}</pre>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <StatusBar>
        <KeyBadge>{`${MOD}+3`}</KeyBadge> focus
      </StatusBar>
    </div>
  );
}
