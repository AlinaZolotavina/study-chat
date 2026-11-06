import { expect, it } from 'vitest';
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
import { createEmptyChat } from './helpers';
import { selectChatRowMetadata } from './selectors';

function readyInBackground() {
  let chats = pendingState();
  chats = chatsReducer(
    chats,
    chatActions.chatCreated(createEmptyChat('chat-b', TEST_TIME)),
  );
  chats = chatsReducer(
    chats,
    chatActions.agentEventReceived(eventFor(pendingMeta, { type: 'started' })),
  );
  chats = chatsReducer(
    chats,
    chatActions.agentEventReceived(
      eventFor(pendingMeta, { type: 'text_delta', text: 'answer' }),
    ),
  );
  return chats;
}

it('marks a background completion unread until that chat is opened', () => {
  let chats = readyInBackground();
  expect(chats.byId['chat-a']?.unreadRunId).toBeUndefined();
  chats = chatsReducer(
    chats,
    chatActions.agentEventReceived(
      eventFor(pendingMeta, { type: 'completed' }),
    ),
  );
  expect(chats.byId['chat-a']?.unreadRunId).toBe(pendingMeta.runId);
  expect(selectChatRowMetadata({ chats }, 'chat-a')).toMatchObject({
    isActive: false,
    hasUnreadReply: true,
  });
  expect(chats.selectedChatId).toBe('chat-b');
  const before = chats;
  chats = chatsReducer(chats, chatActions.chatSelected('chat-a'));
  expect(chats.byId['chat-a']?.unreadRunId).toBeUndefined();
  expect(selectChatRowMetadata({ chats }, 'chat-a')?.hasUnreadReply).toBe(
    false,
  );
  expect(chats.byId['chat-b']).toBe(before.byId['chat-b']);
  expect(
    chatsReducer(
      chats,
      chatActions.agentEventReceived(
        eventFor(pendingMeta, { type: 'completed' }),
      ),
    ),
  ).toBe(chats);
});

it('does not mark a completion unread when the user is viewing that chat', () => {
  let chats = readyInBackground();
  chats = chatsReducer(chats, chatActions.chatSelected('chat-a'));
  chats = chatsReducer(
    chats,
    chatActions.agentEventReceived(
      eventFor(pendingMeta, { type: 'completed' }),
    ),
  );
  expect(lastAssistant(chats.byId['chat-a']).run.status).toBe('completed');
  expect(chats.byId['chat-a']?.unreadRunId).toBeUndefined();
  chats = chatsReducer(chats, chatActions.chatSelected('chat-b'));
  expect(selectChatRowMetadata({ chats }, 'chat-a')?.hasUnreadReply).toBe(
    false,
  );
});

it.each(['error', 'stop', 'invalid_completion', 'stale_completion'] as const)(
  'does not mark a new unread reply after %s',
  (outcome) => {
    let chats = readyInBackground();
    if (outcome === 'error')
      chats = chatsReducer(
        chats,
        chatActions.agentEventReceived(
          eventFor(pendingMeta, {
            type: 'error',
            error: { code: 'demo_failure', retryable: true },
          }),
        ),
      );
    if (outcome === 'stop')
      chats = chatsReducer(
        chats,
        chatActions.runCancelled({
          chatId: 'chat-a',
          runId: pendingMeta.runId,
          at: TEST_TIME,
        }),
      );
    if (outcome === 'invalid_completion') {
      const chat = chats.byId['chat-a'];
      if (!chat) throw new Error('Missing chat');
      chats = {
        ...chats,
        byId: {
          ...chats.byId,
          'chat-a': { ...chat, messages: makeTurn(queuedRun()) },
        },
      };
    }
    chats = chatsReducer(
      chats,
      chatActions.agentEventReceived(
        eventFor(
          outcome === 'stale_completion'
            ? { ...pendingMeta, runId: 'previous-run' }
            : pendingMeta,
          { type: 'completed' },
        ),
      ),
    );
    expect(chats.byId['chat-a']?.unreadRunId).toBeUndefined();
  },
);

it('marks a successful background Retry with its new run ID', () => {
  let chats = readyInBackground();
  chats = chatsReducer(
    chats,
    chatActions.runCancelled({
      chatId: 'chat-a',
      runId: pendingMeta.runId,
      at: TEST_TIME,
    }),
  );
  chats = chatsReducer(
    chats,
    chatActions.retryAccepted({
      chatId: 'chat-a',
      assistantMessageId: pendingMeta.assistantMessageId,
      run: { ...queuedRun('retry'), attempt: 2 },
    }),
  );
  const retry = { ...pendingMeta, runId: 'retry' };
  for (const data of [
    { type: 'started' },
    { type: 'text_delta', text: 'retry answer' },
    { type: 'completed' },
  ] as const)
    chats = chatsReducer(
      chats,
      chatActions.agentEventReceived(eventFor(retry, data)),
    );
  expect(chats.byId['chat-a']?.unreadRunId).toBe('retry');
});

it('marks the automatically opened neighbor read after deleting the selected chat', () => {
  let chats = readyInBackground();
  chats = chatsReducer(
    chats,
    chatActions.agentEventReceived(
      eventFor(pendingMeta, { type: 'completed' }),
    ),
  );
  expect(chats.byId['chat-a']?.unreadRunId).toBe(pendingMeta.runId);
  chats = chatsReducer(
    chats,
    chatActions.chatDeleted({ chatId: 'chat-b', replacement: null }),
  );
  expect(chats.selectedChatId).toBe('chat-a');
  expect(chats.byId['chat-a']?.unreadRunId).toBeUndefined();
});
