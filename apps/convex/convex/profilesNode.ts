"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import crypto from "crypto";
import { api } from "./_generated/api";

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

function obfuscatePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `******${last4}`;
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
    const phoneObfuscated = phone ? obfuscatePhone(phone) : undefined;
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
