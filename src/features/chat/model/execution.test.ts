import { expect, it } from 'vitest';
import type { AgentEventData } from '@/agent/types';
import {
  eventFor,
  lastAssistant,
  makeTurn,
  pendingMeta,
  pendingState,
  queuedRun,
  TEST_TIME,
} from '@/test/fixtures';
import { chatActions, chatsReducer } from './chatsSlice';
import { formatExecutionDuration } from './execution';
import { createEmptyChat, createInitialChatsState } from './helpers';
import { getAgentStatusLabel } from './selectors';
import type { ChatsState } from './types';

it.each([
  { ms: -1000, label: '0,0 сек' },
  { ms: 0, label: '0,0 сек' },
  { ms: 999, label: '1,0 сек' },
  { ms: 1000, label: '1,0 сек' },
  { ms: 1999, label: '2,0 сек' },
  { ms: 2000, label: '2,0 сек' },
  { ms: 4200, label: '4,2 сек' },
  { ms: 50, label: '0,1 сек' },
  { ms: Number.NaN, label: '0,0 сек' },
  { ms: 60000, label: '1 минуту' },
  { ms: 72000, label: '1 минуту 12,0 сек' },
  { ms: 120000, label: '2 минуты' },
  { ms: 300000, label: '5 минут' },
])('formats elapsed duration $ms ms as $label', ({ ms, label }) => {
  expect(formatExecutionDuration(ms)).toBe(label);
});

function apply(state: ChatsState, event: AgentEventData) {
  return chatsReducer(
    state,
    chatActions.agentEventReceived(eventFor(pendingMeta, event)),
  );
}
const analysis: AgentEventData = {
  type: 'action_completed',
  actionId: 'analysis-1',
  action: 'analyzed',
};

it('preserves chronological actions and expansion through phases, streaming and completion', () => {
  let state = apply(pendingState(), { type: 'started' });
  expect(getAgentStatusLabel(lastAssistant(state.byId['chat-a']).run)).toBe(
    'Думаю над вопросом…',
  );
  expect(lastAssistant(state.byId['chat-a']).run.actions).toEqual([]);
  state = apply(state, analysis);
  expect(apply(state, analysis)).toBe(state);
  state = apply(state, { ...analysis, actionId: 'analysis-2' });
  state = chatsReducer(
    state,
    chatActions.executionExpandedChanged({ ...pendingMeta, expanded: true }),
  );
  state = apply(state, { type: 'phase_changed', phase: 'composing' });
  expect(apply(state, analysis)).toBe(state);
  for (const text of ['first ', 'second'])
    state = apply(state, { type: 'text_delta', text });
  state = apply(state, {
    type: 'action_completed',
    actionId: 'answer',
    action: 'answer_composed',
  });
  state = apply(state, { type: 'completed' });
  const message = lastAssistant(state.byId['chat-a']);
  expect(message.text).toBe('first second');
  expect(message.run).toMatchObject({ status: 'completed', expanded: true });
  expect(message.run.actions.map((action) => [action.id, action.kind])).toEqual(
    [
      ['analysis-1', 'analyzed'],
      ['analysis-2', 'analyzed'],
      ['answer', 'answer_composed'],
    ],
  );
  expect(apply(state, { ...analysis, actionId: 'late' })).toBe(state);
});

it.each(['queued', 'tool_running', 'image_missing', 'text_missing'] as const)(
  'rejects premature action completion: %s',
  (phase) => {
    let state = pendingState();
    if (phase !== 'queued') state = apply(state, { type: 'started' });
    let event = analysis;
    if (phase === 'tool_running') {
      state = apply(state, {
        type: 'tool_call',
        callId: 'call',
        tool: 'calculator',
        input: { operation: 'multiply', left: 2, right: 3 },
      });
      event = {
        type: 'action_completed',
        actionId: 'calc',
        action: 'calculated',
      };
    }
    if (phase === 'image_missing') {
      state = apply(state, { type: 'phase_changed', phase: 'composing' });
      event = {
        type: 'action_completed',
        actionId: 'image',
        action: 'image_prepared',
      };
    }
    if (phase === 'text_missing')
      event = {
        type: 'action_completed',
        actionId: 'answer',
        action: 'answer_composed',
      };
    const run = lastAssistant(apply(state, event).byId['chat-a']).run;
    expect(run).toMatchObject({
      status: 'failed',
      error: { code: 'protocol_error' },
      actions: [],
    });
  },
);

it('uses one completion event per calculator action instead of duplicating tool_result', () => {
  let state = apply(pendingState(), { type: 'started' });
  state = apply(state, {
    type: 'tool_call',
    callId: 'call',
    tool: 'calculator',
    input: { operation: 'multiply', left: 2, right: 3 },
  });
  state = apply(state, {
    type: 'tool_result',
    callId: 'call',
    tool: 'calculator',
    output: { value: 6 },
  });
  expect(lastAssistant(state.byId['chat-a']).run.actions).toEqual([]);
  state = apply(state, {
    type: 'action_completed',
    actionId: 'calc',
    action: 'calculated',
  });
  expect(
    lastAssistant(state.byId['chat-a']).run.actions.map(
      (action) => action.kind,
    ),
  ).toEqual(['calculated']);
});

it.each(['failed', 'cancelled'] as const)(
  'keeps completed actions on %s and resets them on Retry',
  (status) => {
    let state = apply(apply(pendingState(), { type: 'started' }), analysis);
    state = chatsReducer(
      state,
      chatActions.executionExpandedChanged({ ...pendingMeta, expanded: true }),
    );
    state =
      status === 'failed'
        ? apply(state, {
            type: 'error',
            error: { code: 'demo_failure', retryable: true },
          })
        : chatsReducer(
            state,
            chatActions.runCancelled({
              chatId: pendingMeta.chatId,
              runId: pendingMeta.runId,
              at: TEST_TIME,
            }),
          );
    const run = lastAssistant(state.byId['chat-a']).run;
    expect(run.actions).toHaveLength(1);
    expect(run.expanded).toBe(true);
    expect(getAgentStatusLabel(run)).not.toContain('Думал');
    const retried = chatsReducer(
      state,
      chatActions.retryAccepted({
        chatId: pendingMeta.chatId,
        assistantMessageId: pendingMeta.assistantMessageId,
        run: { ...queuedRun('retry'), attempt: 2 },
      }),
    );
    expect(lastAssistant(retried.byId['chat-a']).run).toMatchObject({
      id: 'retry',
      actions: [],
      expanded: false,
    });
    expect(apply(retried, { ...analysis, actionId: 'late' })).toBe(retried);
    expect(
      chatsReducer(
        retried,
        chatActions.executionExpandedChanged({
          ...pendingMeta,
          expanded: true,
        }),
      ),
    ).toBe(retried);
  },
);

it('changes expansion on an older answer independently of another chat or newer answer', () => {
  const first = createEmptyChat('a', TEST_TIME);
  first.messages = [
    ...makeTurn(
      { ...queuedRun('first'), status: 'completed', finishedAt: TEST_TIME },
      'first',
      'first',
    ),
    ...makeTurn(queuedRun('second'), '', 'second'),
  ];
  const second = createEmptyChat('b', TEST_TIME);
  const state = createInitialChatsState(first);
  state.byId.b = second;
  state.order.push('b');
  state.selectedChatId = 'b';
  const next = chatsReducer(
    state,
    chatActions.executionExpandedChanged({
      chatId: 'a',
      assistantMessageId: 'assistant-first',
      runId: 'first',
      expanded: true,
    }),
  );
  expect(
    next.byId.a?.messages[1]?.role === 'assistant' &&
      next.byId.a.messages[1].run.expanded,
  ).toBe(true);
  expect(lastAssistant(next.byId.a).run.expanded).toBe(false);
  expect(next.byId.b).toBe(second);
});

it.each(['constructor', 'toString', '__proto__', 'missing'])(
  'ignores an expansion action with an unknown chat: %s',
  (chatId) => {
    const state = pendingState();
    expect(
      chatsReducer(
        state,
        chatActions.executionExpandedChanged({
          ...pendingMeta,
          chatId,
          expanded: true,
        }),
      ),
    ).toBe(state);
  },
);

it('calculates completion time from acceptance, including queueing and streaming', () => {
  expect(
    getAgentStatusLabel({
      ...queuedRun(),
      status: 'completed',
      finishedAt: new Date(Date.parse(TEST_TIME) + 72000).toISOString(),
    }),
  ).toBe('Думал 1 минуту 12,0 сек');
});
