"use node";
import { action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import * as crypto from "crypto";
import { api } from "./_generated/api";
import { verifyPassword, hmacFingerprint, decryptPassword } from "./lib/passwordUtils";
import { ValidationError } from "./lib/types";

export const resolveListByPassword = action({
  args: {
    eventId: v.id("events"),
    password: v.string(),
  },
  handler: async (ctx, { eventId, password }): Promise<{ ok: true; listKey: string } | { ok: false }> => {
    const credentials = await ctx.runQuery(api.credentials.getCredsForEvent, {
      eventId,
    });
    for (const credential of credentials) {
      if (
        verifyPassword(
          password,
          credential.passwordHash,
          credential.passwordSalt,
          credential.passwordIterations,
        )
      ) {
        return { ok: true as const, listKey: credential.listKey };
      }
    }
    return { ok: false as const };
  },
});

export const resolveEventByPassword = action({
  args: { password: v.string() },
  handler: async (ctx, { password }): Promise<{ ok: true; eventId: string; listKey: string } | { ok: false }> => {
    const fingerprintSecret = process.env.FINGERPRINT_SECRET as
      | string
      | undefined;
    if (!fingerprintSecret)
      throw new ValidationError("Missing FINGERPRINT_SECRET env");
    const fingerprint = hmacFingerprint(fingerprintSecret, password);
    const credentials = await ctx.runQuery(api.credentials.getByFingerprint, {
      fingerprint,
    });
    if (credentials.length === 0) return { ok: false as const };

    const verifyCredential = (credential: (typeof credentials)[0]) => {
      return verifyPassword(
        password,
        credential.passwordHash,
        credential.passwordSalt,
        credential.passwordIterations,
      );
    };

    const now = Date.now();

    // First, try to find featured event with valid password
    for (const credential of credentials) {
      const event = await ctx.runQuery(api.events.get, {
        eventId: credential.eventId,
      });
      if (event && event.isFeatured && verifyCredential(credential)) {
        return {
          ok: true as const,
          eventId: credential.eventId,
          listKey: credential.listKey,
        };
      }
    }

    // If no featured event, try upcoming events
    for (const credential of credentials) {
      const event = await ctx.runQuery(api.events.get, {
        eventId: credential.eventId,
      });
      if (event && event.eventDate > now && verifyCredential(credential)) {
        return {
          ok: true as const,
          eventId: credential.eventId,
          listKey: credential.listKey,
        };
      }
    }
    const firstCredential = credentials[0];
    if (verifyCredential(firstCredential))
      return {
        ok: true as const,
        eventId: firstCredential.eventId,
        listKey: firstCredential.listKey,
      };
    return { ok: false as const };
  },
});

type UserIdentityWithRole = { role?: string; subject: string };

/**
 * Decrypt passwords for all credentials of an event.
 * Returns list key + decrypted password pairs.
 * Host-only action (requires org:admin role).
 */
export const getDecryptedPasswordsForEvent = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<
    { listKey: string; password: string | null; credentialId: string }[]
  > => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const userRole = (identity as unknown as UserIdentityWithRole).role;
    if (userRole !== "org:admin") {
      throw new Error("Forbidden: admin role required");
    }

    const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    const credentials = await ctx.runQuery(api.credentials.getCredsForEvent, {
      eventId,
    });

    return credentials.map((credential: any) => {
      let decryptedPassword: string | null = null;
      if (credential.encryptedPassword && encryptionKey) {
        try {
          decryptedPassword = decryptPassword(
            credential.encryptedPassword,
            encryptionKey,
          );
        } catch (error) {
          console.error(
            `[DECRYPT] Failed to decrypt password for credential ${credential._id}:`,
            error,
          );
        }
      }
      return {
        listKey: credential.listKey,
        password: decryptedPassword,
        credentialId: credential._id,
      };
    });
  },
});
