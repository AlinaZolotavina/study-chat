import en from '@/locales/en.json';
import ru from '@/locales/ru.json';

export type Command =
  | {
      kind:
        | 'simplify'
        | 'diagram'
        | 'life_example'
        | 'next'
        | 'explain_brackets'
        | 'explain_constants'
        | 'explain_transfer'
        | 'verify_detail'
        | 'verify_method';
    }
  | {
      kind: 'calculator';
      operation: 'add' | 'subtract' | 'multiply' | 'divide';
      left: number;
      right: number;
    }
  | { kind: 'equation' | 'newton' | 'unsupported' };

const aliases: Record<string, Command['kind']> = {};
for (const dictionary of [ru, en]) {
  for (const [kind, phrases] of Object.entries(dictionary.agent.commands)) {
    for (const phrase of phrases) {
      aliases[phrase.replaceAll('−', '-').toLowerCase()] =
        kind as Command['kind'];
    }
  }
}

const calculatorPrefixes = [
  ...ru.agent.calculatorPrefixes,
  ...en.agent.calculatorPrefixes,
];

export function normalizeCommand(prompt: string) {
  return prompt
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(/[.,;:!?…\s]+$/gu, '');
}

// The demo intentionally uses explicit grammar instead of open-ended NLP:
// normalize the request, match aliases and patterns, then convert it to a typed command.
export function classifyCommand(prompt: string): Command {
  const normalized = normalizeCommand(prompt);
  const matchingText = normalized.replaceAll('−', '-');
  const kind = Object.hasOwn(aliases, matchingText)
    ? aliases[matchingText]
    : undefined;
  if (
    kind === 'simplify' ||
    kind === 'diagram' ||
    kind === 'life_example' ||
    kind === 'next' ||
    kind === 'explain_brackets' ||
    kind === 'explain_constants' ||
    kind === 'explain_transfer' ||
    kind === 'verify_detail' ||
    kind === 'verify_method'
  )
    return { kind };

  const calculatorPrefix = calculatorPrefixes.find((prefix) =>
    matchingText.startsWith(prefix),
  );
  const calculationText = calculatorPrefix
    ? matchingText.slice(calculatorPrefix.length).trim()
    : matchingText;
  const calculation = /^([-−]?\d+)\s*([+\-×*xх/÷])\s*([-−]?\d+)$/u.exec(
    calculationText,
  );
  if (calculation) {
    const left = Number(calculation[1]?.replace('−', '-'));
    const operator = calculation[2];
    const right = Number(calculation[3]?.replace('−', '-'));
    const operation =
      operator === '+'
        ? 'add'
        : operator === '-'
          ? 'subtract'
          : operator === '×' ||
              operator === '*' ||
              operator === 'x' ||
              operator === 'х'
            ? 'multiply'
            : operator === '/' || operator === '÷'
              ? 'divide'
              : undefined;
    if (
      operation &&
      [left, right].every(Number.isInteger) &&
      !(operation === 'divide' && right === 0)
    )
      return { kind: 'calculator', operation, left, right };
  }
  if (
    kind === 'equation' ||
    [ru, en].some(({ agent }) =>
      new RegExp(agent.equationPattern, 'u').test(matchingText),
    )
  )
    return { kind: 'equation' };
  if (kind === 'newton') return { kind };
  return { kind: 'unsupported' };
}
