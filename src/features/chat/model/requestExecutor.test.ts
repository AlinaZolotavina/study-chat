import { afterEach, expect, it, vi } from 'vitest';
import type { Agent, AgentEvent, AgentEventData } from '@/agent/types';
import { createControlledAgent } from '@/test/controlledAgent';
import {
  createIds,
  eventFor,
  lastAssistant,
  makeTurn,
  queuedRun,
  TEST_TIME,
  imageToolCall,
  imageToolResult,
} from '@/test/fixtures';
import { chatActions, chatsReducer } from './chatsSlice';
import { createEmptyChat, createInitialChatsState } from './helpers';
import { createRequestExecutor, type RequestExecutor } from './requestExecutor';
import type { ChatsState, Run } from './types';

const executors: RequestExecutor[] = [];
function setup(agent: Agent, timeoutMs = 100, initialState?: ChatsState) {
  const chat = createEmptyChat('a', TEST_TIME);
  chat.draft = 'question';
  let state = initialState ?? createInitialChatsState(chat);
  const dispatch = vi.fn((action: Parameters<typeof chatsReducer>[1]) => {
    state = chatsReducer(state, action);
  });
  const executor = createRequestExecutor({
    agent,
    getState: () => state,
    dispatch,
    now: () => TEST_TIME,
    createId: createIds(),
    timeoutMs,
  });
  executors.push(executor);
  return { executor, dispatch, state: () => state };
}

afterEach(async () => {
  await Promise.all(executors.splice(0).map((executor) => executor.dispose()));
  vi.useRealTimers();
});

it('sends a suggested reply once through the same executor while preserving the draft', async () => {
  const chat = createEmptyChat('a', TEST_TIME);
  const past = makeTurn(
    { ...queuedRun('past'), status: 'completed', finishedAt: TEST_TIME },
    'explanation',
    'past',
  );
  past[0].text = 'Объясни второй закон Ньютона';
  chat.messages = past;
  chat.draft = 'next question already typed';
  const control = createControlledAgent();
  const context = setup(control.agent, 1000, createInitialChatsState(chat));
  const reply = { text: 'Покажи схему', afterMessageId: past[1].id };
  expect(context.executor.send(chat.id, reply)).toBe(true);
  expect(context.executor.send(chat.id, reply)).toBe(false);
  expect(context.state().byId.a?.messages).toHaveLength(4);
  expect(context.state().byId.a?.messages[2]).toMatchObject({
    role: 'user',
    text: reply.text,
  });
  expect(context.state().byId.a?.draft).toBe(chat.draft);
  const call = control.call(0);
  expect(call.request).toMatchObject({
    prompt: reply.text,
    history: [{ userText: past[0].text, assistantText: past[1].text }],
  });
  call.emit({ type: 'started' });
  call.emit({ type: 'text_delta', text: 'new answer' });
  call.emit({ type: 'completed' });
  await vi.waitFor(() =>
    expect(lastAssistant(context.state().byId.a).run.status).toBe('completed'),
  );
  const before = context.state();
  expect(context.executor.send(chat.id, reply)).toBe(false);
  expect(context.state()).toBe(before);
  expect(context.state().byId.a?.draft).toBe(chat.draft);
});

it.each(['', ' '.repeat(3), 'x'.repeat(4001)])(
  'rejects invalid explicit text without touching the draft (%#)',
  (text) => {
    const chat = createEmptyChat('a', TEST_TIME);
    chat.messages = makeTurn(
      { ...queuedRun(), status: 'completed', finishedAt: TEST_TIME },
      'answer',
    );
    chat.draft = 'keep draft';
    const agent = vi.fn<Agent>();
    const context = setup(agent, 1000, createInitialChatsState(chat));
    const before = context.state();
    expect(
      context.executor.send(chat.id, { text, afterMessageId: 'assistant-1' }),
    ).toBe(false);
    expect(context.state()).toBe(before);
    expect(agent).not.toHaveBeenCalled();
  },
);

it.each(['constructor', 'toString', '__proto__', 'missing'])(
  'rejects a suggested reply for a missing chat: %s',
  (chatId) => {
    const agent = vi.fn<Agent>();
    const context = setup(agent);
    const before = context.state();
    expect(
      context.executor.send(chatId, {
        text: 'Проще',
        afterMessageId: 'assistant-1',
      }),
    ).toBe(false);
    expect(context.state()).toBe(before);
    expect(agent).not.toHaveBeenCalled();
  },
);

it.each<Run>([
  {
    ...queuedRun('old-run'),
    status: 'failed',
    finishedAt: TEST_TIME,
    error: { code: 'demo_partial_failure', retryable: true },
  },
  {
    ...queuedRun('old-run'),
    status: 'interrupted',
    finishedAt: TEST_TIME,
    reason: 'reload',
  },
])(
  'retries a $status response without duplicating its question or context',
  async (run) => {
    const chat = createEmptyChat('a', TEST_TIME);
    const completed = makeTurn(
      { ...queuedRun('past-run'), status: 'completed', finishedAt: TEST_TIME },
      'past answer',
      'past',
    );
    const current = makeTurn(run, 'partial', 'current');
    current[1].imageSrc = 'assets/example.png';
    chat.messages = [...completed, ...current];
    chat.draft = 'keep my draft';
    const control = createControlledAgent();
    const context = setup(control.agent, 1000, createInitialChatsState(chat));

    expect(context.executor.retry(chat.id, current[1].id)).toBe(true);
    const call = control.call(0);
    expect(call.request).toMatchObject({
      prompt: current[0].text,
      assistantMessageId: current[1].id,
      attempt: 2,
      history: [{ userText: completed[0].text, assistantText: 'past answer' }],
    });
    expect(call.request.runId).not.toBe(run.id);
    expect(
      context.state().byId.a?.messages.map((message) => message.id),
    ).toEqual(chat.messages.map((message) => message.id));
    expect(lastAssistant(context.state().byId.a)).toMatchObject({
      text: '',
      imageSrc: null,
      run: { status: 'queued', id: call.request.runId },
    });
    expect(context.state().byId.a?.draft).toBe('keep my draft');
    expect(context.executor.retry(chat.id, current[1].id)).toBe(false);
    call.emit({ type: 'started' });
    call.emit({ type: 'text_delta', text: 'new answer' });
    call.emit({ type: 'completed' });
    await vi.waitFor(() =>
      expect(lastAssistant(context.state().byId.a)).toMatchObject({
        text: 'new answer',
        imageSrc: null,
        run: { status: 'completed' },
      }),
    );
    expect(context.state().byId.a?.messages.slice(0, 2)).toEqual(completed);
    expect(context.state().byId.a?.draft).toBe('keep my draft');
  },
);

it('rejects retryable:false without changing the response or calling the agent', () => {
  vi.useFakeTimers();
  const chat = createEmptyChat('a', TEST_TIME);
  const turn = makeTurn(
    {
      ...queuedRun(),
      status: 'failed',
      finishedAt: TEST_TIME,
      error: { code: 'demo_failure', retryable: false },
    },
    'partial',
  );
  chat.messages = turn;
  const agent = vi.fn<Agent>();
  const context = setup(agent, 100, createInitialChatsState(chat));
  const before = context.state();
  expect(context.executor.retry(chat.id, turn[1].id)).toBe(false);
  expect(context.state()).toBe(before);
  expect(context.dispatch).not.toHaveBeenCalled();
  expect(agent).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['completed', 'agent_error', 'exception'] as const)(
  'releases its timer, abort listeners and iterator after %s before disposal',
  async (outcome) => {
    vi.useFakeTimers();
    const addListener = vi.spyOn(AbortSignal.prototype, 'addEventListener');
    const removeListener = vi.spyOn(
      AbortSignal.prototype,
      'removeEventListener',
    );
    const next = vi.fn<() => Promise<IteratorResult<AgentEvent>>>();
    const returnIterator = vi.fn(
      async (): Promise<IteratorResult<AgentEvent>> => ({
        done: true,
        value: undefined,
      }),
    );
    let activeSignal: AbortSignal | undefined;
    const agent: Agent = (request, signal) => {
      activeSignal = signal;
      const events: AgentEventData[] = [
        { type: 'started' },
        { type: 'text_delta', text: 'partial' },
      ];
      if (outcome === 'completed') events.push({ type: 'completed' });
      if (outcome === 'agent_error')
        events.push({
          type: 'error',
          error: { code: 'demo_partial_failure', retryable: true },
        });
      let index = 0;
      next.mockImplementation(async () => {
        const event = events[index++];
        if (!event) throw new Error('internal detail');
        return { done: false, value: eventFor(request, event) };
      });
      return {
        [Symbol.asyncIterator]: () => ({ next, return: returnIterator }),
      };
    };
    const context = setup(agent);
    expect(context.executor.send('a')).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(lastAssistant(context.state().byId.a)).toMatchObject({
      text: 'partial',
      run:
        outcome === 'completed'
          ? { status: 'completed' }
          : {
              status: 'failed',
              error: {
                code:
                  outcome === 'agent_error'
                    ? 'demo_partial_failure'
                    : 'unknown',
                retryable: true,
              },
            },
    });
    expect(activeSignal?.aborted).toBe(true);
    expect(next).toHaveBeenCalledTimes(3);
    expect(returnIterator).toHaveBeenCalledOnce();
    const abortSubscriptions = addListener.mock.calls.filter(
      ([type]) => type === 'abort',
    );
    expect(abortSubscriptions.length).toBeGreaterThan(0);
    for (const [, listener] of abortSubscriptions)
      expect(removeListener).toHaveBeenCalledWith('abort', listener);
    expect(vi.getTimerCount()).toBe(0);
    const terminalState = context.state();
    await vi.advanceTimersByTimeAsync(1000);
    expect(context.state()).toBe(terminalState);
    expect(JSON.stringify(terminalState)).not.toContain('internal detail');
  },
);

it('keeps partial text, image and draft at timeout and ignores late output', async () => {
  vi.useFakeTimers();
  const control = createControlledAgent();
  const context = setup(control.agent);
  context.executor.send('a');
  const call = control.call(0);
  call.emit({ type: 'started' });
  call.emit(imageToolCall());
  call.emit(imageToolResult());
  call.emit({ type: 'text_delta', text: 'partial' });
  context.dispatch(
    chatActions.draftChanged({ chatId: 'a', draft: 'keep draft' }),
  );
  await vi.advanceTimersByTimeAsync(99);
  expect(lastAssistant(context.state().byId.a).run.status).toBe('streaming');
  expect(call.signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(lastAssistant(context.state().byId.a)).toMatchObject({
    text: 'partial',
    imageSrc: 'assets/newtons-2nd-law-of-motion.png',
    run: { status: 'failed', error: { code: 'timeout', retryable: true } },
  });
  expect(context.state().byId.a?.draft).toBe('keep draft');
  expect(call.signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  const terminalState = context.state();
  call.emit({ type: 'text_delta', text: 'late' });
  context.dispatch(
    chatActions.agentEventReceived(
      eventFor(call.request, { type: 'completed' }),
    ),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(context.state()).toBe(terminalState);
});

it.each(['constructor', 'toString', '__proto__', 'missing'])(
  'rejects a nonexistent chat without starting or cancelling requests: %s',
  (chatId) => {
    vi.useFakeTimers();
    const agent = vi.fn<Agent>();
    const context = setup(agent);
    const before = context.state();
    expect(context.executor.send(chatId)).toBe(false);
    expect(context.executor.retry(chatId, 'missing-message')).toBe(false);
    expect(context.executor.stop(chatId)).toBe(false);
    expect(context.state()).toBe(before);
    expect(agent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each([
  {
    kind: 'agent throws',
    agent: (() => {
      throw new Error('internal detail');
    }) as Agent,
    code: 'unknown',
  },
  {
    kind: 'next rejects',
    agent: (() => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error('internal detail')),
      }),
    })) as Agent,
    code: 'unknown',
  },
  {
    kind: 'iterator ends',
    agent: (() => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true, value: undefined }),
      }),
    })) as Agent,
    code: 'unexpected_end',
  },
])('terminates when $kind', async ({ agent, code }) => {
  vi.useFakeTimers();
  const context = setup(agent);
  context.executor.send('a');
  await vi.waitFor(() =>
    expect(lastAssistant(context.state().byId.a).run).toMatchObject({
      status: 'failed',
      error: { code, retryable: true },
    }),
  );
  expect(JSON.stringify(context.state())).not.toContain('internal detail');
  expect(vi.getTimerCount()).toBe(0);
});

it('times out a non-cooperative iterator and cleans up without awaiting return()', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const returnIterator = vi.fn(
    () => new Promise<IteratorResult<AgentEvent>>(() => undefined),
  );
  const agent: Agent = (_request, currentSignal) => {
    signal = currentSignal;
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<AgentEvent>>(() => undefined),
        return: returnIterator,
      }),
    };
  };
  const context = setup(agent);
  context.executor.send('a');
  await vi.advanceTimersByTimeAsync(100);
  expect(lastAssistant(context.state().byId.a).run).toMatchObject({
    status: 'failed',
    error: { code: 'timeout' },
  });
  expect(signal?.aborted).toBe(true);
  expect(returnIterator).toHaveBeenCalledOnce();
  await context.executor.dispose();
  expect(vi.getTimerCount()).toBe(0);
  expect(context.executor.send('a')).toBe(false);
});

it('cancels only the addressed run and disposes the remaining one', async () => {
  vi.useFakeTimers();
  const signals = new Map<string, AbortSignal>();
  const agent: Agent = (request, signal) => {
    signals.set(request.chatId, signal);
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<AgentEvent>>(() => undefined),
      }),
    };
  };
  const context = setup(agent);
  context.dispatch(chatActions.chatCreated(createEmptyChat('b', TEST_TIME)));
  context.dispatch(chatActions.draftChanged({ chatId: 'b', draft: 'other' }));
  context.executor.send('a');
  context.executor.send('b');
  context.executor.stop('a');
  expect(signals.get('a')?.aborted).toBe(true);
  expect(signals.get('b')?.aborted).toBe(false);
  expect(lastAssistant(context.state().byId.b).run.status).toBe('queued');
  await context.executor.dispose();
  expect(signals.get('b')?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('does not dispatch an event addressed to a different chat', async () => {
  const agent: Agent = async function* (request) {
    yield eventFor({ ...request, chatId: 'b' }, { type: 'started' });
    yield eventFor(request, { type: 'started' });
    yield eventFor(request, { type: 'text_delta', text: 'answer' });
    yield eventFor(request, { type: 'completed' });
  };
  const context = setup(agent, 1000);
  context.dispatch(chatActions.chatCreated(createEmptyChat('b', TEST_TIME)));
  context.executor.send('a');
  await vi.waitFor(() =>
    expect(lastAssistant(context.state().byId.a).run.status).toBe('completed'),
  );
  expect(context.state().byId.b?.messages).toEqual([]);
  expect(context.dispatch).not.toHaveBeenCalledWith(
    expect.objectContaining({
      type: chatActions.agentEventReceived.type,
      payload: expect.objectContaining({ chatId: 'b' }),
    }),
  );
});
