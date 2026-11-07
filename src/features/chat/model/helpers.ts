import type { AgentHistoryTurn } from '@/agent/types';
import type {
  ActiveRun,
  AssistantMessage,
  Chat,
  ChatsState,
  Message,
  Run,
  RunBase,
} from './types';

export const MAX_MESSAGE_LENGTH = 4000;
export const REQUEST_TIMEOUT_MS = 30_000;

export function createEmptyChat(id: string, createdAt: string): Chat {
  return {
    id,
    title: 'Новый диалог',
    createdAt,
    lastQuestionAt: null,
    draft: '',
    messages: [],
    demonstratedFailures: [],
  };
}

export function createInitialChatsState(chat: Chat): ChatsState {
  return {
    byId: { [chat.id]: chat },
    order: [chat.id],
    selectedChatId: chat.id,
  };
}

export function getChatById(chats: ChatsState, chatId: string) {
  return Object.hasOwn(chats.byId, chatId) ? chats.byId[chatId] : undefined;
}

export function getLastAssistant(messages: readonly Message[]) {
  const last = messages.at(-1);
  return last?.role === 'assistant' ? last : undefined;
}

export function isActiveRun(run: Run): run is ActiveRun {
  return ['queued', 'processing', 'streaming'].includes(run.status);
}

export function canRetryMessage(message: AssistantMessage) {
  const run = message.run;
  return (
    run.status === 'cancelled' ||
    run.status === 'interrupted' ||
    (run.status === 'failed' && run.error.retryable)
  );
}

export function runBase(run: Run): RunBase {
  return {
    id: run.id,
    attempt: run.attempt,
    acceptedAt: run.acceptedAt,
    actions: run.actions,
    expanded: run.expanded,
  };
}

export function validateDraft(draft: string) {
  if (draft.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, reason: 'too_long' } as const;
  }
  const text = draft.trim();
  return text
    ? ({ valid: true, text } as const)
    : ({ valid: false, reason: 'empty' } as const);
}

export function makeChatTitle(text: string) {
  const characters = Array.from(text.trim().replace(/\s+/gu, ' '));
  return characters.length <= 48
    ? characters.join('')
    : characters.slice(0, 47).join('') + '…';
}

export function buildAgentHistory(
  messages: readonly Message[],
  beforeUserMessageId?: string,
): AgentHistoryTurn[] {
  const end =
    beforeUserMessageId === undefined
      ? messages.length
      : messages.findIndex((message) => message.id === beforeUserMessageId);
  const history: AgentHistoryTurn[] = [];
  for (let index = 0; index + 1 < end; index += 2) {
    const user = messages[index];
    const assistant = messages[index + 1];
    if (
      user?.role === 'user' &&
      assistant?.role === 'assistant' &&
      assistant.replyToMessageId === user.id &&
      assistant.run.status === 'completed'
    ) {
      history.push({ userText: user.text, assistantText: assistant.text });
    }
  }
  return history;
}

export function isLocalImageSrc(path: string) {
  return (
    path.startsWith('assets/') &&
    !/[\\?#:%]/u.test(path) &&
    path.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}
