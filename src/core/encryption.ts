import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;

export function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, "dxcrm-salt-v1", KEY_LEN);
}

export interface EncryptedField {
  iv: string;
  ciphertext: string;
  authTag: string;
}

export function encryptField(plaintext: string, key: Buffer): EncryptedField {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

export function decryptField(encrypted: EncryptedField, key: Buffer): string {
  const iv = Buffer.from(encrypted.iv, "hex");
  const ciphertext = Buffer.from(encrypted.ciphertext, "hex");
  const authTag = Buffer.from(encrypted.authTag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptFieldStr(plaintext: string, secret: string): string {
  return JSON.stringify(encryptField(plaintext, deriveKey(secret)));
}

export function decryptFieldStr(encryptedJson: string, secret: string): string {
  return decryptField(JSON.parse(encryptedJson) as EncryptedField, deriveKey(secret));
}
