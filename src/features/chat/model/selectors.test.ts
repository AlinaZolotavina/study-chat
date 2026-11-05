import { expect, it } from 'vitest';
import { makeTurn, queuedRun, TEST_TIME } from '@/test/fixtures';
import { createEmptyChat, createInitialChatsState } from './helpers';
import type { Run } from './types';
import {
  selectActiveRun,
  selectAgentStatusLabel,
  selectCanRetry,
  selectCanSend,
  selectChatMessages,
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
    });
  },
);
