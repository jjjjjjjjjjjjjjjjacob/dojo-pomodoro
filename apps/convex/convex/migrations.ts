import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Create migrations instance and runner
export const migrations = new Migrations(components.migrations);
export const run = migrations.runner();

// User name parsing migration - parse concatenated name to firstName/lastName
export const parseUserNamesToFirstLast = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    // Only migrate if has name but missing firstName/lastName
    if (!user.name || typeof user.name !== "string" || user.name.trim() === "")
      return;
    if (user.firstName && user.lastName) return; // Already migrated

    const parts = user.name
      .trim()
      .split(" ")
      .filter((p: string) => p.trim());
    if (parts.length === 0) return;

    if (parts.length === 1) {
      // Single name goes to firstName, lastName empty
      return { firstName: parts[0], lastName: "" };
    } else {
      // Last part is lastName, everything else is firstName
      return {
        firstName: parts.slice(0, -1).join(" "),
        lastName: parts[parts.length - 1],
      };
    }
  },
});

// RSVP credential migration - migrate listKey to credentialId
export const migrateRsvpsCredentialRefs = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvp) => {
    if (rsvp.credentialId) return; // Already migrated
    if (!rsvp.listKey) return; // Nothing to migrate

    const credential = await ctx.db
      .query("listCredentials")
      .withIndex("by_event_key", (q: any) =>
        q.eq("eventId", rsvp.eventId).eq("listKey", rsvp.listKey),
      )
      .unique();

    if (credential) {
      return { credentialId: credential._id };
    }
    // If no credential found, log it but don't fail
    console.warn(
      `No credential found for RSVP ${rsvp._id} with listKey: ${rsvp.listKey}`,
    );
  },
});

// Approvals credential migration - migrate listKey to credentialId
export const migrateApprovalsCredentialRefs = migrations.define({
  table: "approvals",
  migrateOne: async (ctx, approval) => {
    if (approval.credentialId) return; // Already migrated
    if (!approval.listKey) return; // Nothing to migrate

    const credential = await ctx.db
      .query("listCredentials")
      .withIndex("by_event_key", (q: any) =>
        q.eq("eventId", approval.eventId).eq("listKey", approval.listKey),
      )
      .unique();

    if (credential) {
      return { credentialId: credential._id };
    }
    // If no credential found, log it but don't fail
    console.warn(
      `No credential found for approval ${approval._id} with listKey: ${approval.listKey}`,
    );
  },
});

// Redemptions credential migration - migrate listKey to credentialId
export const migrateRedemptionsCredentialRefs = migrations.define({
  table: "redemptions",
  migrateOne: async (ctx, redemption) => {
    if (redemption.credentialId) return; // Already migrated
    if (!redemption.listKey) return; // Nothing to migrate

    const credential = await ctx.db
      .query("listCredentials")
      .withIndex("by_event_key", (q: any) =>
        q.eq("eventId", redemption.eventId).eq("listKey", redemption.listKey),
      )
      .unique();

    if (credential) {
      return { credentialId: credential._id };
    }
    // If no credential found, log it but don't fail
    console.warn(
      `No credential found for redemption ${redemption._id} with listKey: ${redemption.listKey}`,
    );
  },
});

// Backfill userName field for search functionality
export const backfillUserNameInRsvps = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvp) => {
    // Skip if userName is already populated
    if (
      rsvp.userName &&
      typeof rsvp.userName === "string" &&
      rsvp.userName.trim() !== ""
    )
      return;

    // Get user data via clerkUserId
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q: any) =>
        q.eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();

    if (user) {
      // Construct display name from users table
      let displayName = "";
      if (
        user.firstName &&
        user.lastName &&
        typeof user.firstName === "string" &&
        typeof user.lastName === "string"
      ) {
        displayName = `${user.firstName} ${user.lastName}`;
      } else if (user.firstName && typeof user.firstName === "string") {
        displayName = user.firstName;
      } else if (user.name && typeof user.name === "string") {
        displayName = user.name;
      }

      if (displayName.trim()) {
        return { userName: displayName.trim() };
      }
    }
  },
});

// Backfill RSVP customFieldValues from user metadata when possible
export const backfillRsvpCustomFieldsFromUserMetadata = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvp) => {
    const existingValues = rsvp.customFieldValues ?? {};

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q: any) =>
        q.eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();

    if (!user?.metadata || Object.keys(user.metadata).length === 0) {
      return;
    }

    const event = await ctx.db.get(rsvp.eventId as Id<"events">);
    if (!event?.customFields || event.customFields.length === 0) {
      return;
    }

    const fieldMap = new Map(
      event.customFields.map((definition: any) => [definition.key, definition]),
    );

    let modified = false;
    const nextValues: Record<string, string> = { ...existingValues };

    for (const [metadataKey, metadataValue] of Object.entries(user.metadata)) {
      const definition = fieldMap.get(metadataKey);
      if (!definition) continue;
      if (nextValues[metadataKey] !== undefined) continue;
      const stringValue =
        typeof metadataValue === "string"
          ? metadataValue
          : `${metadataValue ?? ""}`;
      const finalValue = definition.trimWhitespace === false
        ? stringValue
        : stringValue.trim();
      if (!finalValue) continue;
      nextValues[metadataKey] = finalValue;
      modified = true;
    }

    if (!modified) {
      return;
    }

    if (Object.keys(nextValues).length === 0) {
      return { customFieldValues: undefined };
    }

    return { customFieldValues: nextValues };
  },
});

// Consolidate user metadata into RSVP customFieldValues and drop metadata field
export const migrateUserMetadataIntoRsvpCustomFields = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    if (!user.metadata || Object.keys(user.metadata).length === 0) {
      return { metadata: undefined };
    }

    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (q) => q.eq("clerkUserId", user.clerkUserId))
      .collect();

    for (const rsvp of rsvps) {
      const currentValues = rsvp.customFieldValues ?? {};
      const nextValues: Record<string, string> = { ...currentValues };

      const event = await ctx.db.get(rsvp.eventId as Id<"events">);
      if (!event?.customFields || event.customFields.length === 0) continue;

      const fieldMap = new Map(
        event.customFields.map((definition: any) => [definition.key, definition]),
      );

      let modified = false;
      for (const [key, value] of Object.entries(user.metadata ?? {})) {
        const definition = fieldMap.get(key);
        if (!definition) continue;
        if (nextValues[key] !== undefined) continue;
        const stringValue =
          typeof value === "string" ? value : `${value ?? ""}`;
        const finalValue = definition.trimWhitespace === false
          ? stringValue
          : stringValue.trim();
        if (!finalValue) continue;
        nextValues[key] = finalValue;
        modified = true;
      }

      if (modified) {
        await ctx.db.patch(rsvp._id, {
          customFieldValues:
            Object.keys(nextValues).length > 0 ? nextValues : undefined,
          updatedAt: Date.now(),
        });
        console.log(
          `[METADATA MIGRATION] Applied metadata from user ${user._id} to RSVP ${rsvp._id}`,
        );
      }
    }

    console.log(`[METADATA MIGRATION] Clearing metadata for user ${user._id}`);

    return { metadata: undefined };
  },
});

// ==================== CREDENTIALID SUNSET MIGRATIONS ====================

// Phase 1: Validation migrations - Ensure all records have complete listKey data
export const validateDataIntegrityBeforeCredentialIdSunset = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvp, { showLogs = false } = {}) => {
    // Ensure every RSVP has a listKey
    if (
      !rsvp.listKey ||
      typeof rsvp.listKey !== "string" ||
      rsvp.listKey.trim() === ""
    ) {
      // Try to recover from credentialId if available
      if (rsvp.credentialId) {
        const credential = await ctx.db.get(
          rsvp.credentialId as Id<"listCredentials">,
        );
        if (credential && credential.listKey) {
          if (showLogs) {
            console.log(
              `[VALIDATION] Recovering listKey for RSVP ${rsvp._id}: ${credential.listKey}`,
            );
          }
          return { listKey: credential.listKey };
        }
      }

      // If we can't recover, this is a data integrity issue
      throw new Error(
        `RSVP ${rsvp._id} missing listKey and cannot recover from credentialId`,
      );
    }

    // Validation passed
    return;
  },
});

export const validateApprovalsDataIntegrity = migrations.define({
  table: "approvals",
  migrateOne: async (ctx, approval, { showLogs = false } = {}) => {
    if (
      !approval.listKey ||
      typeof approval.listKey !== "string" ||
      approval.listKey.trim() === ""
    ) {
      if (approval.credentialId) {
        const credential = await ctx.db.get(
          approval.credentialId as Id<"listCredentials">,
        );
        if (credential && credential.listKey) {
          if (showLogs) {
            console.log(
              `[VALIDATION] Recovering listKey for approval ${approval._id}: ${credential.listKey}`,
            );
          }
          return { listKey: credential.listKey };
        }
      }
      throw new Error(
        `Approval ${approval._id} missing listKey and cannot recover from credentialId`,
      );
    }
    return;
  },
});

export const validateRedemptionsDataIntegrity = migrations.define({
  table: "redemptions",
  migrateOne: async (ctx, redemption, { showLogs = false } = {}) => {
    if (
      !redemption.listKey ||
      typeof redemption.listKey !== "string" ||
      redemption.listKey.trim() === ""
    ) {
      if (redemption.credentialId) {
        const credential = await ctx.db.get(
          redemption.credentialId as Id<"listCredentials">,
        );
        if (credential && credential.listKey) {
          if (showLogs) {
            console.log(
              `[VALIDATION] Recovering listKey for redemption ${redemption._id}: ${credential.listKey}`,
            );
          }
          return { listKey: credential.listKey };
        }
      }
      throw new Error(
        `Redemption ${redemption._id} missing listKey and cannot recover from credentialId`,
      );
    }
    return;
  },
});

// Phase 2: CredentialId removal migrations - Remove credentialId fields completely
export const sunsetCredentialIdFromRsvps = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvp, { showLogs = false } = {}) => {
    // Only remove credentialId if it exists
    if (rsvp.credentialId !== undefined) {
      if (showLogs) {
        console.log(`[SUNSET] Removing credentialId from RSVP ${rsvp._id}`);
      }
      return { credentialId: undefined };
    }
    return;
  },
});

export const sunsetCredentialIdFromApprovals = migrations.define({
  table: "approvals",
  migrateOne: async (ctx, approval, { showLogs = false } = {}) => {
    if (approval.credentialId !== undefined) {
      if (showLogs) {
        console.log(
          `[SUNSET] Removing credentialId from approval ${approval._id}`,
        );
      }
      return { credentialId: undefined };
    }
    return;
  },
});

export const sunsetCredentialIdFromRedemptions = migrations.define({
  table: "redemptions",
  migrateOne: async (ctx, redemption, { showLogs = false } = {}) => {
    if (redemption.credentialId !== undefined) {
      if (showLogs) {
        console.log(
          `[SUNSET] Removing credentialId from redemption ${redemption._id}`,
        );
      }
      return { credentialId: undefined };
    }
    return;
  },
});

// Remove legacy name field from users when firstName/lastName are present
export const removeNameFromUsersWithFirstLastName = migrations.define({
  table: "users",
  migrateOne: async (ctx, user, { showLogs = false } = {}) => {
    // Only remove name if user has firstName OR lastName populated
    if (
      (user.firstName && typeof user.firstName === "string" && user.firstName.trim()) ||
      (user.lastName && typeof user.lastName === "string" && user.lastName.trim())
    ) {
      // Only remove if name field actually exists
      if (user.name !== undefined) {
        if (showLogs) {
          console.log(
            `[CLEANUP] Removing legacy name field from user ${user._id} (has firstName: ${!!user.firstName}, lastName: ${!!user.lastName})`,
          );
        }
        return { name: undefined };
      }
    }
    return;
  },
});

