import { expect, it } from 'vitest';
import { classifyCommand, normalizeCommand, type Command } from './commands';

it.each<{ kind: Command['kind']; prompts: string[] }>([
  {
    kind: 'archimedes',
    prompts: [
      'Объясни закон Архимеда',
      'Объясни принцип Архимеда',
      'Расскажи о законе Архимеда',
    ],
  },
  {
    kind: 'simplify',
    prompts: ['Объясни проще', 'Проще', 'Объясни попроще', 'Скажи проще'],
  },
  {
    kind: 'diagram',
    prompts: ['Покажи схему', 'Нарисуй схему', 'Покажи иллюстрацию'],
  },
  { kind: 'next', prompts: ['Дальше', 'Продолжай', 'Следующий шаг'] },
  {
    kind: 'equation',
    prompts: [
      'Помоги решить уравнение',
      'Помоги решить 2x + 6 = 14, но не давай ответ сразу',
      'Помоги решить 2 х+6=14, но не давай ответ сразу',
    ],
  },
  { kind: 'demo_error', prompts: ['Покажи ошибку'] },
  { kind: 'demo_partial_error', prompts: ['Покажи обрыв ответа'] },
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
  { prompt: '17 x 24', left: 17, right: 24 },
  { prompt: '17 Х 24', left: 17, right: 24 },
  { prompt: '−10000 × -10000', left: -10000, right: -10000 },
  { prompt: '0 * 10000', left: 0, right: 10000 },
])(
  'parses the anchored calculator grammar: $prompt',
  ({ prompt, left, right }) => {
    expect(classifyCommand(prompt)).toEqual({
      kind: 'calculator',
      left,
      right,
    });
  },
);

it.each([
  'Пожалуйста, объясни закон Архимеда',
  'Объясни закон Архимеда и покажи ошибку',
  'Закон Архимеда',
  'Сделай ошибку',
  'Покажи обрыв',
  'Помоги решить 3x + 6 = 14, но не давай ответ сразу',
  'Помоги решить 2x + 6 = 14',
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
