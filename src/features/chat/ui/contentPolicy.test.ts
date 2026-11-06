import { expect, it } from 'vitest';
import { safeLinkHref, localImageUrl } from './contentPolicy';

it.each([
  {
    input: 'https://example.com/path?q=1#section',
    expected: 'https://example.com/path?q=1#section',
  },
  { input: 'HTTP://EXAMPLE.COM', expected: 'http://example.com/' },
])('allows an absolute HTTP(S) link: $input', ({ input, expected }) => {
  expect(safeLinkHref(input)).toBe(expected);
});

it.each([
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'mailto:student@example.com',
  'ftp://example.com/file',
  '//example.com',
  '/relative',
  '#section',
  'https://',
  ' https://example.com',
  '',
])('keeps an unsupported URL inactive: %s', (url) => {
  expect(safeLinkHref(url)).toBeUndefined();
});

it.each(['/', '/study-chat/'])(
  'resolves the provided image against the publication base %s',
  (base) => {
    expect(localImageUrl('assets/newtons-2nd-law-of-motion.png', base)).toBe(
      `${base}assets/newtons-2nd-law-of-motion.png`,
    );
    expect(localImageUrl('assets/Схема (1).png', base)).toBe(
      `${base}assets/%D0%A1%D1%85%D0%B5%D0%BC%D0%B0%20(1).png`,
    );
  },
);

it.each([
  'https://example.com/a.png',
  '/assets/a.png',
  'assets/../a.png',
  'assets/%2e%2e/a.png',
])('does not turn an invalid image path into an image URL: %s', (path) => {
  expect(localImageUrl(path, '/study-chat/')).toBeUndefined();
});
