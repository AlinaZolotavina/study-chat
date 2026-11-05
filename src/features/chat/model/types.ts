import type { AgentError, AgentPhase } from '@/agent/types';

export type ChatId = string;
export type MessageId = string;
export type RunId = string;
export type ToolCallId = string;
export type Timestamp = string;

export interface RunBase {
  id: RunId;
  attempt: number;
  acceptedAt: Timestamp;
}

export type ProcessingPhase =
  | { kind: AgentPhase }
  | { kind: 'using_tool'; callId: ToolCallId; tool: 'calculator' };

export type QueuedRun = RunBase & { status: 'queued' };
export type ActiveRun =
  | QueuedRun
  | (RunBase & { status: 'processing'; phase: ProcessingPhase })
  | (RunBase & { status: 'streaming' });
export type Run =
  | ActiveRun
  | (RunBase & { status: 'completed'; finishedAt: Timestamp })
  | (RunBase & { status: 'failed'; finishedAt: Timestamp; error: AgentError })
  | (RunBase & { status: 'cancelled'; finishedAt: Timestamp })
  | (RunBase & {
      status: 'interrupted';
      finishedAt: Timestamp;
      reason: 'reload';
    });

interface MessageBase {
  id: MessageId;
  createdAt: Timestamp;
}

export interface UserMessage extends MessageBase {
  role: 'user';
  text: string;
}

export interface AssistantMessage extends MessageBase {
  role: 'assistant';
  replyToMessageId: MessageId;
  text: string;
  imageSrc: string | null;
  run: Run;
}

export type Message = UserMessage | AssistantMessage;

export interface Chat {
  id: ChatId;
  title: string;
  createdAt: Timestamp;
  lastQuestionAt: Timestamp | null;
  draft: string;
  messages: Message[];
}

export interface ChatsState {
  byId: Record<ChatId, Chat>;
  order: ChatId[];
  selectedChatId: ChatId;
}

export interface ChatRootState {
  chats: ChatsState;
}
