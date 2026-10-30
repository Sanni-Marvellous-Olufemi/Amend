const BASE32HEX = '0123456789abcdefghijklmnopqrstuv'

/**
 * Deterministic Google Calendar event ID for one approval. Inserting twice with the
 * same ID returns 409 instead of creating a duplicate event.
 * Google requires 5-1024 chars from [a-v0-9].
 */
export async function eventIdFor(opId: string, proposalId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${opId}:${proposalId}`)))
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of digest) {
    value = ((value << 8) | byte) & 0xffff
    bits += 8
    while (bits >= 5) {
      out += BASE32HEX[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return `amend${out.slice(0, 27)}`
}
