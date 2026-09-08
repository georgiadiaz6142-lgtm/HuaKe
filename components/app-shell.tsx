"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { ApiError, api, assetContentUrl } from "@/lib/api";
import { canonicalLocalUrl } from "@/lib/auth-state";
import { matchesCourseFilter } from "@/lib/dashboard-state";
import type { CourseFilter } from "@/lib/dashboard-state";
import { ArtworkSpecView } from "@/components/artwork-spec-view";
import { LessonView } from "@/components/lesson-view";
import { MainArtworkView } from "@/components/main-artwork-view";
import { StepSheetView } from "@/components/step-sheet-view";
import { SlidePlanView } from "@/components/slide-plan-view";
import { SketchbookLanding } from "@/components/sketchbook-landing";
import type {
  ArtworkSpecVersion,
  BlueprintVersion,
  CourseStage,
  Course,
  EditableInputSpecPayload,
  InputSpecVersion,
  Job,
  LearningObjective,
  EditableLessonPayload,
  EditableMainArtworkSpecPayload,
  LessonVersion,
  MainArtworkVersion,
  StepSheetVersion,
  SlidePlanVersion,
  EditableSemanticSlidePlanV02,
  User,
} from "@/lib/types";

const JOB_POLL_MS = 650;
const EXAMPLE_REQUIREMENT =
  "为 6—8 岁、12 人的小班设计一节森林夜景主题的水粉课，希望画面有冷暖色对比，课程 75 分钟。";
const LOGIN_STEPS = ["描述课程", "确认边界", "课程蓝图", "结构化教案", "主范画规格", "主范画", "三联步骤图", "课堂演示"] as const;
type RetryableCourseError = { message: string; retry: () => void };

function trackBorderGlow(event: ReactPointerEvent<HTMLElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  const distanceToEdge = Math.min(x, y, bounds.width - x, bounds.height - y);
  const sensitivity = Math.min(96, bounds.width / 2, bounds.height / 2);
  const edgeProximity = 1 - Math.min(Math.max(distanceToEdge / sensitivity, 0), 1);

  event.currentTarget.style.setProperty("--border-glow-x", `${x}px`);
  event.currentTarget.style.setProperty("--border-glow-y", `${y}px`);
  event.currentTarget.style.setProperty("--border-glow-opacity", `${0.2 + edgeProximity * 0.8}`);
}

function trackCursorGrid(event: ReactPointerEvent<HTMLElement>) {
  event.currentTarget.style.setProperty("--cursor-grid-x", `${event.clientX}px`);
  event.currentTarget.style.setProperty("--cursor-grid-y", `${event.clientY}px`);
  event.currentTarget.style.setProperty("--cursor-grid-active", "1");
}

function trackStateRail(event: ReactPointerEvent<HTMLElement>) {
  const radius = 92;
  const rows = event.currentTarget.querySelectorAll<HTMLElement>(".state-row");
  rows.forEach((row) => {
    const bounds = row.getBoundingClientRect();
    const center = bounds.top + bounds.height / 2;
    const proximity = Math.max(0, 1 - Math.abs(event.clientY - center) / radius);
    const eased = proximity * proximity * (3 - 2 * proximity);
    row.style.setProperty("--line-effect", eased.toFixed(4));
  });
}

function resetStateRail(event: ReactPointerEvent<HTMLElement>) {
  event.currentTarget.querySelectorAll<HTMLElement>(".state-row").forEach((row) => {
    row.style.setProperty("--line-effect", "0");
  });
}

function trackDock(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;
  const influenceRadius = 132;
  event.currentTarget.querySelectorAll<HTMLElement>(".app-dock-item").forEach((item) => {
    const bounds = item.getBoundingClientRect();
    const center = bounds.left + bounds.width / 2;
    const proximity = Math.max(0, 1 - Math.abs(event.clientX - center) / influenceRadius);
    item.style.setProperty("--dock-item-width", `${52 + proximity * 18}px`);
    item.style.setProperty("--dock-item-height", `${42 + proximity * 16}px`);
    item.style.setProperty("--dock-glow", `${proximity}`);
  });
}

function resetDockItems(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>(".app-dock-item").forEach((item) => {
    item.style.setProperty("--dock-item-width", "52px");
    item.style.setProperty("--dock-item-height", "42px");
    item.style.setProperty("--dock-glow", "0");
  });
}

function resetDock(event: ReactPointerEvent<HTMLElement>) {
  resetDockItems(event.currentTarget);
}

function settleDockPress(event: ReactPointerEvent<HTMLButtonElement>) {
  const dock = event.currentTarget.closest<HTMLElement>(".app-dock");
  if (dock) resetDockItems(dock);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "发生未知错误，请稍后重试。";
}

function sortCourses(items: Course[]): Course[] {
  return [...items].sort((left, right) => {
    const pinOrder = Date.parse(right.pinned_at ?? "") - Date.parse(left.pinned_at ?? "");
    if (!Number.isNaN(pinOrder) && pinOrder !== 0) return pinOrder;
    if (left.pinned_at && !right.pinned_at) return -1;
    if (!left.pinned_at && right.pinned_at) return 1;
    return Date.parse(right.updated_at) - Date.parse(left.updated_at);
  });
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function AppShell({ initialCourseId = null }: { initialCourseId?: string | null }) {
  const [showLanding, setShowLanding] = useState(!initialCourseId);
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const requestedCourseId = initialCourseId;
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const creatingCourseRef = useRef(false);
  const accountDockButtonRef = useRef<HTMLButtonElement>(null);

  const refreshCourses = useCallback(async () => {
    const result = await api.courses();
    setCourses(result.items);
    return result.items;
  }, []);

  useEffect(() => {
    const canonicalUrl = canonicalLocalUrl(window.location.href);
    if (canonicalUrl) {
      window.location.replace(canonicalUrl);
      return;
    }
    const returnCourseId = initialCourseId;
    let active = true;
    Promise.all([api.meta(), api.me()])
      .then(async ([, me]) => {
        if (!active) return;
        setUser(me.user);
        const result = await api.courses();
        if (active) {
          setCourses(result.items);
          if (returnCourseId) {
            setActiveCourse(result.items.find((course) => course.id === returnCourseId) ?? null);
          }
        }
      })
      .catch(async (error: unknown) => {
        if (!active) return;
        try {
          await api.meta();
        } catch {
          setNotice("后端服务尚未连接，请确认 API 已在 8010 端口启动。");
        }
        if (!(error instanceof ApiError && error.status === 401)) {
          setNotice(errorMessage(error));
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [initialCourseId]);

  async function handleLogin(inviteCode: string) {
    setNotice(null);
    const result = await api.login(inviteCode);
    setUser(result.user);
    const items = await refreshCourses();
    if (requestedCourseId) {
      setActiveCourse(items.find((course) => course.id === requestedCourseId) ?? null);
    }
  }

  async function handleLogout() {
    await api.logout();
    setAccountOpen(false);
    setPlanOpen(false);
    setUser(null);
    setActiveCourse(null);
    setCourses([]);
  }

  async function createCourse() {
    if (creatingCourseRef.current) return;
    creatingCourseRef.current = true;
    setCreatingCourse(true);
    setNotice(null);
    try {
      const course = await api.createCourse();
      setCourses((current) => [course, ...current]);
      setUser((current) => current ? {
        ...current,
        course_count: current.course_count + 1,
        last_course_at: course.updated_at,
      } : current);
      setActiveCourse(course);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      creatingCourseRef.current = false;
      setCreatingCourse(false);
    }
  }

  async function setCoursePinned(course: Course, pinned: boolean) {
    setNotice(null);
    const updated = pinned
      ? await api.pinCourse(course.id)
      : await api.unpinCourse(course.id);
    setCourses((current) => sortCourses(
      current.map((item) => item.id === updated.id ? updated : item),
    ));
  }

  async function deleteCourse(course: Course) {
    setNotice(null);
    await api.deleteCourse(course.id);
    setCourses((current) => current.filter((item) => item.id !== course.id));
    setUser((current) => current ? {
      ...current,
      course_count: Math.max(0, current.course_count - 1),
    } : current);
  }

  async function restoreCourse(course: Course) {
    setNotice(null);
    const restored = await api.restoreCourse(course.id);
    setCourses((current) => sortCourses([
      restored,
      ...current.filter((item) => item.id !== restored.id),
    ]));
    setUser((current) => current ? {
      ...current,
      course_count: current.course_count + 1,
      last_course_at: current.last_course_at && current.last_course_at > restored.updated_at
        ? current.last_course_at
        : restored.updated_at,
    } : current);
  }

  async function createReentryCode() {
    const result = await api.createReentryCode();
    setUser(result.user);
    return result.invite_code;
  }

  const handleWorkspaceBack = useCallback(async () => {
    try {
      const [, account] = await Promise.all([refreshCourses(), api.me()]);
      setUser(account.user);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setActiveCourse(null);
    }
  }, [refreshCourses]);

  const closeAccount = useCallback(() => setAccountOpen(false), []);

  const openDashboard = useCallback(async () => {
    setAccountOpen(false);
    setPlanOpen(false);
    if (activeCourse) {
      await handleWorkspaceBack();
    }
  }, [activeCourse, handleWorkspaceBack]);

  async function createFromDock() {
    setAccountOpen(false);
    setPlanOpen(false);
    await createCourse();
  }

  async function openPlans() {
    setAccountOpen(false);
    if (activeCourse) {
      await handleWorkspaceBack();
    }
    setPlanOpen(true);
  }

  async function redeemSubscriptionCode(code: string) {
    const result = await api.redeemSubscriptionCode(code);
    setUser(result.user);
    return result.user;
  }

  const handleCourseChange = useCallback((course: Course) => {
    setActiveCourse(course);
    setCourses((current) =>
      current.map((item) => (item.id === course.id ? course : item)),
    );
  }, []);

  if (showLanding) {
    return <SketchbookLanding onEnter={() => setShowLanding(false)} />;
  }

  if (loading) {
    return <FullPageMessage eyebrow="画课" title="正在连接课程工作台…" />;
  }

  if (!user) {
    return <LoginView notice={notice} onLogin={handleLogin} />;
  }

  return (
    <main
      className={`app-frame ${activeCourse ? "workspace-frame" : "dashboard-frame"}`}
      onPointerMove={trackCursorGrid}
      onPointerLeave={(event) => event.currentTarget.style.setProperty("--cursor-grid-active", "0")}
    >
      <header className="topbar">
        <button className="brand" type="button" onClick={() => {
          setAccountOpen(false);
          setPlanOpen(false);
          setActiveCourse(null);
        }}>
          {/* Logo extracted from the user's uploaded artwork. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/landing/login-logo.webp" alt="" />
          <span>
            <strong>画课</strong>
            <small>儿童美术课程工作台</small>
          </span>
        </button>
      </header>

      {activeCourse && (
        <div className="workspace-return-bar">
          <div className="workspace-return-inner page-width">
            <button className="back-button workspace-return-button" type="button" onClick={handleWorkspaceBack}>
              ← 返回课程列表
            </button>
          </div>
        </div>
      )}

      {notice && <div className="global-notice">{notice}</div>}

      {planOpen ? (
        <SubscriptionView user={user} onRedeem={redeemSubscriptionCode} />
      ) : activeCourse ? (
        <CourseWorkspace
          initialCourse={activeCourse}
          onCourseChange={handleCourseChange}
        />
      ) : (
        <Dashboard
          courses={courses}
          creating={creatingCourse}
          user={user}
          onCreate={createCourse}
          onOpen={setActiveCourse}
          onSetPinned={setCoursePinned}
          onDelete={deleteCourse}
          onRestore={restoreCourse}
        />
      )}

      <AccountSheet
        open={accountOpen}
        user={user}
        returnFocusRef={accountDockButtonRef}
        onClose={closeAccount}
        onCreateReentryCode={createReentryCode}
        onLogout={handleLogout}
      />
      <AppDock
        dashboardActive={!accountOpen && !planOpen}
        plansActive={planOpen}
        accountActive={accountOpen}
        creating={creatingCourse}
        accountButtonRef={accountDockButtonRef}
        onDashboard={() => void openDashboard()}
        onCreate={() => void createFromDock()}
        onPlans={() => void openPlans()}
        onAccount={() => {
          setPlanOpen(false);
          setAccountOpen((current) => !current);
        }}
      />
    </main>
  );
}

function LoginView({
  notice,
  onLogin,
}: {
  notice: string | null;
  onLogin: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onLogin(code.trim());
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-layout">
      <section className="login-story">
        <div className="story-kicker">HUÀ KÈ</div>
        <h1>先把一节好课，想清楚。</h1>
        <p>
          从课程条件、教案和视觉资产，走到可预览、可审核、可全屏上课的课堂演示。
        </p>
        <ol className="story-steps" aria-label="课程设计流程">
          {LOGIN_STEPS.map((step) => (
            <li key={step}>
              <i aria-hidden="true" />
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="login-panel">
        <div className="login-card">
          {/* Logo extracted from the user's uploaded artwork. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-brand-logo" src="/landing/login-logo.webp" alt="画课" />
          <p className="eyebrow">内部测试入口</p>
          <h2>使用登录码进入</h2>
          <p className="muted">
            首次获得的邀请码也是你的登录码。使用同一个登录码，会回到原账号和原课程。
          </p>
          <form onSubmit={submit}>
            <label htmlFor="invite-code">登录码</label>
            <input
              id="invite-code"
              autoComplete="one-time-code"
              value={code}
              minLength={8}
              onChange={(event) => setCode(event.target.value)}
              placeholder="请输入有效登录码"
              required
            />
            {(error || notice) && <div className="inline-error">{error ?? notice}</div>}
            <button className="primary-button full" disabled={submitting} type="submit">
              {submitting ? "正在验证…" : "进入工作台"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Dashboard({
  courses,
  creating,
  user,
  onCreate,
  onOpen,
  onSetPinned,
  onDelete,
  onRestore,
}: {
  courses: Course[];
  creating: boolean;
  user: User;
  onCreate: () => void;
  onOpen: (course: Course) => void;
  onSetPinned: (course: Course, pinned: boolean) => Promise<void>;
  onDelete: (course: Course) => Promise<void>;
  onRestore: (course: Course) => Promise<void>;
}) {
  const [failedCourseCovers, setFailedCourseCovers] = useState<Record<string, string>>({});
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [courseActionError, setCourseActionError] = useState<RetryableCourseError | null>(null);
  const [recentlyDeletedCourse, setRecentlyDeletedCourse] = useState<Course | null>(null);
  const [restoringCourseId, setRestoringCourseId] = useState<string | null>(null);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);
  const [courseQuery, setCourseQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState<CourseFilter>("all");
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteCancelButtonRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);

  async function handlePin(course: Course) {
    setPendingCourseId(course.id);
    setCourseActionError(null);
    try {
      await onSetPinned(course, !course.pinned_at);
    } catch (error) {
      setCourseActionError({
        message: errorMessage(error),
        retry: () => void handlePin(course),
      });
    } finally {
      setPendingCourseId(null);
    }
  }

  function requestDelete(course: Course, trigger: HTMLButtonElement) {
    deleteTriggerRef.current = trigger;
    setCourseActionError(null);
    setDeleteDialogError(null);
    setCourseToDelete(course);
  }

  function closeDeleteDialog() {
    if (courseToDelete && pendingCourseId === courseToDelete.id) return;
    setCourseToDelete(null);
    setDeleteDialogError(null);
    window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
  }

  async function confirmDelete() {
    if (!courseToDelete) return;
    const course = courseToDelete;
    setPendingCourseId(course.id);
    setDeleteDialogError(null);
    try {
      await onDelete(course);
      setRecentlyDeletedCourse(course);
      setCourseToDelete(null);
    } catch (error) {
      setDeleteDialogError(errorMessage(error));
    } finally {
      setPendingCourseId(null);
    }
  }

  useEffect(() => {
    if (!courseToDelete) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => deleteCancelButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [courseToDelete]);

  useEffect(() => {
    if (!courseToDelete) return;
    const courseId = courseToDelete.id;
    function handleDialogKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && pendingCourseId !== courseId) {
        setCourseToDelete(null);
        setDeleteDialogError(null);
        window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        deleteDialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      if (buttons.length === 0) {
        event.preventDefault();
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleDialogKeydown);
    return () => document.removeEventListener("keydown", handleDialogKeydown);
  }, [courseToDelete, pendingCourseId]);

  useEffect(() => {
    if (!recentlyDeletedCourse || restoringCourseId || courseActionError) return;
    const timeout = window.setTimeout(() => setRecentlyDeletedCourse(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [courseActionError, recentlyDeletedCourse, restoringCourseId]);

  async function handleUndoDelete() {
    if (!recentlyDeletedCourse) return;
    const course = recentlyDeletedCourse;
    setRestoringCourseId(course.id);
    setCourseActionError(null);
    try {
      await onRestore(course);
      setRecentlyDeletedCourse(null);
    } catch (error) {
      setCourseActionError({
        message: errorMessage(error),
        retry: () => void handleUndoDelete(),
      });
    } finally {
      setRestoringCourseId(null);
    }
  }

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => matchesCourseFilter(course, courseQuery, courseFilter));
  }, [courseFilter, courseQuery, courses]);

  const hasCourseFilters = Boolean(courseQuery.trim()) || courseFilter !== "all";
  const courseRemaining = user.entitlement.course_remaining;
  const quotaAttention = user.entitlement.status !== "active"
    ? {
        className: "is-exhausted",
        summary: "当前套餐已到期；可先创建课程草稿，生成前请兑换或续期。",
      }
    : courseRemaining === 0
      ? {
          className: "is-exhausted",
          summary: "完整课程额度已用完；可先创建草稿，生成前请兑换或升级。",
        }
      : courseRemaining === 1
        ? {
            className: "is-low",
            summary: "仅剩 1 门完整课程额度，新课程首次进入生成时会占用。",
          }
        : null;

  return (
    <section className="dashboard page-width">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">儿童美术课程设计工作台</p>
          <h1>从一个教学灵感，走到一堂准备充分的美术课。</h1>
          <p className="lead">梳理课程目标，完善教案，准备主范画与步骤图，最后编排成适合老师讲解、学生观看的课堂演示。</p>
          <p className={`dashboard-quota${quotaAttention ? ` ${quotaAttention.className}` : ""}`}>
            <strong>{user.entitlement.plan_name}</strong>
            <span>
              {user.entitlement.status !== "active"
                ? `当前周期已到期 · 已使用 ${user.entitlement.course_used} 门`
                : user.entitlement.course_limit === null
                  ? `已生成 ${user.entitlement.course_used} 门 · 课程额度不限`
                  : `已使用 ${user.entitlement.course_used} / ${user.entitlement.course_limit} 门，剩余 ${user.entitlement.course_remaining ?? 0} 门`}
            </span>
          </p>
        </div>
        <div className="dashboard-create-area">
          <button className="primary-button dashboard-create-button" type="button" disabled={creating} onClick={onCreate}>
            {creating ? "正在创建…" : "＋ 新建课程"}
          </button>
          {quotaAttention && <small className={quotaAttention.className}>{quotaAttention.summary}</small>}
        </div>
      </div>

      <div className="section-heading">
        <div>
          <p className="eyebrow">RECENT COURSES</p>
          <h2>最近课程</h2>
        </div>
        <span>
          {hasCourseFilters ? `${filteredCourses.length} / ${courses.length}` : courses.length} 个课程项目
        </span>
      </div>

      {courses.length > 0 && (
        <div className="course-toolbar" role="search" aria-label="搜索和筛选课程">
          <label className="course-search-field">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={courseQuery}
              onChange={(event) => setCourseQuery(event.target.value)}
              placeholder="搜索课程名称"
              aria-label="搜索课程名称"
            />
          </label>
          <select
            value={courseFilter}
            onChange={(event) => setCourseFilter(event.target.value as CourseFilter)}
            aria-label="按课程状态筛选"
          >
            <option value="all">全部状态</option>
            <option value="active">进行中</option>
            <option value="review">待确认</option>
            <option value="generating">生成中</option>
            <option value="complete">已完成</option>
            <option value="attention">需要处理</option>
          </select>
          {hasCourseFilters && (
            <button
              className="course-filter-reset"
              type="button"
              onClick={() => {
                setCourseQuery("");
                setCourseFilter("all");
              }}
            >
              清除筛选
            </button>
          )}
        </div>
      )}

      {courseActionError && (
        <div className="course-action-error" role="alert">
          <span>{courseActionError.message}</span>
          <button type="button" onClick={courseActionError.retry}>重试</button>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="empty-card">
          <div className="empty-illustration">✦</div>
          <h3>当前账号还没有课程</h3>
          <p>
            如果你以前创建过课程，请先退出并使用原账号的登录码；确认账号无误后，再创建新课程。
          </p>
          <button className="secondary-button" type="button" disabled={creating} onClick={onCreate}>
            {creating ? "正在创建…" : "创建课程"}
          </button>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="course-filter-empty">
          <strong>没有找到符合条件的课程</strong>
          <p>可以换一个课程名称，或清除当前状态筛选。</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setCourseQuery("");
              setCourseFilter("all");
            }}
          >
            查看全部课程
          </button>
        </div>
      ) : (
        <div className="course-grid">
          {filteredCourses.map((course) => {
            const cover = course.cover_thumbnail_url
              ? assetContentUrl(course.cover_thumbnail_url)
              : null;
            const coverFailed = Boolean(
              cover && failedCourseCovers[course.id] === cover,
            );
            return (
              <article
              className={`course-card course-card-with-cover border-glow-frame${course.pinned_at ? " is-pinned" : ""}`}
              key={course.id}
              onPointerMove={trackBorderGlow}
            >
              <button className="course-card-open" type="button" onClick={() => onOpen(course)}>
                <div className="course-cover">
                  {!course.working_main_artwork_version_id ? (
                    <span className="course-cover-fallback" aria-hidden="true" />
                  ) : cover && !coverFailed ? (
                    // Authenticated local artwork responses are intentionally rendered by the browser.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt={`${course.title}的主范画`}
                      crossOrigin="use-credentials"
                      loading="lazy"
                      onError={() => setFailedCourseCovers((current) => ({
                        ...current,
                        [course.id]: cover,
                      }))}
                    />
                  ) : (
                    <span className="course-cover-unavailable">
                      <b>范画暂时无法加载</b>
                      <small>课程内容仍然保留</small>
                    </span>
                  )}
                  <span className={`status-dot status-${course.status}`} />
                </div>
                <div className="course-card-copy">
                  <div>
                    <h3>{course.title}</h3>
                    <p>{statusLabel(course.status)}</p>
                  </div>
                  <time>{new Date(course.updated_at).toLocaleString("zh-CN", { month: "short", day: "numeric" })}</time>
                </div>
              </button>
              <div className="course-card-actions" aria-label={`${course.title}的课程操作`}>
                <button
                  className={`course-pin-button${course.pinned_at ? " active" : ""}`}
                  type="button"
                  disabled={pendingCourseId === course.id}
                  aria-pressed={Boolean(course.pinned_at)}
                  onClick={() => handlePin(course)}
                >
                  {course.pinned_at ? "取消置顶" : "置顶"}
                </button>
                <button
                  className="course-delete-button"
                  type="button"
                  disabled={pendingCourseId === course.id}
                  onClick={(event) => requestDelete(course, event.currentTarget)}
                >
                  删除
                </button>
              </div>
              </article>
            );
          })}
        </div>
      )}

      {recentlyDeletedCourse && (
        <div className="course-undo-toast" role="status" aria-live="polite">
          <span>“{recentlyDeletedCourse.title}”已删除</span>
          <button
            type="button"
            disabled={restoringCourseId === recentlyDeletedCourse.id}
            onClick={handleUndoDelete}
          >
            {restoringCourseId === recentlyDeletedCourse.id ? "正在恢复…" : "撤销"}
          </button>
        </div>
      )}

      {courseToDelete && (
        <div className="course-delete-dialog-layer">
          <button
            className="course-delete-dialog-backdrop"
            type="button"
            tabIndex={-1}
            aria-label="关闭删除确认"
            disabled={pendingCourseId === courseToDelete.id}
            onClick={closeDeleteDialog}
          />
          <div
            ref={deleteDialogRef}
            className="course-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-delete-dialog-title"
            aria-describedby="course-delete-dialog-description"
          >
            <p className="eyebrow">课程操作</p>
            <h3 id="course-delete-dialog-title">删除这门课程？</h3>
            <p id="course-delete-dialog-description">
              “{courseToDelete.title}”会从最近课程中移除。删除后 8 秒内仍可撤销，课程内容和范画不会立即清除。
            </p>
            {deleteDialogError && (
              <div className="course-delete-dialog-error" role="alert">
                {deleteDialogError}
              </div>
            )}
            <div className="course-delete-dialog-actions">
              <button
                ref={deleteCancelButtonRef}
                className="course-delete-dialog-cancel"
                type="button"
                disabled={pendingCourseId === courseToDelete.id}
                onClick={closeDeleteDialog}
              >
                暂不删除
              </button>
              <button
                className="course-delete-dialog-confirm"
                type="button"
                disabled={pendingCourseId === courseToDelete.id}
                onClick={confirmDelete}
              >
                {pendingCourseId === courseToDelete.id
                  ? "正在删除…"
                  : deleteDialogError
                    ? "重试删除"
                    : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SubscriptionView({
  user,
  onRedeem,
}: {
  user: User;
  onRedeem: (code: string) => Promise<User>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const entitlement = user.entitlement;
  const canRedeem = entitlement.plan_key !== "institution";
  const usedPercent = entitlement.course_limit
    ? Math.min(100, Math.round((entitlement.course_used / entitlement.course_limit) * 100))
    : 0;

  async function submitRedemption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode || !canRedeem) return;
    setBusy(true);
    setFeedback(null);
    try {
      const nextUser = await onRedeem(trimmedCode);
      setCode("");
      setFeedback({
        error: false,
        text: nextUser.entitlement.queued_months > 0
          ? `兑换成功。已为当前共创版续上 ${nextUser.entitlement.queued_months} 个月度周期。`
          : "兑换成功。一个月共创版和 15 门课程额度已生效。",
      });
    } catch (error) {
      setFeedback({ error: true, text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="subscription-page" aria-labelledby="subscription-title">
      <header className="subscription-heading">
        <p className="eyebrow">PLAN &amp; QUOTA</p>
        <h1 id="subscription-title">套餐与额度</h1>
        <p>查看当前额度，选择后续套餐，或使用兑换码开通一个月共创版。</p>
      </header>

      <article className="subscription-current-card">
        <div className="subscription-current-heading">
          <div>
            <span>当前套餐</span>
            <strong>{entitlement.plan_name}</strong>
          </div>
          <em>{entitlement.status === "active" ? "生效中" : "已到期"}</em>
        </div>

        {entitlement.course_limit === null ? (
          <p>当前课程额度由管理员按合作方案配置。</p>
        ) : (
          <>
            <div className="subscription-usage-line">
              <span>已用 {entitlement.course_used} 门</span>
              <strong>{entitlement.course_remaining ?? 0} / {entitlement.course_limit} 门可用</strong>
            </div>
            <div
              className="subscription-progress"
              role="progressbar"
              aria-label="课程额度使用进度"
              aria-valuemin={0}
              aria-valuemax={entitlement.course_limit}
              aria-valuenow={entitlement.course_used}
            >
              <span style={{ width: `${usedPercent}%` }} />
            </div>
          </>
        )}

        {entitlement.period_ends_at && (
          <div className="subscription-period">
            <span>当前周期至 {new Date(entitlement.period_ends_at).toLocaleDateString("zh-CN")}</span>
            {entitlement.queued_months > 0 && <strong>已续上 {entitlement.queued_months} 个月度周期</strong>}
          </div>
        )}
      </article>

      <section className="subscription-plans" aria-labelledby="plan-options-title">
            <div className="subscription-section-heading">
              <div>
                <p className="eyebrow">CHOOSE A PLAN</p>
                <h2 id="plan-options-title">套餐选择</h2>
              </div>
              <span>支付功能筹备中</span>
            </div>
            <div className="subscription-plan-grid">
              <article>
                <small>START HERE</small>
                <h3>体验版</h3>
                <p className="subscription-price"><strong>免费</strong></p>
                <p>适合第一次完整体验画课的老师。</p>
                <ul><li>完整生成 3 门课程</li><li>包含教案、范画、三联步骤图与课堂演示</li></ul>
                <button type="button" disabled>{entitlement.plan_key === "experience" ? "当前套餐" : "无需购买"}</button>
              </article>
              <article className="is-recommended">
                <small>FOR TEACHERS</small>
                <h3>共创版</h3>
                <p className="subscription-price"><strong>¥29.9</strong><span>/ 月</span></p>
                <p>适合持续备课的独立老师。</p>
                <ul><li>每月完整生成 15 门课程</li><li>每个新周期重新计算额度</li></ul>
                <button type="button" disabled>{entitlement.plan_key === "co_creator" ? "当前套餐" : "支付功能筹备中"}</button>
              </article>
              <article>
                <small>FOR STUDIOS</small>
                <h3>机构版</h3>
                <p className="subscription-price"><strong>暂定</strong></p>
                <p>适合画室、学校与教研团队试点。</p>
                <ul><li>课程额度按实际合作方案配置</li><li>由管理员协助开通和调整</li></ul>
                <button type="button" disabled>{entitlement.plan_key === "institution" ? "当前套餐" : "暂未开放"}</button>
              </article>
            </div>
      </section>

      <section className="subscription-redemption" aria-labelledby="redemption-title">
            <div>
              <p className="eyebrow">REDEMPTION CODE</p>
              <h2 id="redemption-title">兑换码</h2>
              <p>每个兑换码只能使用一次，兑换后获得 1 个月共创版和 15 门课程额度。如果当前共创版仍有效，新的一个月会自动接在当前周期之后。</p>
            </div>
            {canRedeem ? (
              <form onSubmit={submitRedemption}>
                <label htmlFor="subscription-redemption-code">输入共创版兑换码</label>
                <div>
                  <input
                    id="subscription-redemption-code"
                    autoComplete="off"
                    minLength={12}
                    placeholder="HK-PASS-…"
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                  <button type="submit" disabled={busy || !code.trim()}>{busy ? "正在兑换…" : "立即兑换"}</button>
                </div>
                <small>兑换码与登录码是两种不同的码：登录码用于进入账号，兑换码只用于增加套餐额度。</small>
                {feedback && <p className={feedback.error ? "is-error" : "is-success"} role="status">{feedback.text}</p>}
              </form>
            ) : (
              <div className="subscription-redemption-locked">机构版的额度由管理员统一配置，当前账号无需使用共创版兑换码。</div>
            )}
      </section>
    </section>
  );
}

function DockIcon({ name }: { name: "dashboard" | "create" | "plans" | "account" }) {
  if (name === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.8 10.8 12 4l8.2 6.8v8.4a.8.8 0 0 1-.8.8H4.6a.8.8 0 0 1-.8-.8v-8.4Z" />
        <path d="M9 20v-5.7h6V20" />
      </svg>
    );
  }
  if (name === "create") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.2 3.8h8.9l2.7 2.7v13.7H6.2V3.8Z" />
        <path d="M15 3.8v3h2.8M12 10v6M9 13h6" />
      </svg>
    );
  }
  if (name === "plans") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.2 7.2h15.6v11.6a1.4 1.4 0 0 1-1.4 1.4H5.6a1.4 1.4 0 0 1-1.4-1.4V7.2Z" />
        <path d="M6.3 7.2V5.6a1.8 1.8 0 0 1 1.8-1.8h8.5v3.4M15.5 13.7h4.3" />
        <circle cx="15.3" cy="13.7" r=".7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M5.2 20c.5-4 3-6.1 6.8-6.1s6.3 2.1 6.8 6.1" />
    </svg>
  );
}

function AppDock({
  dashboardActive,
  plansActive,
  accountActive,
  creating,
  accountButtonRef,
  onDashboard,
  onCreate,
  onPlans,
  onAccount,
}: {
  dashboardActive: boolean;
  plansActive: boolean;
  accountActive: boolean;
  creating: boolean;
  accountButtonRef: RefObject<HTMLButtonElement | null>;
  onDashboard: () => void;
  onCreate: () => void;
  onPlans: () => void;
  onAccount: () => void;
}) {
  return (
    <nav
      className="app-dock"
      aria-label="主要导航"
      onPointerMove={trackDock}
      onPointerLeave={resetDock}
    >
      <div className="app-dock-panel">
        <button
          className={`app-dock-item${dashboardActive ? " is-active" : ""}`}
          type="button"
          aria-current={dashboardActive ? "page" : undefined}
          onPointerDown={settleDockPress}
          onClick={onDashboard}
        >
          <span className="app-dock-icon"><DockIcon name="dashboard" /></span>
          <span className="app-dock-label">工作台</span>
        </button>
        <button
          className="app-dock-item"
          type="button"
          disabled={creating}
          aria-busy={creating}
          onPointerDown={settleDockPress}
          onClick={onCreate}
        >
          <span className="app-dock-icon"><DockIcon name="create" /></span>
          <span className="app-dock-label">{creating ? "创建中" : "新建课程"}</span>
        </button>
        <button
          className={`app-dock-item${plansActive ? " is-active" : ""}`}
          type="button"
          aria-current={plansActive ? "page" : undefined}
          onPointerDown={settleDockPress}
          onClick={onPlans}
        >
          <span className="app-dock-icon"><DockIcon name="plans" /></span>
          <span className="app-dock-label">套餐</span>
        </button>
        <button
          ref={accountButtonRef}
          className={`app-dock-item${accountActive ? " is-active" : ""}`}
          type="button"
          aria-expanded={accountActive}
          aria-controls="account-sheet"
          onPointerDown={settleDockPress}
          onClick={onAccount}
        >
          <span className="app-dock-icon"><DockIcon name="account" /></span>
          <span className="app-dock-label">我的</span>
        </button>
      </div>
    </nav>
  );
}

function AccountSheet({
  open,
  user,
  returnFocusRef,
  onClose,
  onCreateReentryCode,
  onLogout,
}: {
  open: boolean;
  user: User;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onCreateReentryCode: () => Promise<string>;
  onLogout: () => Promise<void>;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const closeSheet = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, [onClose, returnFocusRef]);

  async function logout() {
    setLogoutBusy(true);
    setLogoutError(null);
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(errorMessage(error));
      setLogoutBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSheet();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled)',
        ) ?? [],
      );
      if (controls.length === 0) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [closeSheet, open]);

  return (
    <div className="account-sheet-layer" hidden={!open}>
      <button
        className="account-sheet-backdrop"
        type="button"
        tabIndex={-1}
        aria-label="关闭我的账号"
        onClick={closeSheet}
      />
      <section
        ref={panelRef}
        id="account-sheet"
        className="account-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-sheet-title"
      >
        <header className="account-sheet-heading">
          <div>
            <p className="eyebrow">账号中心</p>
            <h2 id="account-sheet-title">我的</h2>
            <p>查看课程数量，管理账号恢复方式。</p>
          </div>
          <button
            ref={closeButtonRef}
            className="account-sheet-close"
            type="button"
            aria-label="关闭"
            onClick={closeSheet}
          >
            ×
          </button>
        </header>

        <div className="account-sheet-stats" aria-label="账号概览">
          <div>
            <span>课程项目</span>
            <strong>{user.course_count}</strong>
          </div>
          <div>
            <span>当前版本</span>
            <strong>{user.entitlement.plan_name}</strong>
          </div>
        </div>

        <section className="account-entitlement-card" aria-label="课程生成额度">
          <div>
            <p className="eyebrow">课程生成额度</p>
            <strong>
              {user.entitlement.course_limit === null
                ? "不限课程数量"
                : `剩余 ${user.entitlement.course_remaining ?? 0} 门`}
            </strong>
          </div>
          <p>
            {user.entitlement.plan_key === "experience"
              ? "体验版可完整生成 3 门课程。名额在课程首次调用生成模型时使用，删除课程不会返还。"
              : user.entitlement.plan_key === "co_creator"
                ? "共创版每个有效周期可完整生成 15 门课程，额度在新周期开始时重新计算。"
                : "机构版课程额度由管理员按实际合作方案配置。"}
          </p>
          {user.entitlement.period_ends_at && (
            <small>
              当前周期至 {new Date(user.entitlement.period_ends_at).toLocaleDateString("zh-CN")}
            </small>
          )}
        </section>

        <AccountAccessCard user={user} onCreateReentryCode={onCreateReentryCode} />

        <footer className="account-sheet-footer">
          <div>
            <strong>退出当前账号</strong>
            <span>再次进入时，需要重新填写原登录码或备用登录码。</span>
          </div>
          <button
            className="account-logout-button"
            type="button"
            disabled={logoutBusy}
            onClick={() => void logout()}
          >
            {logoutBusy ? "正在退出…" : "退出登录"}
          </button>
          {logoutError && <p role="alert">{logoutError}</p>}
        </footer>
      </section>
    </div>
  );
}

function AccountAccessCard({
  user,
  onCreateReentryCode,
}: {
  user: User;
  onCreateReentryCode: () => Promise<string>;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createCode() {
    setBusy(true);
    setMessage(null);
    try {
      setCode(await onCreateReentryCode());
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setMessage("已复制。请把它保存在只有你能访问的位置。");
    } catch {
      setMessage("浏览器没有允许自动复制，请手动选中登录码复制。");
    }
  }

  if (!user.can_create_reentry_code && !code) return null;

  return (
    <section className="account-access-card border-glow-frame" aria-label="账号与课程恢复" onPointerMove={trackBorderGlow}>
      <div className="account-access-summary">
        <div>
          <p className="eyebrow">账号状态</p>
          <strong>当前已登录</strong>
          <p>当前账号保存有 {user.course_count} 门课程。</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "收起" : "账号安全与恢复"}
        </button>
      </div>

      {expanded && (
        <div className="account-access-panel">
          <div className="account-access-guidance">
            <p>
              原登录码和备用登录码都可以进入当前账号。备用登录码适合更换设备或原登录码遗失时使用。
            </p>
            <p className="account-access-limit">
              每个账号最多保留 {user.reentry_code_limit} 个有效登录码（包含原登录码），通常最多可生成 {user.reentry_code_limit - 1} 个备用登录码。当前还可生成 {user.reentry_code_remaining} 个；达到上限后此入口会自动隐藏。
            </p>
          </div>
          <div className={`account-access-actions ${code ? "has-code" : ""}`}>
            {code ? (
              <>
                <div className="login-code-heading">
                  <strong>登录时请填写下面这个备用登录码</strong>
                  <span>仅显示这一次，请立即复制保存。</span>
                </div>
                <div className="reentry-code-row">
                  <input
                    id="reentry-code"
                    aria-label="备用登录码"
                    readOnly
                    value={code}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button className="secondary-button" type="button" onClick={copyCode}>
                    复制登录码
                  </button>
                </div>
                {!user.can_create_reentry_code && (
                  <button className="text-button account-access-dismiss" type="button" onClick={() => setCode(null)}>
                    我已保存，关闭
                  </button>
                )}
              </>
            ) : (
              <button className="secondary-button" type="button" disabled={busy} onClick={createCode}>
                {busy ? "正在生成…" : "生成备用登录码"}
              </button>
            )}
            {message && <small className="account-access-message">{message}</small>}
          </div>
        </div>
      )}
    </section>
  );
}

function CourseWorkspace({
  initialCourse,
  onCourseChange,
}: {
  initialCourse: Course;
  onCourseChange: (course: Course) => void;
}) {
  const [course, setCourse] = useState(initialCourse);
  const [rawText, setRawText] = useState("");
  const [inputSpec, setInputSpec] = useState<InputSpecVersion | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintVersion | null>(null);
  const [lesson, setLesson] = useState<LessonVersion | null>(null);
  const [artworkSpec, setArtworkSpec] = useState<ArtworkSpecVersion | null>(null);
  const [mainArtwork, setMainArtwork] = useState<MainArtworkVersion | null>(null);
  const [mainArtworkCandidates, setMainArtworkCandidates] = useState<MainArtworkVersion[]>([]);
  const [stepSheet, setStepSheet] = useState<StepSheetVersion | null>(null);
  const [stepSheetCandidates, setStepSheetCandidates] = useState<StepSheetVersion[]>([]);
  const [slidePlan, setSlidePlan] = useState<SlidePlanVersion | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeGenerationModule, setActiveGenerationModule] = useState<Job["module_id"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setNotice] = useState<string | null>(null);
  const [progressDetailsExpanded, setProgressDetailsExpanded] = useState(false);

  const pollJob = useCallback(async (initialJob: Job): Promise<Job> => {
    let current = initialJob;
    const deadline = Date.now() + (["P0-09", "P0-10"].includes(initialJob.module_id) ? 720_000 : 180_000);
    setJob(current);
    while (!["ready", "succeeded", "outdated_result", "provider_submission_unknown", "provider_result_expired", "failed"].includes(current.status)) {
      if (Date.now() >= deadline) {
        throw new Error("任务仍在处理中，请稍后刷新课程继续查看。");
      }
      await wait(JOB_POLL_MS);
      current = (await api.job(current.id)).job;
      setJob(current);
    }
    if (["failed", "outdated_result", "provider_submission_unknown", "provider_result_expired"].includes(current.status)) {
      throw new Error(current.error_summary ?? "生成任务失败，请重试。");
    }
    return current;
  }, []);

  const loadCourseState = useCallback(async () => {
    const nextCourse = await api.course(course.id);
    setCourse(nextCourse);
    onCourseChange(nextCourse);
    if (nextCourse.working_input_spec_version_id) {
      const response = await api.inputSpec(course.id);
      setInputSpec(response.input_spec_version);
    }
    if (nextCourse.working_blueprint_version_id) {
      const response = await api.blueprint(course.id);
      setBlueprint(response.blueprint_version);
    } else {
      setBlueprint(null);
    }
    if (nextCourse.working_lesson_version_id) {
      const response = await api.lesson(course.id);
      setLesson(response.lesson_version);
    } else {
      setLesson(null);
    }
    if (nextCourse.working_artwork_spec_version_id) {
      const response = await api.artworkSpec(course.id);
      setArtworkSpec(response.artwork_spec_version);
    } else {
      setArtworkSpec(null);
    }
    if (nextCourse.working_main_artwork_version_id) {
      const [response, candidatesResponse] = await Promise.all([
        api.mainArtwork(course.id),
        api.mainArtworkCandidates(course.id),
      ]);
      setMainArtwork(response.main_artwork_version);
      setMainArtworkCandidates(candidatesResponse.main_artwork_candidates);
    } else {
      setMainArtwork(null);
      setMainArtworkCandidates([]);
    }
    if (nextCourse.working_step_sheet_version_id) {
      const [response, candidatesResponse] = await Promise.all([
        api.stepSheet(course.id),
        api.stepSheetCandidates(course.id),
      ]);
      setStepSheet(response.step_sheet_version);
      setStepSheetCandidates(candidatesResponse.step_sheet_candidates);
    } else {
      setStepSheet(null);
      setStepSheetCandidates([]);
    }
    if (nextCourse.working_slide_plan_version_id) {
      const response = await api.slidePlan(course.id);
      setSlidePlan(response.slide_plan_version);
    } else {
      setSlidePlan(null);
    }
  }, [course.id, onCourseChange]);

  useEffect(() => {
    let active = true;
    api.course(course.id)
      .then(async (nextCourse) => {
        const [inputResponse, blueprintResponse, lessonResponse, artworkSpecResponse, mainArtworkResponse, mainArtworkCandidatesResponse, stepSheetResponse, stepSheetCandidatesResponse, slidePlanResponse, currentJob] = await Promise.all([
          nextCourse.working_input_spec_version_id ? api.inputSpec(course.id) : null,
          nextCourse.working_blueprint_version_id ? api.blueprint(course.id) : null,
          nextCourse.working_lesson_version_id ? api.lesson(course.id) : null,
          nextCourse.working_artwork_spec_version_id ? api.artworkSpec(course.id) : null,
          nextCourse.working_main_artwork_version_id ? api.mainArtwork(course.id) : null,
          nextCourse.working_main_artwork_version_id ? api.mainArtworkCandidates(course.id) : null,
          nextCourse.working_step_sheet_version_id ? api.stepSheet(course.id) : null,
          nextCourse.working_step_sheet_version_id ? api.stepSheetCandidates(course.id) : null,
          nextCourse.working_slide_plan_version_id ? api.slidePlan(course.id) : null,
          ["generating_lesson", "generating_artwork_spec", "generating_main_artwork", "main_artwork_generation_failed", "main_artwork_generation_needs_review", "generating_step_sheet", "step_sheet_generation_failed", "step_sheet_generation_needs_review", "generating_slide_plan", "slide_plan_generation_failed"].includes(nextCourse.status)
            ? api.currentJob(
                course.id,
                ["generating_slide_plan", "slide_plan_generation_failed"].includes(nextCourse.status)
                  ? "P0-11"
                  : ["generating_step_sheet", "step_sheet_generation_failed", "step_sheet_generation_needs_review"].includes(nextCourse.status)
                  ? "P0-10"
                  : ["generating_main_artwork", "main_artwork_generation_failed", "main_artwork_generation_needs_review"].includes(nextCourse.status)
                    ? "P0-09"
                  : nextCourse.status === "generating_artwork_spec"
                    ? "P0-08"
                    : "P0-04",
              ).catch((jobError: unknown) => {
                if (jobError instanceof ApiError && jobError.status === 404) return null;
                throw jobError;
              })
            : null,
        ]);
        if (!active) return;
        setCourse(nextCourse);
        onCourseChange(nextCourse);
        setInputSpec(inputResponse?.input_spec_version ?? null);
        setBlueprint(blueprintResponse?.blueprint_version ?? null);
        setLesson(lessonResponse?.lesson_version ?? null);
        setArtworkSpec(artworkSpecResponse?.artwork_spec_version ?? null);
        setMainArtwork(mainArtworkResponse?.main_artwork_version ?? null);
        setMainArtworkCandidates(mainArtworkCandidatesResponse?.main_artwork_candidates ?? []);
        setStepSheet(stepSheetResponse?.step_sheet_version ?? null);
        setStepSheetCandidates(stepSheetCandidatesResponse?.step_sheet_candidates ?? []);
        setSlidePlan(slidePlanResponse?.slide_plan_version ?? null);
        if (currentJob) setJob(currentJob.job);
        if (currentJob && ["outdated_result", "provider_submission_unknown", "provider_result_expired", "failed"].includes(currentJob.job.status)) {
          setError(currentJob.job.error_summary ?? "主范画生成任务需要处理。");
        } else if (currentJob && !["ready", "succeeded"].includes(currentJob.job.status)) {
          setBusy(true);
          pollJob(currentJob.job)
            .then(loadCourseState)
            .catch((resumeError: unknown) => setError(errorMessage(resumeError)))
            .finally(() => setBusy(false));
        }
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      });
    return () => {
      active = false;
    };
  }, [course.id, loadCourseState, onCourseChange, pollJob]);

  async function parseRequirements() {
    if (!rawText.trim()) return;
    setBusy(true);
    setActiveGenerationModule("P0-01");
    setError(null);
    setBlueprint(null);
    try {
      const answeredQuestionIds =
        inputSpec?.clarification_questions?.map((question) => question.question_id) ?? [];
      const response = await api.parseRequirements(
        course.id,
        rawText.trim(),
        inputSpec?.id,
        answeredQuestionIds,
      );
      await pollJob(response.job);
      const nextSpec = await api.inputSpec(course.id);
      setInputSpec(nextSpec.input_spec_version);
      setRawText("");
      await loadCourseState();
    } catch (parseError) {
      setError(errorMessage(parseError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function confirmAndGenerate() {
    if (!inputSpec) return;
    setBusy(true);
    setActiveGenerationModule("P0-03");
    setError(null);
    try {
      const response = await api.confirmInput(course.id, inputSpec.id);
      setInputSpec((current) => current && { ...current, confirmation_state: "confirmed" });
      await pollJob(response.job);
      const result = await api.blueprint(course.id);
      setBlueprint(result.blueprint_version);
      await loadCourseState();
    } catch (confirmError) {
      setError(errorMessage(confirmError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function saveInputRevision(editableInput: EditableInputSpecPayload) {
    if (!inputSpec) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.reviseInput(course.id, inputSpec.id, editableInput);
      setInputSpec(response.input_spec_version);
      setNotice(
        `修改已保存为课程条件 V${response.input_spec_version.version_no}；全部字段补齐后才能确认并生成课程蓝图。`,
      );
      await loadCourseState();
    } catch (saveError) {
      setError(errorMessage(saveError));
      throw saveError;
    } finally {
      setBusy(false);
    }
  }

  async function retryBlueprint() {
    setBusy(true);
    setActiveGenerationModule("P0-03");
    setError(null);
    try {
      const response = await api.retryBlueprint(course.id);
      await pollJob(response.job);
      const result = await api.blueprint(course.id);
      setBlueprint(result.blueprint_version);
      await loadCourseState();
    } catch (retryError) {
      setError(errorMessage(retryError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function saveBlueprintRevision(
    learningObjectives: LearningObjective[],
    stages: CourseStage[],
  ) {
    if (!blueprint) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.reviseBlueprint(
        course.id,
        blueprint.id,
        learningObjectives,
        stages,
      );
      setBlueprint(response.blueprint_version);
      setNotice(`修改已保存为课程蓝图 V${response.blueprint_version.version_no}，请确认后再进入下一阶段。`);
      await loadCourseState();
    } catch (saveError) {
      setError(errorMessage(saveError));
      throw saveError;
    } finally {
      setBusy(false);
    }
  }

  async function confirmBlueprintVersion() {
    if (!blueprint) return;
    setBusy(true);
    setActiveGenerationModule("P0-04");
    setError(null);
    setNotice(null);
    try {
      const response = await api.confirmBlueprint(course.id, blueprint.id);
      setBlueprint(response.blueprint_version);
      await pollJob(response.job);
      const result = await api.lesson(course.id);
      setLesson(result.lesson_version);
      setNotice(`课程蓝图已确认，结构化教案 V${result.lesson_version.version_no} 已自动生成，请编辑或确认。`);
      await loadCourseState();
    } catch (confirmError) {
      setError(errorMessage(confirmError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function generateLesson() {
    setBusy(true);
    setActiveGenerationModule("P0-04");
    setError(null);
    setNotice(null);
    try {
      const response = await api.generateLesson(course.id);
      await pollJob(response.job);
      const result = await api.lesson(course.id);
      setLesson(result.lesson_version);
      setNotice(`教案 V${result.lesson_version.version_no} 已生成，请编辑或独立确认。`);
      await loadCourseState();
    } catch (generationError) {
      setError(errorMessage(generationError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function retryLesson() {
    setBusy(true);
    setActiveGenerationModule("P0-04");
    setError(null);
    setNotice(null);
    try {
      const response = await api.retryLesson(course.id);
      await pollJob(response.job);
      const result = await api.lesson(course.id);
      setLesson(result.lesson_version);
      setNotice(`教案 V${result.lesson_version.version_no} 已生成，请编辑或独立确认。`);
      await loadCourseState();
    } catch (retryError) {
      setError(errorMessage(retryError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function saveLessonRevision(editableLesson: EditableLessonPayload) {
    if (!lesson) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.reviseLesson(course.id, lesson.id, editableLesson);
      setLesson(response.lesson_version);
      setNotice(`修改已保存为教案 V${response.lesson_version.version_no}，保存不等于确认。`);
      await loadCourseState();
    } catch (saveError) {
      setError(errorMessage(saveError));
      throw saveError;
    } finally {
      setBusy(false);
    }
  }

  async function confirmLessonVersion() {
    if (!lesson) return;
    setBusy(true);
    setActiveGenerationModule("P0-08");
    setError(null);
    setNotice(null);
    try {
      const response = await api.confirmLesson(course.id, lesson.id);
      setLesson(response.lesson_version);
      await pollJob(response.job);
      const result = await api.artworkSpec(course.id);
      setArtworkSpec(result.artwork_spec_version);
      setNotice(`教案已确认，主范画规格 V${result.artwork_spec_version.version_no} 已自动生成，请编辑或确认。`);
      await loadCourseState();
    } catch (confirmError) {
      setError(errorMessage(confirmError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function generateArtworkSpec() {
    setBusy(true);
    setActiveGenerationModule("P0-08");
    setError(null);
    setNotice(null);
    try {
      const response = await api.generateArtworkSpec(course.id);
      await pollJob(response.job);
      const result = await api.artworkSpec(course.id);
      setArtworkSpec(result.artwork_spec_version);
      setNotice(`主范画规格 V${result.artwork_spec_version.version_no} 已生成，请编辑或独立确认。`);
      await loadCourseState();
    } catch (generationError) {
      setError(errorMessage(generationError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function retryArtworkSpec() {
    setBusy(true);
    setActiveGenerationModule("P0-08");
    setError(null);
    setNotice(null);
    try {
      const response = await api.retryArtworkSpec(course.id);
      await pollJob(response.job);
      const result = await api.artworkSpec(course.id);
      setArtworkSpec(result.artwork_spec_version);
      setNotice(`主范画规格 V${result.artwork_spec_version.version_no} 已生成，请编辑或独立确认。`);
      await loadCourseState();
    } catch (retryError) {
      setError(errorMessage(retryError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function saveArtworkSpecRevision(editableArtworkSpec: EditableMainArtworkSpecPayload) {
    if (!artworkSpec) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.reviseArtworkSpec(
        course.id,
        artworkSpec.id,
        editableArtworkSpec,
      );
      setArtworkSpec(response.artwork_spec_version);
      setNotice(`修改已保存为主范画规格 V${response.artwork_spec_version.version_no}，保存不等于确认。`);
      await loadCourseState();
    } catch (saveError) {
      setError(errorMessage(saveError));
      throw saveError;
    } finally {
      setBusy(false);
    }
  }

  async function confirmArtworkSpecVersion() {
    if (!artworkSpec) return;
    setBusy(true);
    setActiveGenerationModule("P0-09");
    setError(null);
    setNotice(null);
    try {
      const response = await api.confirmArtworkSpec(course.id, artworkSpec.id);
      setArtworkSpec(response.artwork_spec_version);
      const quote = await api.mainArtworkQuote(course.id);
      const generation = await api.generateMainArtwork(
        course.id,
        quote.generation_quote.quote_id,
      );
      await pollJob(generation.job);
      const result = await api.mainArtwork(course.id);
      setMainArtwork(result.main_artwork_version);
      setNotice("主范画规格已确认，主范画已自动生成并保存，请预览后确认。");
      await loadCourseState();
    } catch (confirmError) {
      setError(errorMessage(confirmError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function generateMainArtwork() {
    setBusy(true);
    setActiveGenerationModule("P0-09");
    setError(null);
    setNotice(null);
    try {
      const quote = await api.mainArtworkQuote(course.id);
      const response = mainArtwork?.freshness_status === "current"
        ? await api.regenerateMainArtwork(course.id, mainArtwork.id, quote.generation_quote.quote_id)
        : await api.generateMainArtwork(course.id, quote.generation_quote.quote_id);
      await pollJob(response.job);
      const result = await api.mainArtwork(course.id);
      setMainArtwork(result.main_artwork_version);
      setNotice("主范画已生成并保存，请预览后独立确认。");
      await loadCourseState();
    } catch (generationError) {
      setError(errorMessage(generationError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function confirmMainArtworkVersion() {
    if (!mainArtwork) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.confirmMainArtwork(course.id, mainArtwork.id);
      setMainArtwork(response.main_artwork_version);
      setNotice("当前主范画已独立确认；请在下方主动生成三联步骤图。");
      await loadCourseState();
    } catch (confirmError) {
      setError(errorMessage(confirmError));
    } finally {
      setBusy(false);
    }
  }

  async function selectMainArtworkCandidate(versionId: string) {
    if (!mainArtwork || versionId === mainArtwork.id) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.selectMainArtwork(course.id, versionId);
      setMainArtwork(response.main_artwork_version);
      const option = mainArtworkCandidates.findIndex((item) => item.id === versionId) + 1;
      setNotice(`已切换到主范画方案 ${option}；本次未调用模型，不产生生成费用。`);
      await loadCourseState();
    } catch (selectionError) {
      setError(errorMessage(selectionError));
    } finally {
      setBusy(false);
    }
  }

  async function generateStepSheet() {
    setBusy(true);
    setActiveGenerationModule("P0-10");
    setError(null);
    setNotice(null);
    try {
      const quote = await api.stepSheetQuote(course.id);
      const response = stepSheet?.usage_limit.can_regenerate
        ? await api.regenerateStepSheet(
            course.id,
            stepSheet.id,
            quote.generation_quote.quote_id,
          )
        : await api.generateStepSheet(course.id, quote.generation_quote.quote_id);
      await pollJob(response.job);
      const result = await api.stepSheet(course.id);
      setStepSheet(result.step_sheet_version);
      setNotice("三联步骤图已生成并保存，请核对三个阶段后独立确认。");
      await loadCourseState();
    } catch (generationError) {
      setError(errorMessage(generationError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function confirmStepSheetVersion() {
    if (!stepSheet) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.confirmStepSheet(course.id, stepSheet.id);
      setStepSheet(response.step_sheet_version);
      setNotice("当前三联步骤图已独立确认；可继续编排课堂演示页面方案。");
      await loadCourseState();
    } catch (confirmError) {
      setError(errorMessage(confirmError));
    } finally {
      setBusy(false);
    }
  }

  async function selectStepSheetCandidate(versionId: string) {
    if (!stepSheet || versionId === stepSheet.id) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.selectStepSheet(course.id, versionId);
      setStepSheet(response.step_sheet_version);
      const option = stepSheetCandidates.findIndex((item) => item.id === versionId) + 1;
      setNotice(`已切换到三联步骤图方案 ${option}；本次未调用模型，不产生生成费用。`);
      await loadCourseState();
    } catch (selectionError) {
      setError(errorMessage(selectionError));
    } finally {
      setBusy(false);
    }
  }

  async function generateSlidePlan() {
    setBusy(true);
    setActiveGenerationModule("P0-11");
    setError(null);
    setNotice(null);
    try {
      const response = await api.generateSlidePlan(course.id);
      await pollJob(response.job);
      const result = await api.slidePlan(course.id);
      setSlidePlan(result.slide_plan_version);
      setNotice("课堂演示页面方案已生成，请预览、编辑或确认。");
      await loadCourseState();
    } catch (generationError) {
      setError(errorMessage(generationError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function enhanceSlidePlanContent() {
    if (!slidePlan) return;
    setBusy(true);
    setActiveGenerationModule("P0-11");
    setError(null);
    setNotice(null);
    try {
      const response = await api.enhanceSlidePlanContent(
        course.id,
        slidePlan.id,
      );
      await pollJob(response.job);
      const result = await api.slidePlan(course.id);
      setSlidePlan(result.slide_plan_version);
      setNotice("课堂内容已补充；原图片与旧版本已保留，新版本待确认。");
      await loadCourseState();
    } catch (enhancementError) {
      setError(errorMessage(enhancementError));
    } finally {
      setActiveGenerationModule(null);
      setBusy(false);
    }
  }

  async function saveSlidePlanRevision(revision: EditableSemanticSlidePlanV02) {
    if (!slidePlan) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.reviseSlidePlan(course.id, slidePlan.id, revision);
      setSlidePlan(response.slide_plan_version);
      setNotice("修改已保存为新的页面方案，保存不等于确认。");
      await loadCourseState();
    } catch (saveError) {
      setError(errorMessage(saveError));
      throw saveError;
    } finally {
      setBusy(false);
    }
  }

  async function upgradeSlidePlanVersion() {
    if (!slidePlan || !slidePlan.upgrade_available) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.upgradeSlidePlan(course.id, slidePlan.id);
      setSlidePlan(response.slide_plan_version);
      setNotice("页面方案已更新为教案驱动结构；观察素材来源已记录，新版本待独立确认，旧版历史已保留。");
      await loadCourseState();
    } catch (upgradeError) {
      setError(errorMessage(upgradeError));
    } finally {
      setBusy(false);
    }
  }

  async function refreshSlidePlanObservation(queries: string[]): Promise<string | null> {
    if (!slidePlan) return "当前课堂演示页面方案不存在";
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.refreshSlidePlanObservation(
        course.id,
        slidePlan.id,
        queries,
      );
      setSlidePlan(response.slide_plan_version);
      setNotice(`已找到 ${response.refresh.observation_asset_count} 张观察素材；旧版本与确认记录已保留，新版本待确认。`);
      await loadCourseState();
      return null;
    } catch (refreshError) {
      const message = errorMessage(refreshError);
      setError(message);
      return message;
    } finally {
      setBusy(false);
    }
  }

  async function uploadSlidePlanObservation(file: File) {
    if (!slidePlan) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.uploadSlidePlanObservation(
        course.id,
        slidePlan.id,
        file,
      );
      setSlidePlan(response.slide_plan_version);
      setNotice("已上传观察素材；旧图片、旧版本和确认记录已保留，新版本待确认。");
      await loadCourseState();
    } catch (uploadError) {
      setError(errorMessage(uploadError));
      throw uploadError;
    } finally {
      setBusy(false);
    }
  }

  async function confirmSlidePlanVersion() {
    if (!slidePlan) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.confirmSlidePlan(course.id, slidePlan.id);
      setSlidePlan(response.slide_plan_version);
      setNotice("当前课堂演示页面方案已确认，可以进入全屏课堂演示。");
      await loadCourseState();
    } catch (confirmError) {
      setError(errorMessage(confirmError));
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = useMemo(
    () =>
      Boolean(
        inputSpec &&
          inputSpec.candidate_status === "success" &&
          inputSpec.missing_fields.length === 0 &&
          inputSpec.ambiguities.length === 0 &&
          inputSpec.out_of_scope_fields.length === 0 &&
          (inputSpec.clarification_questions?.length ?? 0) === 0,
      ),
    [inputSpec],
  );
  const pendingQuestions = inputSpec?.clarification_questions ?? [];
  const currentGenerationModule =
    activeGenerationModule ??
    (busy &&
    job &&
    !["ready", "succeeded", "outdated_result", "provider_submission_unknown", "provider_result_expired", "failed"].includes(job.status)
      ? job.module_id
      : null);
  const lessonIsCurrent = lesson?.freshness_status === "current";
  const artworkSpecIsCurrent = artworkSpec?.freshness_status === "current";
  const mainArtworkIsCurrent = mainArtwork?.freshness_status === "current";
  const stepSheetIsCurrent = stepSheet?.freshness_status === "current";
  const slidePlanIsCurrent = slidePlan?.freshness_status === "current";
  const progressCurrent = slidePlanIsCurrent
    ? 8
    : stepSheetIsCurrent
      ? 7
      : mainArtworkIsCurrent
        ? 6
        : artworkSpecIsCurrent
          ? 5
          : lessonIsCurrent
            ? 4
            : blueprint
              ? 3
              : inputSpec
                ? 2
              : 1;
  const stateRows = [
    { label: "课程条件", done: Boolean(inputSpec), detail: inputSpec ? "已生成" : "待生成" },
    { label: "用户确认", done: inputSpec?.confirmation_state === "confirmed", detail: inputSpec?.confirmation_state === "confirmed" ? "已确认" : "待确认" },
    { label: "课程蓝图", done: Boolean(blueprint), detail: blueprint ? "已生成" : "待生成" },
    { label: "蓝图确认", done: blueprint?.confirmation_state === "confirmed", detail: blueprint?.confirmation_state === "confirmed" ? "已确认" : blueprint ? "待确认" : "待生成" },
    { label: "结构化教案", done: Boolean(lessonIsCurrent), detail: lesson ? (lessonIsCurrent ? "已生成" : "已过期") : "待生成" },
    { label: "教案确认", done: lessonIsCurrent && lesson?.confirmation_state === "confirmed", detail: lessonIsCurrent && lesson?.confirmation_state === "confirmed" ? "已确认" : lessonIsCurrent ? "待确认" : "待生成" },
    { label: "主范画规格", done: Boolean(artworkSpecIsCurrent), detail: artworkSpec ? (artworkSpecIsCurrent ? "已生成" : "已过期") : "待生成" },
    { label: "规格确认", done: artworkSpecIsCurrent && artworkSpec?.confirmation_state === "confirmed", detail: artworkSpecIsCurrent && artworkSpec?.confirmation_state === "confirmed" ? "已确认" : artworkSpecIsCurrent ? "待确认" : "待生成" },
    { label: "真实主范画", done: Boolean(mainArtworkIsCurrent), detail: mainArtwork ? (mainArtworkIsCurrent ? "已生成" : "已过期") : "待生成" },
    { label: "主范画确认", done: mainArtworkIsCurrent && mainArtwork?.confirmation_state === "confirmed", detail: mainArtworkIsCurrent && mainArtwork?.confirmation_state === "confirmed" ? "已确认" : mainArtworkIsCurrent ? "待确认" : "待生成" },
    { label: "三联步骤图", done: Boolean(stepSheetIsCurrent), detail: stepSheet ? (stepSheetIsCurrent ? "已生成" : "已过期") : "待生成" },
    { label: "步骤图确认", done: stepSheetIsCurrent && stepSheet?.confirmation_state === "confirmed", detail: stepSheetIsCurrent && stepSheet?.confirmation_state === "confirmed" ? "已确认" : stepSheetIsCurrent ? "待确认" : "待生成" },
    { label: "课堂演示方案", done: Boolean(slidePlanIsCurrent), detail: slidePlan ? (slidePlanIsCurrent ? "已生成" : "已过期") : "待生成" },
    { label: "页面方案确认", done: slidePlanIsCurrent && slidePlan?.confirmation_state === "confirmed", detail: slidePlanIsCurrent && slidePlan?.confirmation_state === "confirmed" ? "已确认" : slidePlanIsCurrent ? "待确认" : "待生成" },
  ];
  const firstIncompleteState = stateRows.findIndex((row) => !row.done);
  const activeStateIndex = firstIncompleteState === -1 ? stateRows.length - 1 : firstIncompleteState;
  const compactStateStart = Math.min(Math.max(activeStateIndex - 1, 0), stateRows.length - 3);
  const compactStateIndexes = new Set([compactStateStart, compactStateStart + 1, compactStateStart + 2]);

  return (
    <section className="workspace page-width">
      <div className="workspace-title">
        <div>
          <p className="eyebrow">COURSE WORKSPACE</p>
          <h1>{course.title}</h1>
        </div>
      </div>

      {error && (
        <div className="error-panel">
          <div><strong>这一步没有完成</strong><p>{error}</p></div>
          {job?.module_id === "P0-03" && job.status === "failed" && (
            <button className="secondary-button" type="button" onClick={retryBlueprint}>重试蓝图生成</button>
          )}
          {job?.module_id === "P0-04" &&
            job.status === "failed" &&
            ["MODEL_CALL_FAILED", "MODEL_SCHEMA_INVALID"].includes(job.error_code ?? "") && (
            <button className="secondary-button" type="button" onClick={retryLesson}>重试教案生成</button>
          )}
          {job?.module_id === "P0-08" &&
            job.status === "failed" &&
            ["MODEL_CALL_FAILED", "MODEL_SCHEMA_INVALID"].includes(job.error_code ?? "") && (
            <button className="secondary-button" type="button" onClick={retryArtworkSpec}>重试主范画规格生成</button>
          )}
        </div>
      )}
      <div className="workspace-grid">
        <aside className="workspace-aside">
          <section className="aside-card state-sidebar-card">
            <p className="eyebrow">CURRENT STATE</p>
            <h3>当前进度</h3>
            <div
              className={`state-rail${progressDetailsExpanded ? " is-expanded" : " is-compact"}`}
              id="course-progress-details"
              role="list"
              aria-label="课程当前进度"
              onPointerMove={trackStateRail}
              onPointerLeave={resetStateRail}
            >
              {stateRows.map((row, index) => (
                <StateRow
                  {...row}
                  active={index === activeStateIndex}
                  compactHidden={!progressDetailsExpanded && !compactStateIndexes.has(index)}
                  contextLabel={
                    index === activeStateIndex
                      ? "当前阶段"
                      : index === activeStateIndex - 1
                        ? "上一步"
                        : index === activeStateIndex + 1
                          ? "下一步"
                          : index < activeStateIndex
                            ? "此前"
                            : "后续"
                  }
                  key={row.label}
                />
              ))}
            </div>
            <div className="state-progress-summary" aria-label={`整体进度 ${progressCurrent} / 8`}>
              <span><i style={{ width: `${(progressCurrent / 8) * 100}%` }} /></span>
              <small>整体进度 {progressCurrent} / 8</small>
            </div>
            <button
              className="state-detail-toggle"
              type="button"
              aria-expanded={progressDetailsExpanded}
              aria-controls="course-progress-details"
              onClick={() => setProgressDetailsExpanded((expanded) => !expanded)}
            >
              {progressDetailsExpanded ? "收起详细进度 ↑" : "展开详细进度 ↓"}
            </button>
          </section>
        </aside>

        <div className="workspace-main">
          <section className="paper-card requirement-card">
            <div className="card-heading">
              <span className="step-number">01</span>
              <div>
                <p className="eyebrow">{pendingQuestions.length ? "需求澄清" : "课程条件"}</p>
                <h2>{pendingQuestions.length ? "回答这轮澄清问题" : "描述你想设计的课程"}</h2>
              </div>
            </div>
            <p className="muted">
              {pendingQuestions.length
                ? "只回答下面仍未明确的问题即可，系统会保留上一轮已经确认的候选条件。"
                : "请包含主题、年龄、班级人数、课程时长和材料；未填写的内容会保持留白。"}
            </p>
            {pendingQuestions.length > 0 && (
              <ClarificationQuestions
                questions={pendingQuestions}
                onUseOption={(option) =>
                  setRawText((current) => (current ? `${current}；${option}` : option))
                }
              />
            )}
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder={
                pendingQuestions.length
                  ? "请用自然语言回答，例如：孩子 8 岁，12 人，课程 75 分钟，主要使用水粉。"
                  : EXAMPLE_REQUIREMENT
              }
              rows={6}
              maxLength={2000}
            />
            <div className="composer-footer">
              {!pendingQuestions.length && (
                <button className="text-button" type="button" onClick={() => setRawText(EXAMPLE_REQUIREMENT)}>填入示例</button>
              )}
              <span>{rawText.length} / 2000</span>
              <button className="primary-button" type="button" disabled={busy || !rawText.trim()} data-loading={currentGenerationModule === "P0-01"} aria-busy={currentGenerationModule === "P0-01"} onClick={parseRequirements}>
                {currentGenerationModule === "P0-01"
                  ? "正在解析…"
                  : pendingQuestions.length
                    ? "提交回答并继续澄清"
                    : inputSpec
                      ? "更新课程条件"
                      : "解析课程条件"}
              </button>
            </div>
          </section>

          {inputSpec && (
            <InputConfirmation
              spec={inputSpec}
              canConfirm={canConfirm}
              busy={busy}
              generating={currentGenerationModule === "P0-03"}
              onSave={saveInputRevision}
              onConfirm={confirmAndGenerate}
            />
          )}

          {blueprint && (
            <BlueprintView
              key={blueprint.id}
              blueprint={blueprint}
              busy={busy}
              generating={currentGenerationModule === "P0-04"}
              onSave={saveBlueprintRevision}
              onConfirm={confirmBlueprintVersion}
            />
          )}

          {course.status === "blueprint_confirmed" && (!lesson || !lessonIsCurrent) && (
            <section className="paper-card lesson-gate-card">
              <div className="card-heading">
                <span className="step-number">04</span>
                <div>
                  <p className="eyebrow">结构化教案 · 流程恢复</p>
                  <h2>继续生成结构化教案</h2>
                </div>
              </div>
              <p>此课程停留在旧流程节点，点击一次即可恢复自动生成；新确认的蓝图无需这一步。</p>
              <div className="lesson-gate-actions">
                <button className="primary-button" type="button" disabled={busy} data-loading={currentGenerationModule === "P0-04"} aria-busy={currentGenerationModule === "P0-04"} onClick={generateLesson}>
                  {currentGenerationModule === "P0-04" ? "正在生成教案…" : "继续生成教案"}
                </button>
              </div>
            </section>
          )}

          {lesson && (
            <LessonView
              key={lesson.id}
              lesson={lesson}
              busy={busy}
              generating={currentGenerationModule === "P0-08"}
              onSave={saveLessonRevision}
              onConfirm={confirmLessonVersion}
            />
          )}

          {course.status === "lesson_confirmed" && lessonIsCurrent && lesson?.confirmation_state === "confirmed" && (!artworkSpec || !artworkSpecIsCurrent) && (
            <section className="paper-card artwork-spec-gate-card">
              <div className="card-heading">
                <span className="step-number">05</span>
                <div>
                  <p className="eyebrow">主范画视觉规格 · 流程恢复</p>
                  <h2>继续生成主范画视觉规格</h2>
                </div>
              </div>
              <p className="muted">
                此课程停留在旧流程节点，点击一次即可恢复自动生成；新确认的教案无需这一步。
              </p>
              <div className="artwork-spec-gate-actions">
                <span>这里只生成结构化文字规格，不会生成图片。</span>
                <button className="primary-button" type="button" disabled={busy} data-loading={currentGenerationModule === "P0-08"} aria-busy={currentGenerationModule === "P0-08"} onClick={generateArtworkSpec}>
                  {currentGenerationModule === "P0-08" ? "正在生成主范画规格…" : "继续生成主范画规格"}
                </button>
              </div>
            </section>
          )}

          {artworkSpec && (
            <ArtworkSpecView
              key={artworkSpec.id}
              artworkSpec={artworkSpec}
              busy={busy}
              generating={currentGenerationModule === "P0-09"}
              onSave={saveArtworkSpecRevision}
              onConfirm={confirmArtworkSpecVersion}
            />
          )}

          {(mainArtwork || (artworkSpecIsCurrent && artworkSpec?.confirmation_state === "confirmed")) && (
            <MainArtworkView
              key={mainArtwork?.id ?? "main-artwork-gate"}
              artwork={mainArtwork}
              candidates={mainArtworkCandidates}
              job={job}
              busy={busy}
              generating={currentGenerationModule === "P0-09"}
              onGenerate={generateMainArtwork}
              onSelectCandidate={selectMainArtworkCandidate}
              onConfirmArtwork={confirmMainArtworkVersion}
            />
          )}

          {(stepSheet || (mainArtworkIsCurrent && mainArtwork?.confirmation_state === "confirmed")) && (
            <StepSheetView
              key={stepSheet?.id ?? "step-sheet-gate"}
              stepSheet={stepSheet}
              candidates={stepSheetCandidates}
              job={job}
              busy={busy}
              generating={currentGenerationModule === "P0-10"}
              onGenerate={generateStepSheet}
              onSelectCandidate={selectStepSheetCandidate}
              onConfirm={confirmStepSheetVersion}
            />
          )}

          {(slidePlan || (stepSheetIsCurrent && stepSheet?.confirmation_state === "confirmed")) && (
            <SlidePlanView
              key={slidePlan?.id ?? "slide-plan-gate"}
              courseId={course.id}
              slidePlan={slidePlan}
              job={job}
              busy={busy}
              generating={currentGenerationModule === "P0-11"}
              onGenerate={generateSlidePlan}
              onEnhanceContent={enhanceSlidePlanContent}
              onSave={saveSlidePlanRevision}
              onUpgrade={upgradeSlidePlanVersion}
              onRefreshObservation={refreshSlidePlanObservation}
              onUploadObservation={uploadSlidePlanObservation}
              onConfirm={confirmSlidePlanVersion}
            />
          )}
        </div>

      </div>
    </section>
  );
}

function editableInputFromSpec(spec: InputSpecVersion): EditableInputSpecPayload {
  const draft = spec.input_spec_draft;
  return {
    theme: draft.theme,
    age: draft.age ? { ...draft.age } : null,
    class_size: draft.class_size,
    duration_minutes: draft.duration_source === "user" ? draft.duration_minutes : null,
    materials: [...draft.materials],
  };
}

function InputConfirmation({
  spec,
  canConfirm,
  busy,
  generating,
  onSave,
  onConfirm,
}: {
  spec: InputSpecVersion;
  canConfirm: boolean;
  busy: boolean;
  generating: boolean;
  onSave: (editableInput: EditableInputSpecPayload) => Promise<void>;
  onConfirm: () => void;
}) {
  const draft = spec.input_spec_draft;
  const [editing, setEditing] = useState(false);
  const [editable, setEditable] = useState<EditableInputSpecPayload>(() =>
    editableInputFromSpec(spec),
  );
  const issues = [
    ...spec.missing_fields.map((item) => `缺失：${fieldLabel(item)}`),
    ...spec.ambiguities.map((item) => `歧义：${item}`),
    ...spec.out_of_scope_fields.map((item) => `越界：${item}`),
  ];
  const hasChanges =
    JSON.stringify(editable) !== JSON.stringify(editableInputFromSpec(spec));

  function beginEditing() {
    setEditable(editableInputFromSpec(spec));
    setEditing(true);
  }

  function cancelEditing() {
    setEditable(editableInputFromSpec(spec));
    setEditing(false);
  }

  function updateAge(part: "min" | "max", value: string) {
    const next = value ? Number(value) : null;
    const current = editable.age ?? { min: 0, max: 0 };
    const sibling = part === "min" ? current.max : current.min;
    setEditable((previous) => ({
      ...previous,
      age:
        next === null
          ? null
          : {
              min: part === "min" ? next : sibling || next,
              max: part === "max" ? next : sibling || next,
            },
    }));
  }

  async function saveEditing() {
    try {
      await onSave(editable);
      setEditing(false);
    } catch {
      // The parent keeps the server error visible and the editor open.
    }
  }

  return (
    <section className="paper-card confirmation-card">
      <div className="card-heading">
        <span className="step-number">02</span>
        <div><p className="eyebrow">确认课程条件 · V{spec.version_no}</p><h2>请核对课程边界</h2></div>
        <div className="confirmation-heading-actions">
          {!editing && spec.confirmation_state !== "confirmed" && (
            <button className="secondary-button compact" type="button" disabled={busy} onClick={beginEditing}>
              编辑
            </button>
          )}
          <span className={`state-badge ${canConfirm ? "ok" : "attention"}`}>{canConfirm ? "可确认" : "需要补充"}</span>
        </div>
      </div>
      {canConfirm ? (
        <p className="confirmation-summary">{spec.confirmation_summary}</p>
      ) : (
        <p className="confirmation-empty-note">未识别到的课程条件保持留白。请点击“编辑”主动补充，系统不会代替你填写默认值。</p>
      )}
      {editing ? (
        <div className="input-boundary-editor">
          <label>主题<input value={editable.theme ?? ""} maxLength={200} onChange={(event) => setEditable((current) => ({ ...current, theme: event.target.value || null }))} /></label>
          <fieldset>
            <legend>年龄</legend>
            <label>最小年龄<input type="number" min={4} max={12} value={editable.age?.min ?? ""} onChange={(event) => updateAge("min", event.target.value)} /></label>
            <label>最大年龄<input type="number" min={4} max={12} value={editable.age?.max ?? ""} onChange={(event) => updateAge("max", event.target.value)} /></label>
          </fieldset>
          <label>班级人数<input type="number" min={4} max={30} value={editable.class_size ?? ""} onChange={(event) => setEditable((current) => ({ ...current, class_size: event.target.value ? Number(event.target.value) : null }))} /></label>
          <label>课程时长<select value={editable.duration_minutes ?? ""} onChange={(event) => setEditable((current) => ({ ...current, duration_minutes: event.target.value ? Number(event.target.value) : null }))}><option value="">请选择</option><option value="60">60 分钟</option><option value="75">75 分钟</option><option value="90">90 分钟</option></select></label>
          <label>主要材料<select value={editable.materials[0] ?? ""} onChange={(event) => setEditable((current) => ({ ...current, materials: event.target.value ? [event.target.value] : [] }))}><option value="">请选择</option>{editable.materials[0] && !["油画棒", "水粉", "水彩"].includes(editable.materials[0]) && <option value={editable.materials[0]}>{editable.materials[0]}（当前范围外）</option>}<option value="油画棒">油画棒</option><option value="水粉">水粉</option><option value="水彩">水彩</option></select></label>
          <div className="locked-boundary-field"><span>视觉资产约束</span><strong>1 张主范画 + 3 张步骤图</strong><small>系统固定 · 不可修改</small></div>
        </div>
      ) : (
        <dl className="spec-grid">
          <SpecItem label="主题" value={draft.theme ?? ""} />
          <SpecItem label="年龄" value={draft.age ? `${draft.age.min}—${draft.age.max} 岁` : ""} />
          <SpecItem label="班级人数" value={draft.class_size ? `${draft.class_size} 人` : ""} />
          <SpecItem label="课程时长" value={draft.duration_source === "user" && draft.duration_minutes ? `${draft.duration_minutes} 分钟` : ""} />
          <SpecItem label="材料" value={draft.materials.join("、")} />
          <SpecItem label="视觉资产约束（系统固定）" value="1 张主范画 + 3 张步骤图" />
        </dl>
      )}
      {(spec.proposed_changes?.length ?? 0) > 0 && (
        <div className="change-list">
          <strong>本轮识别到的修改</strong>
          {(spec.proposed_changes ?? []).map((change) => (
            <span key={`${change.field}-${String(change.proposed_value)}`}>
              {fieldLabel(change.field)}：{formatChangeValue(change.previous_value)} → {formatChangeValue(change.proposed_value)}
            </span>
          ))}
        </div>
      )}
      {issues.length > 0 && <div className="issue-list"><strong>系统正在等待上方问题的回答</strong>{issues.map((issue) => <span key={issue}>• {issue}</span>)}</div>}
      {spec.warnings.length > 0 && <div className="warning-list">{spec.warnings.map((warning) => <span key={warning}>提醒：{warning}</span>)}</div>}
      <div className="confirmation-actions">
        {editing ? (
          <><span>保存只会创建新的课程条件版本，不会调用模型或进入下一步。</span><button className="text-button" type="button" disabled={busy} onClick={cancelEditing}>取消</button><button className="primary-button" type="button" disabled={busy || !hasChanges} onClick={saveEditing}>{busy ? "正在保存…" : "保存修改"}</button></>
        ) : (
          <><span>{canConfirm ? "确认后，系统才会生成课程蓝图。" : "请先补齐所有留白字段，才能进入下一步。"}</span><button className="primary-button" type="button" disabled={!canConfirm || busy || spec.confirmation_state === "confirmed"} data-loading={generating} aria-busy={generating} onClick={onConfirm}>{generating ? "正在生成课程蓝图…" : spec.confirmation_state === "confirmed" ? "已确认" : "确认并生成课程蓝图"}</button></>
        )}
      </div>
    </section>
  );
}

function ClarificationQuestions({
  questions,
  onUseOption,
}: {
  questions: InputSpecVersion["clarification_questions"];
  onUseOption: (option: string) => void;
}) {
  return (
    <div className="clarification-list" aria-label="待回答的澄清问题">
      {questions.map((question, index) => (
        <article key={question.question_id}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div>
            <p>{question.question}</p>
            {question.answer_hint && <small>{question.answer_hint}</small>}
            {question.options.length > 0 && (
              <div className="answer-options">
                {question.options.map((option) => (
                  <button type="button" key={option} onClick={() => onUseOption(option)}>
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function BlueprintView({
  blueprint,
  busy,
  generating,
  onSave,
  onConfirm,
}: {
  blueprint: BlueprintVersion;
  busy: boolean;
  generating: boolean;
  onSave: (learningObjectives: LearningObjective[], stages: CourseStage[]) => Promise<void>;
  onConfirm: () => Promise<void>;
}) {
  const data = blueprint.course_blueprint_draft;
  const [editing, setEditing] = useState(false);
  const [learningObjectives, setLearningObjectives] = useState<LearningObjective[]>(() =>
    copyLearningObjectives(data.learning_objectives),
  );
  const [stages, setStages] = useState<CourseStage[]>(() => copyStages(data.stages));

  const total = (editing ? stages : data.stages).reduce(
    (sum, stage) => sum + stage.minutes,
    0,
  );
  const hasChanges = useMemo(
    () =>
      JSON.stringify(learningObjectives) !== JSON.stringify(data.learning_objectives) ||
      JSON.stringify(stages) !== JSON.stringify(data.stages),
    [data.learning_objectives, data.stages, learningObjectives, stages],
  );
  const fieldsComplete =
    learningObjectives.every(
      (item) => item.objective.trim() && item.observable_evidence.trim(),
    ) &&
    stages.every(
      (stage) =>
        stage.name.trim() &&
        stage.minutes > 0 &&
        stage.teacher_action.trim() &&
        stage.child_action.trim() &&
        stage.stage_output.trim(),
    );
  const durationMatches = total === data.duration_minutes;

  function cancelEditing() {
    setLearningObjectives(copyLearningObjectives(data.learning_objectives));
    setStages(copyStages(data.stages));
    setEditing(false);
  }

  async function saveEditing() {
    try {
      await onSave(learningObjectives, stages);
    } catch {
      // The parent keeps the server error visible and the editor open.
    }
  }

  function updateObjective(
    index: number,
    field: keyof LearningObjective,
    value: string,
  ) {
    setLearningObjectives((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  }

  function updateStage(index: number, patch: Partial<CourseStage>) {
    setStages((current) =>
      current.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patch } : stage,
      ),
    );
  }

  return (
    <section className="paper-card blueprint-card">
      <div className="card-heading blueprint-heading">
        <span className="step-number">03</span>
        <div><p className="eyebrow">课程蓝图 · V{blueprint.version_no}</p><h2>{data.title}</h2></div>
        <div className="blueprint-heading-actions">
          <span className={`state-badge ${blueprint.confirmation_state === "confirmed" ? "ok" : "attention"}`}>
            {blueprint.confirmation_state === "confirmed" ? "已确认" : "待确认"}
          </span>
          {!editing && (
            <button className="secondary-button compact" type="button" disabled={busy} onClick={() => setEditing(true)}>
              编辑蓝图
            </button>
          )}
        </div>
      </div>
      <div className="blueprint-intro"><span>BIG IDEA</span><p>{data.big_idea}</p></div>
      <div className="blueprint-facts">
        <span>{data.audience.age.min}—{data.audience.age.max} 岁</span><span>{data.audience.class_size} 人</span><span>{data.duration_minutes} 分钟</span><span>{data.materials.join(" · ")}</span>
      </div>

      <div className="blueprint-section">
        <h3>可观察学习目标</h3>
        {editing ? (
          <div className="objective-edit-list">
            {learningObjectives.map((item, index) => (
              <article key={index}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <label>
                  学习目标
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={item.objective}
                    onChange={(event) => updateObjective(index, "objective", event.target.value)}
                  />
                </label>
                <label>
                  可观察证据
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={item.observable_evidence}
                    onChange={(event) => updateObjective(index, "observable_evidence", event.target.value)}
                  />
                </label>
              </article>
            ))}
          </div>
        ) : (
          <div className="objective-list">{data.learning_objectives.map((item, index) => <div key={`${index}-${item.objective}`}><b>{String(index + 1).padStart(2, "0")}</b><p><strong>{item.objective}</strong><span>{item.observable_evidence}</span></p></div>)}</div>
        )}
      </div>

      <div className="blueprint-section">
        <div className="section-row">
          <h3>课堂阶段</h3>
          <span className={durationMatches ? "duration-ok" : "duration-error"}>
            总计 {total} / {data.duration_minutes} 分钟
          </span>
        </div>
        {editing ? (
          <div className="stage-edit-list">
            {stages.map((stage, index) => (
              <article key={stage.stage_id}>
                <header>
                  <span>{stage.stage_id}</span>
                  <label>
                    阶段名称
                    <input
                      maxLength={200}
                      value={stage.name}
                      onChange={(event) => updateStage(index, { name: event.target.value })}
                    />
                  </label>
                  <label className="minutes-field">
                    分钟
                    <input
                      type="number"
                      min={1}
                      max={data.duration_minutes}
                      value={stage.minutes}
                      onChange={(event) => updateStage(index, { minutes: Number(event.target.value) })}
                    />
                  </label>
                </header>
                <div className="stage-edit-grid">
                  <label>教师动作<textarea rows={3} maxLength={1500} value={stage.teacher_action} onChange={(event) => updateStage(index, { teacher_action: event.target.value })} /></label>
                  <label>儿童动作<textarea rows={3} maxLength={1500} value={stage.child_action} onChange={(event) => updateStage(index, { child_action: event.target.value })} /></label>
                  <label>阶段产出<textarea rows={2} maxLength={1000} value={stage.stage_output} onChange={(event) => updateStage(index, { stage_output: event.target.value })} /></label>
                  <label>阶段材料<input value={stage.materials.join("、")} placeholder="使用顿号分隔；只能使用原蓝图已有材料" onChange={(event) => updateStage(index, { materials: splitList(event.target.value) })} /></label>
                  <label className="wide-field">安全说明<input value={stage.safety_notes.join("；")} placeholder="使用分号分隔；没有可留空" onChange={(event) => updateStage(index, { safety_notes: splitList(event.target.value) })} /></label>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="stage-list">{data.stages.map((stage) => <article key={stage.stage_id}><div className="stage-time"><strong>{stage.minutes}</strong><small>分钟</small></div><div><h4>{stage.name}</h4><p><b>教师：</b>{stage.teacher_action}</p><p><b>儿童：</b>{stage.child_action}</p><p className="stage-output">阶段产出：{stage.stage_output}</p>{stage.materials.length > 0 && <p><b>材料：</b>{stage.materials.join("、")}</p>}{stage.safety_notes.length > 0 && <p className="safety">安全：{stage.safety_notes.join("；")}</p>}</div></article>)}</div>
        )}
      </div>

      <div className="blueprint-columns">
        <BlueprintList title="技法路径" items={data.technique_path} />
        <BlueprintList title="课堂组织" items={data.classroom_strategy} />
        <BlueprintList title="差异化目标" items={data.differentiation_goals} />
        <BlueprintList title="评价观察点" items={data.assessment_points} />
      </div>

      {editing ? (
        <div className="blueprint-edit-actions">
          <div>
            <strong>{durationMatches ? "课堂时间已闭合" : `还需调整 ${Math.abs(data.duration_minutes - total)} 分钟`}</strong>
            <span>保存后将创建新蓝图版本，不会覆盖 V{blueprint.version_no}。</span>
          </div>
          <button className="text-button" type="button" disabled={busy} onClick={cancelEditing}>取消修改</button>
          <button className="primary-button" type="button" disabled={busy || !hasChanges || !fieldsComplete || !durationMatches} onClick={saveEditing}>
            {busy ? "正在保存…" : "保存为新版本"}
          </button>
        </div>
      ) : (
        <div className="blueprint-confirm-actions">
          <div>
            <strong>{blueprint.confirmation_state === "confirmed" ? "当前蓝图已经确认" : "保存不等于确认"}</strong>
            <span>{blueprint.confirmation_state === "confirmed" ? "后续教案必须依赖此蓝图版本。" : "请检查最终版本，再将它确认为下游唯一事实源。"}</span>
          </div>
          <button className="primary-button" type="button" disabled={busy || blueprint.confirmation_state === "confirmed"} data-loading={generating} aria-busy={generating} onClick={onConfirm}>
            {generating ? "正在生成结构化教案…" : blueprint.confirmation_state === "confirmed" ? "已确认并生成教案" : "确认蓝图并生成教案"}
          </button>
        </div>
      )}
    </section>
  );
}

function copyLearningObjectives(items: LearningObjective[]): LearningObjective[] {
  return items.map((item) => ({ ...item }));
}

function copyStages(items: CourseStage[]): CourseStage[] {
  return items.map((stage) => ({
    ...stage,
    materials: [...stage.materials],
    safety_notes: [...stage.safety_notes],
  }));
}

function splitList(value: string): string[] {
  return value
    .split(/[、,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function BlueprintList({ title, items }: { title: string; items: string[] }) {
  return <section><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>;
}

function StateRow({ label, done, detail, active, compactHidden, contextLabel }: { label: string; done: boolean; detail: string; active: boolean; compactHidden: boolean; contextLabel: string }) {
  return <div className={`state-row${active ? " is-active" : ""}${compactHidden ? " is-compact-hidden" : ""}`} data-state={done ? "done" : active ? "active" : "pending"} role="listitem" aria-current={active ? "step" : undefined} aria-hidden={compactHidden || undefined}><span>{done ? "✓" : "·"}</span><strong data-context={contextLabel}>{label}</strong><small>{detail}</small></div>;
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd className={value ? undefined : "empty-spec-value"}>{value || "\u00a0"}</dd></div>;
}

function FullPageMessage({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <main className="full-message"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><span className="spinner" /></main>;
}

function statusLabel(status: string) {
  return ({ created: "等待填写条件", needs_user_action: "待确认课程条件", ready: "课程蓝图已就绪", needs_blueprint_confirmation: "待确认课程蓝图", blueprint_confirmed: "可生成教案", generating_lesson: "正在生成教案", needs_lesson_confirmation: "待确认教案", lesson_confirmed: "可生成主范画规格", generating_artwork_spec: "正在生成主范画规格", needs_artwork_spec_confirmation: "待确认主范画规格", artwork_spec_confirmed: "可生成真实主范画", generating_main_artwork: "正在生成真实主范画", needs_main_artwork_confirmation: "待确认真实主范画", main_artwork_confirmed: "可生成三联步骤图", generating_step_sheet: "正在生成三联步骤图", needs_step_sheet_confirmation: "待确认三联步骤图", step_sheet_confirmed: "可生成课程页面方案", generating_slide_plan: "正在编排课程页面", needs_slide_plan_confirmation: "待确认课程页面方案", slide_plan_confirmed: "课程页面方案已确认", slide_plan_generation_failed: "课程页面方案生成需要处理", step_sheet_generation_failed: "三联步骤图生成需要处理", step_sheet_generation_needs_review: "步骤图提交状态需要人工核对", main_artwork_generation_failed: "主范画生成需要处理", main_artwork_generation_needs_review: "生图提交状态需要人工核对", artwork_spec_generation_failed: "主范画规格生成需要处理", lesson_generation_failed: "教案生成需要处理", failed: "需要处理" } as Record<string, string>)[status] ?? status;
}

function fieldLabel(field: string) {
  return ({ theme: "课程主题", age: "儿童年龄", class_size: "班级人数", materials: "使用材料", duration_minutes: "课程时长" } as Record<string, string>)[field] ?? field;
}

function formatChangeValue(value: unknown) {
  if (value === null || value === undefined) return "未设置";
  if (Array.isArray(value)) return value.join("、") || "未设置";
  if (typeof value === "object") {
    const age = value as { min?: number; max?: number };
    if (typeof age.min === "number" && typeof age.max === "number") {
      return `${age.min}—${age.max} 岁`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}
