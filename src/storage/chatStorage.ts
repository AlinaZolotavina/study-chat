import { isActiveRun, runBase } from '@/features/chat/model/helpers';
import type { ChatsState } from '@/features/chat/model/types';
import { isChatsState } from './validation';

export const STORAGE_KEY = 'lom-ai:chat';
export interface ChatStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type StorageLoadResult =
  | {
      ok: true;
      storage: ChatStorage;
      chats: ChatsState | null;
      needsSave: boolean;
    }
  | { ok: false };

export function restoreInterrupted(chats: ChatsState, now: () => string) {
  let changed = false;
  let restoredAt: string | undefined;
  const byId = Object.fromEntries(
    Object.entries(chats.byId).map(([id, chat]) => [
      id,
      {
        ...chat,
        messages: chat.messages.map((message) => {
          if (message.role !== 'assistant' || !isActiveRun(message.run))
            return message;
          changed = true;
          restoredAt ??= now();
          return {
            ...message,
            run: {
              ...runBase(message.run),
              status: 'interrupted' as const,
              finishedAt: restoredAt,
              reason: 'reload' as const,
            },
          };
        }),
      },
    ]),
  );
  return {
    chats: changed
      ? { byId, order: chats.order, selectedChatId: chats.selectedChatId }
      : chats,
    changed,
  };
}

export function loadChats(
  getStorage: () => ChatStorage,
  now: () => string,
): StorageLoadResult {
  try {
    const storage = getStorage();
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null)
      return { ok: true, storage, chats: null, needsSave: true };
    const parsed: unknown = JSON.parse(raw);
    if (!isChatsState(parsed)) return { ok: false };
    const restored = restoreInterrupted(parsed, now);
    return {
      ok: true,
      storage,
      chats: restored.chats,
      needsSave: restored.changed,
    };
  } catch {
    return { ok: false };
  }
}
