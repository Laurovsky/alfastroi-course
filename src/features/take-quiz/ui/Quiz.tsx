import { useProgressStore } from '@/entities/progress';

export interface QuizProps {
  /** Уникальный id вопроса в пределах курса — под ним сохраняется ответ. */
  id: string;
  question: string;
  options: string[];
  /** Индекс правильного варианта (с 0). */
  answer: number;
  /** Объяснение, которое показывается после ответа (почему верно / почему нет). */
  explain: string;
}

/** Вопрос с одним правильным ответом. Ответ можно поменять; объяснение видно сразу после выбора. */
export function Quiz({ id, question, options, answer, explain }: QuizProps) {
  const chosen = useProgressStore((s) => s.quizAnswers[id]);
  const answerQuiz = useProgressStore((s) => s.answerQuiz);
  const answered = chosen !== undefined;
  const correct = chosen === answer;

  return (
    <fieldset className={`quiz${answered ? (correct ? ' quiz--ok' : ' quiz--fail') : ''}`}>
      <legend className="quiz__question">
        <span className="quiz__badge">Проверь себя</span> {question}
      </legend>
      <div className="quiz__options">
        {options.map((option, i) => {
          const state = !answered ? '' : i === answer ? ' quiz__option--right' : i === chosen ? ' quiz__option--wrong' : '';
          return (
            <label key={i} className={`quiz__option${state}`}>
              <input type="radio" name={`quiz-${id}`} checked={chosen === i} onChange={() => answerQuiz(id, i)} />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
      {answered && (
        <p className="quiz__explain" role="status">
          <strong>{correct ? 'Верно. ' : 'Не совсем. '}</strong>
          {explain}
        </p>
      )}
    </fieldset>
  );
}
