import { expect, it } from 'vitest';
import { calculate, type CalculatorOperation } from './calculator';

it.each<{
  operation: CalculatorOperation;
  left: number;
  right: number;
  result: number;
}>([
  { operation: 'add', left: 17, right: 24, result: 41 },
  { operation: 'add', left: 10001, right: 20000, result: 30001 },
  { operation: 'subtract', left: 20, right: 20, result: 0 },
  { operation: 'subtract', left: -10, right: 7, result: -17 },
  { operation: 'multiply', left: 10001, right: 20000, result: 200020000 },
  { operation: 'divide', left: 7, right: 2, result: 3.5 },
  { operation: 'divide', left: 0, right: 123, result: 0 },
])(
  'calculates $operation for integer operands ($left, $right)',
  ({ operation, left, right, result }) => {
    expect(calculate(operation, left, right)).toBe(result);
  },
);

it.each([NaN, Infinity, -Infinity, 0.5])(
  'rejects non-integer operands on either side: %s',
  (value) => {
    expect(() => calculate('add', value, 1)).toThrow(RangeError);
    expect(() => calculate('add', 1, value)).toThrow(RangeError);
  },
);

it('rejects division by zero', () => {
  expect(() => calculate('divide', 20, 0)).toThrow(RangeError);
});
