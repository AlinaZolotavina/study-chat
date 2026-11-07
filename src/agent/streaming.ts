import { delay } from '@/shared/delay';
import { randomInteger, sampleDuration, type StreamingConfig } from './config';

interface TextBlock {
  kind: 'paragraph' | 'item' | 'heading' | 'short';
  text: string;
  pauseBefore: 'paragraph' | 'item' | null;
}

function classifyLine(line: string): TextBlock['kind'] {
  const content = line.trim();
  if (/^#{1,6}\s/.test(content) || /^\*\*[^*]+\*\*$/.test(content))
    return 'heading';
  if (/^(?:[-+*]|\d+[.)])\s/.test(content)) return 'item';
  if (content.includes('=') && !/\p{L}{2,}/u.test(content)) return 'short';
  return 'paragraph';
}

export function splitTextBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let buffer = '';
  let prefix = '';
  let pause: TextBlock['pauseBefore'] = null;
  let fence = '';
  const append = (kind: TextBlock['kind'], value: string) => {
    blocks.push({
      kind,
      text: prefix + value,
      pauseBefore: blocks.length
        ? (pause ??
          (kind === 'item' && blocks.at(-1)?.kind === 'item' ? 'item' : null))
        : null,
    });
    prefix = '';
    pause = null;
  };
  const flush = () => {
    if (buffer) append('paragraph', buffer);
    buffer = '';
  };
  for (const line of text.match(/[^\n]*(?:\n|$)/g) ?? []) {
    if (!line) continue;
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      buffer += line;
      if (marker?.startsWith(fence[0] ?? '') && marker.length >= fence.length) {
        fence = '';
        flush();
      }
    } else if (marker) {
      flush();
      buffer = line;
      fence = marker;
    } else if (!line.trim()) {
      if (buffer) {
        buffer += line;
        flush();
      } else if (blocks.length) {
        const last = blocks.at(-1);
        if (last) last.text += line;
      } else prefix += line;
      pause = 'paragraph';
    } else {
      const kind = classifyLine(line);
      if (kind !== 'paragraph') {
        flush();
        append(kind, line);
      } else if (
        !buffer &&
        !pause &&
        /^\s{2,}\S/.test(line) &&
        blocks.at(-1)?.kind === 'item'
      ) {
        const last = blocks.at(-1);
        if (last) last.text += line;
      } else buffer += line;
    }
  }
  flush();
  if (prefix) append('short', '');
  return blocks;
}

export function blockDuration(
  block: Pick<TextBlock, 'kind' | 'text'>,
  config: StreamingConfig,
  random: () => number,
) {
  const words =
    block.text.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  if (!words) return 0;
  const short = block.kind === 'heading' || block.kind === 'short';
  const minimum = short ? config.minHeadingMs : config.minBlockMs;
  const base = Math.max(
    minimum,
    (words * 1000) /
      (short ? config.headingWordsPerSecond : config.wordsPerSecond),
  );
  const minMs = Math.max(minimum, Math.round(base * (1 - config.variance)));
  const maxMs = Math.max(minMs, Math.round(base * (1 + config.variance)));
  return sampleDuration(
    {
      minMs: short ? Math.min(config.maxHeadingMs, minMs) : minMs,
      maxMs: short ? Math.min(config.maxHeadingMs, maxMs) : maxMs,
    },
    random,
  );
}

export async function* streamText(
  text: string,
  signal: AbortSignal,
  config: StreamingConfig,
  random: () => number,
): AsyncGenerator<string> {
  if (
    config.wordsPerSecond <= 0 ||
    config.headingWordsPerSecond <= 0 ||
    config.variance < 0 ||
    config.variance > 1 ||
    config.minChunkSize < 1
  )
    throw new RangeError('Invalid streaming configuration');
  for (const block of splitTextBlocks(text)) {
    signal.throwIfAborted();
    if (block.pauseBefore)
      await delay(
        sampleDuration(
          block.pauseBefore === 'paragraph'
            ? config.paragraphPauseMs
            : config.listPauseMs,
          random,
        ),
        signal,
      );
    const duration = blockDuration(block, config, random);
    const characters = Array.from(block.text);
    let index = 0;
    let elapsed = 0;
    while (index < characters.length) {
      const end = Math.min(
        characters.length,
        index + randomInteger(config.minChunkSize, config.maxChunkSize, random),
      );
      const deadline = Math.round((duration * end) / characters.length);
      await delay(deadline - elapsed, signal);
      yield characters.slice(index, end).join('');
      index = end;
      elapsed = deadline;
    }
  }
}
