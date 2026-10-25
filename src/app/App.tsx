import { lazy, Suspense, useState } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CourseSidebar } from '@/widgets/course-sidebar';
import { HomePage } from '@/pages/home';
import { NotFoundPage } from '@/pages/not-found';

// Страница урока тянет редактор и подсветку — грузим её лениво, как страницы в Альфастрой.
const LessonPage = lazy(() => import('@/pages/lesson').then((m) => ({ default: m.LessonPage })));
const RoadmapPage = lazy(() => import('@/pages/roadmap').then((m) => ({ default: m.RoadmapPage })));

function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className={`layout${menuOpen ? ' layout--menu' : ''}`}>
      <button type="button" className="layout__burger" aria-expanded={menuOpen} aria-label="Оглавление" onClick={() => setMenuOpen((v) => !v)}>
        {menuOpen ? '✕' : '☰'} Оглавление
      </button>
      <aside className="layout__aside">
        <CourseSidebar onNavigate={() => setMenuOpen(false)} />
      </aside>
      <main className="layout__main" key={location.pathname}>
        <Suspense fallback={<p className="muted">Загрузка…</p>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/lesson/:lessonId" element={<LessonPage />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

/**
 * HashRouter: GitHub Pages отдаёт только статические файлы и не умеет
 * переписывать /lesson/x на index.html. Адреса вида #/lesson/x работают везде.
 */
export function App() {
  return (
    <HashRouter>
      <Layout />
    </HashRouter>
  );
}
