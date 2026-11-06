import { combineReducers, configureStore } from '@reduxjs/toolkit';
import type { Agent } from '@/agent/types';
import { createMockAgent } from '@/agent/mockAgent';
import { chatsReducer } from '@/features/chat/model/chatsSlice';
import {
  createEmptyChat,
  createInitialChatsState,
} from '@/features/chat/model/helpers';
import {
  createRequestExecutor,
  type RequestExecutor,
} from '@/features/chat/model/requestExecutor';
import type { ChatsState } from '@/features/chat/model/types';
import { appReducer } from './appSlice';

const rootReducer = combineReducers({ chats: chatsReducer, app: appReducer });
export type RootState = ReturnType<typeof rootReducer>;

interface StoreOptions {
  agent?: Agent;
  now?: () => string;
  createId?: () => string;
  timeoutMs?: number;
  preloadedState?: RootState;
}

export function createAppStore(options: StoreOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const preloadedState = options.preloadedState ?? {
    chats: createInitialChatsState(createEmptyChat(createId(), now())),
    app: appReducer(undefined, { type: '@@init' }),
  };
  // Callbacks are used by commands only after configureStore has returned.
  const requestExecutor: RequestExecutor = createRequestExecutor({
    agent: options.agent ?? createMockAgent({ now, createId }),
    now,
    createId,
    getState: (): ChatsState => store.getState().chats,
    dispatch: (action): void => {
      store.dispatch(action);
    },
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs }),
  });
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: { extraArgument: { requestExecutor, now, createId } },
      }),
  });
  return Object.assign(store, { dispose: requestExecutor.dispose });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];
