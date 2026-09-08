import type {
  BlueprintVersion,
  ArtworkSpecDownstreamHandoff,
  ArtworkSpecVersion,
  AccountEntitlement,
  CourseStage,
  Course,
  CourseFeedback,
  CourseFeedbackIssueTag,
  CourseFeedbackRating,
  CoursePresentation,
  InputSpecVersion,
  EditableInputSpecPayload,
  Job,
  DownstreamHandoff,
  EditableLessonPayload,
  EditableMainArtworkSpecPayload,
  LessonVersion,
  LearningObjective,
  GenerationQuote,
  MainArtworkDownstreamHandoff,
  MainArtworkVersion,
  StepSheetDownstreamHandoff,
  StepSheetVersion,
  SlidePlanDownstreamHandoff,
  SlidePlanVersion,
  EditableSemanticSlidePlanV02,
  Meta,
  NextStage,
  RedemptionCodeRecord,
  User,
} from "@/lib/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export function assetContentUrl(contentUrl: string): string {
  const apiPrefix = "/api/v1";
  return contentUrl.startsWith(`${apiPrefix}/`)
    ? `${API_BASE}${contentUrl.slice(apiPrefix.length)}`
    : `${API_BASE}${contentUrl.startsWith("/") ? "" : "/"}${contentUrl}`;
}

type ApiErrorBody = {
  error?: { code?: string; message?: string; details?: unknown };
};

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "REQUEST_FAILED", status = 500) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      "网络连接失败，请检查网络，或确认服务已启动后重试。",
      "NETWORK_ERROR",
      0,
    );
  }

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Keep the stable fallback below for non-JSON responses.
    }
    throw new ApiError(
      body.error?.message ?? "请求暂时没有成功，请稍后重试。",
      body.error?.code,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export const api = {
  meta: () => request<Meta>("/meta"),
  me: () => request<{ user: User }>("/auth/me"),
  login: (inviteCode: string) =>
    request<{ user: User; authenticated: boolean }>("/auth/invite", {
      method: "POST",
      body: JSON.stringify({ invite_code: inviteCode }),
    }),
  createReentryCode: () =>
    request<{ invite_code: string; user: User; display_once: true }>(
      "/auth/reentry-code",
      { method: "POST" },
    ),
  redeemSubscriptionCode: (redemptionCode: string) =>
    request<{
      redemption: RedemptionCodeRecord;
      entitlement: AccountEntitlement;
      user: User;
    }>("/account/redemption-codes:redeem", {
      method: "POST",
      body: JSON.stringify({ redemption_code: redemptionCode }),
    }),
  logout: () => request<{ authenticated: false }>("/auth/logout", { method: "POST" }),
  courses: () => request<{ items: Course[] }>("/courses"),
  createCourse: () => request<Course>("/courses", { method: "POST" }),
  course: (courseId: string) => request<Course>(`/courses/${courseId}`),
  pinCourse: (courseId: string) =>
    request<Course>(`/courses/${encodeURIComponent(courseId)}:pin`, { method: "POST" }),
  unpinCourse: (courseId: string) =>
    request<Course>(`/courses/${encodeURIComponent(courseId)}:unpin`, { method: "POST" }),
  deleteCourse: (courseId: string) =>
    request<{ deleted: true; course_id: string }>(
      `/courses/${encodeURIComponent(courseId)}`,
      { method: "DELETE" },
    ),
  restoreCourse: (courseId: string) =>
    request<Course>(`/courses/${encodeURIComponent(courseId)}:restore`, {
      method: "POST",
    }),
  parseRequirements: (
    courseId: string,
    rawText: string,
    draftId?: string,
    answeredQuestionIds: string[] = [],
  ) =>
    request<{ job: Job }>(`/courses/${courseId}/requirements:parse`, {
      method: "POST",
      body: JSON.stringify({
        raw_user_text: rawText,
        existing_draft_version_id: draftId ?? null,
        answered_question_ids: answeredQuestionIds,
        idempotency_key: crypto.randomUUID(),
      }),
    }),
  job: (jobId: string) => request<{ job: Job }>(`/jobs/${jobId}`),
  currentJob: (courseId: string, moduleId: Job["module_id"]) =>
    request<{ job: Job }>(
      `/courses/${courseId}/jobs/current?module_id=${encodeURIComponent(moduleId)}`,
    ),
  inputSpec: (courseId: string) =>
    request<{ input_spec_version: InputSpecVersion }>(
      `/courses/${courseId}/input-spec/current-draft`,
    ),
  reviseInput: (
    courseId: string,
    versionId: string,
    editableInput: EditableInputSpecPayload,
  ) =>
    request<{ input_spec_version: InputSpecVersion }>(
      `/courses/${courseId}/input-spec/${versionId}:revise`,
      {
        method: "POST",
        body: JSON.stringify(editableInput),
      },
    ),
  confirmInput: (courseId: string, versionId: string) =>
    request<{ input_spec_version: InputSpecVersion; job: Job }>(
      `/courses/${courseId}/input-spec/${versionId}:confirm`,
      { method: "POST", body: JSON.stringify({ idempotency_key: crypto.randomUUID() }) },
    ),
  blueprint: (courseId: string) =>
    request<{ blueprint_version: BlueprintVersion }>(
      `/courses/${courseId}/blueprints/current`,
    ),
  reviseBlueprint: (
    courseId: string,
    versionId: string,
    learningObjectives: LearningObjective[],
    stages: CourseStage[],
  ) =>
    request<{ blueprint_version: BlueprintVersion }>(
      `/courses/${courseId}/blueprints/${versionId}:revise`,
      {
        method: "POST",
        body: JSON.stringify({
          learning_objectives: learningObjectives,
          stages,
        }),
      },
    ),
  confirmBlueprint: (courseId: string, versionId: string) =>
    request<{ blueprint_version: BlueprintVersion; job: Job; next_stage: NextStage }>(
      `/courses/${courseId}/blueprints/${versionId}:confirm`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  retryBlueprint: (courseId: string) =>
    request<{ job: Job }>(`/courses/${courseId}/blueprints:retry`, { method: "POST" }),
  generateLesson: (courseId: string) =>
    request<{ job: Job }>(`/courses/${courseId}/lessons:generate`, {
      method: "POST",
      body: JSON.stringify({ idempotency_key: crypto.randomUUID() }),
    }),
  lesson: (courseId: string) =>
    request<{ lesson_version: LessonVersion }>(
      `/courses/${courseId}/lessons/current`,
    ),
  reviseLesson: (
    courseId: string,
    versionId: string,
    editableLesson: EditableLessonPayload,
  ) =>
    request<{ lesson_version: LessonVersion }>(
      `/courses/${courseId}/lessons/${versionId}:revise`,
      {
        method: "POST",
        body: JSON.stringify({ editable_lesson: editableLesson }),
      },
    ),
  confirmLesson: (courseId: string, versionId: string) =>
    request<{
      lesson_version: LessonVersion;
      job: Job;
      downstream_handoff: DownstreamHandoff;
    }>(`/courses/${courseId}/lessons/${versionId}:confirm`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  retryLesson: (courseId: string) =>
    request<{ job: Job }>(`/courses/${courseId}/lessons:retry`, {
      method: "POST",
    }),
  generateArtworkSpec: (courseId: string) =>
    request<{ job: Job }>(`/courses/${courseId}/artwork-specs:generate`, {
      method: "POST",
      body: JSON.stringify({ idempotency_key: crypto.randomUUID() }),
    }),
  artworkSpec: (courseId: string) =>
    request<{ artwork_spec_version: ArtworkSpecVersion }>(
      `/courses/${courseId}/artwork-specs/current`,
    ),
  reviseArtworkSpec: (
    courseId: string,
    versionId: string,
    editableArtworkSpec: EditableMainArtworkSpecPayload,
  ) =>
    request<{ artwork_spec_version: ArtworkSpecVersion }>(
      `/courses/${courseId}/artwork-specs/${versionId}:revise`,
      {
        method: "POST",
        body: JSON.stringify({ editable_artwork_spec: editableArtworkSpec }),
      },
    ),
  confirmArtworkSpec: (courseId: string, versionId: string) =>
    request<{
      artwork_spec_version: ArtworkSpecVersion;
      downstream_handoff: ArtworkSpecDownstreamHandoff;
    }>(`/courses/${courseId}/artwork-specs/${versionId}:confirm`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  retryArtworkSpec: (courseId: string) =>
    request<{ job: Job }>(`/courses/${courseId}/artwork-specs:retry`, {
      method: "POST",
    }),
  mainArtworkQuote: (courseId: string) =>
    request<{ generation_quote: GenerationQuote }>(
      `/courses/${courseId}/main-artworks/generation-quotes`,
      { method: "POST" },
    ),
  generateMainArtwork: (courseId: string, quoteId: string) =>
    request<{ job: Job }>(`/courses/${courseId}/main-artworks:generate`, {
      method: "POST",
      body: JSON.stringify({
        schema_version: "0.1",
        quote_id: quoteId,
        idempotency_key: crypto.randomUUID(),
      }),
    }),
  mainArtwork: (courseId: string) =>
    request<{ main_artwork_version: MainArtworkVersion }>(
      `/courses/${courseId}/main-artworks/current`,
    ),
  mainArtworkCandidates: (courseId: string) =>
    request<{ main_artwork_candidates: MainArtworkVersion[] }>(
      `/courses/${courseId}/main-artworks/candidates`,
    ),
  selectMainArtwork: (courseId: string, versionId: string) =>
    request<{ main_artwork_version: MainArtworkVersion }>(
      `/courses/${courseId}/main-artworks/${versionId}:select`,
      { method: "POST" },
    ),
  regenerateMainArtwork: (courseId: string, versionId: string, quoteId: string) =>
    request<{ job: Job }>(
      `/courses/${courseId}/main-artworks/${versionId}:regenerate`,
      {
        method: "POST",
        body: JSON.stringify({
          schema_version: "0.1",
          quote_id: quoteId,
          idempotency_key: crypto.randomUUID(),
        }),
      },
    ),
  confirmMainArtwork: (courseId: string, versionId: string) =>
    request<{
      main_artwork_version: MainArtworkVersion;
      downstream_handoff: MainArtworkDownstreamHandoff;
    }>(`/courses/${courseId}/main-artworks/${versionId}:confirm`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  stepSheetQuote: (courseId: string) =>
    request<{ generation_quote: GenerationQuote }>(
      `/courses/${courseId}/step-sheets/generation-quotes`,
      { method: "POST" },
    ),
  generateStepSheet: (courseId: string, quoteId: string) =>
    request<{ job: Job }>(`/courses/${courseId}/step-sheets:generate`, {
      method: "POST",
      body: JSON.stringify({
        schema_version: "0.1",
        quote_id: quoteId,
        idempotency_key: crypto.randomUUID(),
      }),
    }),
  stepSheet: (courseId: string) =>
    request<{ step_sheet_version: StepSheetVersion }>(
      `/courses/${courseId}/step-sheets/current`,
    ),
  stepSheetCandidates: (courseId: string) =>
    request<{ step_sheet_candidates: StepSheetVersion[] }>(
      `/courses/${courseId}/step-sheets/candidates`,
    ),
  selectStepSheet: (courseId: string, versionId: string) =>
    request<{ step_sheet_version: StepSheetVersion }>(
      `/courses/${courseId}/step-sheets/${versionId}:select`,
      { method: "POST" },
    ),
  regenerateStepSheet: (courseId: string, versionId: string, quoteId: string) =>
    request<{ job: Job }>(
      `/courses/${courseId}/step-sheets/${versionId}:regenerate`,
      {
        method: "POST",
        body: JSON.stringify({
          schema_version: "0.1",
          quote_id: quoteId,
          idempotency_key: crypto.randomUUID(),
        }),
      },
    ),
  confirmStepSheet: (courseId: string, versionId: string) =>
    request<{
      step_sheet_version: StepSheetVersion;
      downstream_handoff: StepSheetDownstreamHandoff;
    }>(`/courses/${courseId}/step-sheets/${versionId}:confirm`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  generateSlidePlan: (courseId: string) =>
    request<{ job: Job }>(`/courses/${courseId}/slide-plans:generate`, {
      method: "POST",
      body: JSON.stringify({ idempotency_key: crypto.randomUUID() }),
    }),
  enhanceSlidePlanContent: (courseId: string, versionId: string) =>
    request<{ job: Job }>(
      `/courses/${courseId}/slide-plans/${versionId}:enhance-content`,
      {
        method: "POST",
        body: JSON.stringify({ idempotency_key: crypto.randomUUID() }),
      },
    ),
  slidePlan: (courseId: string) =>
    request<{ slide_plan_version: SlidePlanVersion }>(
      `/courses/${courseId}/slide-plans/current`,
    ),
  reviseSlidePlan: (
    courseId: string,
    versionId: string,
    revision: EditableSemanticSlidePlanV02,
  ) =>
    request<{ slide_plan_version: SlidePlanVersion }>(
      `/courses/${courseId}/slide-plans/${versionId}:revise`,
      { method: "POST", body: JSON.stringify(revision) },
    ),
  upgradeSlidePlan: (courseId: string, versionId: string) =>
    request<{ slide_plan_version: SlidePlanVersion }>(
      `/courses/${courseId}/slide-plans/${versionId}:upgrade-layout`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  refreshSlidePlanObservation: (
    courseId: string,
    versionId: string,
    queries: string[],
  ) =>
    request<{
      slide_plan_version: SlidePlanVersion;
      refresh: {
        from_version_id: string;
        to_version_id: string;
        provider_submit_count: 0;
        estimated_cost_micros_cny: 0;
        observation_asset_count: number;
        warnings: string[];
      };
    }>(`/courses/${courseId}/slide-plans/${versionId}:refresh-observation`, {
      method: "POST",
      body: JSON.stringify({ queries }),
    }),
  uploadSlidePlanObservation: (
    courseId: string,
    versionId: string,
    file: File,
  ) =>
    request<{
      slide_plan_version: SlidePlanVersion;
      upload: {
        from_version_id: string;
        to_version_id: string;
        provider_submit_count: 0;
        estimated_cost_micros_cny: 0;
        observation_asset_count: number;
      };
    }>(
      `/courses/${courseId}/slide-plans/${versionId}:upload-observation?filename=${encodeURIComponent(file.name)}&rights_attested=true`,
      {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      },
    ),
  confirmSlidePlan: (courseId: string, versionId: string) =>
    request<{
      slide_plan_version: SlidePlanVersion;
      downstream_handoff: SlidePlanDownstreamHandoff;
    }>(`/courses/${courseId}/slide-plans/${versionId}:confirm`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  courseFeedback: (courseId: string, versionId: string) =>
    request<{ feedback: CourseFeedback | null }>(
      `/courses/${courseId}/slide-plans/${versionId}/feedback`,
    ),
  saveCourseFeedback: (
    courseId: string,
    versionId: string,
    rating: CourseFeedbackRating,
    issueTags: CourseFeedbackIssueTag[],
    comment: string,
  ) =>
    request<{ feedback: CourseFeedback }>(
      `/courses/${courseId}/slide-plans/${versionId}/feedback`,
      {
        method: "POST",
        body: JSON.stringify({
          rating,
          issue_tags: issueTags,
          comment: comment.trim() || null,
        }),
      },
    ),
  presentation: (courseId: string) =>
    request<{ presentation: CoursePresentation }>(
      `/courses/${courseId}/presentation`,
    ),
};
