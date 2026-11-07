import { expect, it } from 'vitest';
import {
  createEmptyChat,
  createInitialChatsState,
} from '@/features/chat/model/helpers';
import { makeTurn, queuedRun, TEST_TIME } from '@/test/fixtures';
import { isChatsState } from './validation';

it.each(['constructor', 'toString', '__proto__', 'ordinary-id'])(
  'accepts only actual own chat IDs: %s',
  (id) => {
    expect(
      isChatsState(createInitialChatsState(createEmptyChat(id, TEST_TIME))),
    ).toBe(true);
    const state = createInitialChatsState(createEmptyChat('a', TEST_TIME));
    state.selectedChatId = id;
    expect(isChatsState(state)).toBe(false);
  },
);

it('rejects inconsistent chat IDs, order, drafts and message arrays', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  const valid = createInitialChatsState(chat);
  const invalid: unknown[] = [
    { ...valid, order: ['a', 'a'] },
    { ...valid, order: ['missing'] },
    { ...valid, byId: { a: { ...chat, id: 'another' } } },
    { ...valid, byId: { a: { ...chat, draft: null } } },
    { ...valid, byId: { a: { ...chat, unreadRunId: 42 } } },
    { ...valid, byId: { a: { ...chat, messages: {} } } },
    { ...valid, byId: { a: { ...chat, createdAt: 'not-a-date' } } },
  ];
  for (const state of invalid) expect(isChatsState(state)).toBe(false);
});

it('rejects unsafe message/run fields instead of partially restoring them', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  const [user, assistant] = makeTurn(queuedRun());
  const invalid: unknown[] = [
    { ...assistant, text: null },
    { ...assistant, replyToMessageId: null },
    { ...assistant, imageSrc: 'https://example.com/image.png' },
    { ...assistant, imageAlt: 'alt without an image' },
    { ...assistant, imageSrc: 'assets/example.png', imageAlt: ' ' },
    { ...assistant, imageSrc: 'assets/example.png', imageAlt: 42 },
    { ...assistant, run: null },
    { ...assistant, run: { ...queuedRun(), attempt: 0 } },
    { ...assistant, run: { ...queuedRun(), expanded: 'true' } },
    { ...assistant, run: { ...queuedRun(), actions: null } },
    {
      ...assistant,
      run: {
        ...queuedRun(),
        actions: [{ id: 'action', kind: 'secret', completedAt: TEST_TIME }],
      },
    },
    {
      ...assistant,
      run: {
        ...queuedRun(),
        actions: [
          { id: 'action', kind: 'analyzed', completedAt: 'invalid-date' },
        ],
      },
    },
    {
      ...assistant,
      run: {
        ...queuedRun(),
        actions: [
          { id: 'same', kind: 'analyzed', completedAt: TEST_TIME },
          { id: 'same', kind: 'analyzed', completedAt: TEST_TIME },
        ],
      },
    },
    {
      ...assistant,
      run: { ...queuedRun(), status: 'processing', phase: null },
    },
    {
      ...assistant,
      run: {
        ...queuedRun(),
        status: 'processing',
        phase: { kind: 'using_tool', tool: 'unknown', callId: 'call' },
      },
    },
    {
      ...assistant,
      run: {
        ...queuedRun(),
        status: 'failed',
        finishedAt: TEST_TIME,
        error: { code: 'timeout', retryable: 'yes' },
      },
    },
    {
      ...assistant,
      run: {
        ...queuedRun(),
        status: 'interrupted',
        finishedAt: TEST_TIME,
        reason: 'unknown',
      },
    },
  ];
  for (const message of invalid)
    expect(
      isChatsState({
        byId: { a: { ...chat, messages: [user, message] } },
        order: ['a'],
        selectedChatId: 'a',
      }),
    ).toBe(false);
});
