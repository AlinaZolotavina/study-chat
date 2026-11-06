export type Command =
  | { kind: 'demo_error' | 'demo_partial_error' }
  | { kind: 'simplify' | 'diagram' | 'next' }
  | { kind: 'calculator'; left: number; right: number }
  | { kind: 'equation' | 'archimedes' | 'unsupported' };

const aliases: Readonly<Record<string, Command['kind']>> = {
  'покажи ошибку': 'demo_error',
  'покажи обрыв ответа': 'demo_partial_error',
  'объясни проще': 'simplify',
  проще: 'simplify',
  'объясни попроще': 'simplify',
  'скажи проще': 'simplify',
  'покажи схему': 'diagram',
  'нарисуй схему': 'diagram',
  'покажи иллюстрацию': 'diagram',
  дальше: 'next',
  продолжай: 'next',
  'следующий шаг': 'next',
  'помоги решить уравнение': 'equation',
  'объясни закон архимеда': 'archimedes',
  'объясни принцип архимеда': 'archimedes',
  'расскажи о законе архимеда': 'archimedes',
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
  const kind = Object.hasOwn(aliases, normalized)
    ? aliases[normalized]
    : undefined;
  if (kind === 'demo_error' || kind === 'demo_partial_error') return { kind };
  if (kind === 'simplify' || kind === 'diagram' || kind === 'next')
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
    /^помоги решить 2\s*[xх]\s*\+\s*6\s*=\s*14,\s*но не давай ответ сразу$/u.test(
      normalized,
    )
  )
    return { kind: 'equation' };
  if (kind === 'archimedes') return { kind };
  return { kind: 'unsupported' };
}
