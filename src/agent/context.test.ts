import { expect, it } from 'vitest';
import { deriveContext } from './context';

const history = (...prompts: string[]) =>
  prompts.map((userText) => ({ userText, assistantText: 'unused' }));
const newton = 'Объясни второй закон Ньютона';
const equation = 'Помоги решить уравнение';

it('derives isolated contexts without reading assistant answers', () => {
  expect(deriveContext(history(newton))).toEqual({
    topic: 'newton',
    simplified: false,
    diagramShown: false,
    exampleShown: false,
  });
  expect(deriveContext([])).toEqual({ topic: 'none' });
  expect(
    deriveContext([{ userText: 'Неизвестный запрос', assistantText: newton }]),
  ).toEqual({ topic: 'none' });
  expect(
    deriveContext([
      ...history(equation),
      { userText: 'Покажи ошибку', assistantText: 'Дальше. x = 5,25' },
    ]),
  ).toMatchObject({ topic: 'equation', step: 1 });
});

it('tracks independent Newton actions and retains them on repeated requests', () => {
  expect(deriveContext(history(newton, 'Покажи схему'))).toEqual({
    topic: 'newton',
    simplified: false,
    diagramShown: true,
    exampleShown: false,
  });
  expect(
    deriveContext(
      history(
        newton,
        'Нарисуй схему',
        'Приведи пример из жизни',
        'Скажи проще',
        newton,
        'Проще',
      ),
    ),
  ).toEqual({
    topic: 'newton',
    simplified: true,
    diagramShown: true,
    exampleShown: true,
  });
});

it('advances the equation only on next, caps its last step and preserves progress on repeated start', () => {
  expect(deriveContext(history(equation))).toMatchObject({
    topic: 'equation',
    step: 1,
  });
  expect(deriveContext(history(equation, 'Продолжай', equation))).toMatchObject(
    { topic: 'equation', step: 2 },
  );
  expect(
    deriveContext(history(equation, 'Дальше', 'Следующий шаг')),
  ).toMatchObject({ topic: 'equation', step: 3 });
  expect(
    deriveContext(history(equation, 'Дальше', 'Дальше', 'Дальше', 'Дальше')),
  ).toMatchObject({ topic: 'equation', step: 4 });
});

it.each([
  { topic: 'none', previous: [], expected: { topic: 'none' } },
  {
    topic: 'newton',
    previous: [newton, 'Покажи схему'],
    expected: {
      topic: 'newton',
      simplified: false,
      diagramShown: true,
      exampleShown: false,
    },
  },
  {
    topic: 'equation',
    previous: [equation, 'Дальше', 'Почему −12 + 5 = −7?'],
    expected: {
      topic: 'equation',
      step: 2,
      questionAnswered: true,
      verificationDetailed: false,
      verificationExplained: false,
    },
  },
  {
    topic: 'calculator',
    previous: ['17 * 24'],
    expected: { topic: 'calculator' },
  },
])(
  'preserves the complete $topic context across a successful fallback',
  ({ previous, expected }) => {
    expect(deriveContext(history(...previous, 'Неизвестный вопрос'))).toEqual(
      expected,
    );
  },
);

it('does not advance on specific explanations and ignores out-of-phase verification', () => {
  expect(
    deriveContext(
      history(
        equation,
        'Почему нужно раскрывать скобки?',
        'Покажи проверку подробнее',
      ),
    ),
  ).toMatchObject({ topic: 'equation', step: 1, verificationDetailed: false });
  expect(
    deriveContext(
      history(equation, 'Дальше', 'Почему −12 + 5 = −7?', 'Объясни подробнее'),
    ),
  ).toMatchObject({ topic: 'equation', step: 2 });
});

it('records only available verification actions and retains them on repeated start', () => {
  expect(
    deriveContext(
      history(
        equation,
        'Дальше',
        'Дальше',
        'Дальше',
        'Покажи проверку подробнее',
        'Объясни, как проверить ответ',
        equation,
      ),
    ),
  ).toEqual({
    topic: 'equation',
    step: 4,
    questionAnswered: false,
    verificationDetailed: true,
    verificationExplained: true,
  });
});

it('preserves calculator topic rules and starts fresh when explicitly changing teaching topic', () => {
  expect(deriveContext(history(newton, '17 × 24', 'Проще'))).toEqual({
    topic: 'calculator',
  });
  expect(
    deriveContext(history(newton, 'Покажи схему', equation)),
  ).toMatchObject({ topic: 'equation', step: 1 });
  expect(deriveContext(history(equation, 'Дальше', newton))).toEqual({
    topic: 'newton',
    simplified: false,
    diagramShown: false,
    exampleShown: false,
  });
});

it('ignores contextual commands without their topic', () => {
  expect(
    deriveContext(
      history(
        'Дальше',
        'Проще',
        'Покажи схему',
        'Приведи пример из жизни',
        'Покажи проверку подробнее',
      ),
    ),
  ).toEqual({ topic: 'none' });
});

it('tracks question usage only for the matching current stage, then clears it on advancement', () => {
  const first = [equation, 'Почему нужно раскрывать скобки?'];
  expect(deriveContext(history(...first))).toMatchObject({
    step: 1,
    questionAnswered: true,
  });
  expect(
    deriveContext(
      history(
        ...first,
        'Почему нужно раскрывать скобки?',
        'Новый вопрос',
        equation,
      ),
    ),
  ).toMatchObject({ step: 1, questionAnswered: true });
  const second = [...first, 'Дальше'];
  expect(deriveContext(history(...second))).toMatchObject({
    step: 2,
    questionAnswered: false,
  });
  expect(
    deriveContext(history(...second, 'Почему нужно раскрывать скобки?')),
  ).toMatchObject({ step: 2, questionAnswered: false });
  expect(
    deriveContext(history(...second, 'Почему −12 + 5 = −7?')),
  ).toMatchObject({ step: 2, questionAnswered: true });
  expect(
    deriveContext(history(...second, 'Почему −12 + 5 = −7?', 'Дальше')),
  ).toMatchObject({ step: 3, questionAnswered: false });
});
