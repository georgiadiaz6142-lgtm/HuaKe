export type ObservationRefreshCopy = {
  title: string;
  description: string;
  action: string;
};

export const OBSERVATION_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export function observationUploadIssue(file: {
  type: string;
  size: number;
}): string | null {
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    return "只能上传 JPG 或 PNG 图片。";
  }
  if (file.size <= 0 || file.size > OBSERVATION_UPLOAD_MAX_BYTES) {
    return "图片不能超过 25 MB。";
  }
  return null;
}

export function observationUploadPrerequisiteIssue(
  hasFile: boolean,
  rightsAttested: boolean,
): string | null {
  if (!hasFile) return "请先点击“选择文件”并选择一张图片。";
  if (!rightsAttested) return "请先勾选图片使用权确认。";
  return null;
}

export function observationRefreshCopy(
  observationAssetCount: number,
): ObservationRefreshCopy {
  if (observationAssetCount > 0) {
    return {
      title: "更换观察素材",
      description:
        "当前图片和旧版本会保留。修改检索词后只重新检索授权图片，不调用模型。",
      action: "更换素材并生成新版本",
    };
  }
  return {
    title: "检索观察素材",
    description:
      "每行填写一组关键词，最多 4 组。建议使用 2–4 个英文场景词；只检索授权图片，不调用模型。",
    action: "检索素材并生成新版本",
  };
}

export function canRefreshObservation(
  schemaVersion: string,
  freshnessStatus: string,
): boolean {
  return schemaVersion === "0.2" && freshnessStatus === "current";
}

export function slidePlanNeedsContentEnhancement(
  slots: Record<string, { visible_points: string[]; teacher_notes: string[] }>,
): boolean {
  return Object.entries(slots).some(([slotId, slot]) => {
    const minimumPoints = slotId === "cover" ? 1 : 2;
    return (
      slot.visible_points.length < minimumPoints ||
      slot.teacher_notes.length === 0
    );
  });
}

export function courseFeedbackSubmissionIssue(
  rating: string | null,
  issueCount: number,
  comment: string,
): string | null {
  if (!rating) return "请先选择使用感受。";
  if (
    ["needs_adjustment", "not_usable"].includes(rating) &&
    issueCount === 0 &&
    !comment.trim()
  ) {
    return "请选择至少一个问题位置，或填写补充说明。";
  }
  return null;
}
