import type {
  Agent,
  AgentEvent,
  AgentEventData,
  AgentRequest,
} from '@/agent/types';
import { eventFor } from './fixtures';

interface ControlledCall {
  request: AgentRequest;
  signal: AbortSignal;
  emit: (data: AgentEventData) => void;
  end: () => void;
}

export function createControlledAgent() {
  const calls: ControlledCall[] = [];
  const agent: Agent = (request, signal) => {
    const buffer: AgentEvent[] = [];
    let waiting: ((value: IteratorResult<AgentEvent>) => void) | undefined;
    let closed = false;
    const done: IteratorResult<AgentEvent> = { done: true, value: undefined };
    const end = () => {
      closed = true;
      waiting?.(done);
      waiting = undefined;
    };
    calls.push({
      request,
      signal,
      end,
      emit(data) {
        if (closed) return;
        const value: IteratorResult<AgentEvent> = {
          done: false,
          value: eventFor(request, data),
        };
        if (waiting) {
          waiting(value);
          waiting = undefined;
        } else buffer.push(value.value);
      },
    });
    return {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<AgentEvent>> {
            const value = buffer.shift();
            if (value) return Promise.resolve({ done: false, value });
            if (closed) return Promise.resolve(done);
            return new Promise((resolve) => {
              waiting = resolve;
            });
          },
          return() {
            end();
            return Promise.resolve(done);
          },
        };
      },
    };
  };
  function call(index: number) {
    const value = calls[index];
    if (!value) throw new Error(`Agent call ${index} not found`);
    return value;
  }
  return { agent, calls, call };
}
