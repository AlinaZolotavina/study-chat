import { afterEach, expect, it, vi } from 'vitest';
import { createAppStore, type AppStore } from '@/app/store';
import { createMockAgent } from '@/agent/mockAgent';
import { EQUATION_STEPS } from '@/agent/equation';
import { createControlledAgent } from '@/test/controlledAgent';
import {
  createIds,
  eventFor,
  lastAssistant,
  TEST_TIME,
  FIXED_MOCK_TIMING,
  FIXED_STREAMING,
} from '@/test/fixtures';
import { chatActions } from './chatsSlice';
import { selectChatSuggestions } from './selectors';
import {
  createChat,
  deleteChat,
  retryResponse,
  sendMessage,
  stopGeneration,
} from './commands';

const stores: AppStore[] = [];
function setup() {
  const control = createControlledAgent();
  const store = createAppStore({
    agent: control.agent,
    now: () => TEST_TIME,
    createId: createIds(),
  });
  stores.push(store);
  const chatId = store.getState().chats.selectedChatId;
  store.dispatch(
    chatActions.draftChanged({ chatId, draft: '  First question  ' }),
  );
  return { store, control, chatId };
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()));
  vi.useRealTimers();
});

it('INT-01: sends once, streams and completes the real mock-agent response', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TEST_TIME));
  const createId = createIds();
  const now = () => new Date().toISOString();
  const store = createAppStore({
    now,
    createId,
    agent: createMockAgent({
      now,
      createId,
      timing: FIXED_MOCK_TIMING,
      streaming: FIXED_STREAMING,
      random: () => 0.5,
    }),
  });
  stores.push(store);
  const chatId = store.getState().chats.selectedChatId;
  store.dispatch(
    chatActions.draftChanged({
      chatId,
      draft: '  Объясни второй закон Ньютона  ',
    }),
  );
  expect(store.dispatch(sendMessage(chatId))).toBe(true);
  const accepted = lastAssistant(store.getState().chats.byId[chatId]);
  expect(accepted).toMatchObject({
    text: '',
    imageSrc: null,
    run: { status: 'queued', attempt: 1 },
  });
  expect(store.getState().chats.byId[chatId]?.messages[0]).toMatchObject({
    id: accepted.replyToMessageId,
    role: 'user',
    text: 'Объясни второй закон Ньютона',
  });
  expect(accepted.id).not.toBe(accepted.replyToMessageId);
  store.dispatch(chatActions.draftChanged({ chatId, draft: 'next question' }));
  expect(store.dispatch(sendMessage(chatId))).toBe(false);
  await vi.advanceTimersByTimeAsync(FIXED_MOCK_TIMING.queuedMs);
  expect(lastAssistant(store.getState().chats.byId[chatId]).run.status).toBe(
    'processing',
  );
  await vi.advanceTimersByTimeAsync(
    FIXED_MOCK_TIMING.analysisMs.minMs +
      FIXED_MOCK_TIMING.composingMs.minMs +
      200,
  );
  const partial = lastAssistant(store.getState().chats.byId[chatId]);
  expect(partial.run.status).toBe('streaming');
  expect(partial.text.length).toBeGreaterThan(0);
  await vi.runAllTimersAsync();
  const completed = lastAssistant(store.getState().chats.byId[chatId]);
  expect(completed.run).toMatchObject({
    id: accepted.run.id,
    status: 'completed',
  });
  expect(completed.text).toContain('F = m · a');
  expect(completed.run.actions.map((action) => action.kind)).toEqual([
    'analyzed',
    'answer_composed',
  ]);
  expect(completed.text.length).toBeGreaterThan(partial.text.length);
  expect(store.getState().chats.byId[chatId]?.messages).toHaveLength(2);
  expect(store.getState().chats.byId[chatId]?.draft).toBe('next question');
  expect(vi.getTimerCount()).toBe(0);
});

it('INT-02: stops generation and ignores late events', async () => {
  const { store, control, chatId } = setup();
  store.dispatch(sendMessage(chatId));
  control.call(0).emit({ type: 'started' });
  control.call(0).emit({ type: 'text_delta', text: 'partial' });
  await vi.waitFor(() =>
    expect(lastAssistant(store.getState().chats.byId[chatId]).text).toBe(
      'partial',
    ),
  );
  store.dispatch(chatActions.draftChanged({ chatId, draft: 'next draft' }));
  expect(store.dispatch(stopGeneration(chatId))).toBe(true);
  expect(control.call(0).signal.aborted).toBe(true);
  store.dispatch(
    chatActions.agentEventReceived(
      eventFor(control.call(0).request, { type: 'text_delta', text: 'late' }),
    ),
  );
  expect(lastAssistant(store.getState().chats.byId[chatId])).toMatchObject({
    text: 'partial',
    run: { status: 'cancelled' },
  });
  expect(store.getState().chats.byId[chatId]?.draft).toBe('next draft');
});

it('INT-03: switches chats and deletes another active chat without stopping the original response', async () => {
  const { store, control, chatId } = setup();
  store.dispatch(sendMessage(chatId));
  const otherId = store.dispatch(createChat());
  store.dispatch(
    chatActions.draftChanged({ chatId: otherId, draft: 'Other question' }),
  );
  store.dispatch(sendMessage(otherId));
  expect(store.getState().chats.selectedChatId).toBe(otherId);
  control.call(0).emit({ type: 'started' });
  control.call(0).emit({ type: 'text_delta', text: 'Answer A' });
  control.call(1).emit({ type: 'started' });
  control.call(1).emit({ type: 'text_delta', text: 'Answer B' });
  await vi.waitFor(() => {
    expect(lastAssistant(store.getState().chats.byId[chatId])).toMatchObject({
      text: 'Answer A',
      run: { status: 'streaming' },
    });
    expect(lastAssistant(store.getState().chats.byId[otherId])).toMatchObject({
      text: 'Answer B',
      run: { status: 'streaming' },
    });
  });
  expect(control.call(1).request.history).toEqual([]);
  expect(control.call(0).signal.aborted).toBe(false);
  expect(control.call(1).signal.aborted).toBe(false);
  expect(store.dispatch(deleteChat(otherId))).toBe(true);
  expect(control.call(1).signal.aborted).toBe(true);
  expect(control.call(0).signal.aborted).toBe(false);
  expect(store.getState().chats.selectedChatId).toBe(chatId);
  control.call(1).emit({ type: 'text_delta', text: 'late output' });
  control.call(1).emit({ type: 'completed' });
  control.call(0).emit({ type: 'text_delta', text: ' continues' });
  control.call(0).emit({ type: 'completed' });
  await vi.waitFor(() =>
    expect(lastAssistant(store.getState().chats.byId[chatId]).run.status).toBe(
      'completed',
    ),
  );
  expect(lastAssistant(store.getState().chats.byId[chatId]).text).toBe(
    'Answer A continues',
  );
  expect(store.getState().chats.byId[otherId]).toBeUndefined();
  expect(store.getState().chats.order).toEqual([chatId]);
});

it('INT-04: retries with a fresh run, empty result and protection from the old run', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TEST_TIME));
  const createId = createIds();
  const now = () => new Date().toISOString();
  const store = createAppStore({
    now,
    createId,
    agent: createMockAgent({
      now,
      createId,
      timing: FIXED_MOCK_TIMING,
      streaming: FIXED_STREAMING,
      random: () => 0.5,
    }),
  });
  stores.push(store);
  const chatId = store.getState().chats.selectedChatId;
  for (const draft of ['Помоги решить уравнение', 'Дальше', 'Дальше']) {
    store.dispatch(chatActions.draftChanged({ chatId, draft }));
    expect(store.dispatch(sendMessage(chatId))).toBe(true);
    await vi.runAllTimersAsync();
  }
  const failed = lastAssistant(store.getState().chats.byId[chatId]);
  expect(failed.run).toMatchObject({
    status: 'failed',
    error: { code: 'stream_failure' },
  });
  expect(failed.text.length).toBeGreaterThan(0);
  expect(EQUATION_STEPS[3].answer.startsWith(failed.text)).toBe(true);
  expect(store.getState().chats.byId[chatId]?.demonstratedFailures).toEqual([
    'equation',
  ]);
  expect(selectChatSuggestions(store.getState(), chatId)).toEqual([]);
  store.dispatch(chatActions.draftChanged({ chatId, draft: 'keep draft' }));
  const messageId = failed.id;
  expect(store.dispatch(retryResponse(chatId, messageId))).toBe(true);
  expect(store.dispatch(retryResponse(chatId, messageId))).toBe(false);
  const retry = lastAssistant(store.getState().chats.byId[chatId]);
  expect(retry.run.id).not.toBe(failed.run.id);
  expect(retry).toMatchObject({
    id: messageId,
    text: '',
    imageSrc: null,
    run: { status: 'queued', attempt: 2, actions: [], expanded: false },
  });
  const beforeLate = store.getState();
  store.dispatch(
    chatActions.agentEventReceived(
      eventFor(
        { chatId, assistantMessageId: failed.id, runId: failed.run.id },
        { type: 'text_delta', text: 'late' },
      ),
    ),
  );
  expect(store.getState()).toBe(beforeLate);
  await vi.runAllTimersAsync();
  const completed = lastAssistant(store.getState().chats.byId[chatId]);
  expect(completed.run.status).toBe('completed');
  expect(completed.text).toBe(EQUATION_STEPS[3].answer);
  expect(selectChatSuggestions(store.getState(), chatId)).toEqual([
    'Дальше',
    'Почему при переносе меняется знак?',
  ]);
  expect(store.getState().chats.byId[chatId]?.messages).toHaveLength(6);
  expect(store.getState().chats.byId[chatId]?.draft).toBe('keep draft');
  expect(vi.getTimerCount()).toBe(0);
});
