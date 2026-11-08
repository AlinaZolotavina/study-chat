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
  { prompt: 'Сколько будет 17 × 24?', left: 17, right: 24 },
  { prompt: '17*24', left: 17, right: 24 },
  { prompt: '7*24', left: 7, right: 24 },
  { prompt: '17 x 24', left: 17, right: 24 },
  { prompt: '17 Х 24', left: 17, right: 24 },
  { prompt: '−10000 × -10000', left: -10000, right: -10000 },
  { prompt: '0 * 10000', left: 0, right: 10000 },
])(
  'parses the anchored calculator grammar: $prompt',
  ({ prompt, left, right }) => {
    const expected = {
      kind: 'calculator',
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
  '10001 * 2',
  '-10001 * 2',
  '17 * 24 + 1',
  'ответ 17 * 24',
  '17 * 24 готово',
  '2 ** 3',
  '2 / 3',
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
