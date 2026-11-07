import { expect, it } from 'vitest';
import { deriveContext } from './context';
import { getSuggestions } from './suggestions';

const newton = 'Объясни второй закон Ньютона';
const equation = 'Помоги решить уравнение';
function suggestions(...prompts: string[]) {
  return getSuggestions(
    deriveContext(prompts.map((userText) => ({ userText, assistantText: '' }))),
  );
}
const actions = ['Объясни проще', 'Покажи схему', 'Приведи пример из жизни'];

it('offers exactly three independent actions after the first Newton explanation', () => {
  expect(suggestions(newton)).toEqual(actions);
});

it('recognizes short Newton phrases as the same completed actions', () => {
  expect(suggestions('2 закон ньютона')).toEqual(actions);
  expect(suggestions('второй закон ньютона', 'попроще')).toEqual([
    'Покажи схему',
    'Приведи пример из жизни',
  ]);
  expect(
    suggestions('2 закон ньютона', 'попроще', 'дай схему', 'пример'),
  ).toEqual([]);
});

it('consumes equation aliases only on their current stage without advancing the solution', () => {
  expect(suggestions(equation, 'почему получилось -7?')).toEqual([
    'Дальше',
    'Почему нужно раскрывать скобки?',
  ]);
  const second = [equation, 'Дальше', 'почему получилось -7?'];
  expect(suggestions(...second)).toEqual(['Дальше']);
  const third = [...second, 'Дальше', 'почему поменялся знак?'];
  expect(suggestions(...third)).toEqual(['Дальше']);
  expect(suggestions(...third, 'Дальше', 'объясни проверку решения')).toEqual([
    'Покажи проверку подробнее',
  ]);
});

it.each([
  { order: [0, 1, 2] },
  { order: [0, 2, 1] },
  { order: [1, 0, 2] },
  { order: [1, 2, 0] },
  { order: [2, 0, 1] },
  { order: [2, 1, 0] },
])('removes completed actions in any order: $order', ({ order }) => {
  const prompts = [newton];
  const completed = new Set<string>();
  for (const index of order) {
    const action = actions[index]!;
    prompts.push(action);
    completed.add(action);
    expect(suggestions(...prompts)).toEqual(
      actions.filter((value) => !completed.has(value)),
    );
  }
  expect(suggestions(...prompts, newton, 'Проще')).toEqual([]);
});

it.each([
  { next: 0, question: 'Почему нужно раскрывать скобки?' },
  { next: 1, question: 'Почему −12 + 5 = −7?' },
  { next: 2, question: 'Почему при переносе меняется знак?' },
])(
  'consumes a stage-specific question without advancing on its explanation ($next)',
  ({ next, question }) => {
    const prompts = [equation, ...Array<string>(next).fill('Дальше')];
    const expected = ['Дальше', question];
    expect(suggestions(...prompts)).toEqual(expected);
    expect(
      suggestions(
        ...prompts,
        question,
        'Объясни подробнее',
        'Неизвестный вопрос',
      ),
    ).toEqual(['Дальше']);
  },
);

it('offers only remaining verification questions after solving, then no artificial continuation', () => {
  const prompts = [equation, 'Дальше', 'Дальше', 'Дальше'];
  expect(suggestions(...prompts)).toEqual([
    'Покажи проверку подробнее',
    'Объясни, как проверить ответ',
  ]);
  expect(suggestions(...prompts, 'Покажи проверку подробнее')).toEqual([
    'Объясни, как проверить ответ',
  ]);
  expect(suggestions(...prompts, 'Объясни, как проверить ответ')).toEqual([
    'Покажи проверку подробнее',
  ]);
  expect(
    suggestions(
      ...prompts,
      'Покажи проверку подробнее',
      'Объясни, как проверить ответ',
      'Дальше',
    ),
  ).toEqual([]);
});

it('keeps the same available actions after fallback or a successfully retried demo command', () => {
  expect(
    suggestions(newton, 'Покажи схему', 'Неизвестный вопрос', 'Покажи ошибку'),
  ).toEqual(['Объясни проще', 'Приведи пример из жизни']);
  expect(suggestions()).toEqual([]);
  expect(suggestions('17 * 24', 'Неизвестный вопрос')).toEqual([]);
});

it('resets used questions on advancement and never carries an earlier question into the new stage', () => {
  const first = [equation, 'Почему нужно раскрывать скобки?'];
  expect(suggestions(...first)).toEqual(['Дальше']);
  expect(
    suggestions(
      ...first,
      equation,
      'Почему нужно раскрывать скобки?',
      'Новый вопрос',
      'Покажи ошибку',
    ),
  ).toEqual(['Дальше']);
  const second = [...first, 'Дальше'];
  expect(suggestions(...second)).toEqual(['Дальше', 'Почему −12 + 5 = −7?']);
  expect(suggestions(...second, 'Почему нужно раскрывать скобки?')).toEqual([
    'Дальше',
    'Почему −12 + 5 = −7?',
  ]);
  expect(
    suggestions(...second, 'Почему -12 + 5 = -7?', 'Почему −12 + 5 = −7?'),
  ).toEqual(['Дальше']);
  expect(suggestions(...second, 'Почему −12 + 5 = −7?', 'Дальше')).toEqual([
    'Дальше',
    'Почему при переносе меняется знак?',
  ]);
});
