export type PresentationPosition = {
  slideIndex: number;
  revealedAnimations: number;
};

export type BoxMetrics = {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
};

export function clampSlideIndex(index: number, slideCount: number): number {
  if (!Number.isFinite(index) || slideCount <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), slideCount - 1);
}

export function restoreSlideIndex(value: string | null, slideCount: number): number {
  if (value === null || value.trim() === "") return 0;
  const parsed = Number(value);
  return clampSlideIndex(parsed, slideCount);
}

export function presentationStorageKey(courseId: string, versionId: string): string {
  return `huake:presentation:${courseId}:${versionId}:slide`;
}

export function advancePresentation(
  position: PresentationPosition,
  animationCount: number,
  slideCount: number,
  animationsEnabled: boolean,
): PresentationPosition {
  const slideIndex = clampSlideIndex(position.slideIndex, slideCount);
  if (animationsEnabled && position.revealedAnimations < animationCount) {
    return { slideIndex, revealedAnimations: position.revealedAnimations + 1 };
  }
  if (slideIndex >= slideCount - 1) {
    return {
      slideIndex,
      revealedAnimations: animationsEnabled ? animationCount : 0,
    };
  }
  return { slideIndex: slideIndex + 1, revealedAnimations: 0 };
}

export function previousPresentation(
  position: PresentationPosition,
  slideCount: number,
): PresentationPosition {
  return {
    slideIndex: clampSlideIndex(position.slideIndex - 1, slideCount),
    revealedAnimations: 0,
  };
}

export function jumpToSlide(index: number, slideCount: number): PresentationPosition {
  return { slideIndex: clampSlideIndex(index, slideCount), revealedAnimations: 0 };
}

export function resolveAnimationsEnabled(
  manualSetting: boolean | null,
  prefersReducedMotion: boolean,
): boolean {
  return manualSetting ?? !prefersReducedMotion;
}

export function isBoxOverflowing(metrics: BoxMetrics, tolerance = 1): boolean {
  return (
    metrics.scrollWidth - metrics.clientWidth > tolerance ||
    metrics.scrollHeight - metrics.clientHeight > tolerance
  );
}

export function detectHorizontalSwipe(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold = 56,
): "previous" | "next" | null {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
    return null;
  }
  return deltaX > 0 ? "previous" : "next";
}

export function resolveChineseFontStack(fontFamily: string): string {
  const wantsSerif =
    /song|宋体|明朝/i.test(fontFamily) ||
    /(^|,)\s*["']?serif["']?\s*(,|$)/i.test(fontFamily);
  if (wantsSerif) {
    return '"Songti SC", STSong, SimSun, "宋体", "Microsoft YaHei", "Noto Serif CJK SC", serif';
  }
  return '"PingFang SC", "Microsoft YaHei", "微软雅黑", "Noto Sans CJK SC", Arial, sans-serif';
}

export type PresentationKeyAction = "advance" | "previous" | "first" | "last" | null;

export function presentationActionForKey(key: string): PresentationKeyAction {
  if (key === "ArrowRight" || key === " ") return "advance";
  if (key === "ArrowLeft") return "previous";
  if (key === "Home") return "first";
  if (key === "End") return "last";
  return null;
}

export function notesOpenAfterFullscreenChange(
  fullscreenActive: boolean,
  currentNotesOpen: boolean,
): boolean {
  return fullscreenActive ? false : currentNotesOpen;
}

export function shouldUseImageFallback(
  sourceUrl: string | null,
  failedUrl: string | null,
): boolean {
  return sourceUrl === null || sourceUrl === failedUrl;
}

export function protectedImageRenderMode(
  sourceRect: object | null | undefined,
): "native-img" | "native-crop" {
  return sourceRect ? "native-crop" : "native-img";
}

export type NormalizedSourceRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function nativeImageCropGeometry(
  source: NormalizedSourceRect,
  assetWidth: number,
  assetHeight: number,
  frameWidth: number,
  frameHeight: number,
) {
  const viewportAspect =
    (source.w * assetWidth) / (source.h * assetHeight);
  const frameAspect = frameWidth / frameHeight;
  return {
    viewportAspect,
    fitAxis: viewportAspect <= frameAspect ? "height" : "width",
    imageWidthPercent: 100 / source.w,
    imageHeightPercent: 100 / source.h,
    imageLeftPercent: source.x === 0 ? 0 : -(source.x / source.w) * 100,
    imageTopPercent: source.y === 0 ? 0 : -(source.y / source.h) * 100,
  } as const;
}

export function presentationGateTitle(code: string, status: number): string {
  const titles: Record<string, string> = {
    PRESENTATION_NOT_CONFIRMED: "请先确认页面方案",
    PRESENTATION_OUTDATED: "页面方案已过期",
    PRESENTATION_SCHEMA_OUTDATED: "旧版页面方案需要升级",
    PRESENTATION_NOT_FOUND: "尚未生成课堂演示",
    SLIDE_PLAN_RENDER_SPEC_INVALID: "课堂演示校验未通过",
    SLIDE_PLAN_ASSET_REF_INVALID: "课堂演示校验未通过",
  };
  return titles[code] ?? (status === 401 ? "请先登录画课" : "暂时无法进入课堂演示");
}
