export function canonicalLocalUrl(currentUrl: string): string | null {
  const url = new URL(currentUrl);
  if (url.hostname !== "127.0.0.1") return null;
  url.hostname = "localhost";
  return url.toString();
}

export function requestedWorkspaceCourseId(currentUrl: string): string | null {
  const courseId = new URL(currentUrl).searchParams.get("course_id")?.trim();
  return courseId || null;
}

export function courseWorkspaceUrl(courseId: string): string {
  return `/?course_id=${encodeURIComponent(courseId)}`;
}
