import type { AgentEvent, AgentEventData, AgentRequest } from '@/agent/types';
import { STREAMING_CONFIG, type MockTiming } from '@/agent/config';
import {
  createEmptyChat,
  createInitialChatsState,
} from '@/features/chat/model/helpers';
import type {
  AssistantMessage,
  Chat,
  Run,
  UserMessage,
} from '@/features/chat/model/types';

export const TEST_TIME = '2026-11-06T08:00:00.000Z';

export const FIXED_MOCK_TIMING: MockTiming = {
  queuedMs: 150,
  analysisMs: { minMs: 450, maxMs: 450 },
  toolUseMs: { minMs: 500, maxMs: 500 },
  toolResultMs: { minMs: 200, maxMs: 200 },
  imageMs: { minMs: 800, maxMs: 800 },
  composingMs: { minMs: 200, maxMs: 200 },
  calculatorComposingMs: { minMs: 200, maxMs: 200 },
};
export const FIXED_STREAMING = {
  ...STREAMING_CONFIG,
  wordsPerSecond: 30,
  minBlockMs: 180,
  headingWordsPerSecond: 60,
  minHeadingMs: 100,
  maxHeadingMs: 300,
  variance: 0,
  minChunkSize: 16,
  maxChunkSize: 16,
  paragraphPauseMs: { minMs: 250, maxMs: 250 },
  listPauseMs: { minMs: 120, maxMs: 120 },
};

export function createIds(prefix = 'id') {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

export function makeTurn(
  run: Run,
  text = '',
  suffix = '1',
): [UserMessage, AssistantMessage] {
  const user: UserMessage = {
    id: `user-${suffix}`,
    role: 'user',
    createdAt: TEST_TIME,
    text: `question-${suffix}`,
  };
  return [
    user,
    {
      id: `assistant-${suffix}`,
      role: 'assistant',
      createdAt: TEST_TIME,
      replyToMessageId: user.id,
      text,
      imageSrc: null,
      run,
    },
  ];
}

export function queuedRun(id = 'run-1') {
  return {
    id,
    attempt: 1,
    acceptedAt: TEST_TIME,
    status: 'queued',
    actions: [],
    expanded: false,
  } satisfies Run;
}

export function pendingState() {
  const chat = createEmptyChat('chat-a', TEST_TIME);
  chat.messages = makeTurn(queuedRun());
  return createInitialChatsState(chat);
}

export function lastAssistant(chat: Chat | undefined) {
  const message = chat?.messages.at(-1);
  if (message?.role !== 'assistant')
    throw new Error('Expected assistant message');
  return message;
}

export function eventFor(
  request: Pick<AgentRequest, 'chatId' | 'runId' | 'assistantMessageId'>,
  data: AgentEventData,
): AgentEvent {
  return {
    chatId: request.chatId,
    runId: request.runId,
    assistantMessageId: request.assistantMessageId,
    at: TEST_TIME,
    ...data,
  };
}

export const pendingMeta = {
  chatId: 'chat-a',
  runId: 'run-1',
  assistantMessageId: 'assistant-1',
};
