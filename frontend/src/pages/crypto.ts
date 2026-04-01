import CryptoJS from "crypto-js";

export type EncryptedPayload = {
  cipherText: string;
  iv: string;
};

export function encrypt(text: string, secretKey: string): EncryptedPayload {
  const iv = CryptoJS.lib.WordArray.random(16);

  const encrypted = CryptoJS.AES.encrypt(text, CryptoJS.enc.Utf8.parse(secretKey), {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    cipherText: encrypted.toString(),
    iv: iv.toString(CryptoJS.enc.Hex),
  };
}

export function decrypt(cipherText: string, secretKey: string, ivHex: string): string {
  const iv = CryptoJS.enc.Hex.parse(ivHex);

  const decrypted = CryptoJS.AES.decrypt(cipherText, CryptoJS.enc.Utf8.parse(secretKey), {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}
