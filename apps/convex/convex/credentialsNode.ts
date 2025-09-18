"use node";
import { action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import * as crypto from "crypto";
import { api } from "./_generated/api";
import { verifyPassword, hmacFingerprint } from "./lib/passwordUtils";
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

    for (const credential of credentials) {
      const event = await ctx.runQuery(api.events.get, {
        eventId: credential.eventId,
      });
      if (event && event.status === "active" && verifyCredential(credential)) {
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
