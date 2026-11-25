import { Group, Panel } from "react-resizable-panels";

import { useDiffStore } from "@/store/diff";
import { useIsReviewable, useSelectionStore } from "@/store/selection";
import { ErrorText } from "@/ui/components/ErrorText";
import { Handle } from "@/ui/components/Handle";
import { KeyBadge } from "@/ui/components/KeyBadge";
import { StatusBar } from "@/ui/components/StatusBar";
import { DiffSummary } from "@/ui/widgets/DiffSummary";
import { DiffView } from "@/ui/widgets/DiffView";
import { FileList } from "@/ui/widgets/FileList";
import { TrashZone } from "@/ui/widgets/TrashZone";

export function DetailsPane() {
  const selectedId = useSelectionStore((s) => s.selection?.change);

  return (
    <div className="relative h-full">
      {selectedId ? <Details /> : <div className="p-2 text-muted">Select a change in the graph.</div>}
      <TrashZone />
    </div>
  );
}

function Details() {
  const selectedId = useSelectionStore((s) => s.selection?.change);
  const files = useDiffStore((s) => s.files);
  const detailsError = useDiffStore((s) => s.detailsError);
  const reviewable = useIsReviewable();

  return (
    <div className="flex h-full flex-col">
      {detailsError && <ErrorText>{detailsError}</ErrorText>}
      <div className="min-h-0 flex-1">
        <Group orientation="horizontal">
          <Panel defaultSize="256px" minSize="15%">
            <div className="h-full overflow-auto">
              <DiffSummary files={files} />
              <FileList files={files} reviewable={reviewable} />
            </div>
          </Panel>
          <Handle orientation="horizontal" />
          <Panel minSize="20%">
            <DiffView key={selectedId} files={files} reviewable={reviewable} />
          </Panel>
        </Group>
      </div>
      <StatusBar className="flex gap-6">
        <div className="flex gap-3">
          <span>
            <KeyBadge>j</KeyBadge> <KeyBadge>k</KeyBadge> navigate files
          </span>
          {reviewable && (
            <span>
              <KeyBadge>R</KeyBadge> review file
            </span>
          )}
          <span>
            <KeyBadge>c</KeyBadge> collapse file
          </span>
        </div>
        <div className="flex gap-3">
          <span>
            <KeyBadge>[</KeyBadge> <KeyBadge>]</KeyBadge> navigate hunks
          </span>
          {reviewable && (
            <>
              <span>
                <KeyBadge>u</KeyBadge> next unreviewed
              </span>
              <span>
                <KeyBadge>Space</KeyBadge> review hunk
              </span>
            </>
          )}
        </div>
      </StatusBar>
    </div>
  );
}
