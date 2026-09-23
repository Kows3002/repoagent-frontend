import { sessionRequest } from "./auth";
import { ApiError, friendlyError } from "./errors";
export type PreviewStatus = "idle" | "building" | "ready" | "unsupported" | "failed";
export interface PreviewResult { status: PreviewStatus; message?: string; project_root?: string; before_url?: string; after_url?: string; expires_at?: number }
export function normalizePreview(value: unknown): PreviewResult {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const states = ["idle", "building", "ready", "unsupported", "failed"];
  if (!states.includes(String(data.status))) throw new ApiError(friendlyError("service-unavailable"));
  const result: PreviewResult = {status: data.status as PreviewStatus};
  for (const key of ["message", "project_root", "before_url", "after_url"] as const) {
    if (typeof data[key] === "string") result[key] = data[key];
  }
  if (typeof data.expires_at === "number") result.expires_at = data.expires_at;
  if (result.status === "ready" && (!isPreviewUrl(result.before_url) || !isPreviewUrl(result.after_url))) throw new ApiError(friendlyError("service-unavailable"));
  return result;
}
export function isPreviewUrl(value?: string): boolean {
  if (!value) return false;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
export function previewPageUrl(base: string, path: string): string | null {
  if (!isPreviewUrl(base) || !path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f]/.test(path)) return null;
  try {
    const root = new URL(base);
    const url = new URL(path.slice(1) || "./", root.href.endsWith("/") ? root.href : root.href + "/");
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return null;
    return url.href;
  } catch { return null; }
}
export async function fetchPreview(id: string | number, signal: AbortSignal): Promise<PreviewResult> {
  return normalizePreview(await sessionRequest("/jobs/" + encodeURIComponent(String(id)) + "/preview", {signal}, "poll"));
}
export async function startPreview(id: string | number, signal: AbortSignal): Promise<PreviewResult> {
  return normalizePreview(await sessionRequest("/jobs/" + encodeURIComponent(String(id)) + "/preview", {method: "POST", signal}, "create"));
}
