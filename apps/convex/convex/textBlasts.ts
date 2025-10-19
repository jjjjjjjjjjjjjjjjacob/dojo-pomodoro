/**
 * Text blast management API
 * Handles bulk SMS campaigns for events
 */

import { action, mutation, query, internalAction, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Create a new text blast draft
 */
export const createDraft = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    message: v.string(),
    targetLists: v.array(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Id<"textBlasts">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Verify user is host of this event
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    if (!event.hosts.includes(identity.email!)) {
      throw new Error("Not authorized for this event");
    }

    // Count potential recipients
    const recipientCount = await ctx.runQuery(internal.textBlasts.countRecipientsInternal, {
      eventId: args.eventId,
      targetLists: args.targetLists,
    });

    const now = Date.now();
    return await ctx.db.insert("textBlasts", {
      eventId: args.eventId,
      name: args.name,
      message: args.message,
      targetLists: args.targetLists,
      recipientCount,
      sentCount: 0,
      failedCount: 0,
      sentBy: identity.subject,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an existing text blast draft
 */
export const updateDraft = mutation({
  args: {
    blastId: v.id("textBlasts"),
    name: v.optional(v.string()),
    message: v.optional(v.string()),
    targetLists: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Doc<"textBlasts"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const blast = await ctx.db.get(args.blastId);
    if (!blast) throw new Error("Text blast not found");

    if (blast.sentBy !== identity.subject) {
      throw new Error("Not authorized to edit this text blast");
    }

    if (blast.status !== "draft") {
      throw new Error("Can only edit draft text blasts");
    }

    // Update recipient count if target lists changed
    let recipientCount = blast.recipientCount;
    if (args.targetLists) {
      recipientCount = await ctx.runQuery(internal.textBlasts.countRecipientsInternal, {
        eventId: blast.eventId,
        targetLists: args.targetLists,
      });
    }

    const updateData: any = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updateData.name = args.name;
    if (args.message !== undefined) updateData.message = args.message;
    if (args.targetLists !== undefined) {
      updateData.targetLists = args.targetLists;
      updateData.recipientCount = recipientCount;
    }

    await ctx.db.patch(args.blastId, updateData);
    return await ctx.db.get(args.blastId);
  },
});

/**
 * Send a text blast immediately
 */
type SendBlastResult = {
  success: true;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
} | {
  success: false;
  message?: string;
};

type BlastRecipient = {
  clerkUserId: string;
  decryptedPhone: string;
  phoneObfuscated: string;
  listKey: string;
};

type SmsRecipientPayload = {
  phoneNumber: string;
  clerkUserId: string;
  notificationId: Id<"smsNotifications">;
};

export const sendBlast = action({
  args: {
    blastId: v.id("textBlasts"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<SendBlastResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Get blast details and verify ownership
    const blast = await ctx.runQuery(internal.textBlasts.getBlastInternal, {
      blastId: args.blastId,
    });

    if (!blast) throw new Error("Text blast not found");
    if (blast.sentBy !== identity.subject) {
      throw new Error("Not authorized to send this text blast");
    }
    if (blast.status !== "draft") {
      throw new Error("Text blast already sent or in progress");
    }

    // Update status to sending
    await ctx.runMutation(internal.textBlasts.updateBlastStatus, {
      blastId: args.blastId,
      status: "sending",
      sentAt: Date.now(),
    });

    try {
      // Get all recipients with their encrypted phone data
      const recipients = await ctx.runAction(
        internal.textBlasts.getRecipientsWithPhonesInternal,
        {
          eventId: blast.eventId,
          targetLists: blast.targetLists,
        },
      ) as BlastRecipient[];

      if (recipients.length === 0) {
        await ctx.runMutation(internal.textBlasts.updateBlastStatus, {
          blastId: args.blastId,
          status: "failed",
        });
        throw new Error("No recipients found with phone numbers");
      }

      // Create SMS notification records for each recipient
      const notificationIds: string[] = [];
      for (const recipient of recipients) {
        const notificationId = await ctx.runMutation(internal.sms.createNotification, {
          eventId: blast.eventId,
          recipientClerkUserId: recipient.clerkUserId,
          recipientPhoneObfuscated: recipient.phoneObfuscated,
          type: "blast",
          message: blast.message,
        });
        notificationIds.push(notificationId);
      }

      // Prepare recipients for bulk SMS sending
      const smsRecipients: SmsRecipientPayload[] = recipients.map((recipient, index) => ({
        phoneNumber: recipient.decryptedPhone,
        clerkUserId: recipient.clerkUserId,
        notificationId: notificationIds[index] as Id<"smsNotifications">,
      }));

      // Send bulk SMS
      const result = await ctx.runAction(internal.smsActions.sendBulkSmsInternal, {
        recipients: smsRecipients,
        message: blast.message,
        batchSize: 10, // Send 10 at a time
      });

      // Update blast with final counts
      await ctx.runMutation(internal.textBlasts.updateBlastCounts, {
        blastId: args.blastId,
        sentCount: result.successCount,
        failedCount: result.failureCount,
        status: result.successCount > 0 ? "sent" : "failed",
      });

      return {
        success: true,
        totalRecipients: result.totalRecipients,
        sentCount: result.successCount,
        failedCount: result.failureCount,
      };
    } catch (error: any) {
      // Mark blast as failed
      await ctx.runMutation(internal.textBlasts.updateBlastStatus, {
        blastId: args.blastId,
        status: "failed",
      });
      throw new Error(`Failed to send text blast: ${error.message}`);
    }
  },
});

/**
 * Get text blasts for a specific event
 */
export const getBlastsByEvent = query({
  args: {
    eventId: v.id("events"),
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Doc<"textBlasts">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Verify user is host of this event
    const event = await ctx.db.get(args.eventId);
    if (!event || !event.hosts.includes(identity.email!)) {
      throw new Error("Not authorized for this event");
    }

    let query = ctx.db
      .query("textBlasts")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId));

    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }

    const blasts = await query
      .order("desc")
      .take(args.limit || 50);

    return blasts as Doc<"textBlasts">[];
  },
});

/**
 * Get text blasts sent by current user
 */
export const getMyBlasts = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Doc<"textBlasts">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    let query = ctx.db
      .query("textBlasts")
      .withIndex("by_sent_by", (q) => q.eq("sentBy", identity.subject));

    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }

    const blasts = await query
      .order("desc")
      .take(args.limit || 50);

    return blasts as Doc<"textBlasts">[];
  },
});

/**
 * Get a single text blast by ID
 */
export const getBlastById = query({
  args: { blastId: v.id("textBlasts") },
  handler: async (
    ctx,
    args,
  ): Promise<Doc<"textBlasts"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const blast = await ctx.db.get(args.blastId);
    if (!blast) return null;

    if (blast.sentBy !== identity.subject) {
      throw new Error("Not authorized to view this text blast");
    }

    return blast;
  },
});

/**
 * Duplicate an existing text blast as a new draft
 */
export const duplicateBlast = mutation({
  args: { blastId: v.id("textBlasts") },
  handler: async (
    ctx,
    args,
  ): Promise<Id<"textBlasts">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const originalBlast = await ctx.db.get(args.blastId);
    if (!originalBlast) throw new Error("Text blast not found");

    if (originalBlast.sentBy !== identity.subject) {
      throw new Error("Not authorized to duplicate this text blast");
    }

    // Count current recipients for the target lists
    const recipientCount = await ctx.runQuery(internal.textBlasts.countRecipientsInternal, {
      eventId: originalBlast.eventId,
      targetLists: originalBlast.targetLists,
    });

    const now = Date.now();
    return await ctx.db.insert("textBlasts", {
      eventId: originalBlast.eventId,
      name: `${originalBlast.name} (Copy)`,
      message: originalBlast.message,
      targetLists: originalBlast.targetLists,
      recipientCount,
      sentCount: 0,
      failedCount: 0,
      sentBy: identity.subject,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Delete a text blast (only drafts can be deleted)
 */
export const deleteBlast = mutation({
  args: { blastId: v.id("textBlasts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const blast = await ctx.db.get(args.blastId);
    if (!blast) throw new Error("Text blast not found");

    if (blast.sentBy !== identity.subject) {
      throw new Error("Not authorized to delete this text blast");
    }

    if (blast.status !== "draft") {
      throw new Error("Can only delete draft text blasts");
    }

    await ctx.db.delete(args.blastId);
    return { success: true };
  },
});

// Internal functions below this line

/**
 * Internal query to get blast details
 */
export const getBlastInternal = internalQuery({
  args: { blastId: v.id("textBlasts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.blastId);
  },
});

/**
 * Internal mutation to update blast status
 */
type UpdateBlastStatusArgs = {
  blastId: Id<"textBlasts">;
  status: string;
  sentAt?: number;
};

export const updateBlastStatus = internalMutation({
  args: {
    blastId: v.id("textBlasts"),
    status: v.string(),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, args: UpdateBlastStatusArgs) => {
    const updateData: Partial<Doc<"textBlasts"> & { updatedAt: number }> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.sentAt !== undefined) {
      updateData.sentAt = args.sentAt;
    }

    await ctx.db.patch(args.blastId, updateData);
  },
});

/**
 * Internal mutation to update blast counts
 */
type UpdateBlastCountArgs = {
  blastId: Id<"textBlasts">;
  sentCount: number;
  failedCount: number;
  status: string;
};

export const updateBlastCounts = internalMutation({
  args: {
    blastId: v.id("textBlasts"),
    sentCount: v.number(),
    failedCount: v.number(),
    status: v.string(),
  },
  handler: async (ctx, args: UpdateBlastCountArgs) => {
    await ctx.db.patch(args.blastId, {
      sentCount: args.sentCount,
      failedCount: args.failedCount,
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal query to count recipients for target lists
 */
export const countRecipientsInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    targetLists: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Get all approved RSVPs for this event
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();

    // Filter by target lists
    const filteredRsvps = rsvps.filter((rsvp) =>
      args.targetLists.includes(rsvp.listKey)
    );

    // Count unique users with phone numbers
    const uniqueUserIds = new Set(filteredRsvps.map((rsvp) => rsvp.clerkUserId));

    let count = 0;
    for (const clerkUserId of uniqueUserIds) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
        .unique();

      if (profile?.phoneEnc) {
        count++;
      }
    }

    return count;
  },
});

/**
 * Internal action to get recipients with decrypted phones
 */
export const getRecipientsWithPhonesInternal = internalAction({
  args: {
    eventId: v.id("events"),
    targetLists: v.array(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<BlastRecipient[]> => {
    // Get all approved RSVPs for target lists
    const rsvps = await ctx.runQuery(internal.textBlasts.getApprovedRsvpsForListsInternal, {
      eventId: args.eventId,
      targetLists: args.targetLists,
    });

    const recipients: BlastRecipient[] = [];
    const processedUsers = new Set<string>();

    for (const rsvp of rsvps) {
      // Skip if we already processed this user
      if (processedUsers.has(rsvp.clerkUserId)) continue;
      processedUsers.add(rsvp.clerkUserId);

      // Get user's profile
      const profile = await ctx.runQuery(internal.profiles.getByClerkUserIdInternal, {
        clerkUserId: rsvp.clerkUserId,
      });

      if (profile?.phoneEnc) {
        try {
          // Decrypt phone number
          const decryptedPhone = await ctx.runAction(internal.profilesNode.decryptPhoneInternal, {
            phoneEnc: profile.phoneEnc,
          });

          recipients.push({
            clerkUserId: rsvp.clerkUserId,
            decryptedPhone,
            phoneObfuscated: profile.phoneObfuscated || "***-***-****",
            listKey: rsvp.listKey,
          });
        } catch (error) {
          console.error(`Failed to decrypt phone for user ${rsvp.clerkUserId}:`, error);
          // Skip this recipient
        }
      }
    }

    return recipients;
  },
});

/**
 * Internal query to get approved RSVPs for specific lists
 */
export const getApprovedRsvpsForListsInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    targetLists: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();

    return rsvps.filter((rsvp) => args.targetLists.includes(rsvp.listKey));
  },
});