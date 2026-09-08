import assert from "node:assert/strict";
import test from "node:test";

import {
  advancePresentation,
  clampSlideIndex,
  detectHorizontalSwipe,
  isBoxOverflowing,
  jumpToSlide,
  notesOpenAfterFullscreenChange,
  nativeImageCropGeometry,
  presentationActionForKey,
  presentationGateTitle,
  presentationStorageKey,
  protectedImageRenderMode,
  previousPresentation,
  resolveAnimationsEnabled,
  resolveChineseFontStack,
  restoreSlideIndex,
  shouldUseImageFallback,
} from "./presentation-state.ts";

test("animation advances before the next slide", () => {
  let position = { slideIndex: 0, revealedAnimations: 0 };
  position = advancePresentation(position, 2, 3, true);
  assert.deepEqual(position, { slideIndex: 0, revealedAnimations: 1 });
  position = advancePresentation(position, 2, 3, true);
  assert.deepEqual(position, { slideIndex: 0, revealedAnimations: 2 });
  position = advancePresentation(position, 2, 3, true);
  assert.deepEqual(position, { slideIndex: 1, revealedAnimations: 0 });
});

test("disabled animation reveals content and moves immediately", () => {
  assert.deepEqual(
    advancePresentation({ slideIndex: 0, revealedAnimations: 0 }, 3, 2, false),
    { slideIndex: 1, revealedAnimations: 0 },
  );
});

test("previous, home, end and boundary navigation stay valid", () => {
  assert.deepEqual(previousPresentation({ slideIndex: 0, revealedAnimations: 2 }, 3), {
    slideIndex: 0,
    revealedAnimations: 0,
  });
  assert.deepEqual(previousPresentation({ slideIndex: 2, revealedAnimations: 1 }, 3), {
    slideIndex: 1,
    revealedAnimations: 0,
  });
  assert.equal(jumpToSlide(-4, 3).slideIndex, 0);
  assert.equal(jumpToSlide(99, 3).slideIndex, 2);
  assert.equal(advancePresentation({ slideIndex: 2, revealedAnimations: 0 }, 0, 3, true).slideIndex, 2);
});

test("keyboard map covers the classroom navigation contract without intercepting Escape", () => {
  assert.equal(presentationActionForKey("ArrowRight"), "advance");
  assert.equal(presentationActionForKey(" "), "advance");
  assert.equal(presentationActionForKey("ArrowLeft"), "previous");
  assert.equal(presentationActionForKey("Home"), "first");
  assert.equal(presentationActionForKey("End"), "last");
  assert.equal(presentationActionForKey("Escape"), null);
});

test("entering fullscreen closes teacher notes and exiting keeps the closed state", () => {
  assert.equal(notesOpenAfterFullscreenChange(true, true), false);
  assert.equal(notesOpenAfterFullscreenChange(false, false), false);
});

test("formal presentation gates have distinct user-facing states", () => {
  assert.equal(presentationGateTitle("PRESENTATION_NOT_CONFIRMED", 409), "请先确认页面方案");
  assert.equal(presentationGateTitle("PRESENTATION_OUTDATED", 409), "页面方案已过期");
  assert.equal(presentationGateTitle("PRESENTATION_SCHEMA_OUTDATED", 409), "旧版页面方案需要升级");
  assert.equal(presentationGateTitle("UNKNOWN", 401), "请先登录画课");
});

test("missing or failed image URLs select a non-blocking fallback", () => {
  assert.equal(shouldUseImageFallback(null, null), true);
  assert.equal(shouldUseImageFallback("/asset.png", "/asset.png"), true);
  assert.equal(shouldUseImageFallback("/asset.png", null), false);
  assert.equal(shouldUseImageFallback("/new.png", "/old.png"), false);
});

test("protected images always use native img rendering for fullscreen stability", () => {
  assert.equal(protectedImageRenderMode(null), "native-img");
  assert.equal(protectedImageRenderMode(undefined), "native-img");
  assert.equal(
    protectedImageRenderMode({ x: 0, y: 0, w: 0.3333, h: 1 }),
    "native-crop",
  );
});

test("native image crop geometry isolates a complete triptych panel without stretching", () => {
  const first = nativeImageCropGeometry(
    { x: 0, y: 0, w: 0.3333, h: 1 },
    2048,
    768,
    820,
    520,
  );
  const second = nativeImageCropGeometry(
    { x: 0.3333, y: 0, w: 0.3334, h: 1 },
    2048,
    768,
    820,
    520,
  );

  assert.equal(first.fitAxis, "height");
  assert.ok(Math.abs(first.viewportAspect - 0.8888) < 0.001);
  assert.ok(Math.abs(first.imageWidthPercent - 300.03) < 0.01);
  assert.equal(first.imageHeightPercent, 100);
  assert.equal(first.imageLeftPercent, 0);
  assert.ok(Math.abs(second.imageLeftPercent + 99.97) < 0.02);
});

test("page restoration is clamped and version-isolated", () => {
  assert.equal(restoreSlideIndex("8", 12), 8);
  assert.equal(restoreSlideIndex("999", 12), 11);
  assert.equal(restoreSlideIndex("not-a-page", 12), 0);
  assert.notEqual(
    presentationStorageKey("course-a", "version-1"),
    presentationStorageKey("course-a", "version-2"),
  );
});

test("manual animation setting overrides reduced motion", () => {
  assert.equal(resolveAnimationsEnabled(null, true), false);
  assert.equal(resolveAnimationsEnabled(null, false), true);
  assert.equal(resolveAnimationsEnabled(true, true), true);
  assert.equal(resolveAnimationsEnabled(false, false), false);
});

test("overflow uses a stable one-pixel tolerance", () => {
  assert.equal(isBoxOverflowing({ scrollWidth: 101, clientWidth: 100, scrollHeight: 50, clientHeight: 50 }), false);
  assert.equal(isBoxOverflowing({ scrollWidth: 102, clientWidth: 100, scrollHeight: 50, clientHeight: 50 }), true);
  assert.equal(isBoxOverflowing({ scrollWidth: 100, clientWidth: 100, scrollHeight: 54, clientHeight: 50 }), true);
});

test("touch gesture requires a deliberate horizontal swipe", () => {
  assert.equal(detectHorizontalSwipe(100, 20, 20, 24), "next");
  assert.equal(detectHorizontalSwipe(20, 20, 100, 24), "previous");
  assert.equal(detectHorizontalSwipe(20, 20, 50, 21), null);
  assert.equal(detectHorizontalSwipe(20, 20, 90, 100), null);
});

test("Chinese font stacks cover macOS, Windows and generic fallbacks", () => {
  const serif = resolveChineseFontStack("Songti SC, STSong, serif");
  const sans = resolveChineseFontStack("PingFang SC, sans-serif");
  assert.match(serif, /Songti SC/);
  assert.match(serif, /SimSun/);
  assert.match(serif, /serif$/);
  assert.match(sans, /PingFang SC/);
  assert.match(sans, /Microsoft YaHei/);
  assert.match(sans, /sans-serif$/);
});

test("clamp handles empty decks defensively", () => {
  assert.equal(clampSlideIndex(3, 0), 0);
});
