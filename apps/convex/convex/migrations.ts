import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";

// Create migrations instance and runner
export const migrations = new Migrations(components.migrations);
export const run = migrations.runner();

// User name parsing migration - parse concatenated name to firstName/lastName
export const parseUserNamesToFirstLast = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    // Only migrate if has name but missing firstName/lastName
    if (!user.name || typeof user.name !== "string" || user.name.trim() === "") return;
    if (user.firstName && user.lastName) return; // Already migrated

    const parts = user.name.trim().split(" ").filter((p: string) => p.trim());
    if (parts.length === 0) return;

    if (parts.length === 1) {
      // Single name goes to firstName, lastName empty
      return { firstName: parts[0], lastName: "" };
    } else {
      // Last part is lastName, everything else is firstName
      return {
        firstName: parts.slice(0, -1).join(" "),
        lastName: parts[parts.length - 1]
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
        q.eq("eventId", rsvp.eventId).eq("listKey", rsvp.listKey!)
      )
      .unique();

    if (credential) {
      return { credentialId: credential._id };
    }
    // If no credential found, log it but don't fail
    console.warn(`No credential found for RSVP ${rsvp._id} with listKey: ${rsvp.listKey}`);
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
        q.eq("eventId", approval.eventId).eq("listKey", approval.listKey!)
      )
      .unique();

    if (credential) {
      return { credentialId: credential._id };
    }
    // If no credential found, log it but don't fail
    console.warn(`No credential found for approval ${approval._id} with listKey: ${approval.listKey}`);
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
        q.eq("eventId", redemption.eventId).eq("listKey", redemption.listKey!)
      )
      .unique();

    if (credential) {
      return { credentialId: credential._id };
    }
    // If no credential found, log it but don't fail
    console.warn(`No credential found for redemption ${redemption._id} with listKey: ${redemption.listKey}`);
  },
});