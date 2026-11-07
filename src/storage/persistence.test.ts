import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { chatActions, chatsReducer } from '@/features/chat/model/chatsSlice';
import {
  createEmptyChat,
  createInitialChatsState,
} from '@/features/chat/model/helpers';
import type { ChatsState } from '@/features/chat/model/types';
import {
  eventFor,
  pendingMeta,
  pendingState,
  makeTurn,
  queuedRun,
  TEST_TIME,
  imageToolCall,
} from '@/test/fixtures';
import { STORAGE_KEY } from './chatStorage';
import { attachChatPersistence, SAVE_DEBOUNCE_MS } from './persistence';

const cleanups: (() => void)[] = [];
function setup(
  initial = createInitialChatsState(createEmptyChat('a', TEST_TIME)),
  saveInitial = false,
) {
  let state = initial;
  const listeners = new Set<() => void>();
  const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
  const onWriteError = vi.fn();
  const dispose = attachChatPersistence({
    storage,
    saveInitial,
    getChats: () => state,
    onWriteError,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  cleanups.push(dispose);
  return {
    storage,
    onWriteError,
    dispose,
    listeners,
    state: () => state,
    notify: () => {
      for (const listener of listeners) listener();
    },
    apply: (action: Parameters<typeof chatsReducer>[1]) => {
      state = chatsReducer(state, action);
      for (const listener of listeners) listener();
    },
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose();
  vi.useRealTimers();
});

it('saves the latest draft once after the last change, not a captured old state', async () => {
  const context = setup();
  context.apply(chatActions.draftChanged({ chatId: 'a', draft: 'first' }));
  await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 1);
  expect(context.storage.setItem).not.toHaveBeenCalled();
  context.apply(chatActions.draftChanged({ chatId: 'a', draft: 'latest' }));
  await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 1);
  expect(context.storage.setItem).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(context.storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(context.state()),
  );
});

it('saves a consumed failure immediately with the error, before the debounce', () => {
  const context = setup(pendingState());
  context.apply(
    chatActions.agentEventReceived(eventFor(pendingMeta, { type: 'started' })),
  );
  context.apply(
    chatActions.agentEventReceived(eventFor(pendingMeta, imageToolCall())),
  );
  expect(context.storage.setItem).not.toHaveBeenCalled();
  context.apply(
    chatActions.agentEventReceived(
      eventFor(pendingMeta, {
        type: 'error',
        error: { code: 'tool_failure', retryable: true },
        demoFailure: 'image',
      }),
    ),
  );
  expect(context.storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(context.state()),
  );
  expect(context.state().byId['chat-a']?.demonstratedFailures).toEqual([
    'image',
  ]);
  expect(vi.getTimerCount()).toBe(0);
});

it('debounces streaming fragments and saves the accumulated partial result on a pause', async () => {
  const context = setup(pendingState());
  context.apply(
    chatActions.agentEventReceived(eventFor(pendingMeta, { type: 'started' })),
  );
  for (const text of ['first ', 'second ', 'third']) {
    context.apply(
      chatActions.agentEventReceived(
        eventFor(pendingMeta, { type: 'text_delta', text }),
      ),
    );
    await vi.advanceTimersByTimeAsync(50);
    expect(context.storage.setItem).not.toHaveBeenCalled();
  }
  await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  expect(context.storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(context.state()),
  );
  expect(context.storage.setItem.mock.calls[0]?.[1]).toContain(
    'first second third',
  );
});

it('immediately persists expansion of an older answer and flushes the latest draft', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  chat.messages = [
    ...makeTurn(
      { ...queuedRun('old'), status: 'completed', finishedAt: TEST_TIME },
      'answer',
      'old',
    ),
    ...makeTurn(queuedRun('active'), '', 'active'),
  ];
  const context = setup(createInitialChatsState(chat));
  context.apply(
    chatActions.draftChanged({ chatId: chat.id, draft: 'latest draft' }),
  );
  context.apply(
    chatActions.executionExpandedChanged({
      chatId: chat.id,
      assistantMessageId: 'assistant-old',
      runId: 'old',
      expanded: true,
    }),
  );
  expect(context.storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(context.state()),
  );
  expect(context.storage.setItem.mock.calls[0]?.[1]).toContain('latest draft');
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['completed', 'failed', 'cancelled'] as const)(
  'immediately saves a background %s and cancels a pending debounce',
  async (status) => {
    const state = pendingState();
    state.byId.b = createEmptyChat('b', TEST_TIME);
    state.order.push('b');
    state.selectedChatId = 'b';
    const context = setup(state);
    context.apply(
      chatActions.agentEventReceived(
        eventFor(pendingMeta, { type: 'started' }),
      ),
    );
    context.apply(
      chatActions.agentEventReceived(
        eventFor(pendingMeta, { type: 'text_delta', text: 'partial' }),
      ),
    );
    if (status === 'cancelled')
      context.apply(
        chatActions.runCancelled({
          chatId: 'chat-a',
          runId: pendingMeta.runId,
          at: TEST_TIME,
        }),
      );
    else
      context.apply(
        chatActions.agentEventReceived(
          eventFor(
            pendingMeta,
            status === 'completed'
              ? { type: 'completed' }
              : {
                  type: 'error',
                  error: { code: 'demo_partial_failure', retryable: true },
                },
          ),
        ),
      );
    expect(context.storage.setItem).toHaveBeenCalledExactlyOnceWith(
      STORAGE_KEY,
      JSON.stringify(context.state()),
    );
    expect(context.storage.setItem.mock.calls[0]?.[1]).toContain('partial');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(context.storage.setItem).toHaveBeenCalledOnce();
  },
);

it('saves creation and deletion with the selected chat immediately', () => {
  const context = setup();
  context.apply(chatActions.chatCreated(createEmptyChat('b', TEST_TIME)));
  expect(context.storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(context.state()),
  );
  context.storage.setItem.mockClear();
  context.apply(chatActions.draftChanged({ chatId: 'a', draft: 'keep draft' }));
  context.apply(chatActions.chatDeleted({ chatId: 'b', replacement: null }));
  expect(context.storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(context.state()),
  );
  expect(context.state().selectedChatId).toBe('a');
  expect(context.state().byId.a?.draft).toBe('keep draft');
  expect(vi.getTimerCount()).toBe(0);
});

it('immediately saves replacement of the last chat even when the chat count stays the same', () => {
  const context = setup();
  context.apply(
    chatActions.chatDeleted({
      chatId: 'a',
      replacement: createEmptyChat('new', TEST_TIME),
    }),
  );
  expect(context.storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(context.state()),
  );
  expect(context.state().order).toEqual(['new']);
  expect(context.state().selectedChatId).toBe('new');
});

it('saves selected chat changes with the normal debounce', async () => {
  const context = setup();
  context.apply(chatActions.chatCreated(createEmptyChat('b', TEST_TIME)));
  context.storage.setItem.mockClear();
  context.apply(chatActions.chatSelected('a'));
  expect(context.storage.setItem).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  expect(context.storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(context.state()),
  );
});

it('does not write or reset the timer on an unrelated state notification', async () => {
  const context = setup();
  context.notify();
  expect(vi.getTimerCount()).toBe(0);
  context.apply(chatActions.draftChanged({ chatId: 'a', draft: 'draft' }));
  await vi.advanceTimersByTimeAsync(399);
  context.notify();
  await vi.advanceTimersByTimeAsync(1);
  expect(context.storage.setItem).toHaveBeenCalledOnce();
});

it('reports a write failure once and continues in memory without retrying writes', async () => {
  const context = setup();
  context.storage.setItem.mockImplementation(() => {
    throw new Error('quota');
  });
  context.apply(chatActions.chatCreated(createEmptyChat('b', TEST_TIME)));
  expect(context.onWriteError).toHaveBeenCalledOnce();
  context.apply(
    chatActions.draftChanged({ chatId: 'b', draft: 'still works' }),
  );
  context.apply(chatActions.chatCreated(createEmptyChat('c', TEST_TIME)));
  await vi.runAllTimersAsync();
  expect(context.storage.setItem).toHaveBeenCalledOnce();
  expect(context.onWriteError).toHaveBeenCalledOnce();
  expect(context.state().byId.b?.draft).toBe('still works');
  expect(vi.getTimerCount()).toBe(0);
});

it('clears the pending timer and removes the only subscription on dispose', async () => {
  const context = setup();
  expect(context.listeners.size).toBe(1);
  context.apply(chatActions.draftChanged({ chatId: 'a', draft: 'pending' }));
  expect(vi.getTimerCount()).toBe(1);
  context.dispose();
  expect(context.listeners.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  await vi.runAllTimersAsync();
  expect(context.storage.setItem).not.toHaveBeenCalled();
});

it('can immediately persist initial state without waiting for a state change', () => {
  const state: ChatsState = createInitialChatsState(
    createEmptyChat('a', TEST_TIME),
  );
  const context = setup(state, true);
  expect(context.storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(state),
  );
  expect(vi.getTimerCount()).toBe(0);
});
