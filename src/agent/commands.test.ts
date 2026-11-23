import { expect, it } from 'vitest';
import { classifyCommand, normalizeCommand, type Command } from './commands';

it.each<{ kind: Command['kind']; prompts: string[] }>([
  {
    kind: 'newton',
    prompts: [
      'Объясни второй закон Ньютона',
      'Расскажи о втором законе Ньютона',
      'второй закон ньютона',
      '2 закон ньютона',
    ],
  },
  {
    kind: 'simplify',
    prompts: [
      'Объясни проще',
      'Проще',
      'Объясни попроще',
      'Скажи проще',
      'попроще',
    ],
  },
  {
    kind: 'diagram',
    prompts: [
      'Покажи схему',
      'Нарисуй схему',
      'Покажи иллюстрацию',
      'схема',
      'схему',
      'дай схему',
    ],
  },
  { kind: 'next', prompts: ['Дальше', 'Продолжай', 'Следующий шаг'] },
  {
    kind: 'life_example',
    prompts: [
      'Приведи пример из жизни',
      'пример из жизни',
      'пример',
      'дай пример',
    ],
  },
  { kind: 'explain_brackets', prompts: ['Почему нужно раскрывать скобки?'] },
  {
    kind: 'explain_constants',
    prompts: [
      'Почему −12 + 5 = −7?',
      'Почему -12 + 5 = -7?',
      'почему получилось -7?',
      'почему получилось −7?',
    ],
  },
  {
    kind: 'explain_transfer',
    prompts: [
      'Почему при переносе меняется знак?',
      'почему поменялся знак?',
      'почему изменился знак?',
      'почему меняется знак?',
    ],
  },
  { kind: 'verify_detail', prompts: ['Покажи проверку подробнее'] },
  {
    kind: 'verify_method',
    prompts: [
      'Объясни, как проверить ответ',
      'объясни проверку',
      'объясни проверку решения',
    ],
  },
  {
    kind: 'equation',
    prompts: [
      'Помоги решить уравнение',
      'Помоги решить уравнение 3(2x − 4) + 5 = 2(x + 7), но не давай ответ сразу',
      'Помоги решить 3 (2 х-4)+5=2(х+7), но не давай ответ сразу',
    ],
  },
])(
  'recognizes every approved $kind alias after normalization',
  ({ kind, prompts }) => {
    for (const prompt of prompts) {
      expect(classifyCommand(prompt)).toEqual({ kind });
      expect(
        classifyCommand(
          `  ${prompt.toUpperCase().replaceAll(' ', '  \n')}?!…  `,
        ),
      ).toEqual({ kind });
    }
  },
);

it('normalizes whitespace and terminal punctuation without rewriting internal punctuation', () => {
  expect(normalizeCommand(' \n СКАЖИ \t ПРОЩЕ?!…  ')).toBe('скажи проще');
  expect(normalizeCommand('Скажи проще ? ! … ')).toBe('скажи проще');
  expect(normalizeCommand('17.5 × 24?')).toBe('17.5 × 24');
  for (const punctuation of ['.', ',', ';', ':', '!', '?', '…'])
    expect(normalizeCommand(`  СКАЖИ  ПРОЩЕ${punctuation}  `)).toBe(
      'скажи проще',
    );
});

it.each(['17 * 24 *', '17 * 24 /', '17 * 24 -', '17 * 24 %'])(
  'preserves the trailing operator and rejects an incomplete expression: %s',
  (prompt) => {
    expect(normalizeCommand(prompt)).toBe(prompt);
    expect(classifyCommand(prompt)).toEqual({ kind: 'unsupported' });
    expect(classifyCommand(`${prompt}.`)).toEqual({ kind: 'unsupported' });
  },
);

it.each([
  {
    prompt: 'Сколько будет 17 × 24?',
    operation: 'multiply',
    left: 17,
    right: 24,
  },
  { prompt: '17*24', operation: 'multiply', left: 17, right: 24 },
  { prompt: '7*24', operation: 'multiply', left: 7, right: 24 },
  { prompt: '17 x 24', operation: 'multiply', left: 17, right: 24 },
  { prompt: '17 Х 24', operation: 'multiply', left: 17, right: 24 },
  {
    prompt: '−10001 × -10001',
    operation: 'multiply',
    left: -10001,
    right: -10001,
  },
  { prompt: '0 * 100000', operation: 'multiply', left: 0, right: 100000 },
  { prompt: '100000 + 200000', operation: 'add', left: 100000, right: 200000 },
  { prompt: '20-20', operation: 'subtract', left: 20, right: 20 },
  { prompt: '20 − 20', operation: 'subtract', left: 20, right: 20 },
  { prompt: '−5 - 3', operation: 'subtract', left: -5, right: 3 },
  { prompt: '12 + 8', operation: 'add', left: 12, right: 8 },
  { prompt: '7 / 2', operation: 'divide', left: 7, right: 2 },
  { prompt: '7 ÷ 2', operation: 'divide', left: 7, right: 2 },
])(
  'parses the anchored calculator grammar: $prompt',
  ({ prompt, operation, left, right }) => {
    const expected = {
      kind: 'calculator',
      operation,
      left,
      right,
    };
    expect(classifyCommand(prompt)).toEqual(expected);
    expect(classifyCommand(`${prompt}.`)).toEqual(expected);
  },
);

it.each([
  'Покажи ошибку',
  'Покажи обрыв ответа',
  'Покажи ошибку создания изображения',
  'Объясни подробнее',
  'Решить ещё одно уравнение',
  'Объясни закон Архимеда',
  'Объясни второй закон Ньютона и покажи ошибку',
  'Расскажи, почему второй закон Ньютона важен',
  'Что такое ошибка в физике?',
  'Помоги решить 2x + 6 = 14, но не давай ответ сразу',
  'Помоги решить уравнение 3(2x - 4) + 5 = 2(x + 8), но не давай ответ сразу',
  '17.5 * 24',
  '17,5 * 24',
  '17 * 24 + 1',
  'ответ 17 * 24',
  '17 * 24 готово',
  '2 ** 3',
  '2 / 0',
  '2 * Infinity',
  '2 * 1e3',
  'alert(1)',
  '',
  'constructor',
  'toString',
  '__proto__',
])(
  'uses fallback for unsupported input instead of substring matching: %s',
  (prompt) => {
    expect(classifyCommand(prompt)).toEqual({ kind: 'unsupported' });
  },
);
