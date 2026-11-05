import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AgentEvent } from '@/agent/types';
import {
  canRetryMessage,
  getChatById,
  getLastAssistant,
  isActiveRun,
  isLocalImageSrc,
  makeChatTitle,
  runBase,
} from './helpers';
import type {
  AssistantMessage,
  Chat,
  ChatsState,
  QueuedRun,
  UserMessage,
} from './types';

const initialState: ChatsState = { byId: {}, order: [], selectedChatId: '' };

function applyAgentEvent(message: AssistantMessage, event: AgentEvent) {
  const run = message.run;
  switch (event.type) {
    case 'started':
      if (run.status !== 'queued') break;
      message.run = {
        ...runBase(run),
        status: 'processing',
        phase: { kind: 'analyzing' },
      };
      return;
    case 'phase_changed':
      if (run.status !== 'processing' || run.phase.kind === 'using_tool') break;
      message.run = {
        ...runBase(run),
        status: 'processing',
        phase: { kind: event.phase },
      };
      return;
    case 'tool_call':
      if (
        run.status !== 'processing' ||
        !['analyzing', 'composing'].includes(run.phase.kind) ||
        !event.callId ||
        ![event.input.left, event.input.right].every(
          (value) => Number.isInteger(value) && Math.abs(value) <= 10_000,
        )
      )
        break;
      message.run = {
        ...runBase(run),
        status: 'processing',
        phase: { kind: 'using_tool', callId: event.callId, tool: event.tool },
      };
      return;
    case 'tool_result':
      if (
        run.status !== 'processing' ||
        run.phase.kind !== 'using_tool' ||
        run.phase.callId !== event.callId ||
        run.phase.tool !== event.tool ||
        !Number.isFinite(event.output.value)
      )
        break;
      message.run = {
        ...runBase(run),
        status: 'processing',
        phase: { kind: 'composing' },
      };
      return;
    case 'image_received':
      if (
        run.status !== 'processing' ||
        run.phase.kind !== 'preparing_image' ||
        !isLocalImageSrc(event.imageSrc)
      )
        break;
      message.imageSrc = event.imageSrc;
      message.run = {
        ...runBase(run),
        status: 'processing',
        phase: { kind: 'composing' },
      };
      return;
    case 'text_delta':
      if (
        !event.text ||
        !(
          run.status === 'streaming' ||
          (run.status === 'processing' &&
            ['analyzing', 'composing'].includes(run.phase.kind))
        )
      )
        break;
      message.text += event.text;
      message.run = { ...runBase(run), status: 'streaming' };
      return;
    case 'completed':
      if (run.status !== 'streaming' || !message.text.trim()) break;
      message.run = {
        ...runBase(run),
        status: 'completed',
        finishedAt: event.at,
      };
      return;
    case 'error':
      message.run = {
        ...runBase(run),
        status: 'failed',
        finishedAt: event.at,
        error: event.error,
      };
      return;
    default: {
      const unreachable: never = event;
      throw new Error(`Unsupported event: ${String(unreachable)}`);
    }
  }
  message.run = {
    ...runBase(run),
    status: 'failed',
    finishedAt: event.at,
    error: { code: 'protocol_error', retryable: true },
  };
}

const chatsSlice = createSlice({
  name: 'chats',
  initialState,
  reducers: {
    chatCreated(state, { payload: chat }: PayloadAction<Chat>) {
      if (Object.hasOwn(state.byId, chat.id)) return;
      state.byId = { ...state.byId, [chat.id]: chat };
      state.order.unshift(chat.id);
      state.selectedChatId = chat.id;
    },
    chatSelected(state, { payload: chatId }: PayloadAction<string>) {
      if (getChatById(state, chatId)) state.selectedChatId = chatId;
    },
    draftChanged(
      state,
      { payload }: PayloadAction<{ chatId: string; draft: string }>,
    ) {
      const chat = getChatById(state, payload.chatId);
      if (chat) chat.draft = payload.draft;
    },
    requestAccepted(
      state,
      {
        payload,
      }: PayloadAction<{
        chatId: string;
        user: UserMessage;
        assistant: AssistantMessage;
      }>,
    ) {
      const chat = getChatById(state, payload.chatId);
      if (!chat) return;
      const last = getLastAssistant(chat.messages);
      if (last && isActiveRun(last.run)) return;
      const { user, assistant } = payload;
      if (
        assistant.replyToMessageId !== user.id ||
        assistant.id === user.id ||
        assistant.run.status !== 'queued' ||
        assistant.text !== '' ||
        assistant.imageSrc !== null
      )
        return;
      if (chat.messages.length === 0) chat.title = makeChatTitle(user.text);
      chat.messages.push(user, assistant);
      chat.draft = '';
      chat.lastQuestionAt = user.createdAt;
      state.order = [chat.id, ...state.order.filter((id) => id !== chat.id)];
    },
    retryAccepted(
      state,
      {
        payload,
      }: PayloadAction<{
        chatId: string;
        assistantMessageId: string;
        run: QueuedRun;
      }>,
    ) {
      const chat = getChatById(state, payload.chatId);
      const message = chat && getLastAssistant(chat.messages);
      if (
        !message ||
        message.id !== payload.assistantMessageId ||
        !canRetryMessage(message)
      )
        return;
      message.text = '';
      message.imageSrc = null;
      message.run = payload.run;
    },
    runCancelled(
      state,
      {
        payload,
      }: PayloadAction<{
        chatId: string;
        runId: string;
        at: string;
      }>,
    ) {
      const chat = getChatById(state, payload.chatId);
      const message = chat && getLastAssistant(chat.messages);
      if (
        !message ||
        message.run.id !== payload.runId ||
        !isActiveRun(message.run)
      )
        return;
      message.run = {
        ...runBase(message.run),
        status: 'cancelled',
        finishedAt: payload.at,
      };
    },
    agentEventReceived(state, { payload: event }: PayloadAction<AgentEvent>) {
      const chat = getChatById(state, event.chatId);
      const message = chat && getLastAssistant(chat.messages);
      if (
        !message ||
        message.id !== event.assistantMessageId ||
        message.run.id !== event.runId ||
        !isActiveRun(message.run)
      )
        return;
      applyAgentEvent(message, event);
    },
    chatDeleted(
      state,
      { payload }: PayloadAction<{ chatId: string; replacement: Chat | null }>,
    ) {
      const index = state.order.indexOf(payload.chatId);
      if (!getChatById(state, payload.chatId) || index < 0) return;
      if (state.order.length === 1 && !payload.replacement) return;
      delete state.byId[payload.chatId];
      state.order.splice(index, 1);
      if (state.order.length === 0 && payload.replacement) {
        const chat = payload.replacement;
        state.byId = { ...state.byId, [chat.id]: chat };
        state.order.push(chat.id);
        state.selectedChatId = chat.id;
      } else if (state.selectedChatId === payload.chatId) {
        state.selectedChatId =
          state.order[index] ?? state.order[index - 1] ?? '';
      }
    },
  },
});

export const chatActions = chatsSlice.actions;
export const chatsReducer = chatsSlice.reducer;
export type ChatAction = ReturnType<
  (typeof chatActions)[keyof typeof chatActions]
>;
