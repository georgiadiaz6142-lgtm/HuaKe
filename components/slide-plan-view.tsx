"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { api, assetContentUrl } from "@/lib/api";
import {
  RenderDeckCanvas,
  RenderDeckPreflight,
  type DeckValidationResult,
} from "@/components/render-deck";
import {
  canRefreshObservation,
  courseFeedbackSubmissionIssue,
  observationRefreshCopy,
  observationUploadIssue as validateObservationUpload,
  observationUploadPrerequisiteIssue,
  slidePlanNeedsContentEnhancement,
} from "@/lib/slide-plan-state";
import type {
  CourseFeedback,
  CourseFeedbackIssueTag,
  CourseFeedbackRating,
  EditableSemanticSlidePlanV02,
  Job,
  SemanticSlidePlanSlotsV02,
  SlideElement,
  SlidePlanAsset,
  SlidePlanSlide,
  SlidePlanVersion,
  SlidePlanVersionV02,
} from "@/lib/types";

const SLOT_LABELS: Record<string, string> = {
  cover: "主题进入", hook_and_goals: "观察与思考", observe_form: "主题元素",
  observe_color_texture: "色彩发现", professional_observation: "创作构思",
  technique_and_safety: "任务与准备", step_1: "步骤一", step_2: "步骤二",
  step_3: "步骤三", creative_variation: "创意变化", creation_task: "创作任务",
  sharing_and_assessment: "分享与评价",
};

function cloneSlots(version: SlidePlanVersionV02): SemanticSlidePlanSlotsV02 {
  return structuredClone(version.slide_plan.semantic_plan.slots);
}

function LegacyElement({ element, assets }: { element: SlideElement; assets: Record<string, SlidePlanAsset> }) {
  const style: CSSProperties = { left: `${element.layout.x * 100}%`, top: `${element.layout.y * 100}%`, width: `${element.layout.w * 100}%`, height: `${element.layout.h * 100}%`, zIndex: element.z_index };
  if (element.element_type === "image" && element.asset_key) {
    const asset = assets[element.asset_key];
    return asset ? (
      <div className="slide-preview-element image" style={style}>
        {/* Legacy v0.1 assets require the existing HttpOnly session cookie. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetContentUrl(asset.url)} alt={element.alt_text ?? "课程图片"} crossOrigin="use-credentials" style={{ objectFit: element.image_fit ?? "contain" }} />
      </div>
    ) : null;
  }
  if (element.element_type === "highlight" && element.highlight_region) {
    const [x, y, width, height] = element.highlight_region;
    return <div className="slide-preview-element highlight-layer" style={style} aria-hidden="true"><i style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` }} /></div>;
  }
  if (element.element_type === "text" || element.element_type === "badge") return <div className={`slide-preview-element text ${element.style_token}`} style={style}>{element.text}</div>;
  return <div className="slide-preview-element shape" style={style} />;
}

function LegacySlide({ slide, assets }: { slide: SlidePlanSlide; assets: Record<string, SlidePlanAsset> }) {
  return <article className="slide-plan-page legacy"><header><span>{String(slide.slide_no).padStart(2, "0")}</span><div><strong>{slide.title}</strong><small>{slide.teaching_purpose}</small></div></header><div className="slide-preview-canvas">{slide.elements.map((element) => <LegacyElement key={element.element_id} element={element} assets={assets} />)}</div></article>;
}

const FEEDBACK_RATINGS: Array<{ value: CourseFeedbackRating; label: string }> = [
  { value: "ready_to_use", label: "可直接使用" },
  { value: "needs_adjustment", label: "需要微调" },
  { value: "not_usable", label: "不可使用" },
];

const FEEDBACK_ISSUES: Array<{ value: CourseFeedbackIssueTag; label: string }> = [
  { value: "lesson", label: "结构化教案" },
  { value: "main_artwork", label: "主范画" },
  { value: "step_sheet", label: "三联步骤图" },
  { value: "observation_asset", label: "观察素材" },
  { value: "presentation", label: "课堂演示" },
];

function CourseFeedbackPanel({ courseId, versionId }: { courseId: string; versionId: string }) {
  const [feedback, setFeedback] = useState<CourseFeedback | null>(null);
  const [rating, setRating] = useState<CourseFeedbackRating | null>(null);
  const [issueTags, setIssueTags] = useState<CourseFeedbackIssueTag[]>([]);
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.courseFeedback(courseId, versionId)
      .then(({ feedback: existing }) => {
        if (!active || !existing) return;
        setFeedback(existing);
        setRating(existing.rating);
        setIssueTags(existing.issue_tags);
        setComment(existing.comment ?? "");
      })
      .catch((error: unknown) => {
        if (active) setIssue(error instanceof Error ? error.message : "反馈暂时无法读取。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [courseId, versionId]);

  function chooseRating(value: CourseFeedbackRating) {
    setRating(value);
    if (value === "ready_to_use") setIssueTags([]);
    setIssue(null);
    setSavedNotice(null);
  }

  function toggleIssue(value: CourseFeedbackIssueTag) {
    setIssueTags((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
    setIssue(null);
    setSavedNotice(null);
  }

  async function submitFeedback() {
    const submissionIssue = courseFeedbackSubmissionIssue(
      rating,
      issueTags.length,
      comment,
    );
    if (submissionIssue || !rating) {
      setIssue(submissionIssue);
      return;
    }
    setSaving(true);
    setIssue(null);
    try {
      const response = await api.saveCourseFeedback(
        courseId,
        versionId,
        rating,
        issueTags,
        comment,
      );
      setFeedback(response.feedback);
      setOpen(false);
      setSavedNotice("反馈已保存，不会触发重新生成或产生模型费用。");
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "反馈暂时未保存，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  const savedRating = feedback
    ? FEEDBACK_RATINGS.find((item) => item.value === feedback.rating)?.label
    : null;

  return <section className="course-feedback-panel">
    <div className="course-feedback-heading">
      <div><strong>这套课程实际使用起来怎么样？</strong><span>反馈只用于改进产品，不会修改当前课程或自动重新生成。</span></div>
      <button className="secondary-button" type="button" disabled={loading} onClick={() => { setOpen((value) => !value); setIssue(null); }}>{open ? "收起" : feedback ? "修改反馈" : "填写反馈"}</button>
    </div>
    {!open && feedback && <div className="course-feedback-summary"><strong>{savedRating}</strong>{feedback.issue_tags.length > 0 && <span>{feedback.issue_tags.map((tag) => FEEDBACK_ISSUES.find((item) => item.value === tag)?.label).filter(Boolean).join("、")}</span>}</div>}
    {savedNotice && <span className="course-feedback-success" role="status">{savedNotice}</span>}
    {open && <div className="course-feedback-form">
      <fieldset><legend>使用感受</legend><div className="course-feedback-ratings">{FEEDBACK_RATINGS.map((item) => <button key={item.value} type="button" aria-pressed={rating === item.value} className={rating === item.value ? "selected" : ""} onClick={() => chooseRating(item.value)}>{item.label}</button>)}</div></fieldset>
      {rating && rating !== "ready_to_use" && <fieldset><legend>问题主要出现在哪里？</legend><div className="course-feedback-issues">{FEEDBACK_ISSUES.map((item) => <label key={item.value}><input type="checkbox" checked={issueTags.includes(item.value)} onChange={() => toggleIssue(item.value)} /><span>{item.label}</span></label>)}</div></fieldset>}
      <label className="course-feedback-comment"><span>补充说明（选填）</span><textarea rows={4} maxLength={1000} value={comment} onChange={(event) => { setComment(event.target.value); setIssue(null); setSavedNotice(null); }} placeholder="例如：观察图片与主题不够贴合，第三页课堂提问还可以更具体。" /></label>
      {issue && <span className="course-feedback-error" role="alert">{issue}</span>}
      <div className="course-feedback-submit"><span>反馈绑定当前已确认版本，可随时回来修改。</span><button className="primary-button" type="button" disabled={saving} onClick={() => void submitFeedback()}>{saving ? "正在保存…" : feedback ? "更新反馈" : "提交反馈"}</button></div>
    </div>}
  </section>;
}

export function SlidePlanView({ courseId, slidePlan, job, busy, generating, onGenerate, onEnhanceContent, onSave, onUpgrade, onRefreshObservation, onUploadObservation, onConfirm }: {
  courseId: string;
  slidePlan: SlidePlanVersion | null; job: Job | null; busy: boolean; generating: boolean;
  onGenerate: () => Promise<void>; onEnhanceContent: () => Promise<void>;
  onSave: (revision: EditableSemanticSlidePlanV02) => Promise<void>;
  onUpgrade: () => Promise<void>; onRefreshObservation: (queries: string[]) => Promise<string | null>;
  onUploadObservation: (file: File) => Promise<void>;
  onConfirm: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SemanticSlidePlanSlotsV02 | null>(slidePlan?.schema_version === "0.2" ? cloneSlots(slidePlan) : null);
  const [observationQueryText, setObservationQueryText] = useState(
    slidePlan?.schema_version === "0.2"
      ? slidePlan.slide_plan.semantic_plan.observation_search_queries.join("\n")
      : "",
  );
  const [observationRefreshIssue, setObservationRefreshIssue] = useState<string | null>(null);
  const [observationUploadFile, setObservationUploadFile] = useState<File | null>(null);
  const [observationUploadPreview, setObservationUploadPreview] = useState<string | null>(null);
  const [observationUploadIssue, setObservationUploadIssue] = useState<string | null>(null);
  const [observationRightsAttested, setObservationRightsAttested] = useState(false);
  const [observationUploadInputKey, setObservationUploadInputKey] = useState(0);
  const [deckValidation, setDeckValidation] = useState<DeckValidationResult>({ specHash: "", complete: false, overflowElementIds: [] });
  const generationRunning = generating || (busy && job?.module_id === "P0-11");
  const current = slidePlan?.freshness_status === "current";
  const observationAssets = useMemo(() => slidePlan ? Object.entries(slidePlan.assets).filter(([key]) => key.startsWith("observation_")) : [], [slidePlan]);
  const currentObservationAsset = observationAssets[0]?.[1] ?? null;
  const observationRefresh = observationRefreshCopy(observationAssets.length);
  const deck = slidePlan?.schema_version === "0.2" ? slidePlan.slide_plan.render_deck_spec : null;
  const needsContentEnhancement = slidePlan?.schema_version === "0.2"
    ? slidePlanNeedsContentEnhancement(slidePlan.slide_plan.semantic_plan.slots)
    : false;
  const activeSlide = deck?.slides[selected] ?? null;
  const activeSlot = activeSlide && draft ? draft[activeSlide.slot_id] : null;
  const handleValidation = useCallback((result: DeckValidationResult) => {
    setDeckValidation(result);
  }, []);
  const validationIsCurrent = deckValidation.specHash === deck?.spec_hash;
  const presentationBlocked =
    !validationIsCurrent ||
    !deckValidation.complete ||
    deckValidation.overflowElementIds.length > 0;

  useEffect(() => {
    return () => {
      if (observationUploadPreview) URL.revokeObjectURL(observationUploadPreview);
    };
  }, [observationUploadPreview]);

  async function save() { if (!draft) return; await onSave({ schema_version: "0.2", slots: draft }); setEditing(false); }
  const observationQueries = observationQueryText.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 4);
  function updateActive(patch: Partial<SemanticSlidePlanSlotsV02[keyof SemanticSlidePlanSlotsV02]>) { if (!activeSlide || !draft) return; setDraft({ ...draft, [activeSlide.slot_id]: { ...draft[activeSlide.slot_id], ...patch } }); }
  function selectObservationUpload(file: File | null) {
    setObservationUploadIssue(null);
    setObservationRightsAttested(false);
    if (!file) {
      setObservationUploadFile(null);
      setObservationUploadPreview(null);
      return;
    }
    const issue = validateObservationUpload(file);
    if (issue) {
      setObservationUploadFile(null);
      setObservationUploadPreview(null);
      setObservationUploadIssue(issue);
      return;
    }
    setObservationUploadFile(file);
    setObservationUploadPreview(URL.createObjectURL(file));
  }
  async function uploadObservation() {
    const prerequisiteIssue = observationUploadPrerequisiteIssue(
      Boolean(observationUploadFile),
      observationRightsAttested,
    );
    if (prerequisiteIssue) {
      setObservationUploadIssue(prerequisiteIssue);
      return;
    }
    if (!observationUploadFile) return;
    try {
      await onUploadObservation(observationUploadFile);
      setObservationUploadFile(null);
      setObservationUploadPreview(null);
      setObservationRightsAttested(false);
      setObservationUploadIssue(null);
      setObservationUploadInputKey((value) => value + 1);
    } catch {
      // The app shell already shows the stable API error; keep the selection for retry.
    }
  }
  async function refreshObservation() {
    setObservationRefreshIssue(null);
    const issue = await onRefreshObservation(observationQueries);
    setObservationRefreshIssue(issue);
  }

  return <section className="paper-card slide-plan-card">
    <div className="card-heading slide-plan-heading"><span className="step-number">08</span><div><h2>{slidePlan ? "课堂演示页面方案" : "生成课堂演示页面方案"}</h2></div>{slidePlan && <span className={`state-badge ${current && slidePlan.confirmation_state === "confirmed" ? "ok" : "attention"}`}>{!current ? "已过期" : slidePlan.confirmation_state === "confirmed" ? "已确认" : "待确认"}</span>}</div>
    {!slidePlan && <div className="slide-plan-gate"><div><strong>步骤图已确认，可以编排课堂演示</strong><p>模型只组织固定十二页的教学语义，后台再确定性编译版式。</p></div><button className="primary-button" type="button" disabled={busy} data-loading={generationRunning} aria-busy={generationRunning} onClick={onGenerate}>{generationRunning ? "正在编排…" : "生成课堂演示页面方案"}</button></div>}

    {slidePlan?.schema_version === "0.1" && <><div className="legacy-slide-notice"><strong>历史 v0.1 页面方案 · 只读</strong><span>{current ? "可零成本升级到当前页面版式，升级不会调用模型。" : "该历史版本已过期，仅保留查看。"}</span></div><div className="slide-plan-grid legacy-grid">{slidePlan.slide_plan.slide_plan.slides.map((slide) => <LegacySlide key={slide.slide_id} slide={slide} assets={slidePlan.assets} />)}</div>{current && slidePlan.upgrade_available && <div className="slide-plan-actions"><div><strong>升级后生成新的未确认 v0.2 版本</strong><span>旧版本与原确认记录保留，旧版仅标记为已过期。</span></div><button className="primary-button" type="button" disabled={busy} onClick={onUpgrade}>零成本升级页面版式</button></div>}</>}

    {slidePlan?.schema_version === "0.2" && deck && activeSlide && <>
      <RenderDeckPreflight deck={deck} assets={slidePlan.assets} onValidationChange={handleValidation} />
      <div className="slide-plan-summary"><strong>固定 12 页</strong><span>{observationAssets.length ? `含 ${observationAssets.length} 张授权真实观察素材` : "观察页为文字引导，未用范画替代"}</span></div>
      {needsContentEnhancement && current && <div className="slide-content-enhancement-panel"><div><strong>当前课堂内容较少，可以直接补充</strong><span>系统会从已确认教案补充页面要点和教师备注，只重新整理文字；现有照片、主范画、三联步骤图和旧版本都会保留。</span></div><button className="primary-button" type="button" disabled={busy || slidePlan.generation_usage.remaining === 0} data-loading={generationRunning} aria-busy={generationRunning} onClick={() => void onEnhanceContent()}>{generationRunning ? "正在优化课堂内容…" : slidePlan.generation_usage.remaining === 0 ? "文字优化次数已用完" : "优化课堂内容"}</button></div>}
      {canRefreshObservation(slidePlan.schema_version, slidePlan.freshness_status) && <div className="observation-asset-actions">
        <div className="observation-refresh-panel"><div><strong>{observationRefresh.title}</strong><span>{observationRefresh.description}</span>{currentObservationAsset && <figure className="observation-current-asset">
          {/* The protected asset is served by the authenticated API, so it bypasses image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetContentUrl(currentObservationAsset.url)} alt="当前观察素材" width={currentObservationAsset.width} height={currentObservationAsset.height} />
          <figcaption>当前素材 · {currentObservationAsset.creator_name ?? "作者未标注"}</figcaption>
        </figure>}</div><textarea aria-label="观察素材检索词" rows={3} maxLength={480} value={observationQueryText} placeholder={"例如：\nchildren summer festival\nsummer picnic"} onChange={(event) => { setObservationQueryText(event.target.value); setObservationRefreshIssue(null); }} /><button className="secondary-button" type="button" disabled={busy || observationQueries.length === 0} onClick={() => void refreshObservation()}>{busy ? "正在检索…" : observationRefresh.action}</button>{observationRefreshIssue && <span className="observation-refresh-error" role="alert">{observationRefreshIssue}；当前观察图片保持不变。</span>}</div>
        <div className="observation-upload-panel">
          <div className="observation-upload-copy"><strong>上传自己的观察照片</strong><span>仅支持 JPG/PNG、不超过 25 MB 的横向图片。上传后生成新的待确认版本，不调用模型。</span></div>
          <label className={`observation-file-picker${busy ? " disabled" : ""}`}>
            <input className="observation-file-native" key={observationUploadInputKey} type="file" accept="image/jpeg,image/png" disabled={busy} onChange={(event) => selectObservationUpload(event.target.files?.[0] ?? null)} />
            <span className="observation-file-button">选择图片文件</span>
            <span className="observation-file-name">{observationUploadFile?.name ?? "尚未选择图片"}</span>
          </label>
          {observationUploadPreview && observationUploadFile && <figure className="observation-upload-preview">
            {/* User-selected local preview must remain a browser object URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={observationUploadPreview} alt="待上传的观察素材预览" />
            <figcaption>{observationUploadFile.name} · {(observationUploadFile.size / 1024 / 1024).toFixed(1)} MB</figcaption>
          </figure>}
          {observationUploadIssue && <span className="observation-upload-error" role="alert">{observationUploadIssue}</span>}
          <label className="observation-rights"><input type="checkbox" checked={observationRightsAttested} disabled={busy} onChange={(event) => { setObservationRightsAttested(event.target.checked); if (event.target.checked && observationUploadFile) setObservationUploadIssue(null); }} /><span>我拥有该图片，或已获得用于课堂教学的使用权。</span></label>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void uploadObservation()}>{busy ? "正在上传…" : "上传并生成新版本"}</button>
        </div>
      </div>}
      <div className="deck-workspace"><nav className="deck-thumbnails" aria-label="页面导航">{deck.slides.map((slide, index) => <button key={slide.slide_id} type="button" className={selected === index ? "active" : ""} aria-current={selected === index ? "page" : undefined} onClick={() => setSelected(index)}><span>{String(index + 1).padStart(2, "0")} · {SLOT_LABELS[slide.slot_id]}</span><RenderDeckCanvas slide={slide} assets={slidePlan.assets} thumbnail /></button>)}</nav><div className="deck-stage"><div className="deck-stage-heading"><span>{String(selected + 1).padStart(2, "0")}</span><strong>{SLOT_LABELS[activeSlide.slot_id]}</strong><small>spec {deck.spec_hash.slice(0, 12)}</small></div><RenderDeckCanvas slide={activeSlide} assets={slidePlan.assets} /><section className="deck-speaker-notes"><strong>教师备注（画布外）</strong>{activeSlide.speaker_notes.length ? <ul>{activeSlide.speaker_notes.map((note) => <li key={note}>{note}</li>)}</ul> : <span>本页无教师备注</span>}</section></div></div>

      {(!validationIsCurrent || !deckValidation.complete) && <div className="deck-validation-status" role="status">正在使用浏览器实际字体检查十二页文字…</div>}
      {validationIsCurrent && deckValidation.complete && deckValidation.overflowElementIds.length > 0 && <div className="deck-validation-error" role="alert"><strong>发现文字溢出，当前版本不能正式演示或确认</strong>{deckValidation.overflowElementIds.map((elementId) => <span key={elementId}>{elementId}</span>)}</div>}

      {editing && activeSlot && <div className="semantic-slide-editor"><header><span>只编辑页面语义</span><strong>{SLOT_LABELS[activeSlide.slot_id]}</strong></header><label>页面标题<input maxLength={48} value={activeSlot.title} onChange={(event) => updateActive({ title: event.target.value })} /></label><label>核心信息<textarea rows={3} maxLength={160} value={activeSlot.core_message} onChange={(event) => updateActive({ core_message: event.target.value })} /></label><label>可见要点（每行一项，最多 3 项）<textarea rows={4} maxLength={300} value={activeSlot.visible_points.join("\n")} onChange={(event) => updateActive({ visible_points: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 3) })} /></label><label>教师备注（每行一项，最多 2 项）<textarea rows={3} maxLength={320} value={activeSlot.teacher_notes.join("\n")} onChange={(event) => updateActive({ teacher_notes: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 2) })} /></label></div>}
      {observationAssets.length > 0 && <div className="slide-source-list"><strong>观察素材来源记录</strong>{observationAssets.map(([key, asset]) => <span key={key}>{asset.creator_name ?? "作者未标注"} · {asset.license_id ?? "许可待核对"}</span>)}</div>}
      {slidePlan.slide_plan.warnings.length > 0 && <div className="warning-list">{slidePlan.slide_plan.warnings.map((warning) => <span key={warning}>提醒：{warning}</span>)}</div>}
      <div className="slide-plan-actions"><div><strong>{slidePlan.upgrade_available ? "当前页面方案可更新到教案驱动的课堂演示" : slidePlan.confirmation_state === "confirmed" ? "当前页面方案已确认，可以开始上课" : "保存语义修改不等于确认"}</strong><span>{slidePlan.upgrade_available ? "更新不调用模型；系统会先检索真实观察素材，前半引导思考，后半再使用范画。" : slidePlan.confirmation_state === "confirmed" ? "可以随时进入全屏课堂演示。" : "确认后即可进入全屏课堂演示。"}</span></div>{editing ? <><button className="text-button" type="button" disabled={busy} onClick={() => { setDraft(cloneSlots(slidePlan)); setEditing(false); }}>取消</button><button className="primary-button" type="button" disabled={busy} onClick={save}>保存为新版本</button></> : slidePlan.upgrade_available && current ? <button className="primary-button" type="button" disabled={busy} onClick={onUpgrade}>检索素材并更新演示</button> : slidePlan.confirmation_state === "confirmed" && current ? <a className={`primary-button${presentationBlocked ? " disabled-link" : ""}`} aria-disabled={presentationBlocked} href={presentationBlocked ? undefined : `/courses/${courseId}/presentation`}>开始上课</a> : <><button className="secondary-button" type="button" disabled={busy || !current} onClick={() => setEditing(true)}>编辑当前页语义</button><button className="primary-button" type="button" disabled={busy || !current || presentationBlocked} onClick={onConfirm}>确认页面方案</button></>}</div>
      {slidePlan.confirmation_state === "confirmed" && current && <CourseFeedbackPanel courseId={courseId} versionId={slidePlan.id} />}
    </>}
  </section>;
}
