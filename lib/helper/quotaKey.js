const DEFAULT_KEY_PREFIX = 'rlflx';

// Max length of the raw application key (before encoding and prefixing).
// Mirrors common store limits such as Redis's 512 MB cap while keeping memory
// usage predictable and preventing unbounded-key abuse.
const MAX_KEY_LENGTH = 4096;

// Marker segment identifying storage keys whose raw key contains the ':'
// delimiter and is therefore stored base64-encoded. It is itself a prefixed
// segment, so plain and encoded storage keys can never collide.
const ENCODED_MARKER = 'b64';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes) {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const octet0 = bytes[i];
    const octet1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const octet2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (octet0 * 65536) + (octet1 * 256) + octet2;
    const index0 = Math.floor(triplet / 262144);
    const index1 = Math.floor(triplet / 4096) % 64;
    const index2 = Math.floor(triplet / 64) % 64;
    const index3 = triplet % 64;

    output += BASE64_CHARS.charAt(index0);
    output += BASE64_CHARS.charAt(index1);
    output += i + 1 < bytes.length ? BASE64_CHARS.charAt(index2) : '=';
    output += i + 2 < bytes.length ? BASE64_CHARS.charAt(index3) : '=';
  }
  return output;
}

function base64ToBytes(value) {
  const cleanValue = value.replace(/=+$/, '');
  const bytes = [];
  for (let i = 0; i < cleanValue.length; i += 4) {
    const chunk = cleanValue.substring(i, i + 4);
    const encoded0 = BASE64_CHARS.indexOf(chunk.charAt(0));
    const encoded1 = BASE64_CHARS.indexOf(chunk.charAt(1));
    const encoded2 = chunk.charAt(2) ? BASE64_CHARS.indexOf(chunk.charAt(2)) : -1;
    const encoded3 = chunk.charAt(3) ? BASE64_CHARS.indexOf(chunk.charAt(3)) : -1;
    const combined = (encoded0 * 262144) + (encoded1 * 4096)
      + (encoded2 === -1 ? 0 : encoded2 * 64)
      + (encoded3 === -1 ? 0 : encoded3);

    bytes.push(Math.floor(combined / 65536) % 256);
    if (encoded2 !== -1) {
      bytes.push(Math.floor(combined / 256) % 256);
    }
    if (encoded3 !== -1) {
      bytes.push(combined % 256);
    }
  }
  return bytes;
}

function toBase64(value) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }

  // Browser / Deno fallback (no Buffer global).
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64(bytes);
}

function fromBase64(value) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8');
  }

  const bytes = base64ToBytes(value);
  const textDecoder = new TextDecoder();
  return textDecoder.decode(Uint8Array.from(bytes));
}

/**
 * Normalizes an application-supplied key to a non-empty string and enforces
 * the maximum key length. Numbers are accepted for backward compatibility.
 *
 * @param {string|number} key
 * @returns {string}
 */
function normalizeKey(key) {
  if (typeof key === 'number') {
    if (!Number.isFinite(key)) {
      throw new Error('key must be a non-empty string or number');
    }
    return String(key);
  }

  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('key must be a non-empty string or number');
  }

  if (key.length > MAX_KEY_LENGTH) {
    throw new Error(`key length must not exceed ${MAX_KEY_LENGTH} characters`);
  }

  return key;
}

/**
 * Builds the storage key for a limiter.
 *
 * Plain keys keep the legacy `prefix:key` layout, so existing data keeps
 * working. Keys containing the ':' delimiter are base64-encoded behind a
 * `b64` marker segment, which makes the mapping injective: two different
 * (prefix, key) pairs can never produce the same storage key.
 *
 * @param {string} keyPrefix
 * @param {string|number} key
 * @returns {string}
 */
function buildStorageKey(keyPrefix, key) {
  const normalizedKey = normalizeKey(key);

  if (normalizedKey.indexOf(':') === -1) {
    return keyPrefix.length > 0 ? `${keyPrefix}:${normalizedKey}` : normalizedKey;
  }

  const encodedKey = toBase64(normalizedKey);
  return keyPrefix.length > 0
    ? `${keyPrefix}:${ENCODED_MARKER}:${encodedKey}`
    : `${ENCODED_MARKER}:${encodedKey}`;
}

/**
 * Inverse of {@link buildStorageKey}.
 *
 * Decodes both the encoded layout and legacy plain storage keys. A legacy
 * key whose prefix itself contains ':' is handled by matching against the
 * configured prefix instead of relying on a fixed substring offset.
 *
 * @param {string} keyPrefix
 * @param {string} storageKey
 * @returns {string}
 */
function parseStorageKey(keyPrefix, storageKey) {
  if (keyPrefix.length === 0) {
    if (storageKey.indexOf(`${ENCODED_MARKER}:`) === 0) {
      return fromBase64(storageKey.substring(ENCODED_MARKER.length + 1));
    }
    return storageKey;
  }

  const prefixWithDelimiter = `${keyPrefix}:`;
  if (storageKey.indexOf(prefixWithDelimiter) !== 0) {
    // Unknown/foreign storage key; fall back to the legacy offset behavior.
    return storageKey.substring(keyPrefix.length + 1);
  }

  const remainder = storageKey.substring(prefixWithDelimiter.length);
  if (remainder.indexOf(`${ENCODED_MARKER}:`) === 0) {
    return fromBase64(remainder.substring(ENCODED_MARKER.length + 1));
  }

  return remainder;
}

module.exports = {
  DEFAULT_KEY_PREFIX,
  MAX_KEY_LENGTH,
  ENCODED_MARKER,
  normalizeKey,
  buildStorageKey,
  parseStorageKey,
};
