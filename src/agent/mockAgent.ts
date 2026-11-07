import { delay } from '@/shared/delay';
import { calculateProduct } from './calculator';
import { classifyCommand } from './commands';
import {
  NEWTON_IMAGE_SRC,
  MOCK_TIMING,
  STREAMING_CONFIG,
  sampleDuration,
  type MockTiming,
  type StreamingConfig,
} from './config';
import { streamText } from './streaming';
import { deriveContext } from './context';
import { chooseScenario } from './scenarios';
import type {
  Agent,
  AgentActionKind,
  AgentEvent,
  AgentEventData,
} from './types';

interface MockAgentOptions {
  now?: () => string;
  createId?: () => string;
  timing?: Partial<MockTiming>;
  streaming?: Partial<StreamingConfig>;
  random?: () => number;
}

export function createMockAgent(options: MockAgentOptions = {}): Agent {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const timing = { ...MOCK_TIMING, ...options.timing };
  const streaming = { ...STREAMING_CONFIG, ...options.streaming };
  const random = options.random ?? Math.random;

  return async function* (request, signal): AsyncGenerator<AgentEvent> {
    const event = (data: AgentEventData): AgentEvent => ({
      ...data,
      chatId: request.chatId,
      assistantMessageId: request.assistantMessageId,
      runId: request.runId,
      at: now(),
    });
    const actionCompleted = (action: AgentActionKind) =>
      event({ type: 'action_completed', actionId: createId(), action });
    const scenario = chooseScenario(
      classifyCommand(request.prompt),
      deriveContext(request.history),
      request.attempt,
    );
    await delay(timing.queuedMs, signal);
    yield event({ type: 'started' });
    await delay(sampleDuration(timing.analysisMs, random), signal);
    yield actionCompleted('analyzed');

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
      await delay(sampleDuration(timing.toolUseMs, random), signal);
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
      await delay(sampleDuration(timing.toolResultMs, random), signal);
      yield event({
        type: 'tool_result',
        tool: 'calculator',
        callId,
        output: { value },
      });
      yield actionCompleted('calculated');
      text = `**${scenario.left} × ${scenario.right} = ${value}**. Я проверил произведение с помощью калькулятора.`;
    } else {
      text = scenario.text;
      if (scenario.kind === 'image') {
        yield event({ type: 'phase_changed', phase: 'preparing_image' });
        await delay(sampleDuration(timing.imageMs, random), signal);
        yield event({ type: 'image_received', imageSrc: NEWTON_IMAGE_SRC });
        yield actionCompleted('image_prepared');
      } else if (text)
        yield event({ type: 'phase_changed', phase: 'composing' });
    }
    if (text) {
      await delay(
        sampleDuration(
          scenario.kind === 'calculator'
            ? timing.calculatorComposingMs
            : timing.composingMs,
          random,
        ),
        signal,
      );
      for await (const delta of streamText(text, signal, streaming, random))
        yield event({ type: 'text_delta', text: delta });
    }
    signal.throwIfAborted();
    if (scenario.kind === 'error')
      yield event({ type: 'error', error: scenario.error });
    else {
      yield actionCompleted('answer_composed');
      yield event({ type: 'completed' });
    }
  };
}
