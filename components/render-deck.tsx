"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { assetContentUrl } from "@/lib/api";
import {
  isBoxOverflowing,
  nativeImageCropGeometry,
  protectedImageRenderMode,
  resolveChineseFontStack,
  shouldUseImageFallback,
} from "@/lib/presentation-state";
import type {
  RenderElementV01,
  RenderSlideSpecV01,
  SlidePlanAsset,
  SlidePlanVersionV02,
} from "@/lib/types";

type RenderAnimation = RenderSlideSpecV01["animation_plan"][number];
const EMPTY_REPORTS: Record<string, string[]> = {};

export type DeckValidationResult = {
  specHash: string;
  complete: boolean;
  overflowElementIds: string[];
};

function elementPosition(element: RenderElementV01): CSSProperties {
  return {
    left: `${(element.x / 1600) * 100}%`,
    top: `${(element.y / 900) * 100}%`,
    width: `${(element.w / 1600) * 100}%`,
    height: `${(element.h / 900) * 100}%`,
    zIndex: element.z_index,
  };
}

function RenderDeckImage({
  element,
  asset,
  onFailure,
  allowRetry,
}: {
  element: RenderElementV01;
  asset: SlidePlanAsset | undefined;
  onFailure?: (message: string) => void;
  allowRetry: boolean;
}) {
  const sourceUrl = asset ? assetContentUrl(asset.url) : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const failed = shouldUseImageFallback(sourceUrl, failedUrl);
  const requestedUrl = sourceUrl
    ? `${sourceUrl}${sourceUrl.includes("?") ? "&" : "?"}retry=${retryAttempt}`
    : null;

  useEffect(() => {
    if (sourceUrl) return;
    const frame = window.requestAnimationFrame(() =>
      onFailure?.(`${element.element_id}：${element.alt_text ?? "课程图片"}不可用`),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [element.alt_text, element.element_id, onFailure, sourceUrl]);

  if (!asset || !sourceUrl || failed) {
    return (
      <div
        className="render-image-fallback"
        role="img"
        aria-label={element.alt_text ?? "课程图片加载失败"}
      >
        <span aria-hidden="true">图片暂不可用</span>
        <small>{element.alt_text ?? "请继续使用文字内容授课"}</small>
        {sourceUrl && allowRetry && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setFailedUrl(null);
              setRetryAttempt((attempt) => attempt + 1);
            }}
          >
            重新加载图片
          </button>
        )}
      </div>
    );
  }

  if (protectedImageRenderMode(element.source_rect) === "native-img") {
    return (
      // The protected asset requires browser credentials, so it must bypass
      // Next.js image optimization and load as a native image element.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={requestedUrl ?? sourceUrl}
        alt={element.alt_text ?? "课程图片"}
        width={asset.width}
        height={asset.height}
        style={{ objectFit: element.image_fit === "contain" ? "contain" : "cover" }}
        onLoad={() => setFailedUrl(null)}
        onError={() => {
          setFailedUrl(sourceUrl);
          onFailure?.(`${element.element_id}：${element.alt_text ?? "课程图片"}加载失败`);
        }}
      />
    );
  }

  const source = element.source_rect ?? { x: 0, y: 0, w: 1, h: 1 };
  const crop = nativeImageCropGeometry(
    source,
    asset.width,
    asset.height,
    element.w,
    element.h,
  );
  return (
    <div
      className="render-native-crop-frame"
      role="img"
      aria-label={element.alt_text ?? "课程图片"}
    >
      <div
        className="render-native-crop-viewport"
        style={{
          aspectRatio: crop.viewportAspect,
          ...(crop.fitAxis === "height"
            ? { height: "100%", width: "auto" }
            : { width: "100%", height: "auto" }),
        }}
      >
        {/* Keep authenticated source-rect rendering on a native image so fullscreen does not depend on SVG image composition. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={requestedUrl ?? sourceUrl}
          alt=""
          aria-hidden="true"
          width={asset.width}
          height={asset.height}
          style={{
            width: `${crop.imageWidthPercent}%`,
            height: `${crop.imageHeightPercent}%`,
            left: `${crop.imageLeftPercent}%`,
            top: `${crop.imageTopPercent}%`,
          }}
          onLoad={() => setFailedUrl(null)}
          onError={() => {
            setFailedUrl(sourceUrl);
            onFailure?.(`${element.element_id}：${element.alt_text ?? "课程图片"}加载失败`);
          }}
        />
      </div>
    </div>
  );
}

export function RenderDeckElement({
  element,
  asset,
  animation,
  revealedAnimations,
  animationsEnabled,
  validationOnly = false,
  onImageFailure,
  allowImageRetry = true,
}: {
  element: RenderElementV01;
  asset?: SlidePlanAsset;
  animation?: RenderAnimation;
  revealedAnimations: number;
  animationsEnabled: boolean;
  validationOnly?: boolean;
  onImageFailure?: (message: string) => void;
  allowImageRetry?: boolean;
}) {
  const position = elementPosition(element);
  const visible =
    validationOnly ||
    !animation ||
    !animationsEnabled ||
    animation.order <= revealedAnimations;
  const animationClass = animation
    ? ` render-animation-${animation.effect}${visible ? " is-revealed" : " is-pending"}`
    : "";

  if (element.element_type === "shape" && element.shape_style) {
    if (validationOnly) return null;
    return (
      <div
        className={`render-element shape${animationClass}`}
        aria-hidden="true"
        style={{
          ...position,
          background: element.shape_style.fill,
          borderColor: element.shape_style.stroke,
          borderWidth: `${element.shape_style.stroke_width / 16}cqw`,
          borderRadius: `${element.shape_style.corner_radius / 16}cqw`,
          opacity: visible ? element.shape_style.opacity : 0,
        }}
      />
    );
  }

  if (element.element_type === "image" && element.asset_key) {
    if (validationOnly) return null;
    return (
      <div
        className={`render-element image${animationClass}`}
        style={{ ...position, opacity: visible ? 1 : 0 }}
        aria-hidden={!visible}
      >
        <RenderDeckImage
          element={element}
          asset={asset}
          onFailure={onImageFailure}
          allowRetry={allowImageRetry}
        />
      </div>
    );
  }

  if (element.element_type === "text" && element.text_style) {
    const vertical =
      element.text_style.vertical_align === "middle"
        ? "center"
        : element.text_style.vertical_align === "bottom"
          ? "flex-end"
          : "flex-start";
    return (
      <div
        className={`render-element text${animationClass}`}
        data-render-text="true"
        data-element-id={element.element_id}
        aria-hidden={!visible && !validationOnly}
        style={{
          ...position,
          color: element.text_style.color,
          fontFamily: resolveChineseFontStack(element.text_style.font_family),
          fontSize: `${element.text_style.font_size / 16}cqw`,
          fontWeight: element.text_style.font_weight,
          lineHeight: element.text_style.line_height,
          textAlign: element.text_style.align,
          justifyContent: vertical,
          opacity: visible ? 1 : 0,
        }}
      >
        {element.text}
      </div>
    );
  }
  return null;
}

export function RenderDeckSlide({
  slide,
  assets,
  revealedAnimations = Number.MAX_SAFE_INTEGER,
  animationsEnabled = false,
  validationOnly = false,
  onImageFailure,
  allowImageRetry = true,
}: {
  slide: RenderSlideSpecV01;
  assets: Record<string, SlidePlanAsset>;
  revealedAnimations?: number;
  animationsEnabled?: boolean;
  validationOnly?: boolean;
  onImageFailure?: (message: string) => void;
  allowImageRetry?: boolean;
}) {
  const animations = useMemo(
    () => new Map(slide.animation_plan.map((item) => [item.element_id, item])),
    [slide.animation_plan],
  );
  return slide.elements.map((element) => (
    <RenderDeckElement
      key={element.element_id}
      element={element}
      asset={element.asset_key ? assets[element.asset_key] : undefined}
      animation={animations.get(element.element_id)}
      revealedAnimations={revealedAnimations}
      animationsEnabled={animationsEnabled}
      validationOnly={validationOnly}
      onImageFailure={onImageFailure}
      allowImageRetry={allowImageRetry}
    />
  ));
}

export function RenderDeckCanvas({
  slide,
  assets,
  thumbnail = false,
  revealedAnimations = Number.MAX_SAFE_INTEGER,
  animationsEnabled = false,
  validationOnly = false,
  onImageFailure,
  onOverflowChange,
}: {
  slide: RenderSlideSpecV01;
  assets: Record<string, SlidePlanAsset>;
  thumbnail?: boolean;
  revealedAnimations?: number;
  animationsEnabled?: boolean;
  validationOnly?: boolean;
  onImageFailure?: (message: string) => void;
  onOverflowChange?: (elementIds: string[]) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastReport = useRef<string | null>(null);

  const measure = useCallback(() => {
    if (!canvasRef.current || thumbnail) return;
    const overflows = Array.from(
      canvasRef.current.querySelectorAll<HTMLElement>("[data-render-text='true']"),
    )
      .filter((element) =>
        isBoxOverflowing({
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        }),
      )
      .map((element) => `${slide.slot_id}/${element.dataset.elementId ?? "unknown"}`)
      .sort();
    const report = overflows.join("|");
    if (report !== lastReport.current) {
      lastReport.current = report;
      onOverflowChange?.(overflows);
    }
  }, [onOverflowChange, slide.slot_id, thumbnail]);

  useEffect(() => {
    if (thumbnail || !canvasRef.current) return;
    let frame = 0;
    let disposed = false;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!disposed) measure();
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(canvasRef.current);
    window.addEventListener("resize", schedule);
    const fonts = document.fonts;
    void fonts.ready.then(schedule);
    fonts.addEventListener?.("loadingdone", schedule);
    schedule();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      fonts.removeEventListener?.("loadingdone", schedule);
    };
  }, [measure, thumbnail]);

  return (
    <div
      ref={canvasRef}
      className={`render-deck-canvas${thumbnail ? " thumbnail" : ""}${validationOnly ? " validation" : ""}`}
      data-slide-id={slide.slide_id}
    >
      <RenderDeckSlide
        slide={slide}
        assets={assets}
        revealedAnimations={thumbnail ? Number.MAX_SAFE_INTEGER : revealedAnimations}
        animationsEnabled={thumbnail ? false : animationsEnabled}
        validationOnly={validationOnly}
        onImageFailure={onImageFailure}
        allowImageRetry={!thumbnail && !validationOnly}
      />
    </div>
  );
}

export function RenderDeckPreflight({
  deck,
  assets,
  onValidationChange,
}: {
  deck: SlidePlanVersionV02["slide_plan"]["render_deck_spec"];
  assets: Record<string, SlidePlanAsset>;
  onValidationChange: (result: DeckValidationResult) => void;
}) {
  const [reportState, setReportState] = useState<{
    specHash: string;
    reports: Record<string, string[]>;
  }>(() => ({ specHash: deck.spec_hash, reports: {} }));
  const reports =
    reportState.specHash === deck.spec_hash ? reportState.reports : EMPTY_REPORTS;

  useEffect(() => {
    const complete = Object.keys(reports).length === deck.slides.length;
    onValidationChange({
      specHash: deck.spec_hash,
      complete,
      overflowElementIds: complete
        ? Object.values(reports).flat().sort()
        : [],
    });
  }, [deck.slides.length, deck.spec_hash, onValidationChange, reports]);

  const reportSlide = useCallback((slideId: string, elementIds: string[]) => {
    setReportState((current) => {
      const reports = current.specHash === deck.spec_hash ? current.reports : {};
      const previous = reports[slideId] ?? null;
      if (
        previous &&
        previous.length === elementIds.length &&
        previous.every((value, index) => value === elementIds[index])
      ) {
        return current;
      }
      return {
        specHash: deck.spec_hash,
        reports: { ...reports, [slideId]: elementIds },
      };
    });
  }, [deck.spec_hash]);

  return (
    <div className="render-deck-preflight" aria-hidden="true">
      {deck.slides.map((slide) => (
        <RenderDeckCanvas
          key={slide.slide_id}
          slide={slide}
          assets={assets}
          validationOnly
          onOverflowChange={(elementIds) => reportSlide(slide.slide_id, elementIds)}
        />
      ))}
    </div>
  );
}
