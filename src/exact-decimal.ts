export interface ExactDecimal {
  /** Base-10 integer coefficient, stored as a string so the model is JSON-safe. */
  readonly coefficient: string;
  /** Number of decimal places represented by the coefficient. */
  readonly scale: number;
}

const COEFFICIENT_PATTERN = /^-?\d+$/u;
const DECIMAL_NUMBER_PATTERN =
  /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/iu;

/**
 * Convert a finite JavaScript number into the shortest base-10 representation
 * that round-trips to that source number, then store it as coefficient+scale.
 * This does not claim to recover lexical JSON digits already discarded by
 * JSON.parse; it prevents any additional binary floating-point accumulation
 * after the source number enters the normalization boundary.
 */
export function exactDecimalFromNumber(value: number): ExactDecimal {
  if (!Number.isFinite(value)) {
    throw new RangeError("Exact decimal source must be finite.");
  }

  const match = DECIMAL_NUMBER_PATTERN.exec(String(value));
  if (match === null) {
    throw new RangeError("Exact decimal source could not be represented.");
  }

  const sign = match[1] === "-" ? "-" : "";
  const integerDigits = match[2] ?? "0";
  const fractionalDigits = match[3] ?? "";
  const exponent = Number(match[4] ?? "0");
  if (!Number.isSafeInteger(exponent)) {
    throw new RangeError("Exact decimal exponent was not safe.");
  }

  let digits = `${integerDigits}${fractionalDigits}`.replace(/^0+(?=\d)/u, "");
  let scale = fractionalDigits.length - exponent;

  if (scale < 0) {
    digits += "0".repeat(-scale);
    scale = 0;
  }

  while (scale > 0 && digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    scale -= 1;
  }

  digits = digits.replace(/^0+(?=\d)/u, "");
  if (/^0+$/u.test(digits)) {
    return Object.freeze({ coefficient: "0", scale: 0 });
  }

  return Object.freeze({ coefficient: `${sign}${digits}`, scale });
}

/**
 * Add canonical decimals with BigInt internally while keeping the returned
 * model JSON-safe. This is arithmetic infrastructure, not a report formula.
 */
export function addExactDecimals(
  values: readonly ExactDecimal[],
): ExactDecimal {
  if (values.length === 0) {
    return Object.freeze({ coefficient: "0", scale: 0 });
  }

  let maxScale = 0;
  for (const value of values) {
    assertExactDecimal(value);
    maxScale = Math.max(maxScale, value.scale);
  }

  let total = 0n;
  for (const value of values) {
    const multiplier = 10n ** BigInt(maxScale - value.scale);
    total += BigInt(value.coefficient) * multiplier;
  }

  return canonicalize(total, maxScale);
}

export function exactDecimalToString(value: ExactDecimal): string {
  assertExactDecimal(value);
  const negative = value.coefficient.startsWith("-");
  const unsigned = negative ? value.coefficient.slice(1) : value.coefficient;

  if (value.scale === 0) {
    return value.coefficient;
  }

  const padded = unsigned.padStart(value.scale + 1, "0");
  const splitAt = padded.length - value.scale;
  const rendered = `${padded.slice(0, splitAt)}.${padded.slice(splitAt)}`;
  return negative ? `-${rendered}` : rendered;
}

function assertExactDecimal(value: ExactDecimal): void {
  if (
    !COEFFICIENT_PATTERN.test(value.coefficient)
    || !Number.isSafeInteger(value.scale)
    || value.scale < 0
  ) {
    throw new RangeError("Exact decimal value was not canonicalizable.");
  }
}

function canonicalize(coefficient: bigint, scale: number): ExactDecimal {
  if (coefficient === 0n) {
    return Object.freeze({ coefficient: "0", scale: 0 });
  }

  let current = coefficient;
  let currentScale = scale;
  while (currentScale > 0 && current % 10n === 0n) {
    current /= 10n;
    currentScale -= 1;
  }

  return Object.freeze({
    coefficient: current.toString(),
    scale: currentScale,
  });
}
