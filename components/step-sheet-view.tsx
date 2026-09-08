"use client";

import { useState } from "react";

import { assetContentUrl } from "@/lib/api";
import type { Job, StepSheetVersion } from "@/lib/types";

const renderModeLabels = {
  line_art_only: "纯线稿（不允许任何颜色）",
  flat_base_colors_only: "只平涂主要底色（约 50% 完成度）",
  pencil_construction_sketch: "纯铅笔起形稿（不上色）",
  background_only_subject_blank: "只画背景（主体留白）",
  confirmed_main_artwork_reference: "完成稿（与已确认主范画一致）",
  line_art_or_light_underpainting: "线稿／少量浅色（颜色不超过约 20%）",
  base_color_blocks: "铺主要底色与大色块",
  near_finished_reference: "补充细节并接近主范画",
  legacy_unspecified: "旧版本未记录首格完成度规则",
} as const;

function StepSheetImage({ asset }: { asset: StepSheetVersion["asset"] }) {
  const sourceUrl = assetContentUrl(asset.content_url);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const requestedUrl = `${sourceUrl}${sourceUrl.includes("?") ? "&" : "?"}retry=${attempt}`;

  return (
    <div className={`step-sheet-image-frame is-${status}`}>
      {/* The protected response is loaded directly so its session cookie and original pixels are preserved. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={requestedUrl}
        src={requestedUrl}
        alt={`从左到右三个连续教学阶段，${asset.ai_label}`}
        width={asset.width}
        height={asset.height}
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("failed")}
      />
      {status === "loading" && (
        <div className="step-sheet-image-status" role="status">
          正在加载三联步骤图…
        </div>
      )}
      {status === "failed" && (
        <div className="step-sheet-image-status is-error" role="alert">
          <strong>三联步骤图暂时没有显示</strong>
          <span>图片文件仍会保留，可以重新加载。</span>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setAttempt((current) => current + 1);
            }}
          >
            重新加载图片
          </button>
        </div>
      )}
      {status === "ready" && <span>{asset.ai_label}</span>}
    </div>
  );
}

export function StepSheetView({
  stepSheet,
  candidates,
  job,
  busy,
  generating,
  onGenerate,
  onSelectCandidate,
  onConfirm,
}: {
  stepSheet: StepSheetVersion | null;
  candidates: StepSheetVersion[];
  job: Job | null;
  busy: boolean;
  generating: boolean;
  onGenerate: () => Promise<void>;
  onSelectCandidate: (versionId: string) => Promise<void>;
  onConfirm: () => Promise<void>;
}) {
  const generationRunning = generating || (busy && job?.module_id === "P0-10");
  const isCurrent = stepSheet?.freshness_status === "current";
  const used = stepSheet?.usage_limit.successful_versions ?? 0;
  const canRegenerate = Boolean(stepSheet?.usage_limit.can_regenerate);
  const stageLocked = stepSheet?.confirmation_state === "confirmed" && isCurrent;

  return (
    <section className="paper-card step-sheet-card">
      <div className="card-heading step-sheet-heading">
        <span className="step-number">07</span>
        <div>
          <h2>{stepSheet ? "三联步骤图" : "生成三联步骤图"}</h2>
        </div>
        {stepSheet && (
          <span
            className={`state-badge ${
              isCurrent && stepSheet.confirmation_state === "confirmed"
                ? "ok"
                : "attention"
            }`}
          >
            {!isCurrent
              ? "已过期"
              : stepSheet.confirmation_state === "confirmed"
                ? "已确认"
                : "待确认"}
          </span>
        )}
      </div>

      <div className="step-sheet-usage" aria-label="三联步骤图使用次数">
        <strong>
          {used === 0
            ? "可生成 1 次，之后可重做 1 次"
            : used === 1
              ? "可重做 1 次"
              : "已使用重做机会"}
        </strong>
        <span>已生成 {used} 次</span>
      </div>

      {!stepSheet && (
        <div className="step-sheet-gate">
          <div>
            <strong>主范画已确认，步骤图尚未生成</strong>
            <p>点击后会在当前位置生成一张包含左、中、右三个连续阶段的完整图片。</p>
          </div>
          <button className="primary-button" type="button" disabled={busy} data-loading={generationRunning} aria-busy={generationRunning} onClick={onGenerate}>
            {generationRunning ? "正在生成…" : "生成三联步骤图"}
          </button>
        </div>
      )}

      {stepSheet && (
        <>
          <StepSheetImage key={stepSheet.asset.id} asset={stepSheet.asset} />
          <div className="step-sheet-panels">
            {stepSheet.panels.map((panel) => (
              <article key={panel.step_index}>
                <span>步骤 {panel.step_index}</span>
                <strong>{renderModeLabels[panel.render_mode]}</strong>
                <h3>{panel.teaching_action}</h3>
                <p>{panel.visible_result}</p>
              </article>
            ))}
          </div>
        </>
      )}

      {stepSheet && candidates.length > 1 && (
        <section className="visual-candidate-history" aria-label="三联步骤图候选记录">
          <header>
            <div>
              <strong>本阶段生成记录</strong>
              <span>{stageLocked ? "当前方案已确认并锁定。" : "切换已有方案不会调用模型，也不会增加费用；确认后将锁定。"}</span>
            </div>
          </header>
          <div className="visual-candidate-grid step-sheet-candidates">
            {candidates.map((candidate, index) => {
              const active = candidate.id === stepSheet.id;
              return <article className={active ? "is-current" : ""} key={candidate.id}>
                {/* The protected response is loaded directly with the user's session. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetContentUrl(candidate.asset.content_url)} alt={`三联步骤图方案 ${index + 1}`} width={candidate.asset.width} height={candidate.asset.height} />
                <div>
                  <strong>方案 {index + 1}</strong>
                  {active ? (
                    <span>{stageLocked ? "已锁定" : "当前选择"}</span>
                  ) : (
                    <button
                      className="candidate-select-button"
                      type="button"
                      disabled={busy || stageLocked}
                      onClick={() => void onSelectCandidate(candidate.id)}
                    >
                      选择这张
                    </button>
                  )}
                </div>
              </article>;
            })}
          </div>
        </section>
      )}

      {stepSheet && (
        <div className="step-sheet-actions">
          <div>
            <strong>
              {!isCurrent
                ? "主范画或上游已经变化"
                : stepSheet.confirmation_state === "confirmed"
                  ? "当前三联步骤图已确认"
                  : "生成不等于确认"}
            </strong>
            <span>
              {!isCurrent
                ? "旧图仍会保留，请基于新的已确认主范画重新生成。"
                : "请核对三格物体与构图完全一致：第一格必须纯线稿，第二格只有平涂底色，第三格为完成稿。"}
            </span>
          </div>
          {canRegenerate && (
            <button className="secondary-button" type="button" disabled={busy} data-loading={generationRunning} aria-busy={generationRunning} onClick={onGenerate}>
              {generationRunning ? "正在重新生成…" : "不满意，重新生成（仅 1 次）"}
            </button>
          )}
          <button
            className="primary-button"
            type="button"
            disabled={busy || !isCurrent || stepSheet.confirmation_state === "confirmed"}
            onClick={onConfirm}
          >
            {stepSheet.confirmation_state === "confirmed" ? "已选用当前步骤图" : "使用这张图，继续"}
          </button>
        </div>
      )}
    </section>
  );
}
