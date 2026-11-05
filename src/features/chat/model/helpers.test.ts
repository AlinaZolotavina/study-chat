import { describe, expect, it } from 'vitest';
import { makeTurn, queuedRun, TEST_TIME } from '@/test/fixtures';
import {
  buildAgentHistory,
  isLocalImageSrc,
  makeChatTitle,
  validateDraft,
} from './helpers';

describe('draft validation', () => {
  it.each(['', '  \n\t', 'x'.repeat(4001), ' '.repeat(4001)])(
    'rejects invalid input (%#)',
    (input) => {
      expect(validateDraft(input).valid).toBe(false);
    },
  );
  it('counts UTF-16 units, preserves internal newlines and trims only edges', () => {
    expect(validateDraft('🙂'.repeat(2000)).valid).toBe(true);
    expect(validateDraft('🙂'.repeat(2001))).toEqual({
      valid: false,
      reason: 'too_long',
    });
    expect(validateDraft('  first\nsecond  ')).toEqual({
      valid: true,
      text: 'first\nsecond',
    });
  });
});

it('limits titles by Unicode code points without splitting emoji', () => {
  expect(makeChatTitle(' first\n  second ')).toBe('first second');
  expect(Array.from(makeChatTitle('🙂'.repeat(60)))).toHaveLength(48);
  expect(makeChatTitle('🙂'.repeat(60))).toBe('🙂'.repeat(47) + '…');
});

it('copies only completed pairs before the current question into history', () => {
  const complete = makeTurn(
    { ...queuedRun(), status: 'completed', finishedAt: TEST_TIME },
    'answer',
    '1',
  );
  const failed = makeTurn(
    {
      ...queuedRun('run-2'),
      status: 'failed',
      finishedAt: TEST_TIME,
      error: { code: 'unknown', retryable: true },
    },
    'partial',
    '2',
  );
  const current = makeTurn(queuedRun('run-3'), '', '3');
  complete[1].imageSrc = 'assets/example.png';
  const messages = [...complete, ...failed, ...current];
  const history = buildAgentHistory(messages, current[0].id);
  complete[1].text = 'changed later';
  expect(history).toEqual([
    { userText: 'question-1', assistantText: 'answer' },
  ]);
  expect(buildAgentHistory(messages)).toHaveLength(1);
});

it.each([
  '/assets/a.png',
  'https://example.com/a.png',
  'assets/../a.png',
  'assets/%2e%2e/a.png',
  'assets/a.png?x',
])('rejects non-local image paths: %s', (path) => {
  expect(isLocalImageSrc(path)).toBe(false);
});

it('accepts the unencoded local asset name', () => {
  expect(
    isLocalImageSrc('assets/Archimedes’ Principle Infographic (1).png'),
  ).toBe(true);
});
