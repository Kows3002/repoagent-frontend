export function isValidGitHubUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return false;
    const match = url.pathname.match(
      /^\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}))\/([a-zA-Z0-9_.-]+)\/?$/,
    );
    return Boolean(match && ![".", "..", ".git"].includes(match[2]));
  } catch {
    return false;
  }
}
