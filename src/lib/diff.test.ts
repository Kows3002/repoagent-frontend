import assert from "node:assert/strict";
import test from "node:test";
import { getDiffStats, parseUnifiedDiff } from "./diff";

test("parses multiple files, omitted hunk lengths, and old/new line numbers", () => {
  const files = parseUnifiedDiff(
    [
      "diff --git a/src/Login.tsx b/src/Login.tsx",
      "index 1111111..2222222 100644",
      "--- a/src/Login.tsx",
      "+++ b/src/Login.tsx",
      "@@ -8,3 +8,3 @@ export default function Login() {",
      "   return (",
      "-    <title>Sign in</title>",
      "+    <title>Login</title>",
      "   )",
      "diff --git a/README.md b/README.md",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1 +1 @@",
      "-Old title",
      "+New title",
    ].join("\n"),
  );

  assert.equal(files.length, 2);
  assert.equal(files[0].filename, "src/Login.tsx");
  assert.deepEqual(files[0].lines[2], {
    type: "remove",
    text: "    <title>Sign in</title>",
    oldNumber: 9,
  });
  assert.deepEqual(files[0].lines[3], {
    type: "add",
    text: "    <title>Login</title>",
    newNumber: 9,
  });
  assert.deepEqual(files[0].lines[4], {
    type: "context",
    text: "  )",
    oldNumber: 10,
    newNumber: 10,
  });
  assert.deepEqual(getDiffStats(files), {
    files: 2,
    additions: 2,
    deletions: 2,
  });
});

test("preserves spaces and decodes Git quoted Unicode paths", () => {
  const [withSpaces] = parseUnifiedDiff(
    "diff --git a/docs/setup guide.md b/docs/setup guide.md\n--- a/docs/setup guide.md\n+++ b/docs/setup guide.md\n@@ -1 +1 @@\n-old\n+new",
  );
  assert.equal(withSpaces.filename, "docs/setup guide.md");

  const [quoted] = parseUnifiedDiff(
    'diff --git "a/caf\\303\\251.md" "b/caf\\303\\251.md"\n--- "a/caf\\303\\251.md"\n+++ "b/caf\\303\\251.md"\n@@ -1 +1 @@\n-old\n+new',
  );
  assert.equal(quoted.filename, "café.md");
});

test("does not mistake header-like code within a hunk for file headers", () => {
  const [file] = parseUnifiedDiff(
    "--- a/example.md\n+++ b/example.md\n@@ -1,2 +1,2 @@\n--- heading\n+++ heading\n same",
  );
  assert.equal(file.filename, "example.md");
  assert.equal(file.deletions, 1);
  assert.equal(file.additions, 1);
  assert.equal(file.lines[1].text, "-- heading");
  assert.equal(file.lines[2].text, "++ heading");
});

test("supports added and removed files and no-newline metadata", () => {
  const files = parseUnifiedDiff(
    "--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+export {}\n\\ No newline at end of file\n--- a/deleted.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n",
  );
  assert.equal(files.length, 2);
  assert.equal(files[0].filename, "new.ts");
  assert.equal(files[0].lines[2].type, "meta");
  assert.equal(files[1].filename, "deleted.ts");
  assert.deepEqual(getDiffStats(files), {
    files: 2,
    additions: 1,
    deletions: 1,
  });
});

test("keeps extended Git headers with the same added file", () => {
  const files = parseUnifiedDiff(
    "diff --git a/new.ts b/new.ts\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+export {}",
  );
  assert.equal(files.length, 1);
  assert.equal(files[0].filename, "new.ts");
  assert.equal(files[0].additions, 1);
});

test("supports snippets, empty input, CRLF, binary changes, and renamed paths", () => {
  assert.deepEqual(parseUnifiedDiff(" \n "), []);
  const [snippet] = parseUnifiedDiff("-Before\r\n+After\r\n", "src/example.ts");
  assert.equal(snippet.filename, "src/example.ts");
  assert.equal(snippet.lines.length, 2);
  assert.equal(snippet.lines[0].text, "Before");
  const [binary] = parseUnifiedDiff(
    "diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ",
  );
  assert.equal(binary.lines[0].type, "meta");
  const [renamed] = parseUnifiedDiff(
    "diff --git a/old.md b/new.md\nsimilarity index 100%\nrename from old.md\nrename to new.md",
  );
  assert.equal(renamed.filename, "new.md");
});
