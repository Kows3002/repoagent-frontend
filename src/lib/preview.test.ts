import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePreview, previewPageUrl } from "./preview";
test("accepts a rendered preview pair and rejects executable or missing frame URLs", () => {
 const result=normalizePreview({status:"ready",before_url:"http://current.localhost:8000/",after_url:"http://updated.localhost:8000/"});
 assert.equal(result.status,"ready");
 assert.throws(()=>normalizePreview({status:"ready",before_url:"javascript:alert(1)",after_url:"http://updated.localhost:8000/"}));
 assert.throws(()=>normalizePreview({status:"ready",before_url:"http://current.localhost:8000/"}));
 assert.throws(()=>normalizePreview({status:"imaginary"}));
});
test("opens the same route inside each isolated preview origin", () => {
 assert.equal(previewPageUrl("http://current.localhost:8000/","/login?next=%2Fdashboard"),"http://current.localhost:8000/login?next=%2Fdashboard");
 assert.equal(previewPageUrl("http://updated.localhost:8000/","/login"),"http://updated.localhost:8000/login");
 assert.equal(previewPageUrl("https://example.com/scoped/","/"),"https://example.com/scoped/");
 assert.equal(previewPageUrl("https://example.com/scoped/","/../auth"),null);
});
test("rejects navigation outside the preview origin", () => {
 for(const path of ["//evil.test","https://evil.test/","/\\\\evil.test","/\u0000x"]) assert.equal(previewPageUrl("https://preview.example/",path),null);
});
