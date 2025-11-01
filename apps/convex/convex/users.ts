import { mutation, query, action } from "./functions";
import { v } from "convex/values";
import type { UserIdentity } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { createClerkClient } from "@clerk/backend";

type UserIdentityWithRole = UserIdentity & {
  role?: string;
  orgId?: string;
};

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
      const firstName = (u.firstName ?? "").toLowerCase();
      const lastName = (u.lastName ?? "").toLowerCase();
      const fullName = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim().toLowerCase();
      const phone = (u.phone ?? "").toLowerCase();
      return firstName.includes(search) || lastName.includes(search) || fullName.includes(search) || phone.includes(search);
    });

    // Sorting
    const sortBy = args.sortBy ?? "createdAt";
    const sortOrder = args.sortOrder ?? "desc";
    filtered.sort((a: Doc<"users">, b: Doc<"users">) => {
      const av = a[sortBy as keyof Doc<"users">];
      const bv = b[sortBy as keyof Doc<"users">];
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
        imageUrl: args.imageUrl,
        createdAt: now,
        updatedAt: now,
      });
      return { created: true } as const;
    } else {
      await ctx.db.patch(existing._id, {
        phone: args.phone ?? existing.phone,
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
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
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
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: identity.pictureUrl ?? undefined,
        createdAt: now,
        updatedAt: now,
      });
      return { created: true as const };
    }
    await ctx.db.patch(user._id, {
      firstName: args.firstName ?? user.firstName,
      lastName: args.lastName ?? user.lastName,
      updatedAt: now,
    });
    return { created: false as const };
  },
});

// Seed helper mutation - creates a user with any clerkUserId (for testing)
export const create = mutation({
  args: {
    clerkUserId: v.string(),
    phone: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      phone: args.phone,
      imageUrl: args.imageUrl,
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  },
});

// Delete a user (for cleaning up test data)
export const deleteUser = mutation({
  args: {
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (user) {
      await ctx.db.delete(user._id);
      return { deleted: true };
    }
    return { deleted: false };
  },
});

export const listOrganizationUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // Get all users and their org memberships
    const users = await ctx.db.query("users").collect();
    const orgMemberships = await ctx.db.query("orgMemberships").collect();

    // Include ALL users, with role as "guest" if no membership
    const usersWithRoles = users.map((user) => {
      const membership = orgMemberships.find(
        (m) => m.clerkUserId === user.clerkUserId,
      );

      return {
        _id: user._id,
        clerkUserId: user.clerkUserId,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
        role: membership?.role || "guest",
        organizationId: membership?.organizationId || null,
        hasOrganizationMembership: !!membership,
      };
    });

    return usersWithRoles.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const promoteUserToOrganization = mutation({
  args: {
    userId: v.id("users"),
    role: v.string(),
    organizationId: v.optional(v.string()),
  },
  handler: async (ctx, { userId, role, organizationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // Check if current user is admin using Clerk role
    const userRole = (identity as UserIdentityWithRole).role;
    const hasAdminRole = userRole === "org:admin";
    if (!hasAdminRole) {
      throw new Error("Only admins can promote users");
    }

    // Get the admin's organization ID from their membership (fallback to Clerk org if available)
    const currentUserMembership = await ctx.db
      .query("orgMemberships")
      .filter((q) => q.eq(q.field("clerkUserId"), identity.subject))
      .first();

    // Get the target user
    const targetUser = await ctx.db.get(userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    // Check if user already has membership
    const existingMembership = await ctx.db
      .query("orgMemberships")
      .filter((q) => q.eq(q.field("clerkUserId"), targetUser.clerkUserId))
      .first();

    if (existingMembership) {
      throw new Error("User already has organization membership");
    }

    // Validate role
    const validRoles = ["admin", "member"];
    if (!validRoles.includes(role)) {
      throw new Error("Invalid role");
    }

    // Use the admin's organization or provided organizationId or Clerk org
    const orgId =
      organizationId ||
      currentUserMembership?.organizationId ||
      (identity as UserIdentityWithRole).orgId ||
      "default-org";

    // Validate clerkUserId exists
    if (!targetUser.clerkUserId) {
      throw new Error("User does not have a valid Clerk ID");
    }

    // Create new organization membership
    await ctx.db.insert("orgMemberships", {
      clerkUserId: targetUser.clerkUserId,
      organizationId: orgId,
      role,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    newRole: v.string(),
  },
  handler: async (ctx, { userId, newRole }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // Check if current user is admin using Clerk role
    const role = (identity as UserIdentityWithRole).role;
    const hasAdminRole = role === "org:admin";
    if (!hasAdminRole) {
      throw new Error("Only admins can change user roles");
    }

    // Get the admin's organization ID from their membership (fallback to Clerk org if available)
    const currentUserMembership = await ctx.db
      .query("orgMemberships")
      .filter((q) => q.eq(q.field("clerkUserId"), identity.subject))
      .first();

    // Get the target user
    const targetUser = await ctx.db.get(userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    // Validate role
    const validRoles = ["admin", "member"];
    if (!validRoles.includes(newRole)) {
      throw new Error("Invalid role");
    }

    // Find the user's organization membership
    const targetMembership = await ctx.db
      .query("orgMemberships")
      .filter((q) => q.eq(q.field("clerkUserId"), targetUser.clerkUserId))
      .first();

    if (!targetMembership) {
      // Validate clerkUserId exists
      if (!targetUser.clerkUserId) {
        throw new Error("User does not have a valid Clerk ID");
      }

      // User doesn't have membership yet, create one (promote from guest)
      const orgId =
        currentUserMembership?.organizationId ||
        (identity as UserIdentityWithRole).orgId ||
        "default-org";
      await ctx.db.insert("orgMemberships", {
        clerkUserId: targetUser.clerkUserId,
        organizationId: orgId,
        role: newRole,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      // User has membership, update their role
      await ctx.db.patch(targetMembership._id, {
        role: newRole,
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

type OrganizationUserSortOption = "createdAt" | "name" | "role";
type OrganizationUserSortDirection = "asc" | "desc";

const normalizeRoleValue = (role: string): string => role.replace(/^org:/, "");

const resolveRolePriority = (role: string): number => {
  const normalizedRole = normalizeRoleValue(role);
  switch (normalizedRole) {
    case "admin":
      return 0;
    case "member":
      return 1;
    case "guest":
      return 2;
    default:
      return 3;
  }
};

const resolveDisplayNameForSort = (user: {
  firstName?: string | null;
  lastName?: string | null;
  clerkUserId?: string | null;
}): string => {
  const firstName = (user.firstName ?? "").trim();
  const lastName = (user.lastName ?? "").trim();
  const combined = `${firstName} ${lastName}`.trim();
  if (combined.length > 0) {
    return combined.toLowerCase();
  }
  return (user.clerkUserId ?? "").toLowerCase();
};

const sortOrganizationUsers = (
  users: Array<{
    firstName?: string | null;
    lastName?: string | null;
    clerkUserId?: string | null;
    createdAt: number;
    role: string;
  }>,
  sortBy: OrganizationUserSortOption,
  sortDirection: OrganizationUserSortDirection,
) => {
  const directionMultiplier = sortDirection === "asc" ? 1 : -1;
  return users.sort((firstUser, secondUser) => {
    let comparison = 0;
    if (sortBy === "name") {
      comparison = resolveDisplayNameForSort(firstUser).localeCompare(
        resolveDisplayNameForSort(secondUser),
      );
      if (comparison === 0) {
        comparison = firstUser.createdAt - secondUser.createdAt;
      }
    } else if (sortBy === "role") {
      comparison =
        resolveRolePriority(firstUser.role) - resolveRolePriority(secondUser.role);
      if (comparison === 0) {
        comparison = resolveDisplayNameForSort(firstUser).localeCompare(
          resolveDisplayNameForSort(secondUser),
        );
      }
      if (comparison === 0) {
        comparison = firstUser.createdAt - secondUser.createdAt;
      }
    } else {
      comparison = firstUser.createdAt - secondUser.createdAt;
      if (comparison === 0) {
        comparison = resolveDisplayNameForSort(firstUser).localeCompare(
          resolveDisplayNameForSort(secondUser),
        );
      }
    }
    return directionMultiplier * comparison;
  });
};

export const listOrganizationUsersPaginated = query({
  args: {
    pageIndex: v.optional(v.number()),
    pageSize: v.optional(v.number()),
    search: v.optional(v.string()),
    roleFilter: v.optional(v.string()),
    sortBy: v.optional(
      v.union(v.literal("createdAt"), v.literal("name"), v.literal("role")),
    ),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const pageIndex = args.pageIndex ?? 0;
    const pageSize = Math.min(args.pageSize ?? 10, 100); // Limit max page size to 100

    // Get all users and their org memberships
    const users = await ctx.db.query("users").collect();
    const orgMemberships = await ctx.db.query("orgMemberships").collect();

    // Include ALL users, with role as "guest" if no membership
    let usersWithRoles = users.map((user) => {
      const membership = orgMemberships.find(
        (m) => m.clerkUserId === user.clerkUserId,
      );

      return {
        _id: user._id,
        clerkUserId: user.clerkUserId,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
        role: membership?.role || "guest",
        organizationId: membership?.organizationId || null,
        hasOrganizationMembership: !!membership,
      };
    });

    // Apply search filter
    const searchTerm = args.search?.trim().toLowerCase();
    if (searchTerm) {
      usersWithRoles = usersWithRoles.filter((user) => {
        const firstName = (user.firstName || "").toLowerCase();
        const lastName = (user.lastName || "").toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
        const role = (user.role || "").toLowerCase();

        return (
          firstName.includes(searchTerm) ||
          lastName.includes(searchTerm) ||
          fullName.includes(searchTerm) ||
          role.includes(searchTerm)
        );
      });
    }

    // Apply role filter
    if (args.roleFilter && args.roleFilter !== "all") {
      const normalizedRoleFilter = normalizeRoleValue(args.roleFilter);
      usersWithRoles = usersWithRoles.filter(
        (user) => normalizeRoleValue(user.role) === normalizedRoleFilter,
      );
    }

    const sortBy: OrganizationUserSortOption = args.sortBy ?? "createdAt";
    const sortDirection: OrganizationUserSortDirection =
      args.sortDirection ?? (sortBy === "createdAt" ? "desc" : "asc");

    const sortedUsers = sortOrganizationUsers(
      usersWithRoles,
      sortBy,
      sortDirection,
    );

    // Calculate pagination
    const totalCount = sortedUsers.length;
    const startIndex = pageIndex * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedUsers = sortedUsers.slice(startIndex, endIndex);

    const hasNextPage = endIndex < totalCount;
    const hasPreviousPage = pageIndex > 0;

    return {
      users: paginatedUsers,
      pagination: {
        pageIndex,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        hasNextPage,
        hasPreviousPage,
        startIndex: startIndex + 1,
        endIndex: Math.min(endIndex, totalCount),
        sortBy,
        sortDirection,
      },
    };
  },
});

export const getUserStats = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== clerkUserId) {
      throw new Error("Unauthorized");
    }

    const totalRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .collect();

  const organizationMembers = await ctx.db
    .query("orgMemberships")
    .collect();

    return {
      total: organizationMembers.length,
      admin: organizationMembers.filter((member) => member.role === "org:admin").length,
      member: organizationMembers.filter((member) => member.role === "org:member").length,
      guest: organizationMembers.filter((member) => member.role === "org:guest").length,
      organizationMembers: organizationMembers.length,
      totalRsvps: totalRsvps.length,
      approvedRsvps: totalRsvps.filter((rsvp) => rsvp.status === "approved").length,
      deniedRsvps: totalRsvps.filter((rsvp) => rsvp.status === "denied").length,
      lastUpdated: Date.now(),
    };
  },
});

export const promoteUserToOrganizationWithClerk = action({
  args: {
    userId: v.id("users"),
    role: v.string(),
    organizationId: v.optional(v.string()),
  },
  handler: async (ctx, { userId, role, organizationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const userRole = (identity as UserIdentityWithRole).role;
    const hasAdminRole = userRole === "org:admin";
    if (!hasAdminRole) {
      throw new Error("Only admins can promote users");
    }

    const targetUserRecord = await ctx.runQuery(api.users.getById, { userId });
    const targetClerkUserId = targetUserRecord?.clerkUserId;
    if (!targetClerkUserId) {
      throw new Error("Target user missing Clerk ID");
    }

    const targetUser = await ctx.runQuery(api.users.getByClerkUser, {
      clerkUserId: targetClerkUserId,
    });

    if (!targetUser || !targetUser.clerkUserId) {
      throw new Error("User not found or missing Clerk ID");
    }

    let clerkOrgId = organizationId;
    if (!clerkOrgId) {
      const currentUserMemberships = await ctx.runQuery(
        api.orgMemberships.listForUser,
        { clerkUserId: identity.subject },
      );
      if (currentUserMemberships.length === 0) {
        throw new Error("Current user has no organization membership");
      }
      clerkOrgId = currentUserMemberships[0].organizationId;
    }
    if (!clerkOrgId) {
      throw new Error("Unable to resolve organization ID for Clerk promotion");
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY not configured");
    }

    const clerkRole = role === "admin" ? "org:admin" : "org:member";

    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    await clerk.organizations.createOrganizationMembership({
      organizationId: clerkOrgId,
      userId: targetUser.clerkUserId,
      role: clerkRole,
    });

    await ctx.runMutation(api.users.promoteUserToOrganization, {
      userId,
      role,
      organizationId: clerkOrgId,
    });

    return { success: true };
  },
});

export const updateUserRoleWithClerk = action({
  args: {
    userId: v.id("users"),
    newRole: v.string(),
  },
  handler: async (ctx, { userId, newRole }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const userRole = (identity as UserIdentityWithRole).role;
    const hasAdminRole = userRole === "org:admin";
    if (!hasAdminRole) {
      throw new Error("Only admins can change user roles");
    }

    const targetUserRecord = await ctx.runQuery(api.users.getById, { userId });
    const targetClerkUserId = targetUserRecord?.clerkUserId;
    if (!targetClerkUserId) {
      throw new Error("Target user missing Clerk ID");
    }

    const targetUser = await ctx.runQuery(api.users.getByClerkUser, {
      clerkUserId: targetClerkUserId,
    });

    if (!targetUser || !targetUser.clerkUserId) {
      throw new Error("User not found or missing Clerk ID");
    }

    const currentUserMemberships = await ctx.runQuery(
      api.orgMemberships.listForUser,
      { clerkUserId: identity.subject },
    );
    if (currentUserMemberships.length === 0) {
      throw new Error("Current user has no organization membership");
    }
    const clerkOrgId = currentUserMemberships[0].organizationId;

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY not configured");
    }

    const clerkRole = newRole === "admin" ? "org:admin" : "org:member";

    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    await clerk.organizations.updateOrganizationMembership({
      organizationId: clerkOrgId,
      userId: targetUser.clerkUserId,
      role: clerkRole,
    });

    await ctx.runMutation(api.users.updateUserRole, {
      userId,
      newRole,
    });

    return { success: true };
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  },
});
