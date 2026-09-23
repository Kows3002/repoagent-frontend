export type DiffLineType = "add" | "remove" | "context" | "hunk" | "meta";

export interface DiffLine {
  type: DiffLineType;
  text: string;
  oldNumber?: number;
  newNumber?: number;
}

export interface DiffFile {
  filename: string;
  oldPath?: string;
  newPath?: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

/** Git quotes non-ASCII paths as UTF-8 octal bytes, in addition to C escapes. */
function decodeGitPath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path;

  const source = path.slice(1, -1);
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const escapes: Record<string, number> = {
    a: 7,
    b: 8,
    t: 9,
    n: 10,
    v: 11,
    f: 12,
    r: 13,
    '"': 34,
    "\\": 92,
  };

  for (let index = 0; index < source.length;) {
    if (source[index] === "\\" && index + 1 < source.length) {
      const octal = source.slice(index + 1).match(/^[0-7]{1,3}/)?.[0];
      if (octal) {
        bytes.push(Number.parseInt(octal, 8));
        index += octal.length + 1;
        continue;
      }
      const escaped = source[index + 1];
      bytes.push(
        ...(escaped in escapes ? [escapes[escaped]] : encoder.encode(escaped)),
      );
      index += 2;
      continue;
    }
    const character = String.fromCodePoint(source.codePointAt(index)!);
    bytes.push(...encoder.encode(character));
    index += character.length;
  }

  return new TextDecoder().decode(new Uint8Array(bytes));
}

function cleanPath(rawPath: string): string {
  // A tab, rather than a space, separates optional unified-diff timestamps.
  const path = decodeGitPath(rawPath.split("\t")[0]);
  return path.replace(/^[ab]\//, "");
}

function parseGitHeader(
  line: string,
): [string | undefined, string | undefined] {
  const match = line.match(
    /^diff --git ("(?:\\.|[^"\\])*"|a\/.*?) ("(?:\\.|[^"\\])*"|b\/.*)$/,
  );
  return match
    ? [cleanPath(match[1]), cleanPath(match[2])]
    : [undefined, undefined];
}

/** Parse ordinary, multi-file, renamed, binary, or bare snippet diffs. */
export function parseUnifiedDiff(
  diff: string,
  fallbackFilename = "Proposed changes",
): DiffFile[] {
  if (!diff.trim()) return [];

  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  let oldNumber: number | undefined;
  let newNumber: number | undefined;
  let remainingOld = 0;
  let remainingNew = 0;
  let inHunk = false;
  let hasNewHeader = false;

  function startFile(oldPath?: string, newPath?: string): DiffFile {
    const filename =
      newPath && newPath !== "/dev/null"
        ? newPath
        : oldPath || fallbackFilename;
    current = {
      filename,
      oldPath,
      newPath,
      additions: 0,
      deletions: 0,
      lines: [],
    };
    files.push(current);
    oldNumber = undefined;
    newNumber = undefined;
    remainingOld = 0;
    remainingNew = 0;
    inHunk = false;
    hasNewHeader = false;
    return current;
  }

  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();

  for (const rawLine of lines) {
    if (rawLine.startsWith("diff --git ")) {
      startFile(...parseGitHeader(rawLine));
      continue;
    }

    if (!inHunk && rawLine.startsWith("--- ")) {
      if (!current || hasNewHeader) startFile();
      current!.oldPath = cleanPath(rawLine.slice(4));
      if (current!.oldPath !== "/dev/null")
        current!.filename = current!.oldPath;
      continue;
    }

    const file = current ?? startFile();

    if (!inHunk && rawLine.startsWith("+++ ")) {
      file.newPath = cleanPath(rawLine.slice(4));
      if (file.newPath !== "/dev/null") file.filename = file.newPath;
      hasNewHeader = true;
      continue;
    }

    const hunk = rawLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      oldNumber = Number(hunk[1]);
      newNumber = Number(hunk[3]);
      remainingOld = hunk[2] === undefined ? 1 : Number(hunk[2]);
      remainingNew = hunk[4] === undefined ? 1 : Number(hunk[4]);
      inHunk = remainingOld > 0 || remainingNew > 0;
      file.lines.push({ type: "hunk", text: rawLine });
      continue;
    }

    if (rawLine.startsWith("+")) {
      file.lines.push({ type: "add", text: rawLine.slice(1), newNumber });
      file.additions += 1;
      if (newNumber !== undefined) newNumber += 1;
      remainingNew -= 1;
    } else if (rawLine.startsWith("-")) {
      file.lines.push({ type: "remove", text: rawLine.slice(1), oldNumber });
      file.deletions += 1;
      if (oldNumber !== undefined) oldNumber += 1;
      remainingOld -= 1;
    } else if (rawLine.startsWith(" ")) {
      file.lines.push({
        type: "context",
        text: rawLine.slice(1),
        oldNumber,
        newNumber,
      });
      if (oldNumber !== undefined) oldNumber += 1;
      if (newNumber !== undefined) newNumber += 1;
      remainingOld -= 1;
      remainingNew -= 1;
    } else if (!rawLine.startsWith("index ")) {
      file.lines.push({ type: "meta", text: rawLine });
    }

    if (inHunk && remainingOld <= 0 && remainingNew <= 0) inHunk = false;
  }

  return files;
}

export function getDiffStats(files: readonly DiffFile[]) {
  return files.reduce(
    (stats, file) => ({
      files: stats.files + 1,
      additions: stats.additions + file.additions,
      deletions: stats.deletions + file.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  );
}
