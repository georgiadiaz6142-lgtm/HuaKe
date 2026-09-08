"use client";

import { useMemo, useState } from "react";
import type { ArtworkSpecVersion, EditableMainArtworkSpecPayload } from "@/lib/types";

type Props = {
  artworkSpec: ArtworkSpecVersion;
  busy: boolean;
  generating: boolean;
  onSave: (editable: EditableMainArtworkSpecPayload) => Promise<void>;
  onConfirm: () => Promise<void>;
};

export function ArtworkSpecView({ artworkSpec, busy, generating, onSave, onConfirm }: Props) {
  const spec = artworkSpec.main_artwork_spec.main_artwork_spec;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditableMainArtworkSpecPayload>(() =>
    copyEditableSpec(spec.user_controls),
  );
  const hasChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(copyEditableSpec(spec.user_controls)),
    [draft, spec.user_controls],
  );

  function cancelEditing() {
    setDraft(copyEditableSpec(spec.user_controls));
    setEditing(false);
  }

  async function saveEditing() {
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // The parent keeps the server error visible and preserves the user controls.
    }
  }

  return (
    <section className="paper-card artwork-spec-card">
      <div className="card-heading artwork-spec-heading">
        <span className="step-number">05</span>
        <div>
          <p className="eyebrow">主范画视觉规格 · V{artworkSpec.version_no}</p>
          <h2>核对主范画方向</h2>
        </div>
        <div className="artwork-spec-heading-actions">
          <span className={`state-badge ${artworkSpec.confirmation_state === "confirmed" ? "ok" : "attention"}`}>
            {artworkSpec.freshness_status === "outdated"
              ? "已过期"
              : artworkSpec.confirmation_state === "confirmed"
                ? "已确认"
                : "待确认"}
          </span>
          {!editing && artworkSpec.freshness_status === "current" && (
            <button className="secondary-button compact" type="button" disabled={busy} onClick={() => setEditing(true)}>
              调整画面偏好
            </button>
          )}
        </div>
      </div>

      <div className="artwork-spec-boundary">
        <strong>你只需要决定画面偏好</strong>
        <span>教学意图、主画材、三步递进、安全规则和生成参数由系统锁定并自动同步；确认规格不会自动生图，后续由用户主动点击生成。</span>
      </div>

      {editing ? (
        <div className="artwork-spec-editor">
          <div className="artwork-spec-edit-note">
            <strong>修改这些选项只会更新规格，不会生成图片</strong>
            <span>保存时后台会重新编译完整规格并再次执行画材、安全、版权和依赖校验。</span>
          </div>

          <div className="artwork-spec-edit-grid">
            <SelectField label="画面方向" value={draft.canvas_preset} options={[["landscape_4_3", "横版 · 4:3"], ["portrait_3_4", "竖版 · 3:4"], ["square_1_1", "方形 · 1:1"]]} onChange={(value) => setDraft((current) => ({ ...current, canvas_preset: value as typeof current.canvas_preset }))} />
            <SelectField label="主体位置" value={draft.subject_position} options={[["left", "画面偏左"], ["center", "画面中央"], ["right", "画面偏右"]]} onChange={(value) => setDraft((current) => ({ ...current, subject_position: value as typeof current.subject_position }))} />
            <SelectField label="景别" value={draft.view_distance} options={[["close", "近景"], ["medium", "中景"], ["wide", "全景"]]} onChange={(value) => setDraft((current) => ({ ...current, view_distance: value as typeof current.view_distance }))} />
            <SelectField label="画面繁简" value={draft.scene_complexity} options={[["simple", "简洁"], ["moderate", "适中"]]} onChange={(value) => setDraft((current) => ({ ...current, scene_complexity: value as typeof current.scene_complexity }))} />
            <SelectField label="色彩氛围" value={draft.color_mood} options={[["preserve_current", "保持原方案"], ["cool_with_warm_focus", "冷色为主、暖色聚焦"], ["warm_with_cool_balance", "暖色为主、冷色平衡"], ["bright_cheerful", "明亮活泼"], ["soft_harmony", "柔和协调"]]} onChange={(value) => setDraft((current) => ({ ...current, color_mood: value as typeof current.color_mood }))} />
          </div>

          <TextAreaField label="主体与画面故事" hint="可以补充情节，但课程主题、年龄和教学目标不会被改变。" value={draft.story_direction} maxLength={800} onChange={(value) => setDraft((current) => ({ ...current, story_direction: value }))} />

          <div className="artwork-spec-edit-grid">
            <ListField label="可选强调色" hint="最多 5 项；留空表示由原方案决定。" value={draft.accent_colors} onChange={(items) => setDraft((current) => ({ ...current, accent_colors: items.slice(0, 5) }))} />
            <ListField label="个性化偏好" hint="例如：留出儿童添加星星的位置。" value={draft.creative_preferences} onChange={(items) => setDraft((current) => ({ ...current, creative_preferences: items.slice(0, 8) }))} />
            <ListField label="不希望出现" hint="只能新增个人避让项，不能删除系统安全限制。" value={draft.avoid_elements} onChange={(items) => setDraft((current) => ({ ...current, avoid_elements: items.slice(0, 8) }))} />
          </div>

          <div className="artwork-spec-locked-note">
            <strong>系统锁定</strong>
            <span>{spec.material_expression.material}主画材、教学意图、1 张主范画 + 3 张步骤图、三步教学递进、材料可行性、安全与版权规则。</span>
          </div>

          <div className="artwork-spec-edit-actions">
            <div><strong>保存会创建不可变新版本</strong><span>后台重算的技术字段不会单独展示，但画面结果摘要会在保存后更新。</span></div>
            <button className="text-button" type="button" disabled={busy} onClick={cancelEditing}>取消修改</button>
            <button className="primary-button" type="button" disabled={busy || !hasChanges || !draft.story_direction.trim()} onClick={saveEditing}>
              {busy ? "正在保存…" : "保存为新版本"}
            </button>
          </div>
        </div>
      ) : (
        <div className="artwork-spec-preview">
          <div className="artwork-spec-facts">
            <span>{canvasPresetLabel(spec.user_controls.canvas_preset)}</span>
            <span>{spec.material_expression.material}</span>
            <span>1 张主范画 + 3 张步骤图</span>
          </div>

          <section className="artwork-spec-intro">
            <p className="eyebrow">画面故事</p>
            <h3>{spec.subject_and_story}</h3>
            <p><b>教学意图（锁定）：</b>{spec.teaching_intent}</p>
          </section>

          <section>
            <h3>你决定的画面方向</h3>
            <div className="artwork-direction-grid">
              <DirectionItem label="主体位置" value={positionLabel(spec.user_controls.subject_position)} />
              <DirectionItem label="景别" value={distanceLabel(spec.user_controls.view_distance)} />
              <DirectionItem label="画面繁简" value={complexityLabel(spec.user_controls.scene_complexity)} />
              <DirectionItem label="色彩氛围" value={colorMoodLabel(spec.user_controls.color_mood)} />
            </div>
            {(spec.user_controls.creative_preferences.length > 0 || spec.user_controls.avoid_elements.length > 0) && (
              <div className="artwork-spec-columns">
                {spec.user_controls.creative_preferences.length > 0 && <SpecList title="个性化偏好" items={spec.user_controls.creative_preferences} />}
                {spec.user_controls.avoid_elements.length > 0 && <SpecList title="个人避让项" items={spec.user_controls.avoid_elements} />}
              </div>
            )}
          </section>

          <section>
            <h3>后台重算后的画面摘要</h3>
            <div className="artwork-composition-grid compact">
              <SpecBlock title="视觉焦点" text={spec.composition.focal_point} />
              <SpecBlock title="环境层次" text={spec.composition.background} />
              <SpecBlock title="适龄复杂度" text={spec.composition.shape_complexity} />
            </div>
          </section>

          <section>
            <h3>画材与色彩</h3>
            <div className="artwork-spec-columns">
              <SpecList title={`${spec.material_expression.material}技法（锁定）`} items={spec.material_expression.techniques} />
              <SpecList title="最终色板" items={spec.palette} />
            </div>
          </section>

          <section>
            <h3>三步教学递进（锁定）</h3>
            <div className="artwork-layer-list">
              {spec.layer_plan.map((layer) => (
                <article key={layer.step}>
                  <b>{String(layer.step).padStart(2, "0")}</b>
                  <div><strong>{layer.learning_increment}</strong><p>{layer.visible_result}</p></div>
                </article>
              ))}
            </div>
          </section>

        </div>
      )}

      {!editing && (
        <div className="artwork-spec-confirm-actions">
          <div>
            <strong>{artworkSpec.confirmation_state === "confirmed" ? "当前规格已经确认" : "保存不等于确认"}</strong>
            <span>{artworkSpec.confirmation_state === "confirmed" ? "主范画已由确认动作自动生成。" : "确认后会自动生成主范画；现有费用上限和生成次数限制保持不变。"}</span>
          </div>
          <button className="primary-button" type="button" disabled={busy || artworkSpec.freshness_status !== "current" || artworkSpec.confirmation_state === "confirmed"} data-loading={generating} aria-busy={generating} onClick={onConfirm}>
            {generating ? "正在生成主范画…" : artworkSpec.confirmation_state === "confirmed" ? "已确认并生成主范画" : "确认规格并生成主范画"}
          </button>
        </div>
      )}
    </section>
  );
}

function copyEditableSpec(controls: EditableMainArtworkSpecPayload): EditableMainArtworkSpecPayload {
  return { ...controls, accent_colors: [...controls.accent_colors], creative_preferences: [...controls.creative_preferences], avoid_elements: [...controls.avoid_elements] };
}

function splitList(value: string): string[] {
  return value.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean);
}

function canvasPresetLabel(value: EditableMainArtworkSpecPayload["canvas_preset"]) {
  return { landscape_4_3: "横版 · 4:3", portrait_3_4: "竖版 · 3:4", square_1_1: "方形 · 1:1" }[value];
}

function positionLabel(value: EditableMainArtworkSpecPayload["subject_position"]) {
  return { left: "画面偏左", center: "画面中央", right: "画面偏右" }[value];
}

function distanceLabel(value: EditableMainArtworkSpecPayload["view_distance"]) {
  return { close: "近景", medium: "中景", wide: "全景" }[value];
}

function complexityLabel(value: EditableMainArtworkSpecPayload["scene_complexity"]) {
  return { simple: "简洁", moderate: "适中" }[value];
}

function colorMoodLabel(value: EditableMainArtworkSpecPayload["color_mood"]) {
  return { preserve_current: "保持原方案", cool_with_warm_focus: "冷色为主、暖色聚焦", warm_with_cool_balance: "暖色为主、冷色平衡", bright_cheerful: "明亮活泼", soft_harmony: "柔和协调" }[value];
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}</select></label>;
}

function TextAreaField({ label, hint, value, maxLength, onChange }: { label: string; hint: string; value: string; maxLength: number; onChange: (value: string) => void }) {
  return <label className="artwork-spec-field">{label}<small>{hint}</small><textarea rows={4} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ListField({ label, hint, value, onChange }: { label: string; hint: string; value: string[]; onChange: (items: string[]) => void }) {
  return <label className="artwork-spec-field">{label}<small>{hint}</small><textarea rows={3} maxLength={1600} value={value.join("；")} onChange={(event) => onChange(splitList(event.target.value))} placeholder="使用分号或换行分隔" /></label>;
}

function DirectionItem({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}

function SpecBlock({ title, text }: { title: string; text: string }) {
  return <article><strong>{title}</strong><p>{text}</p></article>;
}

function SpecList({ title, items }: { title: string; items: string[] }) {
  return <section className="artwork-spec-list"><strong>{title}</strong><ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>;
}
