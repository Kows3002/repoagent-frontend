import { useCallback, useEffect, useRef, useState } from "react";
import { getGitHubSession, hasSessionCsrfToken, SESSION_EXPIRED_EVENT, setSessionCsrfToken, signOutGitHub } from "../lib/auth";
import { friendlyError, isAbortError, mapError } from "../lib/errors";
import type { FriendlyError, User } from "../lib/types";

function callbackError(): FriendlyError | null {
  const code = new URL(window.location.href).searchParams.get("auth_error");
  if (!code) return null;
  return {
    kind: "authentication-required",
    title: code === "access_denied" ? "GitHub connection was canceled" : "GitHub connection could not be completed",
    message: code === "access_denied" ? "Sign in when you are ready to connect your repositories." : "Please sign in with GitHub again to continue.",
    retryable: false,
  };
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [csrfReady, setCsrfReady] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(callbackError);
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);
  const signingOut = useRef(false);
  const callbackFailure = useRef(error);

  const refresh = useCallback(async (): Promise<void> => {
    if (signingOut.current) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const current = ++version.current;
    setLoading(true);
    try {
      const session = await getGitHubSession(request.signal);
      if (current !== version.current || request.signal.aborted) return;
      setUser(session.user);
      setConfigured(session.configured);
      setCsrfReady(hasSessionCsrfToken());
      setError(session.authenticated ? null : callbackFailure.current);
      callbackFailure.current = null;
    } catch (failure) {
      if (current !== version.current || request.signal.aborted || isAbortError(failure)) return;
      setSessionCsrfToken(null);
      setUser(null);
      setCsrfReady(false);
      setError(mapError(failure, undefined, "auth"));
    } finally {
      if (current === version.current && !request.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const location = new URL(window.location.href);
    if (location.searchParams.has("auth_error")) {
      location.searchParams.delete("auth_error");
      window.history.replaceState(window.history.state, "", `${location.pathname}${location.search}${location.hash}`);
    }
    const expired = () => {
      controller.current?.abort();
      version.current += 1;
      signingOut.current = false;
      setSessionCsrfToken(null);
      setUser(null);
      setLoading(false);
      setLoggingOut(false);
      setCsrfReady(false);
      setError(friendlyError("session-expired"));
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    void refresh();
    return () => {
      version.current += 1;
      controller.current?.abort();
      window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
    };
  }, [refresh]);

  const signOut = useCallback(async (): Promise<boolean> => {
    if (signingOut.current) return false;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const current = ++version.current;
    signingOut.current = true;
    setLoggingOut(true);
    setError(null);
    try {
      await signOutGitHub(request.signal);
      if (current !== version.current || request.signal.aborted) return false;
      setUser(null);
      setCsrfReady(false);
      setError(null);
      return true;
    } catch (failure) {
      if (current === version.current && !request.signal.aborted && !isAbortError(failure)) setError(mapError(failure, undefined, "auth"));
      return false;
    } finally {
      if (current === version.current && !request.signal.aborted) {
        signingOut.current = false;
        setLoggingOut(false);
      }
    }
  }, []);

  return { user, loading, loggingOut, configured, csrfReady, error, refresh, signOut };
}

