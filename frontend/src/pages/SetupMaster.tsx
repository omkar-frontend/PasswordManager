import axios from "axios";
import { deriveKey } from "../crypto/key";
import { encrypt } from "../crypto/encrypt";
import { toBase64 } from "../utils/encoding";

function backendUrl(): string {
  const url = import.meta.env.VITE_BACKEND_URL;
  if (!url) throw new Error("VITE_BACKEND_URL is not set");
  return url;
}

/** Creates `user_security` row via API and returns the derived vault key (in memory only). */
export async function setupMasterPassword(password: string): Promise<CryptoKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, true);
  const { cipher, iv } = await encrypt(password, key);

  await axios.post(`${backendUrl()}/user-security`, {
    salt: toBase64(salt),
    check_cipher: cipher,
    check_iv: iv,
  });

  return key;
}
