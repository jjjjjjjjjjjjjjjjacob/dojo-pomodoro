import { mutation, query } from "./functions";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";

type Enc = { ivB64: string; ctB64: string; tagB64: string };

export const saveEncryptedContact = mutation({
  args: {
    clerkUserId: v.string(),
    phoneEnc: v.optional(v.object({ ivB64: v.string(), ctB64: v.string(), tagB64: v.string() })),
    phoneObfuscated: v.optional(v.string()),
  },
  handler: async (ctx, { clerkUserId, phoneEnc, phoneObfuscated }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (!existing) {
      await ctx.db.insert("profiles", {
        clerkUserId,
        phoneEnc,
        phoneObfuscated,
        createdAt: now,
        updatedAt: now,
      });
      return { created: true } as const;
    } else {
      await ctx.db.patch(existing._id, {
        phoneEnc: phoneEnc ?? existing.phoneEnc,
        phoneObfuscated: phoneObfuscated ?? existing.phoneObfuscated,
        updatedAt: now,
      });
      return { created: false } as const;
    }
  },
});

export const getForClerk = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (!profile) return { hasEmail: false, hasPhone: false } as const;
    return {
      hasEmail: false,
      hasPhone: !!profile.phoneEnc,
      emailObfuscated: undefined,
      phoneObfuscated: profile.phoneObfuscated,
    } as const;
  },
});

// Obfuscation helpers are now used in the Node action before saving.
