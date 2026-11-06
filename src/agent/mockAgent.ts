import { delay } from '@/shared/delay';
import { calculateProduct } from './calculator';
import { classifyCommand } from './commands';
import {
  NEWTON_IMAGE_SRC,
  MOCK_TIMING,
  STREAM_CHUNK_SIZE,
  type MockTiming,
} from './config';
import { deriveContext } from './context';
import { chooseScenario } from './scenarios';
import type { Agent, AgentEvent, AgentEventData } from './types';

interface MockAgentOptions {
  now?: () => string;
  createId?: () => string;
  timing?: Partial<MockTiming>;
}

export function createMockAgent(options: MockAgentOptions = {}): Agent {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const timing = { ...MOCK_TIMING, ...options.timing };

  return async function* (request, signal): AsyncGenerator<AgentEvent> {
    const event = (data: AgentEventData): AgentEvent => ({
      ...data,
      chatId: request.chatId,
      assistantMessageId: request.assistantMessageId,
      runId: request.runId,
      at: now(),
    });
    const scenario = chooseScenario(
      classifyCommand(request.prompt),
      deriveContext(request.history),
      request.attempt,
    );
    await delay(timing.queuedMs, signal);
    yield event({ type: 'started' });
    await delay(timing.processingMs, signal);

    let text: string;
    if (scenario.kind === 'calculator') {
      const callId = createId();
      yield event({
        type: 'tool_call',
        tool: 'calculator',
        callId,
        input: {
          operation: 'multiply',
          left: scenario.left,
          right: scenario.right,
        },
      });
      await delay(timing.calculatorMs, signal);
      let value: number;
      try {
        value = calculateProduct(scenario.left, scenario.right);
      } catch {
        yield event({
          type: 'error',
          error: { code: 'tool_failure', retryable: true },
        });
        return;
      }
      yield event({
        type: 'tool_result',
        tool: 'calculator',
        callId,
        output: { value },
      });
      await delay(timing.composingMs, signal);
      text = `**${scenario.left} × ${scenario.right} = ${value}**. Я проверил произведение с помощью калькулятора.`;
    } else {
      text = scenario.text;
      if (scenario.kind === 'image') {
        yield event({ type: 'phase_changed', phase: 'preparing_image' });
        await delay(timing.imageMs, signal);
        yield event({ type: 'image_received', imageSrc: NEWTON_IMAGE_SRC });
        await delay(timing.composingMs, signal);
      } else if (text)
        yield event({ type: 'phase_changed', phase: 'composing' });
    }
    const characters = Array.from(text);
    for (let index = 0; index < characters.length; index += STREAM_CHUNK_SIZE) {
      await delay(timing.chunkMs, signal);
      yield event({
        type: 'text_delta',
        text: characters.slice(index, index + STREAM_CHUNK_SIZE).join(''),
      });
    }
    signal.throwIfAborted();
    if (scenario.kind === 'error')
      yield event({ type: 'error', error: scenario.error });
    else yield event({ type: 'completed' });
  };
}
