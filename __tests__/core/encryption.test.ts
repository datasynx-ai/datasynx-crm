import { describe, it, expect } from "vitest";
import {
  deriveKey,
  encryptField,
  decryptField,
  encryptFieldStr,
  decryptFieldStr,
} from "../../src/core/encryption.js";

describe("deriveKey", () => {
  it("same secret produces same key", () => {
    const key1 = deriveKey("my-secret");
    const key2 = deriveKey("my-secret");
    expect(key1.equals(key2)).toBe(true);
  });

  it("different secrets produce different keys", () => {
    const key1 = deriveKey("secret-a");
    const key2 = deriveKey("secret-b");
    expect(key1.equals(key2)).toBe(false);
  });

  it("returns a 32-byte buffer", () => {
    const key = deriveKey("test");
    expect(key.length).toBe(32);
  });
});

describe("encryptField / decryptField", () => {
  it("encrypt/decrypt round-trip returns original string", () => {
    const key = deriveKey("test-secret");
    const plaintext = "Hello, CRM world!";
    const encrypted = encryptField(plaintext, key);
    const decrypted = decryptField(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("round-trip works for empty string", () => {
    const key = deriveKey("test-secret");
    const encrypted = encryptField("", key);
    expect(decryptField(encrypted, key)).toBe("");
  });

  it("round-trip works for unicode strings", () => {
    const key = deriveKey("key");
    const plaintext = "Héllo wörld — 日本語テスト";
    const encrypted = encryptField(plaintext, key);
    expect(decryptField(encrypted, key)).toBe(plaintext);
  });

  it("different plaintexts produce different ciphertexts", () => {
    const key = deriveKey("test-secret");
    const enc1 = encryptField("hello", key);
    const enc2 = encryptField("world", key);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });

  it("same plaintext produces different ciphertexts (random IV)", () => {
    const key = deriveKey("test-secret");
    const enc1 = encryptField("same text", key);
    const enc2 = encryptField("same text", key);
    // IVs should differ due to randomness
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  it("tampered authTag causes decryption to throw", () => {
    const key = deriveKey("test-secret");
    const encrypted = encryptField("sensitive data", key);
    const tampered = { ...encrypted, authTag: "deadbeef".repeat(4) };
    expect(() => decryptField(tampered, key)).toThrow();
  });

  it("tampered ciphertext causes decryption to throw", () => {
    const key = deriveKey("test-secret");
    const encrypted = encryptField("sensitive data", key);
    const tampered = { ...encrypted, ciphertext: "00".repeat(encrypted.ciphertext.length / 2) };
    expect(() => decryptField(tampered, key)).toThrow();
  });

  it("wrong key causes decryption to throw", () => {
    const key1 = deriveKey("secret-a");
    const key2 = deriveKey("secret-b");
    const encrypted = encryptField("data", key1);
    expect(() => decryptField(encrypted, key2)).toThrow();
  });
});

describe("encryptFieldStr / decryptFieldStr", () => {
  it("work correctly for a round-trip", () => {
    const secret = "my-crm-secret";
    const plaintext = "confidential@email.com";
    const encryptedStr = encryptFieldStr(plaintext, secret);
    expect(typeof encryptedStr).toBe("string");
    const decrypted = decryptFieldStr(encryptedStr, secret);
    expect(decrypted).toBe(plaintext);
  });

  it("encryptFieldStr produces valid JSON", () => {
    const encryptedStr = encryptFieldStr("test", "secret");
    const parsed = JSON.parse(encryptedStr) as { iv: string; ciphertext: string; authTag: string };
    expect(parsed).toHaveProperty("iv");
    expect(parsed).toHaveProperty("ciphertext");
    expect(parsed).toHaveProperty("authTag");
  });

  it("decryptFieldStr with wrong secret throws", () => {
    const encryptedStr = encryptFieldStr("data", "correct-secret");
    expect(() => decryptFieldStr(encryptedStr, "wrong-secret")).toThrow();
  });
});
