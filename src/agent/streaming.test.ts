import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FIXED_STREAMING } from '@/test/fixtures';
import {
  randomInteger,
  sampleDuration,
  STREAMING_CONFIG,
  type StreamingConfig,
} from './config';
import { blockDuration, splitTextBlocks, streamText } from './streaming';

const pending: { controller: AbortController; task: Promise<void> }[] = [];
function start(
  text: string,
  config: StreamingConfig = FIXED_STREAMING,
  random: () => number = () => 0.5,
) {
  const controller = new AbortController();
  const events: { text: string; at: number }[] = [];
  const started = Date.now();
  const task = (async () => {
    for await (const chunk of streamText(
      text,
      controller.signal,
      config,
      random,
    ))
      events.push({ text: chunk, at: Date.now() - started });
  })();
  pending.push({ controller, task });
  return { controller, task, events, started };
}
async function complete(run: ReturnType<typeof start>) {
  await vi.runAllTimersAsync();
  await run.task;
  return run.events.map((event) => event.text).join('');
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(async () => {
  for (const run of pending) run.controller.abort();
  await Promise.allSettled(pending.splice(0).map((run) => run.task));
  vi.useRealTimers();
});

it.each([
  '',
  '  \n\n',
  'Начало.\n\nПродолжение.\n',
  '\r\n# Заголовок\r\n\r\nАбзац с **выделением** и `кодом`.\r\n',
  'Перед списком.\n\n- Первый пункт\n  продолжение\n- Второй пункт\n\nПосле списка.',
  'Формула:\n\nF = m · a\n\n**Вывод:**\nТекст.',
  '```text\n- это код\n\n# не заголовок\n```\n\nОбычный текст.',
  'Незакрытое **выделение и 👩🏽‍🔬, é, 𐐷 и 🇷🇺.',
])(
  'preserves original Markdown, Unicode and whitespace for %#',
  async (text) => {
    expect(
      splitTextBlocks(text)
        .map((block) => block.text)
        .join(''),
    ).toBe(text);
    expect(await complete(start(text))).toBe(text);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('separates list items and preserves fenced content as one block', () => {
  const blocks = splitTextBlocks(
    '# Заголовок\n\n- Один\n  и продолжение\n- Два\n\n```\n- код\n\nещё код\n```',
  );
  expect(blocks.map((block) => block.kind)).toEqual([
    'heading',
    'item',
    'item',
    'paragraph',
  ]);
  expect(blocks[1]?.text).toContain('  и продолжение');
  expect(blocks[2]?.pauseBefore).toBe('item');
  expect(blocks[3]?.text).toContain('- код\n\nещё код');
});

it('scales by word count without accelerating a long paragraph into a two-second cap', () => {
  const config = FIXED_STREAMING;
  expect(
    blockDuration(
      { kind: 'paragraph', text: 'слово '.repeat(30) },
      config,
      () => 0,
    ),
  ).toBe(1000);
  expect(
    blockDuration(
      { kind: 'paragraph', text: 'слово '.repeat(90) },
      config,
      () => 0,
    ),
  ).toBe(3000);
  expect(
    blockDuration({ kind: 'paragraph', text: 'Да.' }, config, () => 0),
  ).toBe(180);
  expect(
    blockDuration(
      { kind: 'heading', text: 'слово '.repeat(90) },
      config,
      () => 0,
    ),
  ).toBe(300);
  expect(
    blockDuration({ kind: 'short', text: 'F = m · a' }, config, () => 0),
  ).toBe(100);
});

it('samples paragraph duration at the configured variability boundaries', () => {
  const block = { kind: 'paragraph', text: 'слово '.repeat(30) } as const;
  const config = { ...FIXED_STREAMING, variance: STREAMING_CONFIG.variance };
  expect(blockDuration(block, config, () => 0)).toBe(900);
  expect(blockDuration(block, config, () => 0.999999)).toBe(1100);
});

it('varies fragment sizes without binding them to words or splitting surrogate pairs', async () => {
  const values = [0, 0.999999, 0.2, 0.8];
  let index = 0;
  const text = 'Оченьдлинноесловобезпробелов🙂👩🏽‍🔬é𐐷🇷🇺'.repeat(8);
  const run = start(
    text,
    { ...FIXED_STREAMING, minChunkSize: 8, maxChunkSize: 24 },
    () => values[index++ % values.length] ?? 0,
  );
  expect(await complete(run)).toBe(text);
  const lengths = run.events
    .slice(0, -1)
    .map((event) => Array.from(event.text).length);
  expect(new Set(lengths).size).toBeGreaterThan(2);
  expect(lengths).toContain(8);
  expect(lengths).toContain(24);
  for (const event of run.events)
    expect(event.text).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    );
});

it('keeps total block duration independent of fragment size and retains the last short fragment', async () => {
  const text = 'слово '.repeat(30);
  for (const size of [8, 24]) {
    const run = start(text, {
      ...FIXED_STREAMING,
      minChunkSize: size,
      maxChunkSize: size,
    });
    expect(await complete(run)).toBe(text);
    expect(Date.now() - run.started).toBe(1000);
    expect(Array.from(run.events.at(-1)?.text ?? '').length).toBeLessThan(size);
  }
});

it('streams items sequentially with one pause at each boundary and no double-counted time', async () => {
  const text = '1. Один пункт.\n2. Второй пункт.\n\nФинал.';
  const run = start(text);
  expect(await complete(run)).toBe(text);
  expect(Date.now() - run.started).toBe(910);
  const second = run.events.findIndex((event) => event.text.startsWith('2.'));
  expect(second).toBeGreaterThan(0);
  expect(
    (run.events[second]?.at ?? 0) - (run.events[second - 1]?.at ?? 0),
  ).toBeGreaterThanOrEqual(120);
});

it.each([
  { stage: 'fragment', elapsed: 50 },
  { stage: 'paragraph pause', elapsed: 181 },
])(
  'cancels during $stage and leaves no continuing delay',
  async ({ elapsed }) => {
    const run = start('Первый абзац.\n\nСледующий абзац.');
    await vi.advanceTimersByTimeAsync(elapsed);
    const before = [...run.events];
    const rejected = expect(run.task).rejects.toMatchObject({
      name: 'AbortError',
    });
    run.controller.abort();
    await rejected;
    await vi.runAllTimersAsync();
    expect(run.events).toEqual(before);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('is deterministic with the same injected configuration and random values', async () => {
  const a = start(
    'Абзац с **Markdown**.\n\n- Первый пункт\n- Второй пункт',
    STREAMING_CONFIG,
    () => 0.25,
  );
  await complete(a);
  const b = start(
    'Абзац с **Markdown**.\n\n- Первый пункт\n- Второй пункт',
    STREAMING_CONFIG,
    () => 0.25,
  );
  await complete(b);
  expect(b.events).toEqual(a.events);
});

it('samples milliseconds inclusively and permits a fixed range without randomness', () => {
  expect(sampleDuration({ minMs: 500, maxMs: 1200 }, () => 0)).toBe(500);
  expect(sampleDuration({ minMs: 500, maxMs: 1200 }, () => 0.999999)).toBe(
    1200,
  );
  expect(
    sampleDuration({ minMs: 700, maxMs: 700 }, () => {
      throw Error('Not random');
    }),
  ).toBe(700);
});
it.each([-1, 1, Number.NaN])(
  'rejects an invalid injected random value %s',
  (value) => {
    expect(() => randomInteger(0, 10, () => value)).toThrow(RangeError);
  },
);
it.each([
  { minMs: -1, maxMs: 2 },
  { minMs: 3, maxMs: 2 },
  { minMs: 0, maxMs: Number.POSITIVE_INFINITY },
])('rejects an invalid duration range %#', (range) => {
  expect(() => sampleDuration(range, () => 0.5)).toThrow(RangeError);
});
