import { expect, it } from 'vitest';
import { classifyCommand } from './commands';
import { deriveContext } from './context';
import { chooseScenario } from './scenarios';

const newton = 'Объясни второй закон Ньютона';
const equation = 'Помоги решить уравнение';
function answer(prompt: string, ...previous: string[]) {
  return chooseScenario(
    classifyCommand(prompt),
    deriveContext(
      previous.map((userText) => ({ userText, assistantText: 'unused' })),
    ),
    [],
  );
}
function text(prompt: string, ...previous: string[]) {
  const result = answer(prompt, ...previous);
  if (result.kind === 'calculator')
    throw new Error('Expected a teaching response');
  return result.text;
}

it.each([
  { prompt: 'Проще', fragment: 'тележку', kind: 'text' },
  { prompt: 'Покажи схему', fragment: '', kind: 'image' },
  {
    prompt: 'Приведи пример из жизни',
    fragment: 'футбольному мячу',
    kind: 'text',
  },
])(
  'handles $prompt immediately after the explanation or after other actions',
  ({ prompt, fragment, kind }) => {
    for (const previous of [
      [newton],
      [newton, 'Проще', 'Покажи схему', 'Приведи пример из жизни'],
    ]) {
      expect(answer(prompt, ...previous)).toMatchObject({
        kind,
        text: kind === 'image' ? '' : expect.stringContaining(fragment),
      });
    }
  },
);

it.each([
  {
    next: 0,
    formula: '6x − 12 + 5 = 2x + 14',
    question: 'Почему нужно раскрывать скобки?',
    explanation: '3 · 2x − 3 · 4',
    withheld: '6x − 7 = 2x + 14',
  },
  {
    next: 1,
    formula: '6x − 7 = 2x + 14',
    question: 'Почему −12 + 5 = −7?',
    explanation: '−11, −10, −9, −8, −7',
    withheld: '4x = 21',
  },
  {
    next: 2,
    formula: '4x = 21',
    question: 'Почему при переносе меняется знак?',
    explanation: '−7 + 7 = 0',
    withheld: '21/4',
  },
])(
  'explains the current math action without leaking the final answer: step $next',
  ({ next, formula, question, explanation, withheld }) => {
    const previous = [equation, ...Array<string>(next).fill('Дальше')];
    const result = text(question, ...previous);
    expect(result).toContain(explanation);
    expect(result).not.toContain(formula);
    expect(result).not.toContain(withheld);
    expect(result).not.toContain('5,25');
    expect(result).not.toContain('21/4');
    expect(result).not.toMatch(
      /мы на шаге|итог этого шага|дальше пока|этап остаётся|к вычислению x ещё|прогресс сохранён/iu,
    );
    expect(text(equation, ...previous)).toContain(formula);
    expect(text('Покажи проверку подробнее', ...previous)).not.toContain(
      '5,25',
    );
  },
);

it('answers only stage-appropriate specific questions and retains the current stage otherwise', () => {
  expect(text('Почему при переносе меняется знак?', equation)).toContain(
    'подготовленные команды',
  );
  expect(text('Почему нужно раскрывать скобки?', equation, 'Дальше')).toContain(
    'подготовленные команды',
  );
  expect(text('Дальше', equation, 'Почему нужно раскрывать скобки?')).toContain(
    '6x − 7 = 2x + 14',
  );
});

it('provides the final solution and correct substitution without continuing past completion', () => {
  const previous = [equation, 'Дальше', 'Дальше', 'Дальше'];
  const final = text(equation, ...previous);
  expect(final).toContain('x = 21/4 = 5,25');
  expect(final).toContain('19,5 + 5 = **24,5**');
  expect(final).toContain('2 · 12,25 = **24,5**');
  expect(text('Покажи проверку подробнее', ...previous)).toContain(
    '19,5 + 5 = 24,5',
  );
  expect(text('Покажи проверку подробнее', ...previous)).toContain(
    'Внутри скобок сначала умножаем',
  );
  expect(text('Покажи проверку подробнее', ...previous)).not.toContain('Шаг 4');
  expect(text('Объясни, как проверить ответ', ...previous)).toContain(
    'исходное уравнение',
  );
  expect(text('Дальше', ...previous)).toContain('уже решено');
});

it('gives context-aware fallback without claiming to understand arbitrary questions', () => {
  expect(text('Почему так?', newton)).toContain('второй закон Ньютона');
  expect(text('Почему так?', equation, 'Дальше')).toContain('сложение −12 и 5');
  expect(answer('Почему так?', newton).kind).toBe('text');
  expect(text('Проще')).toContain('Объясни второй закон Ньютона');
  expect(answer('Покажи схему').kind).toBe('text');
});

it('is deterministic for an identical request, history and attempt', () => {
  expect(answer('Дальше', equation, 'Почему нужно раскрывать скобки?')).toEqual(
    answer('Дальше', equation, 'Почему нужно раскрывать скобки?'),
  );
});
