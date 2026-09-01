/** Client-side password generation. Nothing here ever leaves the browser. */

export type GeneratorOptions = {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
  /** Drop characters that are easy to confuse when read aloud or transcribed. */
  excludeLookalikes: boolean;
};

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 64;

export const DEFAULT_OPTIONS: GeneratorOptions = {
  length: 20,
  uppercase: true,
  lowercase: true,
  digits: true,
  symbols: true,
  excludeLookalikes: false,
};

const CHARSETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/",
} as const;

const LOOKALIKES = new Set(["O", "0", "o", "I", "l", "1", "|", ":", ";", ",", "."]);

const OPTIONS_STORAGE_KEY = "shieldx_generator_options";

/**
 * A uniform index in [0, max). Rejection sampling matters here: `random % max`
 * biases towards low indices whenever max does not divide 2^32 evenly, which
 * would quietly shrink the keyspace of every password produced.
 */
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % max;
}

function pick(pool: string): string {
  return pool[randomIndex(pool.length)];
}

/** Fisher–Yates, so the guaranteed characters are not pinned to the front. */
function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

function filterLookalikes(set: string): string {
  return [...set].filter((c) => !LOOKALIKES.has(c)).join("");
}

/** The character pools enabled by these options, after look-alike filtering. */
export function activePools(options: GeneratorOptions): string[] {
  const keys = ["uppercase", "lowercase", "digits", "symbols"] as const;
  return keys
    .filter((key) => options[key])
    .map((key) => (options.excludeLookalikes ? filterLookalikes(CHARSETS[key]) : CHARSETS[key]))
    .filter((pool) => pool.length > 0);
}

/** Rough keyspace size in bits. Charset-based, so it says nothing about guessability. */
export function entropyBits(options: GeneratorOptions): number {
  const combined = activePools(options).join("");
  if (combined.length === 0) return 0;
  return options.length * Math.log2(combined.length);
}

export function generatePassword(options: GeneratorOptions): string {
  const pools = activePools(options);
  if (pools.length === 0) return "";

  const length = Math.min(Math.max(options.length, MIN_LENGTH), MAX_LENGTH);
  const combined = pools.join("");
  const chars: string[] = [];

  // One character from each enabled pool, so "include symbols" is a guarantee and
  // not just a probability. Only possible when the password is long enough.
  if (length >= pools.length) {
    for (const pool of pools) chars.push(pick(pool));
  }

  while (chars.length < length) chars.push(pick(combined));

  return shuffle(chars).join("");
}

export function readStoredOptions(): GeneratorOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const parsed = JSON.parse(raw) as Partial<GeneratorOptions>;
    const merged = { ...DEFAULT_OPTIONS, ...parsed };
    merged.length = Math.min(Math.max(Number(merged.length) || DEFAULT_OPTIONS.length, MIN_LENGTH), MAX_LENGTH);
    // Never persist a state that cannot produce a password.
    if (activePools(merged).length === 0) return DEFAULT_OPTIONS;
    return merged;
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export function storeOptions(options: GeneratorOptions): void {
  try {
    localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // A rejected write only means the preference does not persist.
  }
}
