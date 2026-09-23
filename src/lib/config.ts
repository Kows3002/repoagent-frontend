interface ApiEnvironment {
  VITE_API_URL?: string;
  VITE_API_BASE_URL?: string;
}

// Shared by the browser client and Vite's connection policy so they cannot
// disagree about the API host. An explicit empty URL selects same-origin calls.
export function resolveApiBaseUrl(env: ApiEnvironment = {}): string {
  const value = (env.VITE_API_URL ?? env.VITE_API_BASE_URL ?? "").trim();
  if (!value) return "";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("VITE_API_URL must be an absolute HTTP(S) URL or empty for a same-origin proxy.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("VITE_API_URL must be an HTTP(S) URL without credentials, a query, or a fragment.");
  }
  return url.href.replace(/\/+$/, "");
}
