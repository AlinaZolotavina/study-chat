import { expect, it } from 'vitest';
import type { AgentEventData, DemoFailureKind } from '@/agent/types';
import {
  eventFor,
  imageToolCall,
  lastAssistant,
  pendingMeta,
  pendingState,
  TEST_TIME,
} from '@/test/fixtures';
import { chatActions, chatsReducer } from './chatsSlice';
import { createEmptyChat } from './helpers';
import type { ChatsState } from './types';

const calculatorCall: AgentEventData = {
  type: 'tool_call',
  tool: 'calculator',
  callId: 'calculator-call',
  input: { operation: 'multiply', left: 17, right: 24 },
};
const cases: {
  kind: DemoFailureKind;
  preparation: AgentEventData;
  error: AgentEventData;
}[] = [
  {
    kind: 'calculator',
    preparation: calculatorCall,
    error: {
      type: 'error',
      error: { code: 'tool_failure', retryable: true },
      demoFailure: 'calculator',
    },
  },
  {
    kind: 'image',
    preparation: imageToolCall(),
    error: {
      type: 'error',
      error: { code: 'tool_failure', retryable: true },
      demoFailure: 'image',
    },
  },
  {
    kind: 'equation',
    preparation: { type: 'text_delta', text: 'Actual explanation prefix' },
    error: {
      type: 'error',
      error: { code: 'stream_failure', retryable: true },
      demoFailure: 'equation',
    },
  },
];
const apply = (state: ChatsState, event: AgentEventData) =>
  chatsReducer(
    state,
    chatActions.agentEventReceived(eventFor(pendingMeta, event)),
  );
function prepared(event: AgentEventData) {
  return apply(apply(pendingState(), { type: 'started' }), event);
}

it.each(cases)(
  'records $kind only with the actual accepted failure, preserving other chats and partial output',
  ({ kind, preparation, error }) => {
    let state = prepared(preparation);
    expect(state.byId['chat-a']?.demonstratedFailures).toEqual([]);
    const other = createEmptyChat('other', TEST_TIME);
    state = chatsReducer(state, chatActions.chatCreated(other));
    const before = lastAssistant(state.byId['chat-a']);
    state = apply(state, error);
    expect(state.byId['chat-a']?.demonstratedFailures).toEqual([kind]);
    expect(lastAssistant(state.byId['chat-a'])).toMatchObject({
      text: before.text,
      imageSrc: null,
      run: { status: 'failed' },
    });
    expect(state.byId.other).toBe(other);
    expect(apply(state, error)).toBe(state);
  },
);

it.each(cases)(
  'does not consume $kind on Stop or its late error',
  ({ preparation, error }) => {
    let state = prepared(preparation);
    state = chatsReducer(
      state,
      chatActions.runCancelled({
        chatId: pendingMeta.chatId,
        runId: pendingMeta.runId,
        at: TEST_TIME,
      }),
    );
    expect(state.byId['chat-a']?.demonstratedFailures).toEqual([]);
    expect(apply(state, error)).toBe(state);
  },
);

it.each(cases)(
  'does not consume $kind from another run, chat or message',
  ({ preparation, error }) => {
    const state = prepared(preparation);
    for (const meta of [
      { ...pendingMeta, runId: 'old' },
      { ...pendingMeta, chatId: 'missing' },
      { ...pendingMeta, assistantMessageId: 'old-message' },
    ]) {
      expect(
        chatsReducer(
          state,
          chatActions.agentEventReceived(eventFor(meta, error)),
        ),
      ).toBe(state);
    }
  },
);

it.each(cases)(
  'rejects $kind markers outside the matching operation without consuming them',
  ({ error }) => {
    const state = apply(apply(pendingState(), { type: 'started' }), error);
    expect(state.byId['chat-a']?.demonstratedFailures).toEqual([]);
    expect(lastAssistant(state.byId['chat-a']).run).toMatchObject({
      status: 'failed',
      error: { code: 'protocol_error' },
    });
  },
);

it.each(['timeout', 'unknown', 'unexpected_end'] as const)(
  'does not consume a scheduled failure on %s',
  (code) => {
    const state = apply(prepared(calculatorCall), {
      type: 'error',
      error: { code, retryable: true },
    });
    expect(state.byId['chat-a']?.demonstratedFailures).toEqual([]);
  },
);
