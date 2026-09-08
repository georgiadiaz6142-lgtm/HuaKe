export type CourseFilter =
  | "all"
  | "active"
  | "review"
  | "generating"
  | "complete"
  | "attention";

export function courseFilterGroup(
  status: string,
): Exclude<CourseFilter, "all"> {
  if (status === "slide_plan_confirmed") return "complete";
  if (status.startsWith("generating_")) return "generating";
  if (
    status.includes("failed") ||
    status.includes("needs_review") ||
    status === "failed"
  ) {
    return "attention";
  }
  if (status === "needs_user_action" || status.includes("_confirmation")) {
    return "review";
  }
  return "active";
}

export function matchesCourseFilter(
  course: { title: string; status: string },
  query: string,
  filter: CourseFilter,
): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const matchesQuery =
    !normalizedQuery ||
    course.title.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
  const matchesStatus =
    filter === "all" || courseFilterGroup(course.status) === filter;
  return matchesQuery && matchesStatus;
}
