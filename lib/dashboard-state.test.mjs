import assert from "node:assert/strict";
import test from "node:test";

import {
  courseFilterGroup,
  matchesCourseFilter,
} from "./dashboard-state.ts";

test("course statuses map to stable dashboard filter groups", () => {
  assert.equal(courseFilterGroup("created"), "active");
  assert.equal(courseFilterGroup("needs_lesson_confirmation"), "review");
  assert.equal(courseFilterGroup("generating_main_artwork"), "generating");
  assert.equal(courseFilterGroup("slide_plan_confirmed"), "complete");
  assert.equal(courseFilterGroup("step_sheet_generation_failed"), "attention");
  assert.equal(courseFilterGroup("main_artwork_generation_needs_review"), "attention");
});

test("dashboard course filtering combines a trimmed name query and status", () => {
  const course = { title: "Forest Night 森林夜景", status: "needs_blueprint_confirmation" };
  assert.equal(matchesCourseFilter(course, "  forest ", "all"), true);
  assert.equal(matchesCourseFilter(course, "森林", "review"), true);
  assert.equal(matchesCourseFilter(course, "冰屋", "review"), false);
  assert.equal(matchesCourseFilter(course, "森林", "complete"), false);
});
