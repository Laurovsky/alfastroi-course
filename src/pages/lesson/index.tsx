import { useParams } from 'react-router-dom';
import { findLesson } from '@/entities/course';
import { LessonView } from '@/widgets/lesson-view';
import { NotFoundPage } from '@/pages/not-found';

export function LessonPage() {
  const { lessonId = '' } = useParams();
  if (!findLesson(lessonId)) return <NotFoundPage />;
  return <LessonView lessonId={lessonId} />;
}
