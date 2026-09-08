import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalLocalUrl,
  courseWorkspaceUrl,
  requestedWorkspaceCourseId,
} from "./auth-state.ts";

test("local numeric host is redirected to the canonical localhost origin", () => {
  assert.equal(
    canonicalLocalUrl("http://127.0.0.1:3010/course?from=test#top"),
    "http://localhost:3010/course?from=test#top",
  );
});

test("canonical and deployed hosts are left unchanged", () => {
  assert.equal(canonicalLocalUrl("http://localhost:3010/"), null);
  assert.equal(canonicalLocalUrl("https://huake.example.com/"), null);
});

test("course workspace return links preserve the requested course", () => {
  assert.equal(courseWorkspaceUrl("course/with spaces"), "/?course_id=course%2Fwith%20spaces");
  assert.equal(
    requestedWorkspaceCourseId("http://localhost:3010/?course_id=course%2Fwith%20spaces"),
    "course/with spaces",
  );
  assert.equal(requestedWorkspaceCourseId("http://localhost:3010/"), null);
});
