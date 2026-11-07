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
  | { kind: 'calculator'; left: number; right: number }
  | { kind: 'equation' | 'newton' | 'unsupported' };

const aliases: Readonly<Record<string, Command['kind']>> = {
  'объясни проще': 'simplify',
  проще: 'simplify',
  попроще: 'simplify',
  'объясни попроще': 'simplify',
  'скажи проще': 'simplify',
  'покажи схему': 'diagram',
  'нарисуй схему': 'diagram',
  'покажи иллюстрацию': 'diagram',
  схема: 'diagram',
  схему: 'diagram',
  'дай схему': 'diagram',
  'приведи пример из жизни': 'life_example',
  'пример из жизни': 'life_example',
  пример: 'life_example',
  'дай пример': 'life_example',
  'почему нужно раскрывать скобки': 'explain_brackets',
  'почему -12 + 5 = -7': 'explain_constants',
  'почему получилось -7': 'explain_constants',
  'почему при переносе меняется знак': 'explain_transfer',
  'почему поменялся знак': 'explain_transfer',
  'почему изменился знак': 'explain_transfer',
  'почему меняется знак': 'explain_transfer',
  'покажи проверку подробнее': 'verify_detail',
  'объясни, как проверить ответ': 'verify_method',
  'объясни проверку': 'verify_method',
  'объясни проверку решения': 'verify_method',
  дальше: 'next',
  продолжай: 'next',
  'следующий шаг': 'next',
  'помоги решить уравнение': 'equation',
  'объясни второй закон ньютона': 'newton',
  'расскажи о втором законе ньютона': 'newton',
  'второй закон ньютона': 'newton',
  '2 закон ньютона': 'newton',
};

export function normalizeCommand(prompt: string) {
  return prompt
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(/[.,;:!?…\s]+$/gu, '');
}

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

  const calculation =
    /^(?:сколько будет )?([-−]?\d+)\s*[×*xх]\s*([-−]?\d+)$/u.exec(normalized);
  if (calculation) {
    const left = Number(calculation[1]?.replace('−', '-'));
    const right = Number(calculation[2]?.replace('−', '-'));
    if (
      [left, right].every(
        (value) => Number.isInteger(value) && Math.abs(value) <= 10_000,
      )
    )
      return { kind: 'calculator', left, right };
  }
  if (
    kind === 'equation' ||
    /^помоги решить (?:уравнение )?3\s*\(\s*2\s*[xх]\s*-\s*4\s*\)\s*\+\s*5\s*=\s*2\s*\(\s*[xх]\s*\+\s*7\s*\),\s*но не давай ответ сразу$/u.test(
      matchingText,
    )
  )
    return { kind: 'equation' };
  if (kind === 'newton') return { kind };
  return { kind: 'unsupported' };
}
