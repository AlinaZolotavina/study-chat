import type {
  GenerateImageInput,
  GenerateImageResult,
} from './tools/generateImage';

export type AgentErrorCode =
  // Readable in previously saved failures; no standalone demo commands emit these.
  | 'demo_failure'
  | 'demo_partial_failure'
  | 'stream_failure'
  | 'tool_failure'
  | 'timeout'
  | 'unexpected_end'
  | 'protocol_error'
  | 'unknown';

export interface AgentError {
  code: AgentErrorCode;
  retryable: boolean;
}

export type AgentPhase = 'analyzing' | 'composing';
export type ToolName = 'calculator' | 'generate_image';

export const DEMO_FAILURE_KINDS = ['calculator', 'equation', 'image'] as const;
export type DemoFailureKind = (typeof DEMO_FAILURE_KINDS)[number];

export const AGENT_ACTION_KINDS = [
  'analyzed',
  'calculated',
  'image_prepared',
  'answer_composed',
] as const;
export type AgentActionKind = (typeof AGENT_ACTION_KINDS)[number];

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
  readonly demonstratedFailures: readonly DemoFailureKind[];
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
  | { type: 'action_completed'; actionId: string; action: AgentActionKind }
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
  | {
      type: 'tool_call';
      callId: string;
      tool: 'generate_image';
      input: GenerateImageInput;
    }
  | {
      type: 'tool_result';
      callId: string;
      tool: 'generate_image';
      output: GenerateImageResult;
    }
  | { type: 'text_delta'; text: string }
  | { type: 'completed' }
  | { type: 'error'; error: AgentError; demoFailure?: DemoFailureKind };

export type AgentEvent = AgentEventMeta & AgentEventData;

export type Agent = (
  request: AgentRequest,
  signal: AbortSignal,
) => AsyncIterable<AgentEvent>;
