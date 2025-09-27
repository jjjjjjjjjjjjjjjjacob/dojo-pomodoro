import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { updateRsvpInAggregate } from "./rsvpAggregate";

/**
 * Cascade helper functions for maintaining referential integrity
 * These functions handle updating dependent records when parent records change
 */

export interface CascadeStats {
  rsvpsUpdated: number;
  approvalsUpdated: number;
  redemptionsUpdated: number;
  errors: string[];
}

/**
 * Cascades listKey changes to all dependent tables
 * Handles both credentialId-based and listKey-based relationships (for migration compatibility)
 * Runs atomically within the trigger transaction
 */
export async function cascadeListKeyUpdate(
  ctx: MutationCtx,
  eventId: Id<"events">,
  credentialId: Id<"listCredentials">,
  oldListKey: string,
  newListKey: string
): Promise<CascadeStats> {
  const stats: CascadeStats = {
    rsvpsUpdated: 0,
    approvalsUpdated: 0,
    redemptionsUpdated: 0,
    errors: []
  };

  console.log(`[CASCADE] Starting listKey update cascade: ${oldListKey} → ${newListKey} for event ${eventId}`);

  try {
    // Update RSVPs
    // Find records that match either credentialId OR (no credentialId AND listKey matches old value)
    const rsvpsToUpdate = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) =>
        q.or(
          q.eq(q.field("credentialId"), credentialId),
          q.and(
            q.eq(q.field("credentialId"), undefined),
            q.eq(q.field("listKey"), oldListKey)
          )
        )
      )
      .collect();

    for (const rsvp of rsvpsToUpdate) {
      const oldRsvp = { ...rsvp };
      await ctx.db.patch(rsvp._id, {
        listKey: newListKey,
        updatedAt: Date.now()
      });

      // Update RSVP aggregate to maintain consistency
      const newRsvp = await ctx.db.get(rsvp._id);
      if (newRsvp) {
        await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
      }

      stats.rsvpsUpdated++;
    }

    // Update Approvals
    const approvalsToUpdate = await ctx.db
      .query("approvals")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) =>
        q.or(
          q.eq(q.field("credentialId"), credentialId),
          q.and(
            q.eq(q.field("credentialId"), undefined),
            q.eq(q.field("listKey"), oldListKey)
          )
        )
      )
      .collect();

    for (const approval of approvalsToUpdate) {
      await ctx.db.patch(approval._id, { listKey: newListKey });
      stats.approvalsUpdated++;
    }

    // Update Redemptions
    const redemptionsToUpdate = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
      .filter((q) =>
        q.or(
          q.eq(q.field("credentialId"), credentialId),
          q.and(
            q.eq(q.field("credentialId"), undefined),
            q.eq(q.field("listKey"), oldListKey)
          )
        )
      )
      .collect();

    for (const redemption of redemptionsToUpdate) {
      await ctx.db.patch(redemption._id, { listKey: newListKey });
      stats.redemptionsUpdated++;
    }

    console.log(`[CASCADE] Completed listKey update: ${stats.rsvpsUpdated} RSVPs, ${stats.approvalsUpdated} approvals, ${stats.redemptionsUpdated} redemptions updated`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    stats.errors.push(`Cascade listKey update failed: ${errorMessage}`);
    console.error(`[CASCADE ERROR] ${errorMessage}`);
    throw error; // Re-throw to fail the entire transaction
  }

  return stats;
}

/**
 * Nullifies credentialId references when a listCredential is deleted
 * Preserves listKey for data integrity during migration period
 */
export async function nullifyCredentialReferences(
  ctx: MutationCtx,
  credentialId: Id<"listCredentials">,
  eventId: Id<"events">
): Promise<CascadeStats> {
  const stats: CascadeStats = {
    rsvpsUpdated: 0,
    approvalsUpdated: 0,
    redemptionsUpdated: 0,
    errors: []
  };

  console.log(`[CASCADE] Nullifying credentialId references for credential ${credentialId} in event ${eventId}`);

  try {
    // Update RSVPs - nullify credentialId but keep listKey
    const rsvpsToUpdate = await ctx.db
      .query("rsvps")
      .withIndex("by_event_credential", (q) =>
        q.eq("eventId", eventId).eq("credentialId", credentialId)
      )
      .collect();

    for (const rsvp of rsvpsToUpdate) {
      const oldRsvp = { ...rsvp };
      await ctx.db.patch(rsvp._id, {
        credentialId: undefined,
        updatedAt: Date.now()
      });

      // Update RSVP aggregate
      const newRsvp = await ctx.db.get(rsvp._id);
      if (newRsvp) {
        await updateRsvpInAggregate(ctx, oldRsvp, newRsvp);
      }

      stats.rsvpsUpdated++;
    }

    // Update Approvals - nullify credentialId but keep listKey
    const approvalsToUpdate = await ctx.db
      .query("approvals")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("credentialId"), credentialId))
      .collect();

    for (const approval of approvalsToUpdate) {
      await ctx.db.patch(approval._id, { credentialId: undefined });
      stats.approvalsUpdated++;
    }

    // Update Redemptions - nullify credentialId but keep listKey
    const redemptionsToUpdate = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("credentialId"), credentialId))
      .collect();

    for (const redemption of redemptionsToUpdate) {
      await ctx.db.patch(redemption._id, { credentialId: undefined });
      stats.redemptionsUpdated++;
    }

    console.log(`[CASCADE] Completed credentialId nullification: ${stats.rsvpsUpdated} RSVPs, ${stats.approvalsUpdated} approvals, ${stats.redemptionsUpdated} redemptions updated`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    stats.errors.push(`Nullify credential references failed: ${errorMessage}`);
    console.error(`[CASCADE ERROR] ${errorMessage}`);
    throw error; // Re-throw to fail the entire transaction
  }

  return stats;
}

/**
 * Determines if a cascade operation should be batched based on size
 * Returns true if the operation should use scheduled mutations for performance
 */
export async function shouldBatchCascade(
  ctx: MutationCtx,
  eventId: Id<"events">
): Promise<{ shouldBatch: boolean; estimatedSize: number }> {
  // Count total records that would be affected
  const [rsvpCount, approvalCount, redemptionCount] = await Promise.all([
    ctx.db.query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
      .then(results => results.length),
    ctx.db.query("approvals")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect()
      .then(results => results.length),
    ctx.db.query("redemptions")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
      .collect()
      .then(results => results.length)
  ]);

  const totalSize = rsvpCount + approvalCount + redemptionCount;

  // Batch if more than 100 total records (conservative threshold)
  return {
    shouldBatch: totalSize > 100,
    estimatedSize: totalSize
  };
}