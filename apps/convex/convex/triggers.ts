import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { mutation as rawMutation } from "./_generated/server";
import { DataModel } from "./_generated/dataModel";

const triggers = new Triggers<DataModel>();

/**
 * Trigger: Keep userName synchronized in RSVPs when user name changes
 *
 * This maintains denormalized userName field for search performance
 * while ensuring it stays in sync with the users table.
 */
triggers.register("users", async (ctx, change) => {
  // Only react to updates where name fields might have changed
  if (change.operation === "insert" || change.operation === "update") {
    const user = change.newDoc;

    // Skip if user doesn't have a clerkUserId (shouldn't happen but be safe)
    if (!user.clerkUserId) return;

    // Construct userName from users table data
    const userName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ") || user.name || "";

    // Find all RSVPs for this user
    const userRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (q) => q.eq("clerkUserId", user.clerkUserId!))
      .collect();

    // Update userName in all their RSVPs to keep search data fresh
    for (const rsvp of userRsvps) {
      // Only update if userName actually changed (avoid unnecessary writes)
      if (rsvp.userName !== userName) {
        await ctx.db.patch(rsvp._id, {
          userName,
          updatedAt: Date.now(),
        });
      }
    }
  }
});

// Export the custom mutation wrapper that enables triggers
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));

export default triggers;