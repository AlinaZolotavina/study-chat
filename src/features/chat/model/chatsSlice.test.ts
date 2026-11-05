import { describe, expect, it } from 'vitest';
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
import { createEmptyChat, createInitialChatsState } from './helpers';
import { selectChatRowMetadata } from './selectors';
import type { AssistantMessage, Run } from './types';

it.each(['constructor', 'toString', '__proto__', 'missing'])(
  'ignores all updates addressed to a nonexistent chat: %s',
  (chatId) => {
    const state = pendingState();
    const [user, assistant] = makeTurn(queuedRun('new-run'));
    const actions = [
      chatActions.chatSelected(chatId),
      chatActions.draftChanged({ chatId, draft: 'must not be saved' }),
      chatActions.requestAccepted({ chatId, user, assistant }),
      chatActions.retryAccepted({
        chatId,
        assistantMessageId: assistant.id,
        run: queuedRun('retry-run'),
      }),
      chatActions.runCancelled({ chatId, runId: 'run-1', at: TEST_TIME }),
      chatActions.agentEventReceived(
        eventFor({ ...pendingMeta, chatId }, { type: 'started' }),
      ),
      chatActions.chatDeleted({ chatId, replacement: null }),
    ];
    for (const action of actions)
      expect(chatsReducer(state, action)).toBe(state);
    expect(state.selectedChatId).toBe('chat-a');
    expect(state.order).toEqual(['chat-a']);
    expect(Object.hasOwn(state.byId, chatId)).toBe(false);
  },
);

it.each(['constructor', 'toString', '__proto__'])(
  'creates a chat as an own property even when its ID shadows the prototype: %s',
  (chatId) => {
    const initial = pendingState();
    const chat = createEmptyChat(chatId, TEST_TIME);
    const state = chatsReducer(initial, chatActions.chatCreated(chat));
    expect(Object.hasOwn(state.byId, chatId)).toBe(true);
    expect(state.byId[chatId]).toEqual(chat);
    expect(Object.getPrototypeOf(state.byId)).toBe(Object.prototype);
    expect(state.selectedChatId).toBe(chatId);
    expect(state.order).toEqual([chatId, 'chat-a']);
    expect(chatsReducer(state, chatActions.chatCreated(chat))).toBe(state);
  },
);

it('accepts a pair atomically, prevents a duplicate, clears draft and raises only the new question', () => {
  const first = createEmptyChat('chat-a', TEST_TIME);
  first.draft = 'next';
  let state = createInitialChatsState(first);
  state = chatsReducer(
    state,
    chatActions.chatCreated(createEmptyChat('chat-b', TEST_TIME)),
  );
  const [user, assistant] = makeTurn(queuedRun());
  const action = chatActions.requestAccepted({
    chatId: first.id,
    user,
    assistant,
  });
  state = chatsReducer(state, action);
  expect(state.byId[first.id]?.messages).toEqual([user, assistant]);
  expect(state.byId[first.id]?.draft).toBe('');
  expect(state.byId[first.id]?.title).toBe(user.text);
  expect(state.byId[first.id]?.lastQuestionAt).toBe(user.createdAt);
  expect(state.order).toEqual(['chat-a', 'chat-b']);
  expect(chatsReducer(state, action)).toBe(state);
});

it.each<{ reason: string; changes: Partial<AssistantMessage> }>([
  {
    reason: 'replyToMessageId points to another question',
    changes: { replyToMessageId: 'another-user' },
  },
  { reason: 'message IDs are identical', changes: { id: 'user-new' } },
  {
    reason: 'response already contains text',
    changes: { text: 'unexpected text' },
  },
  {
    reason: 'response already contains an image',
    changes: { imageSrc: 'assets/example.png' },
  },
  {
    reason: 'response is processing',
    changes: {
      run: {
        ...queuedRun(),
        status: 'processing',
        phase: { kind: 'analyzing' },
      },
    },
  },
  {
    reason: 'response is streaming',
    changes: { run: { ...queuedRun(), status: 'streaming' } },
  },
  {
    reason: 'response is completed',
    changes: {
      run: { ...queuedRun(), status: 'completed', finishedAt: TEST_TIME },
    },
  },
  {
    reason: 'response is failed',
    changes: {
      run: {
        ...queuedRun(),
        status: 'failed',
        finishedAt: TEST_TIME,
        error: { code: 'unknown', retryable: true },
      },
    },
  },
  {
    reason: 'response is cancelled',
    changes: {
      run: { ...queuedRun(), status: 'cancelled', finishedAt: TEST_TIME },
    },
  },
  {
    reason: 'response is interrupted',
    changes: {
      run: {
        ...queuedRun(),
        status: 'interrupted',
        finishedAt: TEST_TIME,
        reason: 'reload',
      },
    },
  },
])(
  'rejects an invalid request pair without any state changes: $reason',
  ({ changes }) => {
    const chat = createEmptyChat('a', TEST_TIME);
    chat.draft = 'keep this draft';
    let state = createInitialChatsState(chat);
    state = chatsReducer(
      state,
      chatActions.chatCreated(createEmptyChat('b', TEST_TIME)),
    );
    const before = structuredClone(state);
    const [user, assistant] = makeTurn(queuedRun('new-run'), '', 'new');
    const next = chatsReducer(
      state,
      chatActions.requestAccepted({
        chatId: chat.id,
        user,
        assistant: { ...assistant, ...changes },
      }),
    );
    expect(next).toBe(state);
    expect(next).toEqual(before);
  },
);

it('preserves existing history and metadata when rejecting an unrelated response', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  chat.title = 'Existing title';
  chat.lastQuestionAt = TEST_TIME;
  chat.draft = 'keep this draft';
  chat.messages = makeTurn(
    { ...queuedRun(), status: 'completed', finishedAt: TEST_TIME },
    'past answer',
  );
  let state = createInitialChatsState(chat);
  state = chatsReducer(
    state,
    chatActions.chatCreated(createEmptyChat('b', TEST_TIME)),
  );
  const before = structuredClone(state);
  const [user, assistant] = makeTurn(queuedRun('new-run'), '', 'new');
  assistant.replyToMessageId = 'user-1';
  const next = chatsReducer(
    state,
    chatActions.requestAccepted({ chatId: chat.id, user, assistant }),
  );
  expect(next).toBe(state);
  expect(next).toEqual(before);
});

describe('event state machine', () => {
  it('fails a calculator result with a different callId while using the tool', () => {
    const state = pendingState();
    lastAssistant(state.byId['chat-a']).run = {
      ...queuedRun(),
      status: 'processing',
      phase: {
        kind: 'using_tool',
        tool: 'calculator',
        callId: 'expected-call',
      },
    };
    const next = chatsReducer(
      state,
      chatActions.agentEventReceived(
        eventFor(pendingMeta, {
          type: 'tool_result',
          tool: 'calculator',
          callId: 'another-call',
          output: { value: 408 },
        }),
      ),
    );
    expect(lastAssistant(next.byId['chat-a'])).toMatchObject({
      text: '',
      run: {
        status: 'failed',
        error: { code: 'protocol_error', retryable: true },
        finishedAt: TEST_TIME,
      },
    });
    expect(lastAssistant(next.byId['chat-a']).run).not.toHaveProperty('phase');
  });

  it.each<Run>([
    queuedRun(),
    { ...queuedRun(), status: 'processing', phase: { kind: 'analyzing' } },
    { ...queuedRun(), status: 'processing', phase: { kind: 'composing' } },
    {
      ...queuedRun(),
      status: 'processing',
      phase: { kind: 'using_tool', tool: 'calculator', callId: 'pending-call' },
    },
    { ...queuedRun(), status: 'streaming' },
  ])('rejects image_received outside preparing_image (%#)', (run) => {
    const state = pendingState();
    const assistant = lastAssistant(state.byId['chat-a']);
    assistant.run = run;
    assistant.text = run.status === 'streaming' ? 'partial' : '';
    const next = chatsReducer(
      state,
      chatActions.agentEventReceived(
        eventFor(pendingMeta, {
          type: 'image_received',
          imageSrc: 'assets/example.png',
        }),
      ),
    );
    expect(lastAssistant(next.byId['chat-a'])).toMatchObject({
      text: assistant.text,
      imageSrc: null,
      run: {
        status: 'failed',
        error: { code: 'protocol_error', retryable: true },
      },
    });
  });

  it('matches tool calls, accumulates text and locks the completed response', () => {
    let state = pendingState();
    const events: AgentEventData[] = [
      { type: 'started' },
      {
        type: 'tool_call',
        callId: 'call',
        tool: 'calculator',
        input: { operation: 'multiply', left: 17, right: 24 },
      },
      {
        type: 'tool_result',
        callId: 'call',
        tool: 'calculator',
        output: { value: 408 },
      },
      { type: 'text_delta', text: '40' },
      { type: 'text_delta', text: '8' },
      { type: 'completed' },
    ];
    for (const event of events)
      state = chatsReducer(
        state,
        chatActions.agentEventReceived(eventFor(pendingMeta, event)),
      );
    expect(lastAssistant(state.byId['chat-a']).text).toBe('408');
    expect(lastAssistant(state.byId['chat-a']).run.status).toBe('completed');
    expect(
      chatsReducer(
        state,
        chatActions.agentEventReceived(
          eventFor(pendingMeta, { type: 'text_delta', text: 'late' }),
        ),
      ),
    ).toBe(state);
  });

  it('keeps a ready image and partial text on failure, then resets only the attempted response on retry', () => {
    let state = pendingState();
    const events: AgentEventData[] = [
      { type: 'started' },
      { type: 'phase_changed', phase: 'preparing_image' },
      { type: 'image_received', imageSrc: 'assets/example.png' },
      { type: 'text_delta', text: 'partial' },
      {
        type: 'error',
        error: { code: 'demo_partial_failure', retryable: true },
      },
    ];
    for (const event of events)
      state = chatsReducer(
        state,
        chatActions.agentEventReceived(eventFor(pendingMeta, event)),
      );
    expect(lastAssistant(state.byId['chat-a'])).toMatchObject({
      text: 'partial',
      imageSrc: 'assets/example.png',
      run: {
        status: 'failed',
        error: { code: 'demo_partial_failure', retryable: true },
      },
    });
    state = chatsReducer(
      state,
      chatActions.draftChanged({ chatId: 'chat-a', draft: 'next question' }),
    );
    state = chatsReducer(
      state,
      chatActions.retryAccepted({
        ...pendingMeta,
        run: { ...queuedRun('run-2'), attempt: 2 },
      }),
    );
    const message = lastAssistant(state.byId['chat-a']);
    expect(message).toMatchObject({
      id: 'assistant-1',
      text: '',
      imageSrc: null,
      run: { id: 'run-2', status: 'queued', attempt: 2 },
    });
    expect(state.byId['chat-a']?.messages).toHaveLength(2);
    expect(state.byId['chat-a']?.draft).toBe('next question');
    expect(
      chatsReducer(
        state,
        chatActions.agentEventReceived(
          eventFor(pendingMeta, { type: 'text_delta', text: 'old' }),
        ),
      ),
    ).toBe(state);
  });

  it.each<AgentEventData[]>([
    [{ type: 'text_delta', text: 'before started' }],
    [{ type: 'started' }, { type: 'started' }],
    [{ type: 'started' }, { type: 'completed' }],
    [
      { type: 'started' },
      {
        type: 'tool_result',
        tool: 'calculator',
        callId: 'missing',
        output: { value: 1 },
      },
    ],
    [
      { type: 'started' },
      { type: 'phase_changed', phase: 'preparing_image' },
      { type: 'image_received', imageSrc: '/assets/root.png' },
    ],
  ])('fails an invalid current-run transition (%#)', (...events) => {
    let state = pendingState();
    for (const event of events)
      state = chatsReducer(
        state,
        chatActions.agentEventReceived(eventFor(pendingMeta, event)),
      );
    expect(lastAssistant(state.byId['chat-a']).run).toMatchObject({
      status: 'failed',
      error: { code: 'protocol_error' },
    });
  });

  it('ignores a missing chat, wrong assistant or stale run', () => {
    const state = pendingState();
    for (const meta of [
      { ...pendingMeta, chatId: 'deleted' },
      { ...pendingMeta, assistantMessageId: 'wrong' },
      { ...pendingMeta, runId: 'old' },
    ]) {
      expect(
        chatsReducer(
          state,
          chatActions.agentEventReceived(eventFor(meta, { type: 'started' })),
        ),
      ).toBe(state);
    }
  });
});

it.each([
  { selected: 'a', removed: 'a', expected: 'b' },
  { selected: 'c', removed: 'c', expected: 'b' },
  { selected: 'c', removed: 'a', expected: 'c' },
])(
  'selects the proper neighbor after deleting $removed',
  ({ selected, removed, expected }) => {
    const state = {
      byId: Object.fromEntries(
        ['a', 'b', 'c'].map((id) => [id, createEmptyChat(id, TEST_TIME)]),
      ),
      order: ['a', 'b', 'c'],
      selectedChatId: selected,
    };
    const next = chatsReducer(
      state,
      chatActions.chatDeleted({ chatId: removed, replacement: null }),
    );
    expect(next.selectedChatId).toBe(expected);
    expect(next.byId[removed]).toBeUndefined();
  },
);

it('replaces the last deleted chat atomically and ignores its late events', () => {
  const state = chatsReducer(
    pendingState(),
    chatActions.chatDeleted({
      chatId: 'chat-a',
      replacement: createEmptyChat('new', TEST_TIME),
    }),
  );
  expect(state.order).toEqual(['new']);
  expect(state.selectedChatId).toBe('new');
  expect(
    chatsReducer(
      state,
      chatActions.agentEventReceived(
        eventFor(pendingMeta, { type: 'started' }),
      ),
    ),
  ).toBe(state);
});

it('keeps sidebar metadata stable across text deltas', () => {
  let chats = chatsReducer(
    pendingState(),
    chatActions.agentEventReceived(eventFor(pendingMeta, { type: 'started' })),
  );
  const metadata = selectChatRowMetadata({ chats }, 'chat-a');
  chats = chatsReducer(
    chats,
    chatActions.agentEventReceived(
      eventFor(pendingMeta, { type: 'text_delta', text: 'part' }),
    ),
  );
  expect(selectChatRowMetadata({ chats }, 'chat-a')).toBe(metadata);
});
