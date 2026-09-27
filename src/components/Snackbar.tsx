import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export interface SnackbarMessage {
  id?: string;
  title?: string;
  message: string;
  tone: "success" | "error" | "info";
}

type Notification = SnackbarMessage & { id: string };
interface SnackbarContextValue {
  notify: (notification: SnackbarMessage) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const fallback: SnackbarContextValue = {
  notify: (notification) => notification.id ?? "",
  dismiss: () => {},
  clear: () => {},
};
const SnackbarContext = createContext<SnackbarContextValue>(fallback);
const MAX_VISIBLE = 3;
const DISMISS_AFTER_MS = 6_000;

function SnackbarItem({
  notification,
  dismiss,
}: {
  notification: Notification;
  dismiss: (id: string) => void;
}) {
  const remaining = useRef(DISMISS_AFTER_MS);
  const hovered = useRef(false);
  const focused = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (notification.tone === "error" || paused) return;
    const startedAt = Date.now();
    const timeout = window.setTimeout(() => dismiss(notification.id), remaining.current);
    return () => {
      window.clearTimeout(timeout);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [notification.id, notification.tone, paused, dismiss]);

  const Icon = notification.tone === "error"
    ? AlertCircle
    : notification.tone === "success" ? CheckCircle2 : Info;

  return (
    <div
      className={`snackbar snackbar-${notification.tone}`}
      role={notification.tone === "error" ? "alert" : "status"}
      aria-atomic="true"
      onMouseEnter={() => {
        hovered.current = true;
        setPaused(true);
      }}
      onMouseLeave={() => {
        hovered.current = false;
        setPaused(focused.current);
      }}
      onFocusCapture={() => {
        focused.current = true;
        setPaused(true);
      }}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        focused.current = false;
        setPaused(hovered.current);
      }}
    >
      <Icon className="snackbar-icon" size={19} aria-hidden="true" />
      <div className="snackbar-copy">
        {notification.title ? <strong>{notification.title}</strong> : null}
        <p>{notification.message}</p>
      </div>
      <button
        type="button"
        className="snackbar-dismiss"
        aria-label={`Dismiss ${notification.title ?? "notification"}`}
        onClick={() => dismiss(notification.id)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const sequence = useRef(0);

  const dismiss = useCallback((id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    setNotifications([]);
  }, []);

  const notify = useCallback((notification: SnackbarMessage) => {
    const id = notification.id ?? `notification-${++sequence.current}`;
    setNotifications((current) => {
      if (current.some((item) => item.id === id)) return current;
      const next = [...current, { ...notification, id }];
      if (next.length <= MAX_VISIBLE) return next;
      // Keep persistent errors visible when a transient notification arrives.
      const transientIndex = next.findIndex((item) => item.tone !== "error");
      next.splice(transientIndex === -1 ? 0 : transientIndex, 1);
      return next;
    });
    return id;
  }, []);

  const value = useMemo(() => ({ notify, dismiss, clear }), [notify, dismiss, clear]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <section className="snackbar-region" aria-label="Notifications">
        {notifications.map((notification) => (
          <SnackbarItem key={notification.id} notification={notification} dismiss={dismiss} />
        ))}
      </section>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarContextValue {
  return useContext(SnackbarContext);
}
