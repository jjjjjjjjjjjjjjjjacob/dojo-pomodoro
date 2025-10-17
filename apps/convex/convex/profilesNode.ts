"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import crypto from "crypto";
import { api } from "./_generated/api";
import { formatPhoneNumberForSms, obfuscatePhoneNumber } from "./lib/phoneUtils";

type Enc = { ivB64: string; ctB64: string; tagB64: string };

function getKey(envGetter: (k: string) => string | undefined): Buffer {
  const base64 = envGetter("ENCRYPTION_KEY");
  if (!base64) throw new Error("Missing ENCRYPTION_KEY env");
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32)
    throw new Error("ENCRYPTION_KEY must be 32 bytes (base64 of 32 bytes)");
  return key;
}

function encryptString(key: Buffer, plaintext: string): Enc {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ivB64: iv.toString("base64"),
    ctB64: ct.toString("base64"),
    tagB64: tag.toString("base64"),
  };
}

function decryptString(key: Buffer, encData: Enc): string {
  const iv = Buffer.from(encData.ivB64, "base64");
  const ct = Buffer.from(encData.ctB64, "base64");
  const tag = Buffer.from(encData.tagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ct),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function obfuscateEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "******";
  const shownLocal = local.length ? local.slice(-1) : "";
  return `******${shownLocal}@${domain}`;
}

export const upsertEncryptedContact = action({
  args: { email: v.optional(v.string()), phone: v.optional(v.string()) },
  handler: async (ctx, { email, phone }): Promise<any> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const clerkUserId = identity.subject;
    const key = getKey((k) => (process.env as any)[k]);
    const emailEnc = email ? encryptString(key, email) : undefined;
    const phoneEnc = phone ? encryptString(key, phone) : undefined;
    const emailObfuscated = email ? obfuscateEmail(email) : undefined;
    const phoneObfuscated = phone ? obfuscatePhoneNumber(phone) : undefined;
    const res = await ctx.runMutation(
      api.profiles.saveEncryptedContact,
      {
        clerkUserId,
        phoneEnc,
        phoneObfuscated,
      },
    );
    return res;
  },
});

/**
 * Internal action to decrypt a phone number
 * Used by other Convex functions for SMS operations
 */
export const decryptPhoneInternal = internalAction({
  args: {
    phoneEnc: v.object({ ivB64: v.string(), ctB64: v.string(), tagB64: v.string() }),
  },
  handler: async (ctx, { phoneEnc }): Promise<string> => {
    const key = getKey((k) => (process.env as any)[k]);
    return decryptString(key, phoneEnc);
  },
});
