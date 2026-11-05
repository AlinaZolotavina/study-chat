export type AgentErrorCode =
  | 'demo_failure'
  | 'demo_partial_failure'
  | 'tool_failure'
  | 'timeout'
  | 'unexpected_end'
  | 'protocol_error'
  | 'unknown';

export interface AgentError {
  code: AgentErrorCode;
  retryable: boolean;
}

export type AgentPhase = 'analyzing' | 'preparing_image' | 'composing';

export interface AgentHistoryTurn {
  readonly userText: string;
  readonly assistantText: string;
}

export interface AgentRequest {
  readonly chatId: string;
  readonly assistantMessageId: string;
  readonly runId: string;
  readonly attempt: number;
  readonly prompt: string;
  readonly history: readonly AgentHistoryTurn[];
}

export interface AgentEventMeta {
  chatId: string;
  assistantMessageId: string;
  runId: string;
  at: string;
}

export type AgentEventData =
  | { type: 'started' }
  | { type: 'phase_changed'; phase: AgentPhase }
  | {
      type: 'tool_call';
      callId: string;
      tool: 'calculator';
      input: { operation: 'multiply'; left: number; right: number };
    }
  | {
      type: 'tool_result';
      callId: string;
      tool: 'calculator';
      output: { value: number };
    }
  | { type: 'image_received'; imageSrc: string }
  | { type: 'text_delta'; text: string }
  | { type: 'completed' }
  | { type: 'error'; error: AgentError };

export type AgentEvent = AgentEventMeta & AgentEventData;

export type Agent = (
  request: AgentRequest,
  signal: AbortSignal,
) => AsyncIterable<AgentEvent>;
