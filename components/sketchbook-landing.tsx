"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const SPREADS = [
  {
    src: "/sketchbook/huake-spread-01.webp",
    eyebrow: "从灵感开始",
    title: "把一节好课，慢慢画出来。",
    copy: "翻开这本备课写生册，看看一个念头如何变成可以走进课堂的完整课程。",
  },
  {
    src: "/sketchbook/huake-spread-02.webp",
    eyebrow: "观察与设计",
    title: "先带孩子看见，再带孩子创造。",
    copy: "把真实观察、课程教案与视觉步骤编排在一起，让课堂不只围绕一张范画。",
  },
  {
    src: "/sketchbook/huake-spread-03.webp",
    eyebrow: "走进课堂",
    title: "从备课桌，走到可以上课的演示。",
    copy: "确认每一个关键节点后，生成适合老师讲解、学生观看的完整课堂演示。",
  },
  {
    src: "/sketchbook/huake-spread-04-entry.webp",
    eyebrow: "开始吧",
    title: "从灵感出发，设计一堂好课",
    copy: "进入工作台，从课程想法开始，一步步完成教案、范画、步骤图与课堂演示。",
    isEntry: true,
  },
] as const;

const FEATURED_COURSES = [
  {
    title: "冰屋",
    medium: "水彩创作课",
    src: "/course-covers/ice-house.webp",
  },
  {
    title: "夏日派对",
    medium: "水彩创作课",
    src: "/course-covers/summer-party.webp",
  },
  {
    title: "森林夜景",
    medium: "水粉创作课",
    src: "/course-covers/forest-night.webp",
  },
] as const;

const COURSE_STORY_ASSETS = [
  { src: "/landing/course-story/01-course-blueprint.webp", alt: "森林夜景课程蓝图", delay: "0ms" },
  { src: "/landing/course-story/02-structured-lesson.webp", alt: "森林夜景结构化教案", delay: "280ms" },
  { src: "/landing/course-story/03-main-artwork.webp", alt: "森林夜景水彩主范画", delay: "820ms" },
  { src: "/landing/course-story/04-step-sheet.webp", alt: "森林夜景三步创作示范", delay: "1500ms" },
  { src: "/landing/course-story/05-classroom-presentation.webp", alt: "森林夜景课堂演示画面", delay: "2180ms" },
] as const;

const PROCESS_STEPS = [
  {
    number: "01",
    eyebrow: "读懂课堂",
    title: "把模糊的想法，整理成清楚的课程边界",
    copy: "从老师的描述中梳理主题、年龄、班级人数、课时、材料与视觉要求；缺少的部分保留给老师确认，不替老师擅自决定。",
    output: "课程边界与课程蓝图",
  },
  {
    number: "02",
    eyebrow: "搭好教学骨架",
    title: "让教案不只完整，也真正适合课堂执行",
    copy: "把学习目标、引导提问、教学阶段、材料准备与安全提醒编排成可编辑的结构化教案，确认后再进入视觉创作。",
    output: "可编辑的结构化教案",
  },
  {
    number: "03",
    eyebrow: "建立视觉线索",
    title: "从主范画到三联步骤图，保持同一套画面语言",
    copy: "先锁定构图、色彩与材料肌理，再生成主范画和连续三步示范；老师可以比较历史版本，选定满意方案后继续。",
    output: "1 张主范画与 3 张步骤图",
  },
  {
    number: "04",
    eyebrow: "准备走进课堂",
    title: "把观察、提问与示范，编排成老师讲得顺的课堂演示",
    copy: "前半段用真实观察素材引导孩子发现，后半段结合范画与步骤图进入示范，让每一页都有讲解目的，而不只是摆放图片。",
    output: "可全屏授课的课堂演示",
  },
] as const;

const PRICING_PLANS = [
  {
    key: "experience",
    eyebrow: "START HERE",
    name: "体验版",
    price: "免费",
    unit: "",
    description: "适合第一次完整体验画课的老师",
    features: [
      "完整生成 3 门课程",
      "包含教案、范画、三联步骤图与课堂演示",
      "已生成课程可以继续查看",
    ],
    action: "免费开始",
    available: true,
    featured: false,
  },
  {
    key: "co-creator",
    eyebrow: "FOR TEACHERS",
    name: "共创版",
    price: "¥29.9",
    unit: "/ 月",
    description: "适合持续备课的独立老师",
    features: [
      "每月完整生成 15 门课程",
      "每个新周期重新计算课程额度",
      "包含体验版的完整课程链路",
    ],
    action: "即将开放",
    available: false,
    featured: true,
  },
  {
    key: "institution",
    eyebrow: "FOR STUDIOS",
    name: "机构版",
    price: "暂定",
    unit: "",
    description: "适合画室、学校与教研团队试点",
    features: [
      "课程额度按实际合作方案配置",
      "保留完整的课程生成与授课链路",
      "由管理员协助开通和调整额度",
    ],
    action: "方案筹备中",
    available: false,
    featured: false,
  },
] as const;

type TurnDirection = "next" | "previous";
const CURL_STRIPS = 24;
const CURL_BEND = 0.6;
const spreadLoadCache = new Map<string, Promise<boolean>>();

function prepareSpread(src: string) {
  const cached = spreadLoadCache.get(src);
  if (cached) return cached;

  const pending = new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      void image.decode()
        .catch(() => undefined)
        .then(() => resolve(image.naturalWidth > 0));
    };
    image.onerror = () => resolve(false);
    image.src = src;
  });

  spreadLoadCache.set(src, pending);
  void pending.then((loaded) => {
    if (!loaded) spreadLoadCache.delete(src);
  });
  return pending;
}

export function SketchbookLanding({ onEnter }: { onEnter: () => void }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [turnDirection, setTurnDirection] = useState<TurnDirection | null>(null);
  const landingRef = useRef<HTMLElement>(null);
  const pointerStart = useRef<number | null>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const autoTurnTimerRef = useRef<number | null>(null);
  const autoTourActiveRef = useRef(true);
  const turnRequestRef = useRef(0);

  const stopAutoTour = useCallback(() => {
    autoTourActiveRef.current = false;
    turnRequestRef.current += 1;
    if (autoTurnTimerRef.current !== null) {
      window.clearTimeout(autoTurnTimerRef.current);
      autoTurnTimerRef.current = null;
    }
  }, []);

  const turnPage = useCallback(async (direction: TurnDirection) => {
    if (turnDirection) return;
    const targetIndex = direction === "next" ? pageIndex + 1 : pageIndex - 1;
    if (targetIndex < 0 || targetIndex >= SPREADS.length) return;
    const requestId = ++turnRequestRef.current;
    const ready = await prepareSpread(SPREADS[targetIndex].src);
    if (!ready || requestId !== turnRequestRef.current) return;
    setTurnDirection(direction);
  }, [pageIndex, turnDirection]);

  useEffect(() => {
    const nearbyIndexes = [pageIndex - 1, pageIndex, pageIndex + 1];
    nearbyIndexes.forEach((index) => {
      const spread = SPREADS[index];
      if (spread) void prepareSpread(spread.src);
    });
  }, [pageIndex]);

  useEffect(() => () => {
    turnRequestRef.current += 1;
  }, []);

  useEffect(() => {
    if (!turnDirection) {
      bookRef.current?.style.setProperty("--landing-turn", "0deg");
      bookRef.current?.style.setProperty("--landing-curl", "0deg");
      bookRef.current?.style.setProperty("--landing-shade", "0");
      return;
    }

    const targetIndex = turnDirection === "next" ? pageIndex + 1 : pageIndex - 1;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 1 : 860;
    const startedAt = performance.now();

    function animate(now: number) {
      const rawProgress = Math.min(1, (now - startedAt) / duration);
      const progress = 0.5 - Math.cos(Math.PI * rawProgress) / 2;
      const sweep = Math.PI * progress;
      const bend = CURL_BEND * Math.sin(Math.PI * progress);
      const degrees = 180 / Math.PI;
      bookRef.current?.style.setProperty("--landing-turn", `${((sweep + bend) * degrees).toFixed(2)}deg`);
      bookRef.current?.style.setProperty("--landing-curl", `${((2 * bend / CURL_STRIPS) * degrees).toFixed(3)}deg`);
      bookRef.current?.style.setProperty("--landing-shade", Math.sin(Math.PI * progress).toFixed(3));
      if (rawProgress < 1) {
        animationRef.current = window.requestAnimationFrame(animate);
        return;
      }
      setPageIndex(targetIndex);
      setTurnDirection(null);
      animationRef.current = null;
    }

    animationRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
    };
  }, [pageIndex, turnDirection]);

  useEffect(() => {
    if (!autoTourActiveRef.current || turnDirection || pageIndex === SPREADS.length - 1) return;
    const delay = pageIndex === 0 ? 1100 : 850;
    autoTurnTimerRef.current = window.setTimeout(() => {
      void turnPage("next");
    }, delay);
    return () => {
      if (autoTurnTimerRef.current !== null) window.clearTimeout(autoTurnTimerRef.current);
    };
  }, [pageIndex, turnDirection, turnPage]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        stopAutoTour();
        turnPage("next");
      }
      if (event.key === "ArrowLeft") {
        stopAutoTour();
        turnPage("previous");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stopAutoTour, turnPage]);

  useEffect(() => {
    const landing = landingRef.current;
    if (!landing) return;

    const revealItems = Array.from(landing.querySelectorAll<HTMLElement>("[data-scroll-reveal]"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    landing.classList.add("is-scroll-ready");

    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      revealItems.forEach((item) => item.classList.add("is-revealed"));
      return () => landing.classList.remove("is-scroll-ready");
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.12 });

    revealItems.forEach((item) => observer.observe(item));

    const doodleLayer = landing.querySelector<HTMLElement>(".landing-page-illustrations");
    let scrollFrame: number | null = null;
    const updateDoodleParallax = () => {
      doodleLayer?.style.setProperty("--landing-doodle-shift", `${(-window.scrollY * 0.012).toFixed(1)}px`);
      scrollFrame = null;
    };
    const handleScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = window.requestAnimationFrame(updateDoodleParallax);
    };

    updateDoodleParallax();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      landing.classList.remove("is-scroll-ready");
    };
  }, []);

  const targetIndex = turnDirection === "next"
    ? pageIndex + 1
    : turnDirection === "previous"
      ? pageIndex - 1
      : pageIndex;
  const current = SPREADS[pageIndex];
  const target = SPREADS[targetIndex];

  function finishPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (pointerStart.current === null) return;
    stopAutoTour();
    const distance = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(distance) < 48) {
      const bounds = event.currentTarget.getBoundingClientRect();
      turnPage(event.clientX - bounds.left > bounds.width / 2 ? "next" : "previous");
      return;
    }
    turnPage(distance < 0 ? "next" : "previous");
  }

  return (
    <main ref={landingRef} className="sketchbook-landing">
      <BotanicalSketch side="left" />
      <BotanicalSketch side="right" />
      <div className="landing-corner-botanicals" aria-hidden="true" />
      <div className="landing-page-illustrations" aria-hidden="true" />

      <header className="sketchbook-nav">
        <div className="sketchbook-brand" aria-label="画课">
          <strong>
            {/* Lettering extracted from the user's brush-calligraphy reference. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/huake-wordmark.webp" alt="" />
          </strong>
          <span>儿童美术课程设计工作台</span>
        </div>
      </header>

      <section className="sketchbook-hero" aria-labelledby="sketchbook-heading">
        <div className={`sketchbook-copy${"isEntry" in current && current.isEntry ? " is-entry" : ""}`} key={pageIndex} aria-live="polite">
          <p>{current.eyebrow}</p>
          <h1 id="sketchbook-heading">{current.title}</h1>
          <span>{current.copy}</span>
        </div>

        <div className="sketchbook-viewer">
          <button
            className="sketchbook-arrow previous"
            type="button"
            aria-label="上一页"
            disabled={pageIndex === 0 || Boolean(turnDirection)}
            onClick={() => {
              stopAutoTour();
              turnPage("previous");
            }}
          >
            ←
          </button>

          <div className="sketchbook-shadow">
            <div
              ref={bookRef}
              className={`sketchbook-book${turnDirection ? ` turn-${turnDirection}` : ""}`}
              role="group"
              aria-label={`写生册第 ${pageIndex + 1} 页，共 ${SPREADS.length} 页`}
              tabIndex={0}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("button")) return;
                stopAutoTour();
                pointerStart.current = event.clientX;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={finishPointer}
              onPointerCancel={() => { pointerStart.current = null; }}
            >
              <SpreadImage className="sketchbook-underlay" src={target.src} />

              {turnDirection && (
                <>
                  <div className={`sketchbook-still ${turnDirection === "next" ? "left" : "right"}`}>
                    <SpreadImage src={current.src} />
                  </div>
                  <CurlLeaf direction={turnDirection} fromSrc={current.src} toSrc={target.src} />
                </>
              )}

              {!turnDirection && "isEntry" in current && current.isEntry && (
                <div className="sketchbook-final-entry">
                  <button type="button" aria-label="开始设计课程" onClick={onEnter} />
                </div>
              )}

              <span className="sketchbook-gutter" aria-hidden="true" />
            </div>
          </div>

          <button
            className="sketchbook-arrow next"
            type="button"
            aria-label="下一页"
            disabled={pageIndex === SPREADS.length - 1 || Boolean(turnDirection)}
            onClick={() => {
              stopAutoTour();
              turnPage("next");
            }}
          >
            →
          </button>
        </div>

        <div className="sketchbook-scroll-cue">
          <span>向下看看，一堂课如何慢慢成形</span>
          <i aria-hidden="true">↓</i>
        </div>
      </section>

      <CourseStoryShowcase />

      <CourseShelf />

      <section className="landing-process" aria-labelledby="landing-process-title">
        <div className="landing-section-intro" data-scroll-reveal="intro">
          <p>FROM IDEA TO CLASSROOM</p>
          <h2 id="landing-process-title">一节课，是怎样被画出来的？</h2>
          <span>每一步都先让老师看见、修改并确认，再进入下一步。</span>
        </div>
        <div className="landing-process-list">
          {PROCESS_STEPS.map((step) => (
            <article
              className="landing-process-item"
              data-scroll-reveal="process"
              key={step.number}
              style={{ "--reveal-delay": `${Number(step.number) * 45}ms` } as CSSProperties}
              tabIndex={0}
            >
              <span className="landing-process-number">{step.number}</span>
              <div>
                <small>{step.eyebrow}</small>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </div>
              <strong>{step.output}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-pricing" aria-labelledby="landing-pricing-title">
        <div className="landing-section-intro landing-pricing-intro" data-scroll-reveal="intro">
          <p>CHOOSE YOUR PACE</p>
          <h2 id="landing-pricing-title">选择适合你的备课节奏</h2>
          <span>先从三门完整课程开始，再按每个月的实际备课量决定是否升级。</span>
        </div>

        <div className="landing-pricing-grid">
          {PRICING_PLANS.map((plan, index) => (
            <article
              className={`landing-pricing-card plan-${plan.key}${plan.featured ? " is-featured" : ""}`}
              data-scroll-reveal="card"
              key={plan.key}
              style={{ "--reveal-delay": `${index * 140}ms` } as CSSProperties}
            >
              {plan.featured && <span className="landing-pricing-badge">推荐方案</span>}
              <p className="landing-pricing-eyebrow">{plan.eyebrow}</p>
              <h3>{plan.name}</h3>
              <div className="landing-pricing-price">
                <strong>{plan.price}</strong>
                {plan.unit && <span>{plan.unit}</span>}
              </div>
              <p className="landing-pricing-description">{plan.description}</p>
              <ul>
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <button
                type="button"
                disabled={!plan.available}
                onClick={plan.available ? onEnter : undefined}
              >
                {plan.action}
              </button>
            </article>
          ))}
        </div>

        <p className="landing-pricing-note" data-scroll-reveal="note">
          课程在首次进入生成阶段时计入额度；同一课程的后续步骤不会重复计数，删除课程不会返还名额。共创版与机构版的在线支付和升级入口尚未开放。
        </p>
      </section>

      <footer className="landing-closing">
        <p data-scroll-reveal="closing">把灵感留下，把课堂准备好。</p>
      </footer>
    </main>
  );
}

function CourseStoryShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setIsVisible(true);
      observer.disconnect();
    }, { rootMargin: "0px 0px -10%", threshold: 0.12 });

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`landing-story${isVisible ? " is-visible" : ""}`}
      aria-labelledby="landing-story-title"
    >
      <div className="landing-story-backdrop" aria-hidden="true">
        {COURSE_STORY_ASSETS.map((asset, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={asset.src} src={asset.src} alt="" className={`backdrop-${index + 1}`} />
        ))}
      </div>
      <span className="landing-story-glow" aria-hidden="true" />

      <ol className="landing-story-stage">
        {COURSE_STORY_ASSETS.map((asset, index) => (
          <li
            className={`landing-story-piece piece-${index + 1}`}
            key={asset.src}
            style={{ "--story-delay": asset.delay } as CSSProperties}
          >
            {/* Decorative course artifacts retain their authored transparent edges and shadows. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.src} alt={asset.alt} loading="lazy" decoding="async" />
          </li>
        ))}
      </ol>

      <div className="landing-story-lockup">
        <p>FROM IDEA TO CLASSROOM</p>
        <h2 id="landing-story-title" aria-label="从灵感，到课堂">
          {Array.from("从灵感，到课堂").map((character, index) => (
            <span
              aria-hidden="true"
              key={`${character}-${index}`}
              style={{ "--letter-delay": `${index * 72}ms` } as CSSProperties}
            >
              {character}
            </span>
          ))}
        </h2>
        <i aria-hidden="true" />
        <strong>一堂好课，在这里慢慢成形</strong>
      </div>
    </section>
  );
}

function CourseShelf() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [shelfDirection, setShelfDirection] = useState<"next" | "previous">("next");
  const shelfPointerStart = useRef<number | null>(null);

  function selectCourse(direction: -1 | 1) {
    setShelfDirection(direction === 1 ? "next" : "previous");
    setActiveIndex((current) => (current + direction + FEATURED_COURSES.length) % FEATURED_COURSES.length);
  }

  function tiltCourseBook(event: React.PointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty("--book-tilt-x", `${(-y * 5).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--book-tilt-y", `${(x * 7).toFixed(2)}deg`);
  }

  function finishShelfPointer(event: React.PointerEvent<HTMLElement>) {
    if (shelfPointerStart.current === null) return;
    const distance = event.clientX - shelfPointerStart.current;
    shelfPointerStart.current = null;
    if (Math.abs(distance) < 44) return;
    selectCourse(distance < 0 ? 1 : -1);
  }

  return (
    <section className="landing-course-shelf" aria-labelledby="course-shelf-title">
      <div className="landing-section-intro shelf-intro" data-scroll-reveal="intro">
        <h2 id="course-shelf-title">课程不只是记录，它们会像一本本可以重新翻开的教学画册。</h2>
      </div>

      <div className="landing-shelf-frame" data-scroll-reveal="shelf" style={{ "--reveal-delay": "110ms" } as CSSProperties}>
        <button type="button" aria-label="上一门课程" onClick={() => selectCourse(-1)}>←</button>
        <div className={`landing-course-stage slide-${shelfDirection}`} aria-live="polite">
          {FEATURED_COURSES.map((course, index) => (
            <article
                className={`landing-course-book tone-${(index % 3) + 1}${index === activeIndex ? " is-active" : ""}`}
                key={course.title}
                role="group"
                aria-label={`${course.title}，${course.medium}`}
                tabIndex={0}
                onPointerDown={(event) => {
                  shelfPointerStart.current = event.clientX;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={tiltCourseBook}
                onPointerUp={finishShelfPointer}
                onPointerCancel={() => { shelfPointerStart.current = null; }}
                onPointerLeave={(event) => {
                  event.currentTarget.style.setProperty("--book-tilt-x", "0deg");
                  event.currentTarget.style.setProperty("--book-tilt-y", "0deg");
                }}
            >
              <span className="landing-book-spine" aria-hidden="true" />
              {/* Fixed public showcase artwork; it is intentionally independent of login state. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={course.src} alt="" />
              <span className="landing-book-copy">
                <small>画课 · 课程 {String(index + 1).padStart(2, "0")}</small>
                <strong>{course.title}</strong>
                <em>{course.medium}</em>
              </span>
            </article>
          ))}
          <span className="landing-course-counter">{String(activeIndex + 1).padStart(2, "0")} / {String(FEATURED_COURSES.length).padStart(2, "0")}</span>
        </div>
        <button type="button" aria-label="下一门课程" onClick={() => selectCourse(1)}>→</button>
      </div>
    </section>
  );
}

function BotanicalSketch({ side }: { side: "left" | "right" }) {
  return (
    <div className={`landing-botanical ${side}`} aria-hidden="true">
      <i /><i /><i /><i /><i />
    </div>
  );
}

function CurlLeaf({
  direction,
  fromSrc,
  toSrc,
}: {
  direction: TurnDirection;
  fromSrc: string;
  toSrc: string;
}) {
  return (
    <div className={`sketchbook-curl ${direction}`} aria-hidden="true">
      <CurlStrip direction={direction} fromSrc={fromSrc} toSrc={toSrc} index={0} />
    </div>
  );
}

function CurlStrip({
  direction,
  fromSrc,
  toSrc,
  index,
}: {
  direction: TurnDirection;
  fromSrc: string;
  toSrc: string;
  index: number;
}) {
  const fromPosition = `calc(-1 * (50cqw + ${index} * 44.9cqw / ${CURL_STRIPS}))`;
  const toPosition = `calc(${index + 1} * 44.9cqw / ${CURL_STRIPS} - 50cqw)`;
  const frontPosition = direction === "next" ? fromPosition : toPosition;
  const backPosition = direction === "next" ? toPosition : fromPosition;
  const shadeIndex = direction === "next" ? index : CURL_STRIPS - index - 1;
  const shadePosition = `calc(-1 * ${shadeIndex} * 44.9cqw / ${CURL_STRIPS})`;

  return (
    <div
      className={`sketchbook-strip${index === CURL_STRIPS - 1 ? " edge" : ""}`}
      style={{ "--curl-shade-position": shadePosition } as CSSProperties}
    >
      <div
        className="sketchbook-strip-face front"
        style={{ backgroundImage: `url(${fromSrc})`, backgroundPositionX: frontPosition }}
      >
        <i className="shade" />
        <i className="glow" />
      </div>
      <div
        className="sketchbook-strip-face back"
        style={{ backgroundImage: `url(${toSrc})`, backgroundPositionX: backPosition }}
      >
        <i className="shade" />
        <i className="glow" />
      </div>
      {index < CURL_STRIPS - 1 && (
        <CurlStrip direction={direction} fromSrc={fromSrc} toSrc={toSrc} index={index + 1} />
      )}
    </div>
  );
}

function SpreadImage({ src, className = "" }: { src: string; className?: string }) {
  return (
    // Generated local assets are rendered natively so the same full spread can be cropped inside turning page halves.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`sketchbook-spread ${className}`} src={src} alt="" draggable={false} />
  );
}
