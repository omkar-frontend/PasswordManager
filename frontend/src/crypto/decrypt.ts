import { dec, fromBase64 } from "../utils/encoding";

export async function decrypt(cipher: string, iv: string, key: CryptoKey) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(cipher)
  );

  return dec.decode(decrypted);
}