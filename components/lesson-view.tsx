import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  EditableLessonPayload,
  EditableLessonStage,
  LessonPreparation,
  LessonVersion,
} from "@/lib/types";


type LessonViewProps = {
  lesson: LessonVersion;
  busy: boolean;
  generating: boolean;
  onSave: (editable: EditableLessonPayload) => Promise<void>;
  onConfirm: () => Promise<void>;
};


export function LessonView({ lesson, busy, generating, onSave, onConfirm }: LessonViewProps) {
  const data = lesson.lesson_package.lesson_package_draft;
  const [editing, setEditing] = useState(false);
  const [editable, setEditable] = useState<EditableLessonPayload>(() =>
    editableFromLesson(lesson),
  );
  const hasChanges = useMemo(
    () => JSON.stringify(editable) !== JSON.stringify(editableFromLesson(lesson)),
    [editable, lesson],
  );
  const complete =
    editable.overview.trim().length > 0 &&
    Object.values(editable.preparation).every(
      (items) => items.length > 0 && items.every((item) => item.trim().length > 0),
    ) &&
    editable.stages.every(
      (stage) =>
        stage.purpose.trim() &&
        stage.teacher_actions.length > 0 &&
        stage.teacher_talking_points.length > 0 &&
        stage.child_actions.length > 0 &&
        stage.observation_points.length > 0,
    ) &&
    editable.differentiation.support.length > 0 &&
    editable.differentiation.extension.length > 0 &&
    editable.assessment.length > 0 &&
    editable.cleanup_and_closure.length > 0;
  const isOutdated = lesson.freshness_status === "outdated";

  function cancelEditing() {
    setEditable(editableFromLesson(lesson));
    setEditing(false);
  }

  async function saveEditing() {
    try {
      await onSave(editable);
    } catch {
      return;
    }
  }

  function updatePreparation(field: keyof LessonPreparation, value: string) {
    setEditable((current) => ({
      ...current,
      preparation: { ...current.preparation, [field]: lines(value) },
    }));
  }

  function updateStage(index: number, patch: Partial<EditableLessonStage>) {
    setEditable((current) => ({
      ...current,
      stages: current.stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patch } : stage,
      ),
    }));
  }

  return (
    <section className="paper-card lesson-card">
      <div className="card-heading lesson-heading">
        <span className="step-number">04</span>
        <div>
          <p className="eyebrow">结构化教案 · V{lesson.version_no}</p>
          <h2>{data.title}</h2>
        </div>
        <div className="lesson-heading-actions">
          <span
            className={`state-badge ${
              isOutdated
                ? "attention"
                : lesson.confirmation_state === "confirmed"
                  ? "ok"
                  : "attention"
            }`}
          >
            {isOutdated
              ? "依赖已过期"
              : lesson.confirmation_state === "confirmed"
                ? "已确认"
                : "待确认"}
          </span>
          {!editing && !isOutdated && (
            <button
              className="secondary-button compact"
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              编辑教案
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="lesson-editor">
          <EditorField label="课程概览">
            <textarea
              rows={5}
              maxLength={2000}
              value={editable.overview}
              onChange={(event) =>
                setEditable((current) => ({ ...current, overview: event.target.value }))
              }
            />
          </EditorField>

          <h3>课前准备</h3>
          <div className="lesson-edit-grid">
            {(
              [
                ["teacher", "教师准备"],
                ["per_student", "每位儿童"],
                ["shared", "全班共享"],
                ["setup_notes", "场地布置"],
              ] as const
            ).map(([field, label]) => (
              <EditorField key={field} label={`${label}（每行一项）`}>
                <textarea
                  rows={5}
                  value={editable.preparation[field].join("\n")}
                  onChange={(event) => updatePreparation(field, event.target.value)}
                />
              </EditorField>
            ))}
          </div>

          <h3>课堂阶段</h3>
          <div className="lesson-stage-editor">
            {editable.stages.map((stage, index) => {
              const locked = data.stages[index];
              return (
                <article key={locked.stage_id}>
                  <header>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{locked.name}</strong>
                    <small>{locked.minutes} 分钟 · 锁定</small>
                  </header>
                  <div className="lesson-edit-grid">
                    <EditorField label="阶段目的">
                      <textarea
                        rows={3}
                        maxLength={800}
                        value={stage.purpose}
                        onChange={(event) =>
                          updateStage(index, { purpose: event.target.value })
                        }
                      />
                    </EditorField>
                    <ArrayEditor
                      label="教师动作"
                      items={stage.teacher_actions}
                      onChange={(items) => updateStage(index, { teacher_actions: items })}
                    />
                    <ArrayEditor
                      label="教师话术要点"
                      items={stage.teacher_talking_points}
                      onChange={(items) =>
                        updateStage(index, { teacher_talking_points: items })
                      }
                    />
                    <ArrayEditor
                      label="儿童动作"
                      items={stage.child_actions}
                      onChange={(items) => updateStage(index, { child_actions: items })}
                    />
                    <ArrayEditor
                      label="观察点"
                      items={stage.observation_points}
                      onChange={(items) =>
                        updateStage(index, { observation_points: items })
                      }
                    />
                    <ArrayEditor
                      label="辅助材料与数量"
                      items={stage.materials}
                      onChange={(items) => updateStage(index, { materials: items })}
                      optional
                    />
                    <ArrayEditor
                      label="安全提示"
                      items={stage.safety_notes}
                      onChange={(items) => updateStage(index, { safety_notes: items })}
                      optional
                    />
                    <ArrayEditor
                      label="未来展示提示"
                      items={stage.render_hints}
                      onChange={(items) => updateStage(index, { render_hints: items })}
                      optional
                    />
                  </div>
                </article>
              );
            })}
          </div>

          <div className="lesson-edit-grid lesson-tail-editor">
            <ArrayEditor
              label="支持策略"
              items={editable.differentiation.support}
              onChange={(items) =>
                setEditable((current) => ({
                  ...current,
                  differentiation: { ...current.differentiation, support: items },
                }))
              }
            />
            <ArrayEditor
              label="拓展策略"
              items={editable.differentiation.extension}
              onChange={(items) =>
                setEditable((current) => ({
                  ...current,
                  differentiation: { ...current.differentiation, extension: items },
                }))
              }
            />
            <ArrayEditor
              label="评价"
              items={editable.assessment}
              onChange={(items) =>
                setEditable((current) => ({ ...current, assessment: items }))
              }
            />
            <ArrayEditor
              label="清洁与收尾"
              items={editable.cleanup_and_closure}
              onChange={(items) =>
                setEditable((current) => ({ ...current, cleanup_and_closure: items }))
              }
            />
          </div>

          <div className="lesson-edit-actions">
            <div>
              <strong>保存不等于确认</strong>
              <span>保存将创建新版本，标题、目标、阶段结构与时间保持锁定。</span>
            </div>
            <button className="text-button" type="button" disabled={busy} onClick={cancelEditing}>
              取消修改
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={busy || !hasChanges || !complete}
              onClick={saveEditing}
            >
              {busy ? "正在保存…" : "保存为新版本"}
            </button>
          </div>
        </div>
      ) : (
        <LessonPreview lesson={lesson} />
      )}

      {!editing && !isOutdated && (
        <div className="lesson-confirm-actions">
          <div>
            <strong>
              {lesson.confirmation_state === "confirmed"
                ? "当前教案已经独立确认"
                : "请先核对课堂执行细节"}
            </strong>
            <span>
              {lesson.confirmation_state === "confirmed"
                ? "主范画规格已由确认动作自动生成；再次编辑会创建新的未确认版本。"
                : "确认后会自动生成主范画规格，无需再次点击。"}
            </span>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={busy || lesson.confirmation_state === "confirmed"}
            data-loading={generating}
            aria-busy={generating}
            onClick={onConfirm}
          >
            {generating
              ? "正在生成主范画规格…"
              : lesson.confirmation_state === "confirmed"
              ? "已确认并生成规格"
              : "确认教案并生成主范画规格"}
          </button>
        </div>
      )}
    </section>
  );
}


function LessonPreview({ lesson }: { lesson: LessonVersion }) {
  const data = lesson.lesson_package.lesson_package_draft;
  return (
    <div className="lesson-preview">
      <p className="lesson-overview">{data.overview}</p>
      <section>
        <h3>学习目标（来自蓝图，已锁定）</h3>
        <ol>
          {data.learning_objectives.map((item) => (
            <li key={item.objective}>
              <strong>{item.objective}</strong>
              <span>{item.observable_evidence}</span>
            </li>
          ))}
        </ol>
      </section>
      <div className="lesson-columns">
        <LessonList title="教师准备" items={data.preparation.teacher} />
        <LessonList title="每位儿童" items={data.preparation.per_student} />
        <LessonList title="全班共享" items={data.preparation.shared} />
        <LessonList title="场地布置" items={data.preparation.setup_notes} />
      </div>
      <section>
        <h3>课堂执行</h3>
        <div className="lesson-stage-list">
          {data.stages.map((stage, index) => (
            <article key={stage.stage_id}>
              <header>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h4>{stage.name}</h4>
                  <small>{stage.minutes} 分钟</small>
                </div>
              </header>
              <p>{stage.purpose}</p>
              <LessonList title="教师动作" items={stage.teacher_actions} />
              <LessonList title="话术要点" items={stage.teacher_talking_points} />
              <LessonList title="儿童动作" items={stage.child_actions} />
              <LessonList title="观察点" items={stage.observation_points} />
              {stage.materials.length > 0 && <LessonList title="材料" items={stage.materials} />}
              {stage.safety_notes.length > 0 && (
                <LessonList title="安全" items={stage.safety_notes} tone="safety" />
              )}
            </article>
          ))}
        </div>
      </section>
      <div className="lesson-columns">
        <LessonList title="支持策略" items={data.differentiation.support} />
        <LessonList title="拓展策略" items={data.differentiation.extension} />
        <LessonList title="评价" items={data.assessment} />
        <LessonList title="清洁与收尾" items={data.cleanup_and_closure} />
      </div>
      {lesson.lesson_package.warnings.length > 0 && (
        <div className="warning-list">
          {lesson.lesson_package.warnings.map((warning) => (
            <span key={warning}>教学提醒：{warning}</span>
          ))}
        </div>
      )}
    </div>
  );
}


function LessonList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone?: "safety";
}) {
  return (
    <div className={`lesson-list ${tone ?? ""}`}>
      <strong>{title}</strong>
      <ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
    </div>
  );
}


function EditorField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return <label className="lesson-editor-field"><span>{label}</span>{children}</label>;
}


function ArrayEditor({
  label,
  items,
  onChange,
  optional = false,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  optional?: boolean;
}) {
  return (
    <EditorField label={`${label}（每行一项${optional ? "，可留空" : ""}）`}>
      <textarea rows={5} value={items.join("\n")} onChange={(event) => onChange(lines(event.target.value))} />
    </EditorField>
  );
}


function editableFromLesson(lesson: LessonVersion): EditableLessonPayload {
  const data = lesson.lesson_package.lesson_package_draft;
  return {
    overview: data.overview,
    preparation: copyPreparation(data.preparation),
    stages: data.stages.map((stage) => ({
      purpose: stage.purpose,
      teacher_actions: [...stage.teacher_actions],
      teacher_talking_points: [...stage.teacher_talking_points],
      child_actions: [...stage.child_actions],
      observation_points: [...stage.observation_points],
      materials: [...stage.materials],
      safety_notes: [...stage.safety_notes],
      render_hints: [...stage.render_hints],
    })),
    differentiation: {
      support: [...data.differentiation.support],
      extension: [...data.differentiation.extension],
    },
    assessment: [...data.assessment],
    cleanup_and_closure: [...data.cleanup_and_closure],
  };
}


function copyPreparation(preparation: LessonPreparation): LessonPreparation {
  return {
    teacher: [...preparation.teacher],
    per_student: [...preparation.per_student],
    shared: [...preparation.shared],
    setup_notes: [...preparation.setup_notes],
  };
}


function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}
