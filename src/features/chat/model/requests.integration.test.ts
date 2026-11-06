import { afterEach, expect, it, vi } from 'vitest';
import { createAppStore, type AppStore } from '@/app/store';
import { MOCK_TIMING } from '@/agent/config';
import { createControlledAgent } from '@/test/controlledAgent';
import { createIds, eventFor, lastAssistant, TEST_TIME } from '@/test/fixtures';
import { chatActions } from './chatsSlice';
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
  const store = createAppStore({ now: () => TEST_TIME, createId: createIds() });
  stores.push(store);
  const chatId = store.getState().chats.selectedChatId;
  store.dispatch(
    chatActions.draftChanged({ chatId, draft: '  Объясни закон Архимеда  ' }),
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
    text: 'Объясни закон Архимеда',
  });
  expect(accepted.id).not.toBe(accepted.replyToMessageId);
  store.dispatch(chatActions.draftChanged({ chatId, draft: 'next question' }));
  expect(store.dispatch(sendMessage(chatId))).toBe(false);
  await vi.advanceTimersByTimeAsync(MOCK_TIMING.queuedMs);
  expect(lastAssistant(store.getState().chats.byId[chatId]).run.status).toBe(
    'processing',
  );
  await vi.advanceTimersByTimeAsync(
    MOCK_TIMING.processingMs + MOCK_TIMING.chunkMs,
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
  expect(completed.text).toContain('Fₐ = ρ · g · V');
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
  const { store, control, chatId } = setup();
  store.dispatch(sendMessage(chatId));
  const firstCall = control.call(0);
  firstCall.emit({ type: 'started' });
  firstCall.emit({ type: 'phase_changed', phase: 'preparing_image' });
  firstCall.emit({ type: 'image_received', imageSrc: 'assets/example.png' });
  firstCall.emit({ type: 'text_delta', text: 'partial' });
  await vi.waitFor(() =>
    expect(lastAssistant(store.getState().chats.byId[chatId]).text).toBe(
      'partial',
    ),
  );
  store.dispatch(chatActions.draftChanged({ chatId, draft: 'keep draft' }));
  const messageId = lastAssistant(store.getState().chats.byId[chatId]).id;
  // Retry synchronously, before the cancelled reader gets its finally microtask.
  store.dispatch(stopGeneration(chatId));
  expect(store.dispatch(retryResponse(chatId, messageId))).toBe(true);
  expect(store.dispatch(retryResponse(chatId, messageId))).toBe(false);
  const retryCall = control.call(1);
  expect(retryCall.request.runId).not.toBe(firstCall.request.runId);
  expect(retryCall.request).toMatchObject({
    attempt: 2,
    prompt: 'First question',
    history: [],
  });
  expect(lastAssistant(store.getState().chats.byId[chatId])).toMatchObject({
    id: messageId,
    text: '',
    imageSrc: null,
    run: { status: 'queued' },
  });
  store.dispatch(
    chatActions.agentEventReceived(
      eventFor(firstCall.request, { type: 'completed' }),
    ),
  );
  expect(retryCall.signal.aborted).toBe(false);
  retryCall.emit({ type: 'started' });
  retryCall.emit({ type: 'text_delta', text: 'new answer' });
  retryCall.emit({ type: 'completed' });
  await vi.waitFor(() =>
    expect(lastAssistant(store.getState().chats.byId[chatId]).run.status).toBe(
      'completed',
    ),
  );
  expect(lastAssistant(store.getState().chats.byId[chatId]).text).toBe(
    'new answer',
  );
  expect(store.getState().chats.byId[chatId]?.messages).toHaveLength(2);
  expect(store.getState().chats.byId[chatId]?.draft).toBe('keep draft');
});
