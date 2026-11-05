import { createSelector } from '@reduxjs/toolkit';
import {
  canRetryMessage,
  getChatById,
  getLastAssistant,
  isActiveRun,
  validateDraft,
} from './helpers';
import type { ChatRootState, Message } from './types';

const EMPTY_MESSAGES: readonly Message[] = Object.freeze([]);
export const selectSelectedChat = (state: ChatRootState) =>
  getChatById(state.chats, state.chats.selectedChatId);
export const selectOrderedChatIds = (state: ChatRootState) => state.chats.order;
export const selectChatMessages = (state: ChatRootState, chatId: string) =>
  getChatById(state.chats, chatId)?.messages ?? EMPTY_MESSAGES;

export function selectActiveRun(state: ChatRootState, chatId: string) {
  const message = getLastAssistant(selectChatMessages(state, chatId));
  return message && isActiveRun(message.run) ? message.run : null;
}

export function selectCanSend(state: ChatRootState, chatId: string) {
  const chat = getChatById(state.chats, chatId);
  return (
    !!chat && !selectActiveRun(state, chatId) && validateDraft(chat.draft).valid
  );
}

export function selectCanRetry(
  state: ChatRootState,
  chatId: string,
  messageId: string,
) {
  const message = getLastAssistant(selectChatMessages(state, chatId));
  return !!message && message.id === messageId && canRetryMessage(message);
}

export const selectChatRowMetadata = createSelector(
  [
    (state: ChatRootState, chatId: string) =>
      getChatById(state.chats, chatId)?.title,
    (state: ChatRootState, chatId: string) => !!selectActiveRun(state, chatId),
    (state: ChatRootState, chatId: string) =>
      getLastAssistant(selectChatMessages(state, chatId))?.run.status ===
      'failed',
    (_state: ChatRootState, chatId: string) => chatId,
  ],
  (title, isActive, hasError, id) =>
    title === undefined ? null : { id, title, isActive, hasError },
);

export function selectAgentStatusLabel(
  state: ChatRootState,
  chatId: string,
): string | null {
  const run = getLastAssistant(selectChatMessages(state, chatId))?.run;
  if (!run) return null;
  switch (run.status) {
    case 'queued':
      return 'Сообщение отправлено';
    case 'streaming':
      return 'Пишу ответ…';
    case 'completed':
      return null;
    case 'cancelled':
      return 'Ответ остановлен';
    case 'interrupted':
      return 'Ответ прерван после перезагрузки страницы';
    case 'failed':
      return run.error.code === 'timeout'
        ? 'Ответ занял слишком много времени. Попробуй ещё раз.'
        : 'Не удалось завершить ответ. Попробуй ещё раз.';
    case 'processing': {
      const phase = run.phase.kind;
      switch (phase) {
        case 'analyzing':
          return 'Разбираюсь с вопросом…';
        case 'composing':
          return 'Готовлю ответ…';
        case 'preparing_image':
          return 'Создаю схему…';
        case 'using_tool':
          return 'Проверяю вычисление…';
        default: {
          const unreachable: never = phase;
          return unreachable;
        }
      }
    }
    default: {
      const unreachable: never = run;
      return unreachable;
    }
  }
}
