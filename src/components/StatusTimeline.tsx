import { Check, CircleCheck, Clock3, FileCode2, Search, X } from "lucide-react";
import type { JobStatus } from "../lib/types";
const stages = [
  { key: "queued", title: "Queued", Icon: Clock3 },
  { key: "analyzing", title: "Analyzing Repository", Icon: Search },
  { key: "generating", title: "Generating Patch", Icon: FileCode2 },
  { key: "completed", title: "Completed", Icon: CircleCheck },
] as const;
export default function StatusTimeline({ status }: { status?: JobStatus }) {
  const current = stages.findIndex((stage) => stage.key === status);
  return (
    <ol className="status-timeline" aria-label="Job progress">
      {stages.map(({ key, title, Icon }, index) => {
        const done = current > index || status === "completed";
        const active = current === index && status !== "completed";
        const failed = status === "failed" && index === 3;
        return (
          <li
            key={key}
            className={
              done
                ? "stage-done"
                : active
                  ? "stage-active"
                  : failed
                    ? "stage-failed"
                    : "stage-waiting"
            }
            aria-current={active ? "step" : undefined}
          >
            <span className="stage-icon">
              {done ? (
                <Check size={16} />
              ) : failed ? (
                <X size={16} />
              ) : (
                <Icon size={16} />
              )}
            </span>
            <span className="stage-name">{failed ? "Failed" : title}</span>
            <span className="sr-only">
              {done
                ? "finished"
                : active
                  ? "in progress"
                  : failed
                    ? "job failed"
                    : "pending"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
