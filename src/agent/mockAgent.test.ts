import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { createIds, TEST_TIME } from '@/test/fixtures';
import * as calculator from './calculator';
import * as scenarios from './scenarios';
import { NEWTON_IMAGE_SRC, MOCK_TIMING } from './config';
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
    options.agent ?? createMockAgent({ createId: createIds('tool') });
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
  await vi.advanceTimersByTimeAsync(MOCK_TIMING.queuedMs - 1);
  expect(run.events).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(run.events.map((event) => event.type)).toEqual(['started']);
  await vi.advanceTimersByTimeAsync(MOCK_TIMING.processingMs);
  expect(run.events.at(-1)).toMatchObject({
    type: 'phase_changed',
    phase: 'composing',
  });
  expect(textOf(run.events)).toBe('');
  await vi.advanceTimersByTimeAsync(MOCK_TIMING.chunkMs);
  expect(Array.from(textOf(run.events))).toHaveLength(16);
  await complete(run);
  expect(textOf(run.events)).toContain('F = m · a');
  const deltas = run.events.filter((event) => event.type === 'text_delta');
  expect(deltas.length).toBeGreaterThan(2);
  for (const [index, delta] of deltas.entries()) {
    const length = Array.from(delta.text).length;
    expect(length).toBeLessThanOrEqual(20);
    expect(length).toBeGreaterThanOrEqual(index === deltas.length - 1 ? 1 : 8);
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
    new Date(Date.parse(TEST_TIME) + MOCK_TIMING.queuedMs).toISOString(),
  );
  expect(vi.getTimerCount()).toBe(0);
});

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
    MOCK_TIMING.queuedMs + MOCK_TIMING.processingMs,
  );
  expect(run.events.at(-1)).toMatchObject({
    type: 'phase_changed',
    phase: 'preparing_image',
  });
  expect(run.events.some((event) => event.type === 'image_received')).toBe(
    false,
  );
  await vi.advanceTimersByTimeAsync(MOCK_TIMING.imageMs - 1);
  expect(run.events.some((event) => event.type === 'image_received')).toBe(
    false,
  );
  await vi.advanceTimersByTimeAsync(1);
  expect(run.events.at(-1)).toMatchObject({
    type: 'image_received',
    imageSrc: NEWTON_IMAGE_SRC,
  });
  expect(textOf(run.events)).toBe('');
  expect(
    existsSync(new URL(`../../public/${NEWTON_IMAGE_SRC}`, import.meta.url)),
  ).toBe(true);
  await complete(run);
  expect(textOf(run.events)).toContain('a = F / m');
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
    ).toEqual(['started', 'tool_call', 'tool_result', 'completed']);
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
  const agent = createMockAgent();
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
    elapsed: 650,
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
