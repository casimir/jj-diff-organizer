import TimeAgo from "react-timeago";
import { makeIntlFormatter } from "react-timeago/defaultFormatter";

const formatNarrow = makeIntlFormatter({ style: "narrow" });

export function RelativeTime({ ms, className }: { ms: number; className?: string }) {
  return (
    <span className={className}>
      <TimeAgo date={ms} formatter={formatNarrow} title={new Date(ms).toLocaleString()} />
    </span>
  );
}
