import assert from "node:assert/strict";
import test from "node:test";

import {
  canRefreshObservation,
  courseFeedbackSubmissionIssue,
  observationRefreshCopy,
  observationUploadIssue,
  observationUploadPrerequisiteIssue,
  slidePlanNeedsContentEnhancement,
} from "./slide-plan-state.ts";

test("current v0.2 plans can retrieve or replace observation assets", () => {
  assert.equal(canRefreshObservation("0.2", "current"), true);
  assert.equal(canRefreshObservation("0.2", "outdated"), false);
  assert.equal(canRefreshObservation("0.1", "current"), false);
});

test("observation refresh copy distinguishes missing and existing assets", () => {
  assert.equal(observationRefreshCopy(0).title, "检索观察素材");
  assert.equal(observationRefreshCopy(0).action, "检索素材并生成新版本");
  assert.equal(observationRefreshCopy(1).title, "更换观察素材");
  assert.equal(
    observationRefreshCopy(1).action,
    "更换素材并生成新版本",
  );
});

test("observation upload accepts only bounded jpeg or png files", () => {
  assert.equal(observationUploadIssue({ type: "image/jpeg", size: 1024 }), null);
  assert.equal(observationUploadIssue({ type: "image/png", size: 1024 }), null);
  assert.match(
    observationUploadIssue({ type: "image/svg+xml", size: 1024 }),
    /JPG 或 PNG/,
  );
  assert.match(
    observationUploadIssue({ type: "image/jpeg", size: 26 * 1024 * 1024 }),
    /25 MB/,
  );
});

test("observation upload explains missing prerequisites instead of silently disabling", () => {
  assert.match(observationUploadPrerequisiteIssue(false, false), /选择文件/);
  assert.match(observationUploadPrerequisiteIssue(true, false), /使用权/);
  assert.equal(observationUploadPrerequisiteIssue(true, true), null);
});

test("content enhancement appears only for sparse slide semantics", () => {
  const dense = {
    cover: { visible_points: ["本课观察焦点"], teacher_notes: ["引导进入主题"] },
    hook_and_goals: {
      visible_points: ["先看到了什么？", "哪些细节最特别？"],
      teacher_notes: ["先等待学生描述证据"],
    },
  };
  assert.equal(slidePlanNeedsContentEnhancement(dense), false);
  assert.equal(
    slidePlanNeedsContentEnhancement({
      ...dense,
      hook_and_goals: { visible_points: [], teacher_notes: [] },
    }),
    true,
  );
  assert.equal(
    slidePlanNeedsContentEnhancement({
      ...dense,
      hook_and_goals: {
        visible_points: ["只有一个问题"],
        teacher_notes: ["仍然不够完整"],
      },
    }),
    true,
  );
});

test("course feedback requires a rating and an explanation for problems", () => {
  assert.match(courseFeedbackSubmissionIssue(null, 0, ""), /使用感受/);
  assert.equal(courseFeedbackSubmissionIssue("ready_to_use", 0, ""), null);
  assert.match(
    courseFeedbackSubmissionIssue("needs_adjustment", 0, ""),
    /问题位置/,
  );
  assert.equal(
    courseFeedbackSubmissionIssue("needs_adjustment", 1, ""),
    null,
  );
  assert.equal(
    courseFeedbackSubmissionIssue("not_usable", 0, "具体说明"),
    null,
  );
});
