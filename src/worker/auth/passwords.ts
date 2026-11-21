/**
 * Per-user password hashing and verification using Cloudflare Workers Web Crypto
 * PBKDF2-SHA256 with a unique 16-byte random salt per password.
 *
 * Stored format:
 *   `pbkdf2_sha256$<iterations>$<base64url-salt>$<base64url-derived-key>`
 */

const SCHEME = "pbkdf2_sha256";
const DEFAULT_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_KEY_BITS = 256;

const textEncoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

async function derivePbkdf2Bits(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    keyMaterial,
    DERIVED_KEY_BITS
  );
  return new Uint8Array(derived);
}

/**
 * Hashes a plaintext password with a fresh 16-byte CSPRNG salt and PBKDF2-SHA256.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(new ArrayBuffer(SALT_BYTES));
  crypto.getRandomValues(salt);
  const derived = await derivePbkdf2Bits(password, salt, DEFAULT_ITERATIONS);
  return `${SCHEME}$${DEFAULT_ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(derived)}`;
}

/**
 * Verifies a plaintext password against a stored PBKDF2-SHA256 hash using
 * constant-time byte comparison.
 */
export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  if (!password || !storedHash) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== SCHEME) return false;

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 500_000) {
    return false;
  }

  let salt: Uint8Array<ArrayBuffer>;
  let expected: Uint8Array<ArrayBuffer>;
  try {
    salt = base64UrlDecode(parts[2]!);
    expected = base64UrlDecode(parts[3]!);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await derivePbkdf2Bits(password, salt, iterations);
  return constantTimeBytesEqual(actual, expected);
}
