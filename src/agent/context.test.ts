import { expect, it } from 'vitest';
import { deriveContext } from './context';

const history = (...prompts: string[]) =>
  prompts.map((userText) => ({ userText, assistantText: 'unused' }));

it('derives an empty context without borrowing it from a previous call', () => {
  expect(deriveContext(history('Объясни закон Архимеда'))).toEqual({
    topic: 'archimedes',
    simplified: false,
  });
  expect(deriveContext([])).toEqual({ topic: 'none' });
});

it('replays aliases, repeated simplification and diagrams as the same Archimedes topic', () => {
  expect(
    deriveContext(
      history(
        'Расскажи о законе Архимеда',
        'Объясни попроще',
        'Нарисуй схему',
        'Скажи проще',
      ),
    ),
  ).toEqual({ topic: 'archimedes', simplified: true });
});

it('tracks the equation step, caps completion and resets on a new start', () => {
  const start = 'Помоги решить уравнение';
  expect(deriveContext(history(start))).toEqual({ topic: 'equation', step: 0 });
  expect(deriveContext(history(start, 'Продолжай'))).toEqual({
    topic: 'equation',
    step: 1,
  });
  expect(
    deriveContext(history(start, 'Продолжай', 'Следующий шаг', 'Дальше')),
  ).toEqual({ topic: 'equation', step: 2 });
  expect(deriveContext(history(start, 'Дальше', start))).toEqual({
    topic: 'equation',
    step: 0,
  });
});

it.each(['Покажи ошибку', 'Покажи обрыв ответа'])(
  'preserves topic and equation progress across a successfully retried demo: %s',
  (demo) => {
    expect(
      deriveContext(history('Объясни закон Архимеда', demo, 'Проще')),
    ).toEqual({ topic: 'archimedes', simplified: true });
    expect(
      deriveContext(history('Помоги решить уравнение', 'Дальше', demo)),
    ).toEqual({ topic: 'equation', step: 1 });
  },
);

it.each([
  { prompt: '17 × 24', expected: { topic: 'calculator' } },
  { prompt: 'Неподдержанный вопрос', expected: { topic: 'none' } },
])(
  'resets the previous teaching topic after $prompt',
  ({ prompt, expected }) => {
    expect(
      deriveContext(history('Объясни закон Архимеда', 'Проще', prompt)),
    ).toEqual(expected);
  },
);

it('does not infer a topic or a step from assistant text', () => {
  expect(
    deriveContext([
      {
        userText: 'Что-то другое',
        assistantText: 'Объясни закон Архимеда. Объясни проще',
      },
    ]),
  ).toEqual({ topic: 'none' });
  expect(
    deriveContext([
      ...history('Помоги решить уравнение'),
      {
        userText: 'Покажи ошибку',
        assistantText: 'Дальше. x = 4. Уравнение уже решено',
      },
    ]),
  ).toEqual({ topic: 'equation', step: 0 });
});

it('does not advance a step on a continuation without a matching topic', () => {
  expect(deriveContext(history('Продолжай', 'Проще', 'Покажи схему'))).toEqual({
    topic: 'none',
  });
  expect(deriveContext(history('Объясни закон Архимеда', 'Продолжай'))).toEqual(
    { topic: 'archimedes', simplified: false },
  );
});
