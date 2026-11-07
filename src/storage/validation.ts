import { isLocalImageSrc } from '@/features/chat/model/helpers';
import { AGENT_ACTION_KINDS } from '@/agent/types';
import type {
  Chat,
  ChatsState,
  Message,
  Run,
  CompletedAgentAction,
} from '@/features/chat/model/types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

function isCompletedAction(value: unknown): value is CompletedAgentAction {
  return (
    isRecord(value) &&
    isId(value.id) &&
    AGENT_ACTION_KINDS.some((kind) => kind === value.kind) &&
    isTimestamp(value.completedAt)
  );
}

function isRun(value: unknown): value is Run {
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    typeof value.attempt !== 'number' ||
    !Number.isInteger(value.attempt) ||
    value.attempt < 1 ||
    !isTimestamp(value.acceptedAt) ||
    typeof value.expanded !== 'boolean' ||
    !Array.isArray(value.actions) ||
    !value.actions.every(isCompletedAction) ||
    new Set(value.actions.map((action) => action.id)).size !==
      value.actions.length
  )
    return false;
  if (value.status === 'queued' || value.status === 'streaming') return true;
  if (value.status === 'processing') {
    const phase = value.phase;
    return (
      isRecord(phase) &&
      (phase.kind === 'analyzing' ||
        phase.kind === 'composing' ||
        phase.kind === 'preparing_image' ||
        (phase.kind === 'using_tool' &&
          (phase.tool === 'calculator' || phase.tool === 'generate_image') &&
          isId(phase.callId)))
    );
  }
  if (!isTimestamp(value.finishedAt)) return false;
  if (value.status === 'completed' || value.status === 'cancelled') return true;
  if (value.status === 'interrupted') return value.reason === 'reload';
  return (
    value.status === 'failed' &&
    isRecord(value.error) &&
    typeof value.error.retryable === 'boolean' &&
    typeof value.error.code === 'string' &&
    [
      'demo_failure',
      'demo_partial_failure',
      'tool_failure',
      'timeout',
      'unexpected_end',
      'protocol_error',
      'unknown',
    ].includes(value.error.code)
  );
}

function isMessage(value: unknown): value is Message {
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isTimestamp(value.createdAt) ||
    typeof value.text !== 'string'
  )
    return false;
  if (value.role === 'user') return true;
  return (
    value.role === 'assistant' &&
    isId(value.replyToMessageId) &&
    (value.imageAlt === undefined ||
      (value.imageSrc !== null &&
        typeof value.imageAlt === 'string' &&
        value.imageAlt.trim().length > 0)) &&
    (value.imageSrc === null ||
      (typeof value.imageSrc === 'string' &&
        isLocalImageSrc(value.imageSrc))) &&
    isRun(value.run)
  );
}

function isChat(value: unknown): value is Chat {
  return (
    isRecord(value) &&
    isId(value.id) &&
    typeof value.title === 'string' &&
    isTimestamp(value.createdAt) &&
    (value.lastQuestionAt === null || isTimestamp(value.lastQuestionAt)) &&
    typeof value.draft === 'string' &&
    (value.unreadRunId === undefined || isId(value.unreadRunId)) &&
    Array.isArray(value.messages) &&
    value.messages.every(isMessage)
  );
}

export function isChatsState(value: unknown): value is ChatsState {
  if (
    !isRecord(value) ||
    !isRecord(value.byId) ||
    !Array.isArray(value.order) ||
    !isId(value.selectedChatId)
  )
    return false;
  const { byId, order, selectedChatId } = value;
  return (
    order.length > 0 &&
    order.every(isId) &&
    new Set(order).size === order.length &&
    Object.keys(byId).length === order.length &&
    Object.hasOwn(byId, selectedChatId) &&
    order.every((id) => Object.hasOwn(byId, id)) &&
    Object.entries(byId).every(([id, chat]) => isChat(chat) && chat.id === id)
  );
}
