import { AppShell } from "@/components/app-shell";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const courseId = Array.isArray(params.course_id) ? params.course_id[0] : params.course_id;
  return <AppShell initialCourseId={courseId?.trim() || null} />;
}
