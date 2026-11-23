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
import { loadChats, type ChatStorage } from '@/storage/chatStorage';
import { attachChatPersistence } from '@/storage/persistence';
import { appActions, appReducer } from './appSlice';
import {
  attachLanguagePersistence,
  readLanguagePreference,
} from './languagePreference';
import { getDictionary } from './i18n';

const rootReducer = combineReducers({ chats: chatsReducer, app: appReducer });
export type RootState = ReturnType<typeof rootReducer>;

interface StoreOptions {
  agent?: Agent;
  now?: () => string;
  createId?: () => string;
  timeoutMs?: number;
  preloadedState?: RootState;
  storage?: () => ChatStorage;
}

// Application dependencies are assembled here: agent, executor, Redux, and localStorage.
// Keeping the composition root here lets integration tests replace time, IDs, and the agent.
export function createAppStore(options: StoreOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const language = options.preloadedState?.app.language ?? readLanguagePreference();
  const loaded = options.storage ? loadChats(options.storage, now) : undefined;
  const appState = appReducer(
    appReducer(undefined, { type: '@@init' }),
    appActions.languageChanged(language),
  );
  const initialState = options.preloadedState ?? {
    chats:
      (loaded?.ok && loaded.chats) ||
      createInitialChatsState(
        createEmptyChat(
          createId(),
          now(),
          getDictionary(language).ui.newChatTitle,
        ),
      ),
    app: appState,
  };
  const preloadedState =
    loaded && !loaded.ok
      ? {
          ...initialState,
          app: appReducer(
            initialState.app,
            appActions.storageUnavailable('read_error'),
          ),
        }
      : initialState;
  // Callbacks are used by commands only after configureStore has returned.
  // The executor receives the store through callbacks, so it can be created before
  // configureStore while accessing state and dispatch only after store construction.
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
  // Start persistence only after saved chats have been loaded and restored.
  const detachStorage =
    loaded?.ok && preloadedState.app.storageStatus.status === 'available'
      ? attachChatPersistence({
          storage: loaded.storage,
          getChats: () => store.getState().chats,
          subscribe: store.subscribe,
          onWriteError: () => {
            store.dispatch(appActions.storageUnavailable('write_error'));
          },
          saveInitial: loaded.needsSave || options.preloadedState !== undefined,
        })
      : undefined;
  const detachLanguage = attachLanguagePersistence({
    getLanguage: () => store.getState().app.language,
    subscribe: store.subscribe,
  });
  return Object.assign(store, {
    dispose: async () => {
      detachStorage?.();
      detachLanguage();
      await requestExecutor.dispose();
    },
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];
