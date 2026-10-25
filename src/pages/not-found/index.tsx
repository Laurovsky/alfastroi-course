import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="lesson">
      <h1>Страница не найдена</h1>
      <p>
        Такого урока нет. <Link to="/">К программе курса</Link>
      </p>
    </div>
  );
}
