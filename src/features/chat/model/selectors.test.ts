import { expect, it } from 'vitest';
import { makeTurn, queuedRun, TEST_TIME } from '@/test/fixtures';
import { createEmptyChat, createInitialChatsState } from './helpers';
import type { Run } from './types';
import { chatsReducer, chatActions } from './chatsSlice';
import {
  selectActiveRun,
  selectAgentStatusLabel,
  selectCanRetry,
  selectCanSend,
  selectChatMessages,
  selectChatSuggestions,
  selectChatRowMetadata,
  selectOrderedChatIds,
  selectSelectedChat,
} from './selectors';

const baseRun = queuedRun();
const runCases: { run: Run; active: boolean; retry: boolean }[] = [
  { run: baseRun, active: true, retry: false },
  {
    run: { ...baseRun, status: 'processing', phase: { kind: 'analyzing' } },
    active: true,
    retry: false,
  },
  { run: { ...baseRun, status: 'streaming' }, active: true, retry: false },
  {
    run: { ...baseRun, status: 'completed', finishedAt: TEST_TIME },
    active: false,
    retry: false,
  },
  {
    run: {
      ...baseRun,
      status: 'failed',
      finishedAt: TEST_TIME,
      error: { code: 'demo_failure', retryable: true },
    },
    active: false,
    retry: true,
  },
  {
    run: {
      ...baseRun,
      status: 'failed',
      finishedAt: TEST_TIME,
      error: { code: 'demo_failure', retryable: false },
    },
    active: false,
    retry: false,
  },
  {
    run: { ...baseRun, status: 'cancelled', finishedAt: TEST_TIME },
    active: false,
    retry: true,
  },
  {
    run: {
      ...baseRun,
      status: 'interrupted',
      finishedAt: TEST_TIME,
      reason: 'reload',
    },
    active: false,
    retry: true,
  },
];

it.each(runCases)(
  'derives send/retry eligibility for $run.status (retry: $retry)',
  ({ run, active, retry }) => {
    const chat = createEmptyChat('a', TEST_TIME);
    const turn = makeTurn(
      run,
      active && run.status !== 'streaming' ? '' : 'previous answer',
    );
    chat.messages = turn;
    chat.draft = 'next question';
    const state = { chats: createInitialChatsState(chat) };
    expect(selectActiveRun(state, chat.id)).toBe(active ? run : null);
    expect(selectCanSend(state, chat.id)).toBe(!active);
    expect(selectCanRetry(state, chat.id, turn[1].id)).toBe(retry);
    expect(selectCanRetry(state, chat.id, 'nonexistent-message')).toBe(false);
  },
);

it.each([
  { draft: '', allowed: false },
  { draft: ' \n\t ', allowed: false },
  { draft: 'x'.repeat(4001), allowed: false },
  { draft: ' '.repeat(4000) + 'x', allowed: false },
  { draft: 'x'.repeat(4000), allowed: true },
  { draft: '  first\nsecond  ', allowed: true },
])('validates the draft before enabling send (%#)', ({ draft, allowed }) => {
  const chat = createEmptyChat('a', TEST_TIME);
  chat.draft = draft;
  const state = { chats: createInitialChatsState(chat) };
  expect(selectCanSend(state, chat.id)).toBe(allowed);
  expect(chat.draft).toBe(draft);
  expect(selectCanRetry(state, chat.id, 'nonexistent-message')).toBe(false);
});

it.each([
  queuedRun('next-run'),
  {
    ...queuedRun('next-run'),
    status: 'completed',
    finishedAt: TEST_TIME,
  } as const,
])(
  'hides retry on an older failed response after a new question (%#)',
  (run) => {
    const chat = createEmptyChat('a', TEST_TIME);
    const previous = makeTurn(
      {
        ...baseRun,
        status: 'failed',
        finishedAt: TEST_TIME,
        error: { code: 'demo_failure', retryable: true },
      },
      'partial',
      'old',
    );
    chat.messages = [
      ...previous,
      ...makeTurn(run, run.status === 'completed' ? 'new answer' : '', 'new'),
    ];
    const state = { chats: createInitialChatsState(chat) };
    expect(selectCanRetry(state, chat.id, previous[1].id)).toBe(false);
  },
);

it('allows sending in another chat while a background response is active', () => {
  const background = createEmptyChat('a', TEST_TIME);
  background.messages = makeTurn({ ...baseRun, status: 'streaming' });
  background.draft = 'queued draft';
  const selected = createEmptyChat('b', TEST_TIME);
  selected.draft = 'another question';
  const chats = createInitialChatsState(background);
  chats.byId[selected.id] = selected;
  chats.order.push(selected.id);
  chats.selectedChatId = selected.id;
  expect(selectCanSend({ chats }, background.id)).toBe(false);
  expect(selectCanSend({ chats }, selected.id)).toBe(true);
});

it.each(['constructor', 'toString', '__proto__', 'missing'])(
  'returns safe empty values for a nonexistent chat: %s',
  (chatId) => {
    const chats = createInitialChatsState(
      createEmptyChat('existing', TEST_TIME),
    );
    const state = { chats };
    expect(selectSelectedChat(state)).toBe(chats.byId.existing);
    expect(selectChatMessages(state, chatId)).toEqual([]);
    expect(selectChatSuggestions(state, chatId)).toEqual([]);
    expect(selectChatMessages(state, chatId)).toBe(
      selectChatMessages(state, 'another-missing-id'),
    );
    expect(selectActiveRun(state, chatId)).toBeNull();
    expect(selectCanSend(state, chatId)).toBe(false);
    expect(selectCanRetry(state, chatId, 'missing-message')).toBe(false);
    expect(selectChatRowMetadata(state, chatId)).toBeNull();
    expect(selectAgentStatusLabel(state, chatId)).toBeNull();
    expect(selectOrderedChatIds(state)).toEqual(['existing']);
    expect(
      selectSelectedChat({ chats: { ...chats, selectedChatId: chatId } }),
    ).toBeUndefined();
  },
);

function completedQuestion(prompt: string, suffix = '1') {
  const turn = makeTurn(
    {
      ...queuedRun(`run-${suffix}`),
      status: 'completed',
      finishedAt: TEST_TIME,
    },
    'answer does not define context',
    suffix,
  );
  turn[0].text = prompt;
  return turn;
}

it('derives the latest suggestions per chat and does not subscribe to draft or other chat changes', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  chat.messages = completedQuestion('Объясни второй закон Ньютона');
  const chats = createInitialChatsState(chat);
  const first = selectChatSuggestions({ chats }, chat.id);
  expect(first).toEqual([
    'Объясни проще',
    'Покажи схему',
    'Приведи пример из жизни',
  ]);
  const withDraft = chatsReducer(
    chats,
    chatActions.draftChanged({ chatId: chat.id, draft: 'typed' }),
  );
  expect(selectChatSuggestions({ chats: withDraft }, chat.id)).toBe(first);
  const second = createEmptyChat('b', TEST_TIME);
  second.messages = completedQuestion('Помоги решить уравнение', 'b');
  const switched = chatsReducer(withDraft, chatActions.chatCreated(second));
  expect(selectChatSuggestions({ chats: switched }, second.id)).toEqual([
    'Дальше',
    'Почему нужно раскрывать скобки?',
  ]);
  expect(selectChatSuggestions({ chats: switched }, chat.id)).toBe(first);
});

it.each(runCases.filter(({ run }) => run.status !== 'completed'))(
  'hides previous suggestions while the latest response is $run.status',
  ({ run }) => {
    const chat = createEmptyChat('a', TEST_TIME);
    chat.messages = [
      ...completedQuestion('Объясни второй закон Ньютона'),
      ...makeTurn(run, 'partial', 'current'),
    ];
    expect(
      selectChatSuggestions({ chats: createInitialChatsState(chat) }, chat.id),
    ).toEqual([]);
  },
);

it('hides suggestions as soon as a new user question appears', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  chat.messages = [
    ...completedQuestion('Объясни второй закон Ньютона'),
    { id: 'new-user', createdAt: TEST_TIME, role: 'user', text: 'Anything' },
  ];
  expect(
    selectChatSuggestions({ chats: createInitialChatsState(chat) }, chat.id),
  ).toEqual([]);
});

it('restores current suggestions from JSON, excludes unsuccessful pairs and preserves progress through fallback', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  const failed = makeTurn(
    {
      ...queuedRun('failed'),
      status: 'failed',
      finishedAt: TEST_TIME,
      error: { code: 'demo_failure', retryable: true },
    },
    'partial',
    'failed',
  );
  failed[0].text = 'Проще';
  chat.messages = [
    ...completedQuestion('Объясни второй закон Ньютона'),
    ...failed,
    ...completedQuestion('Покажи схему', 'diagram'),
    ...completedQuestion('Неизвестный вопрос', 'fallback'),
  ];
  const state = { chats: createInitialChatsState(chat) };
  const restored = JSON.parse(JSON.stringify(state));
  expect(selectChatSuggestions(restored, chat.id)).toEqual([
    'Объясни проще',
    'Приведи пример из жизни',
  ]);
  expect(state.chats.byId.a?.messages).toHaveLength(8);
  expect(Object.keys(state.chats.byId.a ?? {})).not.toContain('suggestions');
});

it('keeps used equation questions hidden across fallback, JSON restoration and chat switching', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  chat.messages = [
    ...completedQuestion('Помоги решить уравнение', 'start'),
    ...completedQuestion('Почему нужно раскрывать скобки?', 'why'),
    ...completedQuestion('Новый вопрос', 'fallback'),
  ];
  const second = createEmptyChat('b', TEST_TIME);
  second.messages = completedQuestion('Помоги решить уравнение', 'second');
  const chats = createInitialChatsState(chat);
  chats.byId.b = second;
  chats.order.push('b');
  chats.selectedChatId = 'b';
  const state = JSON.parse(JSON.stringify({ chats }));
  expect(selectChatSuggestions(state, chat.id)).toEqual(['Дальше']);
  expect(selectChatSuggestions(state, second.id)).toEqual([
    'Дальше',
    'Почему нужно раскрывать скобки?',
  ]);
  const switched = {
    chats: chatsReducer(state.chats, chatActions.chatSelected(chat.id)),
  };
  expect(selectChatSuggestions(switched, chat.id)).toEqual(['Дальше']);
  const next = completedQuestion('Дальше', 'next');
  const advanced = {
    chats: {
      ...chats,
      byId: {
        ...chats.byId,
        a: { ...chat, messages: [...chat.messages, ...next] },
      },
    },
  };
  expect(selectChatSuggestions(advanced, chat.id)).toEqual([
    'Дальше',
    'Почему −12 + 5 = −7?',
  ]);
});

it.each(
  runCases.filter(({ run }) =>
    ['failed', 'cancelled', 'interrupted'].includes(run.status),
  ),
)(
  'does not consume a question after $run.status, even when a later fallback succeeds',
  ({ run }) => {
    const chat = createEmptyChat('a', TEST_TIME);
    const incomplete = makeTurn(run, 'partial', 'incomplete');
    incomplete[0].text = 'Почему нужно раскрывать скобки?';
    chat.messages = [
      ...completedQuestion('Помоги решить уравнение'),
      ...incomplete,
      ...completedQuestion('Новый вопрос', 'fallback'),
    ];
    expect(
      selectChatSuggestions({ chats: createInitialChatsState(chat) }, chat.id),
    ).toEqual(['Дальше', 'Почему нужно раскрывать скобки?']);
  },
);

it.each(['constructor', 'toString', '__proto__'])(
  'reads an existing own chat without rejecting its ID: %s',
  (chatId) => {
    const chat = createEmptyChat(chatId, TEST_TIME);
    chat.draft = 'question';
    const state = { chats: createInitialChatsState(chat) };
    expect(selectSelectedChat(state)).toBe(chat);
    expect(selectCanSend(state, chatId)).toBe(true);
    expect(selectChatMessages(state, chatId)).toBe(chat.messages);
    expect(selectChatRowMetadata(state, chatId)).toEqual({
      id: chatId,
      title: chat.title,
      isActive: false,
      hasError: false,
      hasUnreadReply: false,
    });
  },
);
