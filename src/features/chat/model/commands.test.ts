import { configureStore } from '@reduxjs/toolkit';
import { expect, it, vi } from 'vitest';
import {
  createIds,
  makeTurn,
  pendingState,
  queuedRun,
  TEST_TIME,
} from '@/test/fixtures';
import { chatActions, chatsReducer } from './chatsSlice';
import { createChat, deleteChat, sendMessage } from './commands';
import { createEmptyChat, createInitialChatsState } from './helpers';
import type { RequestExecutor } from './requestExecutor';
import type { ChatsState } from './types';

function setup(chats: ChatsState) {
  const requestExecutor: RequestExecutor = {
    send: vi.fn(() => true),
    retry: vi.fn(() => true),
    stop: vi.fn(() => true),
    dispose: vi.fn(async () => undefined),
  };
  const store = configureStore({
    reducer: { chats: chatsReducer },
    preloadedState: { chats },
    middleware: (defaults) =>
      defaults({
        thunk: {
          extraArgument: {
            requestExecutor,
            now: () => TEST_TIME,
            createId: createIds('new'),
          },
        },
      }),
  });
  return { store, requestExecutor };
}

it.each(['constructor', 'toString', '__proto__', 'missing'])(
  'does not stop or delete anything for a nonexistent chat: %s',
  (chatId) => {
    const { store, requestExecutor } = setup(pendingState());
    const before = store.getState();
    expect(store.dispatch(deleteChat(chatId))).toBe(false);
    expect(requestExecutor.stop).not.toHaveBeenCalled();
    expect(store.getState()).toBe(before);
  },
);

it('reuses an empty chat, but creates a separate one without losing its draft', () => {
  const { store } = setup(
    createInitialChatsState(createEmptyChat('empty', TEST_TIME)),
  );
  expect(store.dispatch(createChat())).toBe('empty');
  store.dispatch(
    chatActions.draftChanged({ chatId: 'empty', draft: 'keep me' }),
  );
  expect(store.dispatch(createChat())).toBe('new-1');
  expect(store.getState().chats.selectedChatId).toBe('new-1');
  expect(store.getState().chats.byId.empty?.draft).toBe('keep me');
});

it('cancels only the deleted chat and preserves the other active chat', () => {
  const state = pendingState();
  const other = createEmptyChat('chat-b', TEST_TIME);
  other.messages = makeTurn(queuedRun('run-b'), '', 'b');
  state.byId[other.id] = other;
  state.order.push(other.id);
  state.selectedChatId = other.id;
  const { store, requestExecutor } = setup(state);
  expect(store.dispatch(deleteChat('chat-a'))).toBe(true);
  expect(requestExecutor.stop).toHaveBeenCalledExactlyOnceWith('chat-a');
  expect(store.getState().chats.byId['chat-a']).toBeUndefined();
  expect(store.getState().chats.byId['chat-b']).toBe(other);
  expect(store.getState().chats.selectedChatId).toBe('chat-b');
});

it('creates a replacement for the last chat and ignores repeated deletion', () => {
  const { store, requestExecutor } = setup(pendingState());
  expect(store.dispatch(deleteChat('chat-a'))).toBe(true);
  expect(store.getState().chats.order).toEqual(['new-1']);
  expect(store.getState().chats.selectedChatId).toBe('new-1');
  expect(store.getState().chats.byId['new-1']?.messages).toEqual([]);
  expect(store.dispatch(deleteChat('chat-a'))).toBe(false);
  expect(requestExecutor.stop).toHaveBeenCalledTimes(1);
});

it('rejects a spent or unavailable suggestion before invoking the executor while allowing a manual repeat', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  const start = makeTurn(
    { ...queuedRun('start'), status: 'completed', finishedAt: TEST_TIME },
    'explanation',
    'start',
  );
  start[0].text = 'Помоги решить уравнение';
  const explanation = makeTurn(
    { ...queuedRun('why'), status: 'completed', finishedAt: TEST_TIME },
    'details',
    'why',
  );
  explanation[0].text = 'Почему нужно раскрывать скобки?';
  chat.messages = [...start, ...explanation];
  chat.draft = explanation[0].text;
  const { store, requestExecutor } = setup(createInitialChatsState(chat));
  const before = store.getState();
  for (const text of [
    explanation[0].text,
    'Почему −12 + 5 = −7?',
    'Unknown choice',
  ]) {
    expect(
      store.dispatch(
        sendMessage(chat.id, { text, afterMessageId: explanation[1].id }),
      ),
    ).toBe(false);
  }
  expect(requestExecutor.send).not.toHaveBeenCalled();
  expect(store.getState()).toBe(before);
  const next = { text: 'Дальше', afterMessageId: explanation[1].id };
  expect(store.dispatch(sendMessage(chat.id, next))).toBe(true);
  expect(requestExecutor.send).toHaveBeenCalledExactlyOnceWith(chat.id, next);
  expect(store.dispatch(sendMessage(chat.id))).toBe(true);
  expect(requestExecutor.send).toHaveBeenLastCalledWith(chat.id, undefined);
});

it.each(['constructor', 'toString', '__proto__', 'missing'])(
  'rejects a suggested reply for an unknown chat without invoking the executor: %s',
  (chatId) => {
    const { store, requestExecutor } = setup(pendingState());
    const before = store.getState();
    expect(
      store.dispatch(
        sendMessage(chatId, { text: 'Дальше', afterMessageId: 'assistant-1' }),
      ),
    ).toBe(false);
    expect(requestExecutor.send).not.toHaveBeenCalled();
    expect(store.getState()).toBe(before);
  },
);
