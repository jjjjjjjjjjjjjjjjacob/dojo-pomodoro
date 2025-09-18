import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getAll = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    sortBy: v.optional(
      v.union(
        v.literal("createdAt"),
        v.literal("updatedAt"),
        v.literal("name"),
        v.literal("email"),
      ),
    ),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    filter: v.optional(
      v.object({
        clerkUserId: v.optional(v.string()),
        hasEmail: v.optional(v.boolean()),
        hasPhone: v.optional(v.boolean()),
        hasImage: v.optional(v.boolean()),
        createdAfter: v.optional(v.number()),
        createdBefore: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const all = await ctx.db.query("users").collect();

    // Apply search
    const search = args.search?.trim().toLowerCase();
    let filtered = all.filter((u) => {
      // Basic filter criteria
      if (args.filter?.clerkUserId && u.clerkUserId !== args.filter.clerkUserId)
        return false;
      // Email filtering not supported as email field doesn't exist in schema
      if (args.filter?.hasEmail === true) return false;
      if (args.filter?.hasEmail === false) return true;
      if (args.filter?.hasPhone === true && !u.phone) return false;
      if (args.filter?.hasPhone === false && !!u.phone) return false;
      if (args.filter?.hasImage === true && !u.imageUrl) return false;
      if (args.filter?.hasImage === false && !!u.imageUrl) return false;
      if (args.filter?.createdAfter && u.createdAt < args.filter.createdAfter)
        return false;
      if (args.filter?.createdBefore && u.createdAt > args.filter.createdBefore)
        return false;

      if (!search) return true;
      const name = (u.name ?? "").toLowerCase();
      const phone = (u.phone ?? "").toLowerCase();
      return (
        name.includes(search) ||
        phone.includes(search)
      );
    });

    // Sorting
    const sortBy = args.sortBy ?? "createdAt";
    const sortOrder = args.sortOrder ?? "desc";
    filtered.sort((a: any, b: any) => {
      const av = (a as any)[sortBy];
      const bv = (b as any)[sortBy];
      // Normalize undefined to empty/zero for stable sort
      const aNorm = av ?? (typeof bv === "string" ? "" : 0);
      const bNorm = bv ?? (typeof av === "string" ? "" : 0);
      if (aNorm < bNorm) return sortOrder === "asc" ? -1 : 1;
      if (aNorm > bNorm) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    // Pagination (offset/limit)
    const limit = Math.max(0, Math.min(200, args.limit ?? 50));
    const offset = Math.max(0, args.offset ?? 0);
    const items = filtered.slice(offset, offset + limit);
    const total = filtered.length;
    const nextOffset = offset + items.length;
    const hasMore = nextOffset < total;

    return {
      items,
      page: {
        offset,
        limit,
        total,
        hasMore,
        nextOffset: hasMore ? nextOffset : null,
      },
      sort: { by: sortBy, order: sortOrder },
      applied: { search: search ?? null, filter: args.filter ?? null },
    } as const;
  },
});

export const upsertFromClerk = mutation({
  args: {
    clerkUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (!existing) {
      await ctx.db.insert("users", {
        clerkUserId: args.clerkUserId,
        phone: args.phone,
        name: args.name,
        imageUrl: args.imageUrl,
        createdAt: now,
        updatedAt: now,
      });
      return { created: true } as const;
    } else {
      await ctx.db.patch(existing._id, {
        phone: args.phone ?? existing.phone,
        name: args.name ?? existing.name,
        imageUrl: args.imageUrl ?? existing.imageUrl,
        updatedAt: now,
      });
      return { created: false } as const;
    }
  },
});

export const getByClerkUser = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
  },
});

export const updateProfileMeta = mutation({
  args: {
    name: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    const now = Date.now();
    if (!user) {
      await ctx.db.insert("users", {
        clerkUserId: identity.subject,
        phone: identity.phoneNumber ?? undefined,
        name: args.name,
        imageUrl: identity.pictureUrl ?? undefined,
        metadata: args.metadata ?? undefined,
        createdAt: now,
        updatedAt: now,
      });
      return { created: true as const };
    }
    const mergedMeta = { ...(user.metadata ?? {}), ...(args.metadata ?? {}) };
    await ctx.db.patch(user._id, {
      name: args.name ?? user.name,
      metadata: mergedMeta,
      updatedAt: now,
    });
    return { created: false as const };
  },
});
