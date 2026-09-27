import { useEffect } from "react";
import { useSnackbar } from "./Snackbar";
import { AlertCircle, RotateCcw } from "lucide-react";
import type { FriendlyError } from "../lib/types";
export default function ErrorAlert({
  error,
  onRetry,
  retryLabel = "Reconnect to job",
}: {
  error: FriendlyError;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const { notify, dismiss } = useSnackbar();
  useEffect(() => {
    const id = notify({
      id: `error:${error.kind}:${error.title}:${error.message}`,
      tone: error.kind === "nothing-changed" ? "info" : "error",
      title: error.title,
      message: error.message,
    });
    return () => dismiss(id);
  }, [error.kind, error.title, error.message, notify, dismiss]);
  return (
    <div
      className={
        "error-alert" +
        (error.kind === "nothing-changed" ? " notice-alert" : "")
      }
      role="alert"
    >
      <AlertCircle size={19} />
      <div>
        <h3>{error.title}</h3>
        <p>{error.message}</p>
        {onRetry && error.retryable ? (
          <button className="text-button" onClick={onRetry}>
            <RotateCcw size={13} />
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
