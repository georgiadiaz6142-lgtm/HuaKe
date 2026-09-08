import { PresentationView } from "@/components/presentation-view";

export default async function PresentationPage({
  params,
}: PageProps<"/courses/[course_id]/presentation">) {
  const { course_id: courseId } = await params;
  return <PresentationView courseId={courseId} />;
}
