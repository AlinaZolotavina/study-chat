import { expect, it, vi } from 'vitest';
import {
  createEmptyChat,
  createInitialChatsState,
} from '@/features/chat/model/helpers';
import type { Run } from '@/features/chat/model/types';
import {
  selectCanRetry,
  selectChatSuggestions,
} from '@/features/chat/model/selectors';
import { lastAssistant, makeTurn, queuedRun, TEST_TIME } from '@/test/fixtures';
import { loadChats, restoreInterrupted, STORAGE_KEY } from './chatStorage';

const RESTORED_AT = '2026-11-06T12:00:00.000Z';
const base = queuedRun();
const activeRuns: Run[] = [
  base,
  { ...base, status: 'processing', phase: { kind: 'analyzing' } },
  {
    ...base,
    status: 'processing',
    phase: { kind: 'using_tool', tool: 'calculator', callId: 'tool-1' },
  },
  { ...base, status: 'processing', phase: { kind: 'preparing_image' } },
  { ...base, status: 'streaming' },
];

it('restores a consumed equation question from history without adding serialized usage fields', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  const start = makeTurn(
    { ...queuedRun('start'), status: 'completed', finishedAt: TEST_TIME },
    'equation',
    'start',
  );
  start[0].text = 'Помоги решить уравнение';
  const explanation = makeTurn(
    { ...queuedRun('why'), status: 'completed', finishedAt: TEST_TIME },
    'details',
    'why',
  );
  explanation[0].text = 'Почему нужно раскрывать скобки?';
  chat.messages = [...start, ...explanation];
  chat.draft = 'keep draft';
  const raw = JSON.stringify(createInitialChatsState(chat));
  const restored = loadChats(
    () => ({ getItem: () => raw, setItem: vi.fn() }),
    () => RESTORED_AT,
  );
  if (!restored.ok || !restored.chats)
    throw new Error('Expected restored chats');
  expect(selectChatSuggestions({ chats: restored.chats }, chat.id)).toEqual([
    'Дальше',
  ]);
  expect(restored.chats.byId.a?.messages).toHaveLength(4);
  expect(restored.chats.byId.a?.draft).toBe('keep draft');
  expect(raw).not.toContain('questionAnswered');
});

it('recomputes current suggestions after reload and hides them for interrupted responses', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  const first = makeTurn(
    { ...queuedRun('first'), status: 'completed', finishedAt: TEST_TIME },
    'Newton explanation',
    'first',
  );
  first[0].text = 'Объясни второй закон Ньютона';
  const diagram = makeTurn(
    { ...queuedRun('diagram'), status: 'completed', finishedAt: TEST_TIME },
    'Diagram caption',
    'diagram',
  );
  diagram[0].text = 'Покажи схему';
  diagram[1].imageSrc = 'assets/newtons-2nd-law-of-motion.png';
  chat.messages = [...first, ...diagram];
  const storage = {
    getItem: () => JSON.stringify(createInitialChatsState(chat)),
    setItem: vi.fn(),
  };
  const load = () =>
    loadChats(
      () => storage,
      () => RESTORED_AT,
    );
  const completed = load();
  expect(completed.ok).toBe(true);
  if (!completed.ok || !completed.chats)
    throw new Error('Expected restored chats');
  expect(selectChatSuggestions({ chats: completed.chats }, chat.id)).toEqual([
    'Объясни проще',
    'Приведи пример из жизни',
  ]);
  diagram[1].run = { ...queuedRun('diagram'), status: 'streaming' };
  const active = load();
  if (!active.ok || !active.chats)
    throw new Error('Expected interrupted chats');
  expect(lastAssistant(active.chats.byId.a).run.status).toBe('interrupted');
  expect(selectChatSuggestions({ chats: active.chats }, chat.id)).toEqual([]);
  expect(storage.setItem).not.toHaveBeenCalled();
});

it.each(activeRuns)(
  'restores $status without losing IDs, text, image or draft (%#)',
  (run) => {
    const chat = createEmptyChat('a', TEST_TIME);
    chat.draft = 'keep draft';
    const turn = makeTurn(run, 'partial');
    turn[1].imageSrc = 'assets/newtons-2nd-law-of-motion.png';
    chat.messages = turn;
    const state = createInitialChatsState(chat);
    const before = structuredClone(state);
    const restored = restoreInterrupted(state, () => RESTORED_AT);
    expect(restored.changed).toBe(true);
    expect(lastAssistant(restored.chats.byId.a)).toEqual({
      ...turn[1],
      run: {
        id: run.id,
        attempt: run.attempt,
        acceptedAt: run.acceptedAt,
        status: 'interrupted',
        reason: 'reload',
        finishedAt: RESTORED_AT,
      },
    });
    expect(restored.chats.byId.a?.draft).toBe('keep draft');
    expect(selectCanRetry({ chats: restored.chats }, 'a', turn[1].id)).toBe(
      true,
    );
    expect(state).toEqual(before);
  },
);

it('restores active responses in all chats using one bootstrap timestamp', () => {
  const first = createEmptyChat('a', TEST_TIME);
  first.messages = makeTurn(base);
  const second = createEmptyChat('__proto__', TEST_TIME);
  second.messages = makeTurn(
    { ...base, id: 'run-b', status: 'streaming' },
    'partial',
    'b',
  );
  const state = {
    byId: { [first.id]: first, [second.id]: second },
    order: [second.id, first.id],
    selectedChatId: second.id,
  };
  const now = vi.fn(() => RESTORED_AT);
  const restored = restoreInterrupted(state, now);
  expect(now).toHaveBeenCalledOnce();
  expect(restored.chats.order).toEqual(state.order);
  expect(restored.chats.selectedChatId).toBe('__proto__');
  expect(Object.hasOwn(restored.chats.byId, '__proto__')).toBe(true);
  expect(lastAssistant(restored.chats.byId.a).run.status).toBe('interrupted');
  expect(lastAssistant(restored.chats.byId['__proto__']).run.status).toBe(
    'interrupted',
  );
});

it.each<Run>([
  { ...base, status: 'completed', finishedAt: TEST_TIME },
  { ...base, status: 'cancelled', finishedAt: TEST_TIME },
  {
    ...base,
    status: 'failed',
    finishedAt: TEST_TIME,
    error: { code: 'timeout', retryable: true },
  },
  { ...base, status: 'interrupted', finishedAt: TEST_TIME, reason: 'reload' },
])('does not rewrite a terminal $status response', (run) => {
  const chat = createEmptyChat('a', TEST_TIME);
  chat.messages = makeTurn(run, 'result');
  const state = createInitialChatsState(chat);
  const now = vi.fn(() => RESTORED_AT);
  expect(restoreInterrupted(state, now)).toEqual({
    chats: state,
    changed: false,
  });
  expect(now).not.toHaveBeenCalled();
});

it('reads one key and keeps a valid saved conversation unchanged', () => {
  const chat = createEmptyChat('a', TEST_TIME);
  chat.draft = 'next draft';
  chat.messages = makeTurn(
    { ...base, status: 'completed', finishedAt: TEST_TIME },
    'answer',
  );
  const state = createInitialChatsState(chat);
  const storage = {
    getItem: vi.fn(() => JSON.stringify(state)),
    setItem: vi.fn(),
  };
  expect(
    loadChats(
      () => storage,
      () => RESTORED_AT,
    ),
  ).toEqual({ ok: true, storage, chats: state, needsSave: false });
  expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(STORAGE_KEY);
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('distinguishes a missing key from malformed data', () => {
  const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
  expect(
    loadChats(
      () => storage,
      () => RESTORED_AT,
    ),
  ).toEqual({ ok: true, storage, chats: null, needsSave: true });
  expect(storage.setItem).not.toHaveBeenCalled();
});

it.each([
  '',
  '{',
  'null',
  '[]',
  '{}',
  '{"byId":{},"order":[],"selectedChatId":"missing"}',
])('does not repair or overwrite unreadable data: %s', (raw) => {
  const storage = { getItem: vi.fn(() => raw), setItem: vi.fn() };
  expect(
    loadChats(
      () => storage,
      () => RESTORED_AT,
    ),
  ).toEqual({ ok: false });
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('handles both an inaccessible storage getter and a failed read', () => {
  expect(
    loadChats(
      () => {
        throw new Error('blocked');
      },
      () => RESTORED_AT,
    ),
  ).toEqual({ ok: false });
  const storage = {
    getItem: vi.fn(() => {
      throw new Error('blocked');
    }),
    setItem: vi.fn(),
  };
  expect(
    loadChats(
      () => storage,
      () => RESTORED_AT,
    ),
  ).toEqual({ ok: false });
  expect(storage.setItem).not.toHaveBeenCalled();
});
