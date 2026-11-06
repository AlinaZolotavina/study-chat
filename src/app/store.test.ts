import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Agent } from '@/agent/types';
import { chatActions } from '@/features/chat/model/chatsSlice';
import {
  createEmptyChat,
  createInitialChatsState,
} from '@/features/chat/model/helpers';
import { STORAGE_KEY } from '@/storage/chatStorage';
import {
  createIds,
  lastAssistant,
  makeTurn,
  queuedRun,
  TEST_TIME,
} from '@/test/fixtures';
import { appActions, appReducer } from './appSlice';
import { createAppStore, type AppStore } from './store';

const stores: AppStore[] = [];
function memoryStorage(initial: string | null = null) {
  let raw = initial;
  return {
    getItem: vi.fn((key: string) => (key === STORAGE_KEY ? raw : null)),
    setItem: vi.fn((key: string, value: string) => {
      if (key === STORAGE_KEY) raw = value;
    }),
    raw: () => raw,
  };
}
function track(store: AppStore) {
  stores.push(store);
  return store;
}
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()));
  vi.useRealTimers();
});

it('persists only initial chats in one key before rendering', () => {
  const storage = memoryStorage();
  const store = track(
    createAppStore({
      storage: () => storage,
      now: () => TEST_TIME,
      createId: createIds(),
    }),
  );
  expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(STORAGE_KEY);
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(store.getState().chats),
  );
  expect(Object.keys(JSON.parse(storage.raw() ?? 'null'))).toEqual([
    'byId',
    'order',
    'selectedChatId',
  ]);
  store.dispatch(appActions.storageUnavailable('write_error'));
  expect(storage.setItem).toHaveBeenCalledOnce();
});

it('restores an unread background reply and immediately persists reading it in the same key', () => {
  const chat = createEmptyChat('unread', TEST_TIME);
  chat.messages = makeTurn(
    { ...queuedRun('unread-run'), status: 'completed', finishedAt: TEST_TIME },
    'reply',
  );
  chat.unreadRunId = 'unread-run';
  const chats = createInitialChatsState(chat);
  const selected = createEmptyChat('selected', TEST_TIME);
  chats.byId.selected = selected;
  chats.order.push(selected.id);
  chats.selectedChatId = selected.id;
  const storage = memoryStorage(JSON.stringify(chats));
  const restored = track(createAppStore({ storage: () => storage }));
  expect(restored.getState().chats.byId.unread?.unreadRunId).toBe('unread-run');
  restored.dispatch(chatActions.chatSelected('unread'));
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(restored.getState().chats),
  );
  const next = track(createAppStore({ storage: () => storage }));
  expect(next.getState().chats.selectedChatId).toBe('unread');
  expect(next.getState().chats.byId.unread?.unreadRunId).toBeUndefined();
});

it('restores actions and per-answer expansion through two stores in the same storage', () => {
  const chat = createEmptyChat('saved', TEST_TIME);
  const first = makeTurn(
    {
      ...queuedRun('first'),
      status: 'completed',
      finishedAt: TEST_TIME,
      actions: [{ id: 'analysis', kind: 'analyzed', completedAt: TEST_TIME }],
    },
    'first',
    'first',
  );
  chat.messages = [
    ...first,
    ...makeTurn(
      { ...queuedRun('second'), status: 'completed', finishedAt: TEST_TIME },
      'second',
      'second',
    ),
  ];
  const storage = memoryStorage(JSON.stringify(createInitialChatsState(chat)));
  const initial = track(createAppStore({ storage: () => storage }));
  initial.dispatch(
    chatActions.executionExpandedChanged({
      chatId: chat.id,
      assistantMessageId: first[1].id,
      runId: first[1].run.id,
      expanded: true,
    }),
  );
  const restored = track(createAppStore({ storage: () => storage }));
  expect(restored.getState().chats.byId.saved?.messages[1]).toMatchObject({
    run: { expanded: true, actions: first[1].run.actions },
  });
  expect(lastAssistant(restored.getState().chats.byId.saved).run.expanded).toBe(
    false,
  );
});

it('restores interrupted data and saves it without calling the agent', () => {
  const chat = createEmptyChat('saved', TEST_TIME);
  const turn = makeTurn(
    { ...queuedRun(), status: 'streaming' },
    'saved partial',
  );
  turn[1].imageSrc = 'assets/example.png';
  chat.messages = turn;
  chat.draft = 'saved draft';
  const storage = memoryStorage(JSON.stringify(createInitialChatsState(chat)));
  const agent = vi.fn<Agent>();
  const createId = vi.fn(() => 'new-id');
  const store = track(
    createAppStore({
      storage: () => storage,
      agent,
      createId,
      now: () => TEST_TIME,
    }),
  );
  expect(store.getState().chats.selectedChatId).toBe('saved');
  expect(lastAssistant(store.getState().chats.byId.saved)).toMatchObject({
    id: turn[1].id,
    text: 'saved partial',
    imageSrc: 'assets/example.png',
    run: { id: turn[1].run.id, status: 'interrupted', reason: 'reload' },
  });
  expect(store.getState().chats.byId.saved?.draft).toBe('saved draft');
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
    STORAGE_KEY,
    JSON.stringify(store.getState().chats),
  );
  expect(agent).not.toHaveBeenCalled();
  expect(createId).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not rewrite valid saved terminal data at startup', () => {
  const chat = createEmptyChat('saved', TEST_TIME);
  chat.messages = makeTurn(
    { ...queuedRun(), status: 'completed', finishedAt: TEST_TIME },
    'answer',
  );
  const saved = createInitialChatsState(chat);
  const storage = memoryStorage(JSON.stringify(saved));
  const store = track(createAppStore({ storage: () => storage }));
  expect(store.getState().chats).toEqual(saved);
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('protects the corrupted original key throughout the session while memory state changes', async () => {
  const original = '{broken';
  const storage = memoryStorage(original);
  const store = track(
    createAppStore({
      storage: () => storage,
      now: () => TEST_TIME,
      createId: createIds(),
    }),
  );
  expect(store.getState().app.storageStatus).toEqual({
    status: 'unavailable',
    reason: 'read_error',
  });
  const chatId = store.getState().chats.selectedChatId;
  store.dispatch(chatActions.draftChanged({ chatId, draft: 'memory only' }));
  store.dispatch(
    chatActions.chatCreated(createEmptyChat('another', TEST_TIME)),
  );
  await vi.runAllTimersAsync();
  expect(store.getState().chats.byId[chatId]?.draft).toBe('memory only');
  expect(storage.raw()).toBe(original);
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('survives a blocked getter and a failed initial write without repeated writes', async () => {
  const blocked = track(
    createAppStore({
      storage: () => {
        throw new Error('denied');
      },
    }),
  );
  expect(blocked.getState().app.storageStatus).toEqual({
    status: 'unavailable',
    reason: 'read_error',
  });
  const storage = memoryStorage();
  storage.setItem.mockImplementation(() => {
    throw new Error('quota exceeded');
  });
  const store = track(createAppStore({ storage: () => storage }));
  expect(store.getState().app.storageStatus).toEqual({
    status: 'unavailable',
    reason: 'write_error',
  });
  store.dispatch(chatActions.chatCreated(createEmptyChat('new', TEST_TIME)));
  await vi.runAllTimersAsync();
  expect(store.getState().chats.selectedChatId).toBe('new');
  expect(storage.setItem).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('cleans pending persistence on store disposal', async () => {
  const storage = memoryStorage();
  const store = track(createAppStore({ storage: () => storage }));
  storage.setItem.mockClear();
  store.dispatch(
    chatActions.draftChanged({
      chatId: store.getState().chats.selectedChatId,
      draft: 'pending',
    }),
  );
  expect(vi.getTimerCount()).toBe(1);
  await store.dispose();
  expect(vi.getTimerCount()).toBe(0);
  await vi.runAllTimersAsync();
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('does not mutate an explicitly preloaded state when storage cannot be read', () => {
  const initial = Object.freeze({
    chats: createInitialChatsState(createEmptyChat('preloaded', TEST_TIME)),
    app: appReducer(undefined, { type: '@@init' }),
  });
  const store = track(
    createAppStore({
      preloadedState: initial,
      storage: () => {
        throw new Error('blocked');
      },
    }),
  );
  expect(initial.app.storageStatus).toEqual({ status: 'available' });
  expect(store.getState().chats.selectedChatId).toBe('preloaded');
  expect(store.getState().app.storageStatus).toEqual({
    status: 'unavailable',
    reason: 'read_error',
  });
});
