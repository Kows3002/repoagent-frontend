import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveApiBaseUrl } from "./config";

test("the requested Render API variable takes precedence over the legacy name", () => {
  assert.equal(resolveApiBaseUrl({VITE_API_URL: " https://repoagent.onrender.com/ ", VITE_API_BASE_URL: "https://old.example"}), "https://repoagent.onrender.com");
});
test("same-origin mode is explicit and the previous variable remains compatible", () => {
  assert.equal(resolveApiBaseUrl(), "");
  assert.equal(resolveApiBaseUrl({VITE_API_URL: "", VITE_API_BASE_URL: "https://old.example"}), "");
  assert.equal(resolveApiBaseUrl({VITE_API_BASE_URL: "https://legacy.example/api/"}), "https://legacy.example/api");
});
test("API configuration rejects malformed or credential-bearing URLs", () => {
  for (const value of ["repoagent.onrender.com", "javascript:alert(1)", "https://user:secret@example.com", "https://example.com?token=secret", "https://example.com#fragment"]) {
    assert.throws(() => resolveApiBaseUrl({VITE_API_URL: value}), /VITE_API_URL/);
  }
});
