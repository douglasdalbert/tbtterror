export function getClientId(storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage, random: Pick<Crypto, "getRandomValues"> = crypto): string {
  const existing = storage.getItem("terror-client-id");
  if (existing !== null) return existing;

  // getRandomValues also works on HTTP LAN origins, unlike randomUUID.
  const bytes = random.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  storage.setItem("terror-client-id", id);
  return id;
}
