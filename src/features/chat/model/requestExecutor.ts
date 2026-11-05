import type {
  Agent,
  AgentErrorCode,
  AgentEvent,
  AgentRequest,
} from '@/agent/types';
import { chatActions, type ChatAction } from './chatsSlice';
import {
  buildAgentHistory,
  canRetryMessage,
  getChatById,
  getLastAssistant,
  isActiveRun,
  REQUEST_TIMEOUT_MS,
  validateDraft,
} from './helpers';
import type {
  AssistantMessage,
  ChatsState,
  QueuedRun,
  UserMessage,
} from './types';

interface ExecutorOptions {
  agent: Agent;
  getState: () => ChatsState;
  dispatch: (action: ChatAction) => void;
  now: () => string;
  createId: () => string;
  timeoutMs?: number;
}

interface RunHandle {
  request: AgentRequest;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
  task?: Promise<void>;
}

function nextWithAbort(
  iterator: AsyncIterator<AgentEvent>,
  signal: AbortSignal,
) {
  return new Promise<IteratorResult<AgentEvent>>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    };
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      Promise.resolve(iterator.next()).then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    } catch (error) {
      signal.removeEventListener('abort', onAbort);
      reject(error);
    }
  });
}

function closeIterator(iterator: AsyncIterator<AgentEvent> | undefined) {
  try {
    // An iterator ignoring abort may never settle return(); it must not block cleanup.
    if (iterator?.return)
      void Promise.resolve(iterator.return()).catch(() => undefined);
  } catch {
    return;
  }
}

export function createRequestExecutor(options: ExecutorOptions) {
  const { agent, getState, dispatch, now, createId } = options;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const handles = new Map<string, RunHandle>();
  let disposed = false;

  function currentMessage(request: AgentRequest) {
    const chat = getChatById(getState(), request.chatId);
    const message = chat && getLastAssistant(chat.messages);
    return message?.id === request.assistantMessageId &&
      message.run.id === request.runId
      ? message
      : undefined;
  }

  function isCurrentActive(request: AgentRequest) {
    const message = currentMessage(request);
    return !!message && isActiveRun(message.run);
  }

  function fail(request: AgentRequest, code: AgentErrorCode) {
    if (isCurrentActive(request)) {
      dispatch(
        chatActions.agentEventReceived({
          chatId: request.chatId,
          assistantMessageId: request.assistantMessageId,
          runId: request.runId,
          at: now(),
          type: 'error',
          error: { code, retryable: true },
        }),
      );
    }
  }

  async function consume(handle: RunHandle) {
    const { request, controller } = handle;
    let iterator: AsyncIterator<AgentEvent> | undefined;
    try {
      iterator = agent(request, controller.signal)[Symbol.asyncIterator]();
      while (!controller.signal.aborted && isCurrentActive(request)) {
        const next = await nextWithAbort(iterator, controller.signal);
        if (controller.signal.aborted || !isCurrentActive(request)) break;
        if (next.done) {
          fail(request, 'unexpected_end');
          break;
        }
        const event = next.value;
        if (
          event.chatId !== request.chatId ||
          event.runId !== request.runId ||
          event.assistantMessageId !== request.assistantMessageId
        )
          continue;
        dispatch(chatActions.agentEventReceived(event));
      }
    } catch {
      if (!controller.signal.aborted) fail(request, 'unknown');
    } finally {
      clearTimeout(handle.timer);
      controller.abort();
      closeIterator(iterator);
      if (handles.get(request.runId) === handle) handles.delete(request.runId);
    }
  }

  function start(request: AgentRequest) {
    if (!isCurrentActive(request)) return false;
    const controller = new AbortController();
    const handle: RunHandle = {
      request,
      controller,
      timer: setTimeout(() => {
        fail(request, 'timeout');
        controller.abort();
      }, timeoutMs),
    };
    handles.set(request.runId, handle);
    handle.task = consume(handle);
    return true;
  }

  function send(chatId: string) {
    if (disposed) return false;
    const chat = getChatById(getState(), chatId);
    if (!chat) return false;
    const last = getLastAssistant(chat.messages);
    const validation = validateDraft(chat.draft);
    if (!validation.valid || (last && isActiveRun(last.run))) return false;
    const at = now();
    const user: UserMessage = {
      id: createId(),
      role: 'user',
      createdAt: at,
      text: validation.text,
    };
    const run: QueuedRun = {
      id: createId(),
      attempt: 1,
      acceptedAt: at,
      status: 'queued',
    };
    const assistant: AssistantMessage = {
      id: createId(),
      role: 'assistant',
      createdAt: at,
      replyToMessageId: user.id,
      text: '',
      imageSrc: null,
      run,
    };
    const request: AgentRequest = {
      chatId,
      assistantMessageId: assistant.id,
      runId: run.id,
      attempt: run.attempt,
      prompt: user.text,
      history: buildAgentHistory(chat.messages),
    };
    dispatch(chatActions.requestAccepted({ chatId, user, assistant }));
    return start(request);
  }

  function retry(chatId: string, assistantMessageId: string) {
    if (disposed) return false;
    const chat = getChatById(getState(), chatId);
    const message = chat && getLastAssistant(chat.messages);
    if (
      !chat ||
      !message ||
      message.id !== assistantMessageId ||
      !canRetryMessage(message)
    )
      return false;
    const user = chat.messages.at(-2);
    if (user?.role !== 'user' || user.id !== message.replyToMessageId)
      return false;
    const run: QueuedRun = {
      id: createId(),
      attempt: message.run.attempt + 1,
      acceptedAt: now(),
      status: 'queued',
    };
    const request: AgentRequest = {
      chatId,
      assistantMessageId,
      runId: run.id,
      attempt: run.attempt,
      prompt: user.text,
      history: buildAgentHistory(chat.messages, user.id),
    };
    dispatch(chatActions.retryAccepted({ chatId, assistantMessageId, run }));
    return start(request);
  }

  function stop(chatId: string) {
    const chat = getChatById(getState(), chatId);
    const message = chat && getLastAssistant(chat.messages);
    if (!message || !isActiveRun(message.run)) return false;
    const runId = message.run.id;
    dispatch(chatActions.runCancelled({ chatId, runId, at: now() }));
    const handle = handles.get(runId);
    if (handle) {
      clearTimeout(handle.timer);
      handle.controller.abort();
    }
    return true;
  }

  async function dispose() {
    disposed = true;
    const running = [...handles.values()];
    for (const handle of running) {
      if (isCurrentActive(handle.request)) stop(handle.request.chatId);
      clearTimeout(handle.timer);
      handle.controller.abort();
    }
    await Promise.allSettled(
      running.flatMap((handle) => (handle.task ? [handle.task] : [])),
    );
  }

  return { send, retry, stop, dispose };
}

export type RequestExecutor = ReturnType<typeof createRequestExecutor>;
