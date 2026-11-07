import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AgentEvent } from '@/agent/types';
import {
  isGenerateImageInput,
  isGenerateImageResult,
} from '@/agent/tools/generateImage';
import {
  canRetryMessage,
  getChatById,
  getLastAssistant,
  isActiveRun,
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
  const responseReady =
    (run.status === 'streaming' && !!message.text.trim()) ||
    (message.imageSrc !== null &&
      (run.status === 'streaming' ||
        (run.status === 'processing' && run.phase.kind === 'composing')));
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
    case 'action_completed': {
      if (
        !event.actionId ||
        !Number.isFinite(Date.parse(event.at)) ||
        run.status === 'queued'
      )
        break;
      if (run.actions.some((action) => action.id === event.actionId)) return;
      const phase = run.status === 'processing' ? run.phase.kind : null;
      const allowed =
        (event.action === 'analyzed' && phase === 'analyzing') ||
        (event.action === 'calculated' && phase === 'composing') ||
        (event.action === 'image_prepared' &&
          phase === 'composing' &&
          message.imageSrc !== null) ||
        (event.action === 'answer_composed' && responseReady);
      if (!allowed) break;
      run.actions.push({
        id: event.actionId,
        kind: event.action,
        completedAt: event.at,
      });
      return;
    }
    case 'tool_call':
      if (
        run.status !== 'processing' ||
        !['analyzing', 'composing'].includes(run.phase.kind) ||
        !event.callId ||
        !(event.tool === 'calculator'
          ? [event.input.left, event.input.right].every(
              (value) => Number.isInteger(value) && Math.abs(value) <= 10_000,
            )
          : event.tool === 'generate_image' &&
            isGenerateImageInput(event.input))
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
        !(event.tool === 'calculator'
          ? Number.isFinite(event.output.value)
          : event.tool === 'generate_image' &&
            isGenerateImageResult(event.output))
      )
        break;
      if (event.tool === 'generate_image') {
        message.imageSrc = event.output.imageSrc;
        message.imageAlt = event.output.alt;
      }
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
      if (!responseReady) break;
      message.run = {
        ...runBase(run),
        status: 'completed',
        finishedAt: event.at,
      };
      return;
    case 'error':
      if (
        event.demoFailure !== undefined &&
        !(
          (event.demoFailure === 'equation' &&
            event.error.code === 'stream_failure' &&
            run.status === 'streaming' &&
            !!message.text) ||
          (event.error.code === 'tool_failure' &&
            run.status === 'processing' &&
            run.phase.kind === 'using_tool' &&
            ((event.demoFailure === 'calculator' &&
              run.phase.tool === 'calculator') ||
              (event.demoFailure === 'image' &&
                run.phase.tool === 'generate_image')))
        )
      )
        break;
      message.run = {
        ...runBase(run),
        status: 'failed',
        finishedAt: event.at,
        error: event.error,
      };
      return event.demoFailure;
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
      const chat = getChatById(state, chatId);
      if (!chat) return;
      state.selectedChatId = chatId;
      delete chat.unreadRunId;
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
        preserveDraft?: boolean;
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
        assistant.run.actions.length !== 0 ||
        assistant.run.expanded ||
        assistant.text !== '' ||
        assistant.imageSrc !== null ||
        assistant.imageAlt !== undefined
      )
        return;
      if (chat.messages.length === 0) chat.title = makeChatTitle(user.text);
      chat.messages.push(user, assistant);
      if (!payload.preserveDraft) chat.draft = '';
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
        !canRetryMessage(message) ||
        payload.run.actions.length !== 0 ||
        payload.run.expanded
      )
        return;
      message.text = '';
      message.imageSrc = null;
      delete message.imageAlt;
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
    executionExpandedChanged(
      state,
      {
        payload,
      }: PayloadAction<{
        chatId: string;
        assistantMessageId: string;
        runId: string;
        expanded: boolean;
      }>,
    ) {
      const chat = getChatById(state, payload.chatId);
      const message = chat?.messages.find(
        (item) => item.id === payload.assistantMessageId,
      );
      if (message?.role !== 'assistant' || message.run.id !== payload.runId)
        return;
      message.run.expanded = payload.expanded;
    },
    agentEventReceived(state, { payload: event }: PayloadAction<AgentEvent>) {
      const chat = getChatById(state, event.chatId);
      const message = chat && getLastAssistant(chat.messages);
      if (
        !chat ||
        !message ||
        message.id !== event.assistantMessageId ||
        message.run.id !== event.runId ||
        !isActiveRun(message.run)
      )
        return;
      const demonstratedFailure = applyAgentEvent(message, event);
      if (demonstratedFailure) {
        chat.demonstratedFailures ??= [];
        if (!chat.demonstratedFailures.includes(demonstratedFailure))
          chat.demonstratedFailures.push(demonstratedFailure);
      }
      const completedRun = getLastAssistant(chat.messages)?.run;
      if (event.type === 'completed' && completedRun?.status === 'completed') {
        if (state.selectedChatId === event.chatId) delete chat.unreadRunId;
        else chat.unreadRunId = completedRun.id;
      }
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
        const selected = getChatById(state, state.selectedChatId);
        if (selected) delete selected.unreadRunId;
      }
    },
  },
});

export const chatActions = chatsSlice.actions;
export const chatsReducer = chatsSlice.reducer;
export type ChatAction = ReturnType<
  (typeof chatActions)[keyof typeof chatActions]
>;
