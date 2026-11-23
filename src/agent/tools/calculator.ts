export type CalculatorOperation = 'add' | 'subtract' | 'multiply' | 'divide';

// Keep the tool as a separate pure function and validate its input here, even if
// the command was already filtered by the parser in an earlier layer.
export function calculate(
  operation: CalculatorOperation,
  left: number,
  right: number,
) {
  if (![left, right].every(Number.isInteger))
    throw new RangeError('Calculator accepts integer operands.');
  if (operation === 'divide' && right === 0)
    throw new RangeError('Cannot divide by zero.');
  switch (operation) {
    case 'add':
      return left + right;
    case 'subtract':
      return left - right;
    case 'multiply':
      return left * right;
    case 'divide':
      return left / right;
    default: {
      const unreachable: never = operation;
      return unreachable;
    }
  }
}
