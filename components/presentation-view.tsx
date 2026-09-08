"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { ApiError, api } from "@/lib/api";
import { courseWorkspaceUrl } from "@/lib/auth-state";
import {
  advancePresentation,
  detectHorizontalSwipe,
  jumpToSlide,
  notesOpenAfterFullscreenChange,
  presentationActionForKey,
  presentationGateTitle,
  presentationStorageKey,
  previousPresentation,
  resolveAnimationsEnabled,
  restoreSlideIndex,
  type PresentationPosition,
} from "@/lib/presentation-state";
import type { CoursePresentation } from "@/lib/types";
import {
  RenderDeckCanvas,
  RenderDeckPreflight,
  type DeckValidationResult,
} from "@/components/render-deck";

const ANIMATION_SETTING_KEY = "huake:presentation:animations";

const SLOT_LABELS: Record<string, string> = {
  cover: "主题进入",
  hook_and_goals: "观察与思考",
  observe_form: "主题元素",
  observe_color_texture: "色彩发现",
  professional_observation: "创作构思",
  technique_and_safety: "任务与准备",
  step_1: "步骤一",
  step_2: "步骤二",
  step_3: "步骤三",
  creative_variation: "创意变化",
  creation_task: "创作任务",
  sharing_and_assessment: "分享与评价",
};

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(
    element?.isContentEditable ||
      element?.closest("input, textarea, select, button, a, [role='button']"),
  );
}

export function PresentationView({ courseId }: { courseId: string }) {
  const workspaceUrl = courseWorkspaceUrl(courseId);
  const rootRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const [presentation, setPresentation] = useState<CoursePresentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [position, setPosition] = useState<PresentationPosition>({
    slideIndex: 0,
    revealedAnimations: 0,
  });
  const [restored, setRestored] = useState(false);
  const [validation, setValidation] = useState<DeckValidationResult>({
    specHash: "",
    complete: false,
    overflowElementIds: [],
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [manualAnimations, setManualAnimations] = useState<boolean | null>(null);
  const [imageFailures, setImageFailures] = useState<string[]>([]);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);

  const slidePlan = presentation?.slide_plan_version ?? null;
  const deck = slidePlan?.slide_plan.render_deck_spec ?? null;
  const slides = useMemo(() => deck?.slides ?? [], [deck]);
  const activeSlide = slides[position.slideIndex] ?? null;
  const animationsEnabled = resolveAnimationsEnabled(
    manualAnimations,
    prefersReducedMotion,
  );
  const validationIsCurrent = validation.specHash === deck?.spec_hash;
  const readyToPresent =
    validationIsCurrent &&
    validation.complete &&
    validation.overflowElementIds.length === 0;

  useEffect(() => {
    let active = true;
    api
      .presentation(courseId)
      .then(({ presentation: result }) => {
        if (active) setPresentation(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(caught instanceof Error ? caught.message : "未知错误"),
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [courseId]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(media.matches);
    media.addEventListener("change", updatePreference);
    const frame = window.requestAnimationFrame(() => {
      updatePreference();
      const stored = window.localStorage.getItem(ANIMATION_SETTING_KEY);
      setManualAnimations(stored === "on" ? true : stored === "off" ? false : null);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", updatePreference);
    };
  }, []);

  useEffect(() => {
    if (!slidePlan || !deck) return;
    const key = presentationStorageKey(courseId, slidePlan.id);
    const frame = window.requestAnimationFrame(() => {
      setPosition({
        slideIndex: restoreSlideIndex(window.localStorage.getItem(key), deck.slides.length),
        revealedAnimations: 0,
      });
      setRestored(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [courseId, deck, slidePlan]);

  useEffect(() => {
    if (!restored || !slidePlan) return;
    window.localStorage.setItem(
      presentationStorageKey(courseId, slidePlan.id),
      String(position.slideIndex),
    );
  }, [courseId, position.slideIndex, restored, slidePlan]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === rootRef.current;
      setIsFullscreen(active);
      setNotesOpen((current) => notesOpenAfterFullscreenChange(active, current));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const advance = useCallback(() => {
    if (!activeSlide || !readyToPresent) return;
    setPosition((current) =>
      advancePresentation(
        current,
        activeSlide.animation_plan.length,
        slides.length,
        animationsEnabled,
      ),
    );
  }, [activeSlide, animationsEnabled, readyToPresent, slides.length]);

  const previous = useCallback(() => {
    if (!readyToPresent) return;
    setPosition((current) => previousPresentation(current, slides.length));
  }, [readyToPresent, slides.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const action = presentationActionForKey(event.key);
      if (!action) return;
      if (action === "advance") {
        event.preventDefault();
        advance();
      } else if (action === "previous") {
        event.preventDefault();
        previous();
      } else if (action === "first") {
        event.preventDefault();
        setPosition(jumpToSlide(0, slides.length));
      } else if (action === "last") {
        event.preventDefault();
        setPosition(jumpToSlide(slides.length - 1, slides.length));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advance, previous, slides.length]);

  const handleValidation = useCallback((result: DeckValidationResult) => {
    setValidation(result);
  }, []);

  const recordImageFailure = useCallback((message: string) => {
    setImageFailures((current) =>
      current.includes(message) ? current : [...current, message],
    );
  }, []);

  function handleCanvasClick() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    advance();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    touchStart.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || event.pointerType === "mouse") return;
    const direction = detectHorizontalSwipe(
      start.x,
      start.y,
      event.clientX,
      event.clientY,
    );
    if (!direction) return;
    suppressClick.current = true;
    if (direction === "next") advance();
    else previous();
  }

  async function toggleFullscreen() {
    if (!rootRef.current) return;
    setRuntimeNotice(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current.requestFullscreen();
    } catch {
      setRuntimeNotice("浏览器没有允许进入全屏，请再次点击或检查权限。");
    }
  }

  function toggleAnimations() {
    const next = !animationsEnabled;
    setManualAnimations(next);
    window.localStorage.setItem(ANIMATION_SETTING_KEY, next ? "on" : "off");
    if (!next && activeSlide) {
      setPosition((current) => ({
        ...current,
        revealedAnimations: activeSlide.animation_plan.length,
      }));
    }
  }

  if (loading) {
    return <PresentationMessage title="正在准备课堂演示…" detail="正在验证当前页面方案和课程资产。" />;
  }
  if (error || !presentation || !slidePlan || !deck) {
    const currentError = error ?? new ApiError("课堂演示数据不存在", "PRESENTATION_NOT_FOUND", 404);
    return (
      <PresentationMessage title={presentationGateTitle(currentError.code, currentError.status)} detail={currentError.message}>
        <Link className="presentation-link" href={workspaceUrl}>返回课程工作台</Link>
      </PresentationMessage>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`presentation-shell${isFullscreen ? " is-fullscreen" : ""}`}
    >
      <RenderDeckPreflight
        deck={deck}
        assets={slidePlan.assets}
        onValidationChange={handleValidation}
      />

      <header className="presentation-topbar">
        <div>
          <span>画课 · 课堂演示</span>
          <strong>{slidePlan.slide_plan.semantic_plan.slots.cover.title}</strong>
        </div>
        <div className="presentation-topbar-actions">
          <button type="button" aria-label={animationsEnabled ? "关闭动画" : "开启动画"} onClick={toggleAnimations}>
            动画 {animationsEnabled ? "开" : "关"}
          </button>
          <button type="button" aria-label={isFullscreen ? "退出全屏" : "进入全屏"} onClick={toggleFullscreen}>
            {isFullscreen ? "退出全屏" : "进入全屏"}
          </button>
          <Link href={workspaceUrl} aria-label="返回课程工作台">返回工作台</Link>
        </div>
      </header>

      {(!validationIsCurrent || !validation.complete) && (
        <PresentationMessage title="正在检查浏览器文字排版…" detail="字体加载并完成十二页真实 DOM 测量后才能开始上课。" />
      )}
      {validationIsCurrent && validation.complete && validation.overflowElementIds.length > 0 && (
        <PresentationMessage title="文字排版校验未通过" detail="为避免投影时裁字，当前版本已阻止正式演示。请返回工作台调整以下元素。">
          <div className="presentation-error-elements">
            {validation.overflowElementIds.map((elementId) => <span key={elementId}>{elementId}</span>)}
          </div>
          <Link className="presentation-link" href={workspaceUrl}>返回课程工作台</Link>
        </PresentationMessage>
      )}

      {readyToPresent && activeSlide && (
        <div className="presentation-layout">
          <nav className="presentation-thumbnails" aria-label="演示缩略页导航">
            {slides.map((slide, index) => (
              <button
                key={slide.slide_id}
                type="button"
                aria-label={`前往第 ${index + 1} 页：${SLOT_LABELS[slide.slot_id]}`}
                aria-current={position.slideIndex === index ? "page" : undefined}
                className={position.slideIndex === index ? "active" : ""}
                onClick={() => setPosition(jumpToSlide(index, slides.length))}
              >
                <RenderDeckCanvas slide={slide} assets={slidePlan.assets} thumbnail />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </nav>

          <main className="presentation-stage">
            <div
              className="presentation-canvas-hitarea"
              role="button"
              tabIndex={0}
              aria-label="推进本页动画或进入下一页"
              onClick={handleCanvasClick}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  advance();
                }
              }}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                touchStart.current = null;
              }}
            >
              <RenderDeckCanvas
                slide={activeSlide}
                assets={slidePlan.assets}
                revealedAnimations={position.revealedAnimations}
                animationsEnabled={animationsEnabled}
                onImageFailure={recordImageFailure}
              />
            </div>

            <div className="presentation-controls" onClick={(event) => event.stopPropagation()}>
              <button type="button" aria-label="上一页" disabled={position.slideIndex === 0} onClick={previous}>上一页</button>
              <span aria-live="polite">{position.slideIndex + 1} / {slides.length}</span>
              <button type="button" aria-label="下一页或推进动画" disabled={position.slideIndex === slides.length - 1 && (!animationsEnabled || position.revealedAnimations >= activeSlide.animation_plan.length)} onClick={advance}>下一页</button>
            </div>

            {!isFullscreen && (
              <section className="presentation-notes">
                <button type="button" aria-expanded={notesOpen} aria-controls="teacher-notes-panel" onClick={() => setNotesOpen((current) => !current)}>
                  {notesOpen ? "收起教师备注" : "打开教师备注"}
                </button>
                {notesOpen && (
                  <div id="teacher-notes-panel">
                    <strong>{SLOT_LABELS[activeSlide.slot_id]} · 教师备注</strong>
                    {activeSlide.speaker_notes.length ? (
                      <ul>{activeSlide.speaker_notes.map((note) => <li key={note}>{note}</li>)}</ul>
                    ) : <p>本页没有教师备注。</p>}
                  </div>
                )}
              </section>
            )}

            {imageFailures.length > 0 && (
              <div className="presentation-image-warning" role="status">
                有 {imageFailures.length} 张图片未加载，已显示占位内容；仍可继续授课。
              </div>
            )}
            {runtimeNotice && (
              <div className="presentation-image-warning" role="status">
                {runtimeNotice}
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function PresentationMessage({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="presentation-message" role="status">
      <div className="presentation-message-content">
        <span>画课 · 课堂演示</span>
        <h1>{title}</h1>
        <p>{detail}</p>
        {children}
      </div>
    </main>
  );
}
