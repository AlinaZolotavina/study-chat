export function calculateProduct(left: number, right: number) {
  if (
    ![left, right].every(
      (value) => Number.isInteger(value) && Math.abs(value) <= 10_000,
    )
  )
    throw new RangeError('Calculator accepts integers from -10000 to 10000.');
  return left * right;
}
