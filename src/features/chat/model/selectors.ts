import { createSelector } from '@reduxjs/toolkit';
import { deriveContext } from '@/agent/context';
import { EMPTY_SUGGESTIONS, getSuggestions } from '@/agent/suggestions';
import {
  canRetryMessage,
  buildAgentHistory,
  getChatById,
  getLastAssistant,
  isActiveRun,
  validateDraft,
} from './helpers';
import type { ChatRootState, Message, Run } from './types';
import { getCompletedExecutionLabel } from './execution';
import type { Language } from '@/shared/language';
import { getDictionary } from '@/app/i18n';

const EMPTY_MESSAGES: readonly Message[] = Object.freeze([]);
export const selectSelectedChat = (state: ChatRootState) =>
  getChatById(state.chats, state.chats.selectedChatId);
export const selectOrderedChatIds = (state: ChatRootState) => state.chats.order;
export const selectChatMessages = (state: ChatRootState, chatId: string) =>
  getChatById(state.chats, chatId)?.messages ?? EMPTY_MESSAGES;

// Suggestions use the same completed history as the agent context, so the UI offers
// only commands that fit the current learning step.
export const selectChatSuggestions = createSelector(
  [
    selectChatMessages,
    (_state: ChatRootState, _chatId: string, language: Language = 'en') =>
      language,
  ],
  (messages, language): readonly string[] => {
    const last = getLastAssistant(messages);
    return last?.run.status === 'completed'
      ? getSuggestions(deriveContext(buildAgentHistory(messages)), language)
      : EMPTY_SUGGESTIONS;
  },
);

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
    (state: ChatRootState, chatId: string) =>
      !!getChatById(state.chats, chatId)?.unreadRunId,
    (_state: ChatRootState, chatId: string) => chatId,
  ],
  (title, isActive, hasError, hasUnreadReply, id) =>
    title === undefined
      ? null
      : { id, title, isActive, hasError, hasUnreadReply },
);

export function selectAgentStatusLabel(
  state: ChatRootState,
  chatId: string,
  language: Language = 'en',
): string | null {
  const run = getLastAssistant(selectChatMessages(state, chatId))?.run;
  if (!run) return null;
  return getAgentStatusLabel(run, language);
}

export function getAgentStatusLabel(
  run: Run,
  language: Language = 'en',
): string | null {
  const labels = getDictionary(language).status;
  switch (run.status) {
    case 'queued':
      return labels.queued;
    case 'streaming':
      return labels.streaming;
    case 'completed':
      return getCompletedExecutionLabel(run, language);
    case 'cancelled':
      return labels.cancelled;
    case 'interrupted':
      return labels.interrupted;
    case 'failed':
      return run.error.code === 'timeout'
        ? labels.failedTimeout
        : labels.failed;
    case 'processing': {
      const phase = run.phase.kind;
      switch (phase) {
        case 'analyzing':
          return labels.analyzing;
        case 'composing':
          return labels.composing;
        case 'preparing_image':
          return labels.preparingImage;
        case 'using_tool':
          return run.phase.kind === 'using_tool' &&
            run.phase.tool === 'generate_image'
            ? labels.preparingImage
            : labels.usingCalculator;
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
