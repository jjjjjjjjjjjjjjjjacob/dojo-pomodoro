import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { Id } from "./_generated/dataModel";

type EventCustomFieldDefinition = {
  key: string;
  trimWhitespace?: boolean;
};

type MetadataRecord = Record<string, unknown>;

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
  migrateOne: async (
    ctx,
    rawRsvp,
  ): Promise<{ customFieldValues?: Record<string, string> } | void> => {
    const rsvp = rawRsvp as Doc<"rsvps">;
    const existingValues: Record<string, string> = {};
    const storedCustomFields = rsvp.customFieldValues;
    if (storedCustomFields && typeof storedCustomFields === "object") {
      for (const [key, value] of Object.entries(storedCustomFields)) {
        if (typeof value === "string") {
          existingValues[key] = value;
        }
      }
    }

    const user = (await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (query) =>
        query.eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique()) as Doc<"users"> | null;

    const userMetadata: MetadataRecord | undefined =
      user?.metadata && typeof user.metadata === "object"
        ? (user.metadata as MetadataRecord)
        : undefined;
    if (!userMetadata || Object.keys(userMetadata).length === 0) {
      return;
    }

    const event = (await ctx.db.get(
      rsvp.eventId as Id<"events">,
    )) as Doc<"events"> | null;
    const customFields = event?.customFields as
      | EventCustomFieldDefinition[]
      | undefined;
    if (!customFields || customFields.length === 0) {
      return;
    }

    const fieldMap = new Map<string, EventCustomFieldDefinition>(
      customFields.map((definition) => [definition.key, definition]),
    );

    let modified = false;
    const nextValues: Record<string, string> = { ...existingValues };

    for (const [metadataKey, metadataValue] of Object.entries(userMetadata)) {
      const definition = fieldMap.get(metadataKey);
      if (!definition) continue;
      if (nextValues[metadataKey] !== undefined) continue;
      if (metadataValue === undefined || metadataValue === null) continue;
      const stringValue = String(metadataValue);
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

    const sanitizedEntries: Array<[string, string]> = [];
    for (const [key, value] of Object.entries(nextValues)) {
      if (typeof value === "string" && value !== "") {
        sanitizedEntries.push([key, value]);
      }
    }

    if (sanitizedEntries.length === 0) {
      return;
    }

    const sanitizedValues = Object.fromEntries(sanitizedEntries) as Record<string, string>;

    return { customFieldValues: sanitizedValues };
  },
});

// Consolidate user metadata into RSVP customFieldValues and drop metadata field
export const migrateUserMetadataIntoRsvpCustomFields = migrations.define({
  table: "users",
  migrateOne: async (
    ctx,
    rawUser,
  ): Promise<{ metadata?: undefined } | void> => {
    const user = rawUser as Doc<"users">;
    const userMetadata: MetadataRecord | undefined =
      user.metadata && typeof user.metadata === "object"
        ? (user.metadata as MetadataRecord)
        : undefined;
    if (!userMetadata || Object.keys(userMetadata).length === 0) {
      return { metadata: undefined };
    }

    const clerkUserId = user.clerkUserId;
    if (!clerkUserId) {
      return { metadata: undefined };
    }

    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (query) =>
        query.eq("clerkUserId", clerkUserId),
      )
      .collect();

    for (const rsvp of rsvps) {
      const existingValues: Record<string, string> = {};
      if (rsvp.customFieldValues && typeof rsvp.customFieldValues === "object") {
        for (const [key, value] of Object.entries(rsvp.customFieldValues)) {
          if (typeof value === "string") {
            existingValues[key] = value;
          }
        }
      }
      const nextValues: Record<string, string> = { ...existingValues };

      const event = (await ctx.db.get(
        rsvp.eventId as Id<"events">,
      )) as Doc<"events"> | null;
      const customFields = event?.customFields as
        | EventCustomFieldDefinition[]
        | undefined;
      if (!customFields || customFields.length === 0) continue;

      const fieldMap = new Map<string, EventCustomFieldDefinition>(
        customFields.map((definition) => [definition.key, definition]),
      );

      let modified = false;
      for (const [key, value] of Object.entries(userMetadata)) {
        const definition = fieldMap.get(key);
        if (!definition) continue;
        if (nextValues[key] !== undefined) continue;
        if (value === undefined || value === null) continue;
        const stringValue = String(value);
        const finalValue = definition.trimWhitespace === false
          ? stringValue
          : stringValue.trim();
        if (!finalValue) continue;
        nextValues[key] = finalValue;
        modified = true;
      }

      if (!modified) {
        continue;
      }

      const sanitizedEntries: Array<[string, string]> = [];
      for (const [key, value] of Object.entries(nextValues)) {
        if (typeof value === "string" && value !== "") {
          sanitizedEntries.push([key, value]);
        }
      }

      if (sanitizedEntries.length === 0) {
        continue;
      }

      const sanitizedValues = Object.fromEntries(sanitizedEntries) as Record<string, string>;

      await ctx.db.patch(rsvp._id as Id<"rsvps">, {
        customFieldValues: sanitizedValues,
        updatedAt: Date.now(),
      });
      console.log(
        `[METADATA MIGRATION] Applied metadata from user ${user._id} to RSVP ${rsvp._id}`,
      );
    }

    console.log(`[METADATA MIGRATION] Clearing metadata for user ${user._id}`);

    return { metadata: undefined };
  },
});

// ==================== CREDENTIALID SUNSET MIGRATIONS ====================

// Phase 1: Validation migrations - Ensure all records have complete listKey data
export const validateDataIntegrityBeforeCredentialIdSunset = migrations.define({
  table: "rsvps",
  migrateOne: async (
    ctx,
    rawRsvp,
    { showLogs = false }: { showLogs?: boolean } = {},
  ) => {
    const rsvp = rawRsvp as Doc<"rsvps">;
    if (!rsvp.listKey || rsvp.listKey.trim() === "") {
      if (showLogs) {
        console.warn(
          `[VALIDATION] RSVP ${rsvp._id} missing listKey. Attempting to recover from associated credential.`,
        );
      }

      const credentialId = (rsvp as { credentialId?: Id<"listCredentials"> }).credentialId;

      if (credentialId) {
        const credential = await ctx.db.get(
          credentialId as Id<"listCredentials">,
        );
        if (credential?.listKey) {
          if (showLogs) {
            console.log(
              `[VALIDATION] Recovered listKey for RSVP ${rsvp._id} from credential ${credential._id}.`,
            );
          }
          return { listKey: credential.listKey };
        }
      }

      throw new Error(
        `RSVP ${rsvp._id} missing listKey and no credential fallback available.`,
      );
    }

    return;
  },
});

export const validateApprovalsDataIntegrity = migrations.define({
  table: "approvals",
  migrateOne: async (
    ctx,
    rawApproval,
    { showLogs = false }: { showLogs?: boolean } = {},
  ) => {
    const approval = rawApproval as Doc<"approvals">;
    if (!approval.listKey || approval.listKey.trim() === "") {
      if (showLogs) {
        console.warn(
          `[VALIDATION] Approval ${approval._id} missing listKey. Attempting to recover from credential.`,
        );
      }

      const credentialId = (approval as { credentialId?: Id<"listCredentials"> }).credentialId;

      if (credentialId) {
        const credential = await ctx.db.get(
          credentialId as Id<"listCredentials">,
        );
        if (credential?.listKey) {
          if (showLogs) {
            console.log(
              `[VALIDATION] Recovered listKey for approval ${approval._id} from credential ${credential._id}.`,
            );
          }
          return { listKey: credential.listKey };
        }
      }

      throw new Error(
        `Approval ${approval._id} missing listKey and no credential fallback available.`,
      );
    }
    return;
  },
});

export const validateRedemptionsDataIntegrity = migrations.define({
  table: "redemptions",
  migrateOne: async (
    ctx,
    rawRedemption,
    { showLogs = false }: { showLogs?: boolean } = {},
  ) => {
    const redemption = rawRedemption as Doc<"redemptions">;
    if (!redemption.listKey || redemption.listKey.trim() === "") {
      if (showLogs) {
        console.warn(
          `[VALIDATION] Redemption ${redemption._id} missing listKey. Attempting to recover from credential.`,
        );
      }

      const credentialId = (redemption as { credentialId?: Id<"listCredentials"> }).credentialId;

      if (credentialId) {
        const credential = await ctx.db.get(
          credentialId as Id<"listCredentials">,
        );
        if (credential?.listKey) {
          if (showLogs) {
            console.log(
              `[VALIDATION] Recovered listKey for redemption ${redemption._id} from credential ${credential._id}.`,
            );
          }
          return { listKey: credential.listKey };
        }
      }

      throw new Error(
        `Redemption ${redemption._id} missing listKey and no credential fallback available.`,
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

