import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit';
import { chatActions } from './chatsSlice';
import { createEmptyChat, getChatById } from './helpers';
import { selectChatSuggestions } from './selectors';
import type { RequestExecutor, SuggestedReplyInput } from './requestExecutor';
import type { ChatRootState } from './types';
import type { Language } from '@/shared/language';

export interface ChatDependencies {
  requestExecutor: RequestExecutor;
  now: () => string;
  createId: () => string;
}

// Thunk commands connect the UI to application logic. The executor owns the async
// lifecycle, while reducers receive only state-change events.
type ChatThunk<Result> = ThunkAction<
  Result,
  ChatRootState,
  ChatDependencies,
  UnknownAction
>;

export const sendMessage =
  (
    chatId: string,
    reply?: SuggestedReplyInput,
    language: Language = 'en',
  ): ChatThunk<boolean> =>
  (_dispatch, getState, { requestExecutor }) => {
    if (
      reply &&
      !selectChatSuggestions(getState(), chatId, language).includes(reply.text)
    )
      return false;
    return requestExecutor.send(chatId, reply, language);
  };

export const retryResponse =
  (chatId: string, messageId: string, language: Language = 'en'): ChatThunk<boolean> =>
  (_dispatch, _getState, { requestExecutor }) =>
    requestExecutor.retry(chatId, messageId, language);

export const stopGeneration =
  (chatId: string): ChatThunk<boolean> =>
  (_dispatch, _getState, { requestExecutor }) =>
    requestExecutor.stop(chatId);

export const createChat =
  (title = 'Новый диалог'): ChatThunk<string> =>
  (dispatch, getState, { now, createId }) => {
    const { chats } = getState();
    const current = getChatById(chats, chats.selectedChatId);
    if (current && current.messages.length === 0 && current.draft.length === 0)
      return current.id;
    const chat = createEmptyChat(createId(), now(), title);
    dispatch(chatActions.chatCreated(chat));
    return chat.id;
  };

export const deleteChat =
  (chatId: string, replacementTitle = 'Новый диалог'): ChatThunk<boolean> =>
  (dispatch, getState, { requestExecutor, now, createId }) => {
    if (!getChatById(getState().chats, chatId)) return false;
    requestExecutor.stop(chatId);
    const replacement =
      getState().chats.order.length === 1
        ? createEmptyChat(createId(), now(), replacementTitle)
        : null;
    dispatch(chatActions.chatDeleted({ chatId, replacement }));
    return true;
  };
