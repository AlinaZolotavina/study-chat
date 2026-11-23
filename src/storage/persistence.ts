import { getChatById, getLastAssistant } from '@/features/chat/model/helpers';
import type { ChatsState } from '@/features/chat/model/types';
import { STORAGE_KEY, type ChatStorage } from './chatStorage';

export const SAVE_DEBOUNCE_MS = 400;

// Stream fragments and draft edits update state frequently, so debounce their writes.
// Save completed runs and unread-state changes immediately.
function needsImmediateSave(previous: ChatsState, next: ChatsState) {
  if (
    previous.order.length !== next.order.length ||
    next.order.some((id) => !Object.hasOwn(previous.byId, id))
  )
    return true;
  return next.order.some((id) => {
    const nextChat = getChatById(next, id);
    const previousChat = getChatById(previous, id);
    if (nextChat === previousChat) return false;
    if (nextChat?.unreadRunId !== previousChat?.unreadRunId) return true;
    if (
      nextChat?.messages.some((message, index) => {
        const before = previousChat?.messages[index];
        return (
          message.role === 'assistant' &&
          before?.role === 'assistant' &&
          message.id === before.id &&
          message.run.id === before.run.id &&
          message.run.expanded !== before.run.expanded
        );
      })
    )
      return true;
    const current = getLastAssistant(nextChat?.messages ?? []);
    if (
      !current ||
      !['completed', 'cancelled', 'failed'].includes(current.run.status)
    )
      return false;
    const before = getLastAssistant(getChatById(previous, id)?.messages ?? []);
    return (
      !before ||
      before.id !== current.id ||
      before.run.id !== current.run.id ||
      before.run.status !== current.run.status
    );
  });
}

interface PersistenceOptions {
  storage: ChatStorage;
  getChats: () => ChatsState;
  subscribe: (listener: () => void) => () => void;
  onWriteError: () => void;
  saveInitial: boolean;
}

export function attachChatPersistence(options: PersistenceOptions) {
  let previous = options.getChats();
  let enabled = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function save() {
    clearTimer();
    if (!enabled) return;
    try {
      options.storage.setItem(STORAGE_KEY, JSON.stringify(options.getChats()));
    } catch {
      enabled = false;
      options.onWriteError();
    }
  }
  // Keep this subscription outside reducers so Redux stays synchronous and pure,
  // while writes to browser storage remain an external side effect.
  const unsubscribe = options.subscribe(() => {
    const next = options.getChats();
    const before = previous;
    previous = next;
    if (!enabled || next === before) return;
    if (needsImmediateSave(before, next)) save();
    else {
      clearTimer();
      timer = setTimeout(save, SAVE_DEBOUNCE_MS);
    }
  });
  if (options.saveInitial) save();
  return () => {
    enabled = false;
    clearTimer();
    unsubscribe();
  };
}
