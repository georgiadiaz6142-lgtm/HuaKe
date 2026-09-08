"use client";

import { assetContentUrl } from "@/lib/api";
import type { Job, MainArtworkVersion } from "@/lib/types";

export function MainArtworkView({
  artwork,
  candidates,
  job,
  busy,
  generating,
  onGenerate,
  onSelectCandidate,
  onConfirmArtwork,
}: {
  artwork: MainArtworkVersion | null;
  candidates: MainArtworkVersion[];
  job: Job | null;
  busy: boolean;
  generating: boolean;
  onGenerate: () => Promise<void>;
  onSelectCandidate: (versionId: string) => Promise<void>;
  onConfirmArtwork: () => Promise<void>;
}) {
  const generationRunning = generating || (busy && job?.module_id === "P0-09");
  const generationCount = artwork?.usage_limit.successful_versions ?? 0;
  const remainingCount = Math.max(0, 3 - generationCount);
  const canGenerate = artwork ? artwork.usage_limit.can_generate : remainingCount > 0;
  const isCurrent = artwork?.freshness_status === "current";
  const stageLocked = artwork?.confirmation_state === "confirmed" && isCurrent;

  return (
    <section className="paper-card main-artwork-card">
      <div className="card-heading main-artwork-heading">
        <span className="step-number">06</span>
        <div>
          <h2>{artwork ? "主范画" : "生成主范画"}</h2>
        </div>
        {artwork && (
          <span
            className={`state-badge ${
              isCurrent && artwork.confirmation_state === "confirmed" ? "ok" : "attention"
            }`}
          >
            {!isCurrent ? "已过期" : artwork.confirmation_state === "confirmed" ? "已确认" : "待确认"}
          </span>
        )}
      </div>

      <div className="main-artwork-usage" aria-label="主范画使用次数">
        <strong>本课程最多可生成 3 次</strong>
        <span>已使用 {generationCount} 次</span>
        <span>剩余 {remainingCount} 次</span>
      </div>

      {!artwork && (
        <div className="main-artwork-gate">
          <div>
            <strong>正在衔接主范画生成</strong>
            <p>
              新流程会在确认规格后自动生成；如果旧课程停留在这里，可点击下方按钮继续。
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={busy || !canGenerate}
            data-loading={generationRunning}
            aria-busy={generationRunning}
            onClick={onGenerate}
          >
            {generationRunning ? "正在生成…" : canGenerate ? "继续生成主范画" : "已达 3 次上限"}
          </button>
        </div>
      )}

      {artwork && (
        <>
          <div className="main-artwork-image-frame">
            {/* Authenticated local asset responses are intentionally rendered by the browser. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetContentUrl(artwork.asset.content_url)}
              alt={`${artwork.spec_summary.subject_and_story}，${artwork.asset.ai_label}`}
              crossOrigin="use-credentials"
              width={artwork.asset.width}
              height={artwork.asset.height}
            />
            <span>{artwork.asset.ai_label}</span>
          </div>
          <div className="main-artwork-facts compact">
            <div><small>主题与故事</small><strong>{artwork.spec_summary.subject_and_story}</strong></div>
            <div><small>画材与幅面</small><strong>{artwork.spec_summary.material} · {artwork.asset.width}×{artwork.asset.height}</strong></div>
          </div>
          <div className="main-artwork-palette" aria-label="规格色板">
            {artwork.spec_summary.palette.map((color) => <span key={color}>{color}</span>)}
          </div>
        </>
      )}

      {artwork && candidates.length > 1 && (
        <section className="visual-candidate-history" aria-label="主范画候选记录">
          <header>
            <div>
              <strong>本阶段生成记录</strong>
              <span>{stageLocked ? "当前方案已确认并锁定。" : "切换已有方案不会调用模型，也不会增加费用；确认后将锁定。"}</span>
            </div>
          </header>
          <div className="visual-candidate-grid">
            {candidates.map((candidate, index) => {
              const active = candidate.id === artwork.id;
              return <article className={active ? "is-current" : ""} key={candidate.id}>
                {/* Authenticated local asset responses are intentionally rendered by the browser. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetContentUrl(candidate.asset.content_url)} alt={`主范画方案 ${index + 1}`} crossOrigin="use-credentials" width={candidate.asset.width} height={candidate.asset.height} />
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

      {artwork && (
        <div className="main-artwork-actions">
          <div>
            <strong>{!isCurrent ? "上游规格已变化" : artwork.confirmation_state === "confirmed" ? "当前主范画已确认" : "生成不等于确认"}</strong>
            <span>{!isCurrent ? "旧图仍保留，需基于已确认的新规格重新生成。" : "整图重做会保留旧版本；本阶段不支持局部编辑。"}</span>
          </div>
          <button className="secondary-button" type="button" disabled={busy || !canGenerate || stageLocked} data-loading={generationRunning} aria-busy={generationRunning} onClick={onGenerate}>
            {generationRunning ? "正在生成…" : canGenerate ? isCurrent ? "重新生成，使用 1 次" : "基于新规格生成" : "已达 3 次上限"}
          </button>
          <button className="primary-button" type="button" disabled={busy || !isCurrent || artwork.confirmation_state === "confirmed"} onClick={onConfirmArtwork}>
            {artwork.confirmation_state === "confirmed" ? "已选用当前主范画" : "使用这张图，继续"}
          </button>
        </div>
      )}
    </section>
  );
}
