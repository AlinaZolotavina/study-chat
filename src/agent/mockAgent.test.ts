import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import {
  createIds,
  TEST_TIME,
  FIXED_MOCK_TIMING,
  FIXED_STREAMING,
} from '@/test/fixtures';
import * as calculator from './calculator';
import * as scenarios from './scenarios';
import { NEWTON_IMAGE_SRC } from './config';
import { createMockAgent } from './mockAgent';
import type { Agent, AgentEvent, AgentRequest } from './types';

const runs: { controller: AbortController; finished: Promise<void> }[] = [];
const history = (...prompts: string[]) =>
  prompts.map((userText) => ({ userText, assistantText: 'unused' }));
function start(
  prompt: string,
  options: Partial<Pick<AgentRequest, 'history' | 'attempt' | 'chatId'>> & {
    agent?: Agent;
  } = {},
) {
  const request: AgentRequest = {
    prompt,
    chatId: options.chatId ?? 'chat-a',
    assistantMessageId: 'assistant-1',
    runId: 'run-1',
    attempt: options.attempt ?? 1,
    history: options.history ?? [],
  };
  const agent =
    options.agent ??
    createMockAgent({
      createId: createIds('tool'),
      timing: FIXED_MOCK_TIMING,
      streaming: FIXED_STREAMING,
      random: () => 0.5,
    });
  const controller = new AbortController();
  const events: AgentEvent[] = [];
  const finished = (async () => {
    for await (const event of agent(request, controller.signal))
      events.push(event);
  })();
  runs.push({ controller, finished });
  return { request, controller, events, finished };
}
const textOf = (events: AgentEvent[]) =>
  events
    .flatMap((event) => (event.type === 'text_delta' ? [event.text] : []))
    .join('');
async function complete(run: ReturnType<typeof start>) {
  await vi.runAllTimersAsync();
  await run.finished;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TEST_TIME));
});
afterEach(async () => {
  const pending = runs.splice(0);
  for (const run of pending) run.controller.abort();
  await Promise.allSettled(pending.map((run) => run.finished));
  vi.useRealTimers();
});

it('streams Newton with observable delays and correctly addressed events (S-01)', async () => {
  const run = start('Объясни второй закон Ньютона');
  expect(run.events).toEqual([]);
  await vi.advanceTimersByTimeAsync(FIXED_MOCK_TIMING.queuedMs - 1);
  expect(run.events).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(run.events.map((event) => event.type)).toEqual(['started']);
  await vi.advanceTimersByTimeAsync(FIXED_MOCK_TIMING.analysisMs.minMs);
  expect(run.events.at(-1)).toMatchObject({
    type: 'phase_changed',
    phase: 'composing',
  });
  expect(textOf(run.events)).toBe('');
  await vi.advanceTimersByTimeAsync(FIXED_MOCK_TIMING.composingMs.minMs - 1);
  expect(textOf(run.events)).toBe('');
  await vi.advanceTimersByTimeAsync(201);
  expect(textOf(run.events).length).toBeGreaterThan(0);
  expect(run.events.at(-1)?.type).toBe('text_delta');
  await complete(run);
  expect(textOf(run.events)).toContain('F = m · a');
  const deltas = run.events.filter((event) => event.type === 'text_delta');
  expect(deltas.length).toBeGreaterThan(2);
  for (const delta of deltas) {
    const length = Array.from(delta.text).length;
    expect(length).toBeLessThanOrEqual(16);
    expect(length).toBeGreaterThanOrEqual(1);
  }
  expect(run.events.at(-1)?.type).toBe('completed');
  expect(run.events.some((event) => event.type === 'image_received')).toBe(
    false,
  );
  for (const event of run.events)
    expect(event).toMatchObject({
      chatId: run.request.chatId,
      assistantMessageId: run.request.assistantMessageId,
      runId: run.request.runId,
    });
  expect(run.events[0]?.at).toBe(
    new Date(Date.parse(TEST_TIME) + FIXED_MOCK_TIMING.queuedMs).toISOString(),
  );
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  {
    prompt: 'Объясни второй закон Ньютона',
    expected: ['analyzed', 'answer_composed'],
    firstTextMs: 800,
  },
  {
    prompt: '17 * 24',
    expected: ['analyzed', 'calculated', 'answer_composed'],
    firstTextMs: 1500,
  },
  {
    prompt: 'Покажи схему',
    expected: ['analyzed', 'image_prepared', 'answer_composed'],
    firstTextMs: null,
  },
  { prompt: 'Покажи ошибку', expected: ['analyzed'], firstTextMs: null },
  { prompt: 'Покажи обрыв ответа', expected: ['analyzed'], firstTextMs: 800 },
])(
  'reports completed actions only after their operation, before final completion: $prompt',
  async ({ prompt, expected, firstTextMs }) => {
    const run = start(prompt, {
      history:
        prompt === 'Покажи схему'
          ? history('Объясни второй закон Ньютона')
          : [],
    });
    await complete(run);
    const actions = run.events.filter(
      (event) => event.type === 'action_completed',
    );
    expect(actions.map((action) => action.action)).toEqual(expected);
    expect(new Set(actions.map((action) => action.actionId)).size).toBe(
      actions.length,
    );
    const firstText = run.events.find((event) => event.type === 'text_delta');
    if (firstTextMs === null) expect(firstText).toBeUndefined();
    else
      expect(
        Date.parse(firstText?.at ?? '') - Date.parse(TEST_TIME),
      ).toBeGreaterThanOrEqual(firstTextMs);
    if (run.events.at(-1)?.type === 'completed')
      expect(run.events.at(-2)).toMatchObject({
        type: 'action_completed',
        action: 'answer_composed',
      });
  },
);

it('does not split a Unicode code point between streamed fragments', async () => {
  const text = 'a'.repeat(15) + '🙂' + 'b'.repeat(16);
  vi.spyOn(scenarios, 'chooseScenario').mockReturnValueOnce({
    kind: 'text',
    text,
  });
  const run = start('Объясни второй закон Ньютона');
  await complete(run);
  const firstDelta = run.events.find((event) => event.type === 'text_delta');
  expect(firstDelta?.text).toBe('a'.repeat(15) + '🙂');
  expect(textOf(run.events)).toBe(text);
});

it('simplifies the successful topic without emitting an image (S-02)', async () => {
  const run = start('Скажи проще', {
    history: history('Расскажи о втором законе Ньютона'),
  });
  await complete(run);
  expect(textOf(run.events)).toContain('тележку');
  expect(textOf(run.events)).toContain('ускорение');
  expect(run.events.some((event) => event.type === 'image_received')).toBe(
    false,
  );
  expect(run.events.at(-1)?.type).toBe('completed');
});

it('prepares the supplied Newton image directly after the first explanation (S-03)', async () => {
  const run = start('Нарисуй схему', {
    history: history('Объясни второй закон Ньютона'),
  });
  await vi.advanceTimersByTimeAsync(
    FIXED_MOCK_TIMING.queuedMs + FIXED_MOCK_TIMING.analysisMs.minMs,
  );
  expect(run.events.at(-1)).toMatchObject({
    type: 'phase_changed',
    phase: 'preparing_image',
  });
  expect(run.events.some((event) => event.type === 'image_received')).toBe(
    false,
  );
  await vi.advanceTimersByTimeAsync(FIXED_MOCK_TIMING.imageMs.minMs - 1);
  expect(run.events.some((event) => event.type === 'image_received')).toBe(
    false,
  );
  await vi.advanceTimersByTimeAsync(1);
  expect(
    run.events.find((event) => event.type === 'image_received'),
  ).toMatchObject({
    type: 'image_received',
    imageSrc: NEWTON_IMAGE_SRC,
  });
  expect(
    run.events.find(
      (event) =>
        event.type === 'action_completed' && event.action === 'image_prepared',
    ),
  ).toMatchObject({
    type: 'action_completed',
    action: 'image_prepared',
  });
  expect(textOf(run.events)).toBe('');
  expect(
    existsSync(new URL(`../../public/${NEWTON_IMAGE_SRC}`, import.meta.url)),
  ).toBe(true);
  await complete(run);
  expect(textOf(run.events)).toBe('');
  expect(run.events.some((event) => event.type === 'text_delta')).toBe(false);
  expect(
    run.events.filter((event) => event.type === 'image_received'),
  ).toHaveLength(1);
  expect(run.events.some((event) => event.type === 'tool_call')).toBe(false);
  expect(run.events.at(-1)?.type).toBe('completed');
});

it.each([{ previous: [] }, { previous: history('Помоги решить уравнение') }])(
  'does not emit an image without the Newton topic (%#)',
  async ({ previous }) => {
    const run = start('Покажи схему', { history: previous });
    await complete(run);
    expect(run.events.some((event) => event.type === 'image_received')).toBe(
      false,
    );
    expect(textOf(run.events)).toContain('деморежиме');
    expect(run.events.at(-1)?.type).toBe('completed');
  },
);

it('solves the fixed equation in steps without leaking the answer early (S-04/S-05)', async () => {
  const first = start('Помоги решить уравнение');
  await complete(first);
  expect(textOf(first.events)).toContain('6x − 12 + 5 = 2x + 14');
  expect(textOf(first.events)).not.toContain('5,25');
  const next = start('Продолжай', {
    history: history('Помоги решить уравнение'),
  });
  await complete(next);
  expect(textOf(next.events)).toContain('6x − 7 = 2x + 14');
  expect(textOf(next.events)).not.toContain('5,25');
  const transfer = start('Дальше', {
    history: history('Помоги решить уравнение', 'Дальше'),
  });
  await complete(transfer);
  expect(textOf(transfer.events)).toContain('4x = 21');
  expect(textOf(transfer.events)).not.toContain('5,25');
  const solved = start('Следующий шаг', {
    history: history('Помоги решить уравнение', 'Дальше', 'Дальше'),
  });
  await complete(solved);
  expect(textOf(solved.events)).toContain('x = 21/4 = 5,25');
  expect(textOf(solved.events)).toContain('19,5 + 5 = **24,5**');
  expect(textOf(solved.events)).toContain('2 · 12,25 = **24,5**');
  const repeated = start('Дальше', {
    history: history('Помоги решить уравнение', 'Дальше', 'Дальше', 'Дальше'),
  });
  await complete(repeated);
  expect(textOf(repeated.events)).toContain('уже решено');
});

it.each(['Сколько будет 17 × 24?', '17 * 24', '17 * 24.'])(
  'runs the calculator and uses its matching result in the response (S-06): %s',
  async (prompt) => {
    const run = start(prompt);
    await complete(run);
    const call = run.events.find((event) => event.type === 'tool_call');
    expect(call).toMatchObject({
      type: 'tool_call',
      tool: 'calculator',
      input: { operation: 'multiply', left: 17, right: 24 },
    });
    expect(
      run.events.find((event) => event.type === 'tool_result'),
    ).toMatchObject({
      callId: call?.callId,
      tool: 'calculator',
      output: { value: 408 },
    });
    expect(
      run.events
        .filter((event) => event.type !== 'text_delta')
        .map((event) => event.type),
    ).toEqual([
      'started',
      'action_completed',
      'tool_call',
      'tool_result',
      'action_completed',
      'action_completed',
      'completed',
    ]);
    expect(textOf(run.events)).toContain('408');
    expect(call?.callId).toBeTruthy();
  },
);

it('normalizes a tool failure without leaking internal details', async () => {
  vi.spyOn(calculator, 'calculateProduct').mockImplementationOnce(() => {
    throw new Error('private tool error');
  });
  const run = start('17 × 24');
  await complete(run);
  expect(run.events.at(-1)).toMatchObject({
    type: 'error',
    error: { code: 'tool_failure', retryable: true },
  });
  expect(
    run.events.some(
      (event) => event.type === 'tool_result' || event.type === 'completed',
    ),
  ).toBe(false);
  expect(JSON.stringify(run.events)).not.toContain('private tool error');
});

it('keeps calculator use and result delivery sequential under one tool operation', async () => {
  const run = start('17 * 24');
  await vi.advanceTimersByTimeAsync(600);
  expect(run.events.at(-1)?.type).toBe('tool_call');
  await vi.advanceTimersByTimeAsync(699);
  expect(run.events.some((event) => event.type === 'tool_result')).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(run.events.at(-2)).toMatchObject({
    type: 'tool_result',
    output: { value: 408 },
  });
  expect(run.events.at(-1)).toMatchObject({
    type: 'action_completed',
    action: 'calculated',
  });
  expect(textOf(run.events)).toBe('');
  await complete(run);
  expect(run.events.filter((event) => event.type === 'tool_call')).toHaveLength(
    1,
  );
  expect(
    run.events.filter(
      (event) =>
        event.type === 'action_completed' && event.action === 'calculated',
    ),
  ).toHaveLength(1);
});

it.each([
  { random: 0, analysis: 450, result: 700, image: 2950 },
  { random: 0.999999, analysis: 750, result: 1250, image: 4250 },
])(
  'uses configurable operation ranges and additional non-overlapping image time: $random',
  async ({ random, analysis, result, image }) => {
    const agent = createMockAgent({
      random: () => random,
      createId: createIds('range'),
    });
    const calc = start('17 * 24', { agent });
    const beginning = Date.now();
    await complete(calc);
    const after = (type: string) =>
      Date.parse(calc.events.find((event) => event.type === type)?.at ?? '') -
      beginning;
    expect(
      Date.parse(
        calc.events.find(
          (event) =>
            event.type === 'action_completed' && event.action === 'analyzed',
        )?.at ?? '',
      ) - beginning,
    ).toBe(analysis);
    expect(after('tool_result')).toBe(result);
    const picture = start('Покажи схему', {
      agent,
      history: history('Объясни второй закон Ньютона'),
    });
    const pictureStart = Date.now();
    await complete(picture);
    const ready = Date.parse(
      picture.events.find((event) => event.type === 'image_received')?.at ?? '',
    );
    expect(ready - pictureStart).toBe(image);
    expect(picture.events.some((event) => event.type === 'text_delta')).toBe(
      false,
    );
    expect(Date.parse(picture.events.at(-1)?.at ?? '')).toBe(ready);
    expect(
      picture.events
        .filter((event) => event.type === 'action_completed')
        .map((event) => event.action),
    ).toEqual(['analyzed', 'image_prepared', 'answer_composed']);
  },
);

it('finishes even the slowest calculator response below 3 seconds and before the fastest image request', async () => {
  const slowCalculator = createMockAgent({
    random: () => 0.999999,
    createId: createIds('slow-calculator'),
  });
  const fastImage = createMockAgent({
    random: () => 0,
    createId: createIds('fast-image'),
  });
  const picture = start('Покажи схему', {
    agent: fastImage,
    history: history('Объясни второй закон Ньютона'),
  });
  const pictureStart = Date.now();
  await complete(picture);
  const imageDuration =
    Date.parse(picture.events.at(-1)?.at ?? '') - pictureStart;
  for (const prompt of [
    '17 * 24',
    '-10000 * 10000',
    '-10000 * -10000',
    '0 * 0',
  ]) {
    const beginning = Date.now();
    const run = start(prompt, { agent: slowCalculator });
    await complete(run);
    const elapsed = Date.parse(run.events.at(-1)?.at ?? '') - beginning;
    expect(run.events.at(-1)?.type).toBe('completed');
    expect(textOf(run.events)).toContain('Я проверил произведение');
    expect(elapsed).toBeLessThan(3000);
    expect(elapsed).toBeLessThan(imageDuration);
    expect(vi.getTimerCount()).toBe(0);
  }
});

it('finishes every prepared text response within 4 seconds even at maximum timing values', async () => {
  const equation = 'Помоги решить уравнение';
  const agent = createMockAgent({
    random: () => 0.999999,
    createId: createIds('max'),
  });
  const cases: {
    prompt: string;
    history: AgentRequest['history'];
    attempt?: number;
  }[] = [
    { prompt: 'Объясни второй закон Ньютона', history: [] },
    {
      prompt: 'Объясни проще',
      history: history('Объясни второй закон Ньютона'),
    },
    {
      prompt: 'Приведи пример из жизни',
      history: history('Объясни второй закон Ньютона'),
    },
    {
      prompt: 'Покажи схему',
      history: history('Объясни второй закон Ньютона'),
    },
    { prompt: equation, history: [] },
    ...[1, 2, 3].map((steps) => ({
      prompt: 'Дальше',
      history: history(equation, ...Array<string>(steps - 1).fill('Дальше')),
    })),
    {
      prompt: 'Почему нужно раскрывать скобки?',
      history: history(equation),
    },
    {
      prompt: 'Почему −12 + 5 = −7?',
      history: history(equation, 'Дальше'),
    },
    {
      prompt: 'Почему при переносе меняется знак?',
      history: history(equation, 'Дальше', 'Дальше'),
    },
    {
      prompt: 'Дальше',
      history: history(equation, 'Дальше', 'Дальше', 'Дальше'),
    },
    {
      prompt: 'Покажи проверку подробнее',
      history: history(equation, 'Дальше', 'Дальше', 'Дальше'),
    },
    {
      prompt: 'Объясни, как проверить ответ',
      history: history(equation, 'Дальше', 'Дальше', 'Дальше'),
    },
    { prompt: '17 * 24', history: [] },
    { prompt: 'Что-нибудь неизвестное', history: [] },
    {
      prompt: 'Что-нибудь неизвестное',
      history: history('Объясни второй закон Ньютона'),
    },
    { prompt: 'Что-нибудь неизвестное', history: history(equation) },
    ...['Объясни проще', 'Покажи схему', 'Дальше'].map((prompt) => ({
      prompt,
      history: [],
    })),
    { prompt: 'Покажи ошибку', history: [] },
    { prompt: 'Покажи обрыв ответа', history: [] },
    { prompt: 'Покажи ошибку', history: [], attempt: 2 },
    { prompt: 'Покажи обрыв ответа', history: [], attempt: 2 },
  ];
  for (const input of cases) {
    const beginning = Date.now();
    const run = start(input.prompt, {
      agent,
      history: input.history,
      attempt: input.attempt ?? 1,
    });
    await complete(run);
    expect(Date.now() - beginning).toBeLessThan(30_000);
    if (!run.events.some((event) => event.type === 'image_received'))
      expect(Date.now() - beginning, input.prompt).toBeLessThanOrEqual(4000);
    expect(run.events.at(-1)?.type).toBe(
      ['Покажи ошибку', 'Покажи обрыв ответа'].includes(input.prompt) &&
        !input.attempt
        ? 'error'
        : 'completed',
    );
  }
});

it('finishes unsupported requests as a friendly successful fallback (S-07)', async () => {
  const run = start('Расскажи о звёздах');
  await complete(run);
  expect(textOf(run.events)).toContain('деморежиме');
  expect(textOf(run.events)).toContain('Помоги решить уравнение');
  expect(run.events.at(-1)?.type).toBe('completed');
});

it.each([
  { prompt: 'Покажи ошибку', code: 'demo_failure', partial: false },
  {
    prompt: 'Покажи обрыв ответа',
    code: 'demo_partial_failure',
    partial: true,
  },
])(
  'fails deterministically and succeeds on retry: $prompt',
  async ({ prompt, code, partial }) => {
    const failed = start(prompt);
    await complete(failed);
    expect(failed.events.at(-1)).toMatchObject({
      type: 'error',
      error: { code, retryable: true },
    });
    expect(textOf(failed.events).length > 0).toBe(partial);
    if (partial)
      expect(
        failed.events.filter((event) => event.type === 'text_delta').length,
      ).toBeGreaterThan(1);
    expect(failed.events.some((event) => event.type === 'completed')).toBe(
      false,
    );
    const retry = start(prompt, { attempt: 2 });
    await complete(retry);
    expect(retry.events.at(-1)?.type).toBe('completed');
    expect(textOf(retry.events)).toContain('успешно');
  },
);

it('does not share context between concurrent requests on the same agent instance', async () => {
  const agent = createMockAgent({
    timing: FIXED_MOCK_TIMING,
    streaming: FIXED_STREAMING,
    random: () => 0.5,
  });
  const first = start('Дальше', {
    agent,
    chatId: 'a',
    history: history('Помоги решить уравнение'),
  });
  const second = start('Дальше', { agent, chatId: 'b' });
  await complete(first);
  await second.finished;
  expect(textOf(first.events)).toContain('6x − 7 = 2x + 14');
  expect(textOf(second.events)).toContain('Какую задачу продолжить');
});

it.each([
  {
    stage: 'queued',
    elapsed: 0,
    prompt: 'Объясни второй закон Ньютона',
    history: [],
  },
  {
    stage: 'processing',
    elapsed: 150,
    prompt: 'Объясни второй закон Ньютона',
    history: [],
  },
  {
    stage: 'image preparation',
    elapsed: 600,
    prompt: 'Покажи схему',
    history: history('Объясни второй закон Ньютона', 'Проще'),
  },
  { stage: 'calculator', elapsed: 600, prompt: '17 × 24', history: [] },
  {
    stage: 'streaming',
    elapsed: 1000,
    prompt: 'Объясни второй закон Ньютона',
    history: [],
  },
  {
    stage: 'tool result delivery',
    elapsed: 1100,
    prompt: '17 × 24',
    history: [],
  },
  {
    stage: 'text preparation',
    elapsed: 600,
    prompt: 'Объясни второй закон Ньютона',
    history: [],
  },
])(
  'aborts during $stage without late events or remaining timers',
  async ({ elapsed, prompt, history: previous }) => {
    const run = start(prompt, { history: previous });
    await vi.advanceTimersByTimeAsync(elapsed);
    const count = run.events.length;
    const rejected = expect(run.finished).rejects.toMatchObject({
      name: 'AbortError',
    });
    run.controller.abort();
    await rejected;
    await vi.runAllTimersAsync();
    expect(run.events).toHaveLength(count);
    expect(run.events.some((event) => event.type === 'completed')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  },
);
