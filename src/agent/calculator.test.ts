import { expect, it } from 'vitest';
import { calculateProduct } from './calculator';

it.each([
  { left: 17, right: 24, result: 408 },
  { left: -10000, right: 10000, result: -100000000 },
  { left: 0, right: 123, result: 0 },
])(
  'multiplies bounded integers ($left × $right)',
  ({ left, right, result }) => {
    expect(calculateProduct(left, right)).toBe(result);
  },
);

it.each([NaN, Infinity, -Infinity, 0.5, 10001, -10001])(
  'rejects invalid operands on either side: %s',
  (value) => {
    expect(() => calculateProduct(value, 1)).toThrow(RangeError);
    expect(() => calculateProduct(1, value)).toThrow(RangeError);
  },
);
