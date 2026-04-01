import { enc, toBase64 } from "../utils/encoding";

export async function encrypt(text: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(text)
  );

  return {
    cipher: toBase64(encrypted),
    iv: toBase64(iv),
  };
}