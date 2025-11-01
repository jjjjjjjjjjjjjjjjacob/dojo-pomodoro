/**
 * Text blast management API
 * Handles bulk SMS campaigns for events
 */

import { action, mutation, query, internalAction, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
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
    recipientFilter: v.optional(v.string()),
    includeQrCodes: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Id<"textBlasts">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Verify user is host of this event (using org:admin role)
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    const role = (identity as any).role;
    const hasHostRole = role === "org:admin";
    if (!hasHostRole) {
      throw new Error("Not authorized for this event");
    }

    // Count potential recipients
    const recipientCount = await ctx.runQuery(internal.textBlasts.countRecipientsInternal, {
      eventId: args.eventId,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
    });

    const now = Date.now();
    return await ctx.db.insert("textBlasts", {
      eventId: args.eventId,
      name: args.name,
      message: args.message,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      includeQrCodes: args.includeQrCodes ?? false,
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
    recipientFilter: v.optional(v.string()),
    includeQrCodes: v.optional(v.boolean()),
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

    // Update recipient count if target lists or filter changed
    let recipientCount = blast.recipientCount;
    if (args.targetLists !== undefined || args.recipientFilter !== undefined) {
      recipientCount = await ctx.runQuery(internal.textBlasts.countRecipientsInternal, {
        eventId: blast.eventId,
        targetLists: args.targetLists ?? blast.targetLists,
        recipientFilter: args.recipientFilter ?? blast.recipientFilter,
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
    if (args.recipientFilter !== undefined) {
      updateData.recipientFilter = args.recipientFilter;
      updateData.recipientCount = recipientCount;
    }
    if (args.includeQrCodes !== undefined) {
      updateData.includeQrCodes = args.includeQrCodes;
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
  firstName?: string;
  userName?: string;
  redemptionCode?: string;
};

type SmsRecipientPayload = {
  phoneNumber: string;
  clerkUserId: string;
  notificationId: Id<"smsNotifications">;
  personalizedMessage: string;
  mediaUrl?: string;
};

type TemplateVariables = {
  firstName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  qrCodeUrl?: string;
};

const FIRST_NAME_FALLBACK = "there";

const formatEventDateForSms = (timestamp: number, timezone?: string): string => {
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: timezone ?? "UTC",
  }).replace(/\//g, ".");
};

const applyTemplateVariables = (template: string, variables: TemplateVariables): string => {
  return template
    .replace(/\{\{firstName\}\}/g, variables.firstName)
    .replace(/\{\{eventName\}\}/g, variables.eventName)
    .replace(/\{\{eventDate\}\}/g, variables.eventDate)
    .replace(/\{\{eventLocation\}\}/g, variables.eventLocation)
    .replace(/\{\{qrCodeUrl\}\}/g, variables.qrCodeUrl || "");
};

const resolveRecipientFirstName = (recipient: BlastRecipient): string => {
  const userFirstName = recipient.firstName?.trim();
  if (userFirstName) return userFirstName;

  const derivedFromUserName = recipient.userName?.trim().split(/\s+/)[0];
  if (derivedFromUserName) return derivedFromUserName;

  return FIRST_NAME_FALLBACK;
};

const formatEventTitleInlineForSms = (
  event: Pick<Doc<"events">, "name" | "secondaryTitle"> | null,
): string => {
  const name = event?.name?.trim();
  const secondaryTitle = event?.secondaryTitle?.trim();
  if (name && secondaryTitle) {
    return `${name}: ${secondaryTitle}`;
  }
  if (name) return name;
  if (secondaryTitle) return secondaryTitle;
  return "Event";
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
    // Allow sending drafts and failed blasts (failed blasts can be retried)
    if (blast.status !== "draft" && blast.status !== "failed") {
      throw new Error("Text blast already sent or in progress");
    }

    // Fetch recipients with decrypted phone numbers up front so the pre-check
    // aligns with the actual send payload
    const recipients = await ctx.runAction(
      internal.textBlasts.getRecipientsWithPhonesInternal,
      {
        eventId: blast.eventId,
        targetLists: blast.targetLists,
        recipientFilter: blast.recipientFilter,
      },
    ) as BlastRecipient[];

    if (recipients.length === 0) {
      throw new Error(
        "Cannot send text blast: No recipients found with SMS consent and phone numbers. " +
        "Please check that: (1) RSVPs have SMS consent enabled, (2) Users have phone numbers saved in their profiles, " +
        "and (3) Selected lists have approved/attending RSVPs."
      );
    }

    const event = await ctx.runQuery(internal.textBlasts.getEventInternal, {
      eventId: blast.eventId,
    });
    if (!event) {
      throw new Error("Event not found");
    }

    const templateBase: Omit<TemplateVariables, "firstName"> = {
      eventName: formatEventTitleInlineForSms(event),
      eventDate: formatEventDateForSms(event.eventDate, event.eventTimezone),
      eventLocation: event.location?.trim() ?? "",
    };

    // Update status to sending
    await ctx.runMutation(internal.textBlasts.updateBlastStatus, {
      blastId: args.blastId,
      status: "sending",
      sentAt: Date.now(),
    });

    try {
      // Create SMS notification records with personalized message content
      const smsRecipients: SmsRecipientPayload[] = [];
      const baseUrl = process.env.APP_BASE_URL;
      
      for (const recipient of recipients) {
        // Generate QR code if recipient has redemption code and includeQrCodes is enabled
        let qrCodeMediaUrl: string | undefined;
        let redemptionLink: string | undefined;
        
        if (blast.includeQrCodes && recipient.redemptionCode && baseUrl) {
          try {
            // Use the exact same redemption code format as the user-facing ticket page
            // The redemption code comes from the same query (by_event_user index)
            // and is used in the exact same URL format: ${baseUrl}/redeem/${code}
            // This ensures 100% compatibility with QR codes displayed on the ticket page
            const ticketUrl = `${baseUrl}/redeem/${recipient.redemptionCode}`;
            redemptionLink = ticketUrl; // Store the redemption link for template variable
            
            const qrCodeColor = event.qrCodeColor || "#000000";
            // Generate QR code using action wrapper that preserves admin authentication
            // The action properly loads Node.js QRCode module and maintains auth context
            // The QR code value is identical to what users see on their ticket page
            const qrCodeResult = await ctx.runAction(
              api.lib.qrCodeGenerator.generateAndUploadQrCodeWithAuth,
              {
                value: ticketUrl,
                qrCodeColor,
              },
            );
            
            if (qrCodeResult.url) {
              qrCodeMediaUrl = qrCodeResult.url; // Storage URL for MMS attachment
            }
          } catch (error) {
            console.error(`Failed to generate QR code for recipient ${recipient.clerkUserId}:`, error);
            // Continue without QR code - don't include in MMS if generation failed
          }
        }

        // Replace template variables - {{qrCodeUrl}} should be the redemption link, not the image URL
        const personalizedMessage = applyTemplateVariables(blast.message, {
          ...templateBase,
          firstName: resolveRecipientFirstName(recipient),
          qrCodeUrl: redemptionLink || "",
        });

        const notificationId = await ctx.runMutation(internal.sms.createNotification, {
          eventId: blast.eventId,
          recipientClerkUserId: recipient.clerkUserId,
          recipientPhoneObfuscated: recipient.phoneObfuscated,
          type: "blast",
          message: personalizedMessage,
        });

        smsRecipients.push({
          phoneNumber: recipient.decryptedPhone,
          clerkUserId: recipient.clerkUserId,
          notificationId: notificationId as Id<"smsNotifications">,
          personalizedMessage,
          mediaUrl: qrCodeMediaUrl,
        });
      }

      // Send bulk SMS - Twilio handles promotional messages via standard API
      const result = await ctx.runAction(internal.smsActions.sendBulkSmsInternal, {
        recipients: smsRecipients,
        message: blast.message,
        batchSize: 10, // Send 10 at a time
        messageType: "Promotional",
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
 * Send a text blast immediately without requiring a draft
 * Accepts form data directly and creates/sends in one operation
 */
export const sendBlastDirect = action({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    message: v.string(),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()),
    includeQrCodes: v.optional(v.boolean()),
    selectedRsvpIds: v.optional(v.array(v.id("rsvps"))), // Filter to specific RSVP IDs for testing
  },
  handler: async (
    ctx,
    args,
  ): Promise<SendBlastResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Verify user is host of this event (using org:admin role)
    const event = await ctx.runQuery(internal.textBlasts.getEventInternal, {
      eventId: args.eventId,
    });
    if (!event) throw new Error("Event not found");

    const role = (identity as any).role;
    const hasHostRole = role === "org:admin";
    if (!hasHostRole) {
      throw new Error("Not authorized for this event");
    }

    // Fetch recipients with decrypted phone numbers so the validation matches the send payload
    const recipients = await ctx.runAction(
      internal.textBlasts.getRecipientsWithPhonesInternal,
      {
        eventId: args.eventId,
        targetLists: args.targetLists,
        recipientFilter: args.recipientFilter,
        selectedRsvpIds: args.selectedRsvpIds,
      },
    ) as BlastRecipient[];

    // Pre-check: Validate recipients exist before attempting to send
    if (recipients.length === 0) {
      throw new Error(
        "Cannot send text blast: No recipients found with SMS consent and phone numbers. " +
        "Please check that: (1) RSVPs have SMS consent enabled, (2) Users have phone numbers saved in their profiles, " +
        "and (3) Selected lists have approved/attending RSVPs."
      );
    }

    const recipientCount = recipients.length;
    const templateBase: Omit<TemplateVariables, "firstName"> = {
      eventName: formatEventTitleInlineForSms(event),
      eventDate: formatEventDateForSms(event.eventDate, event.eventTimezone),
      eventLocation: event.location?.trim() ?? "",
    };

    // Create draft record first
    const now = Date.now();
    const blastId = await ctx.runMutation(internal.textBlasts.createBlastInternal, {
      eventId: args.eventId,
      name: args.name,
      message: args.message,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      includeQrCodes: args.includeQrCodes ?? false,
      recipientCount,
      sentBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    });

    // Update status to sending
    await ctx.runMutation(internal.textBlasts.updateBlastStatus, {
      blastId,
      status: "sending",
      sentAt: now,
    });

    try {
      // Create SMS notification records for each recipient
      const smsRecipients: SmsRecipientPayload[] = [];
      const baseUrl = process.env.APP_BASE_URL;
      
      for (const recipient of recipients) {
        // Generate QR code if recipient has redemption code and includeQrCodes is enabled
        let qrCodeMediaUrl: string | undefined;
        let redemptionLink: string | undefined;
        
        if (args.includeQrCodes && recipient.redemptionCode && baseUrl) {
          try {
            // Use the exact same redemption code format as the user-facing ticket page
            // The redemption code comes from the same query (by_event_user index)
            // and is used in the exact same URL format: ${baseUrl}/redeem/${code}
            // This ensures 100% compatibility with QR codes displayed on the ticket page
            const ticketUrl = `${baseUrl}/redeem/${recipient.redemptionCode}`;
            redemptionLink = ticketUrl; // Store the redemption link for template variable
            
            const qrCodeColor = event.qrCodeColor || "#000000";
            // Generate QR code using action wrapper that preserves admin authentication
            // The action properly loads Node.js QRCode module and maintains auth context
            // The QR code value is identical to what users see on their ticket page
            const qrCodeResult = await ctx.runAction(
              api.lib.qrCodeGenerator.generateAndUploadQrCodeWithAuth,
              {
                value: ticketUrl,
                qrCodeColor,
              },
            );
            
            if (qrCodeResult.url) {
              qrCodeMediaUrl = qrCodeResult.url; // Storage URL for MMS attachment
            }
          } catch (error) {
            console.error(`Failed to generate QR code for recipient ${recipient.clerkUserId}:`, error);
            // Continue without QR code - don't include in MMS if generation failed
          }
        }

        // Replace template variables - {{qrCodeUrl}} should be the redemption link, not the image URL
        const personalizedMessage = applyTemplateVariables(args.message, {
          ...templateBase,
          firstName: resolveRecipientFirstName(recipient),
          qrCodeUrl: redemptionLink || "",
        });

        const notificationId = await ctx.runMutation(internal.sms.createNotification, {
          eventId: args.eventId,
          recipientClerkUserId: recipient.clerkUserId,
          recipientPhoneObfuscated: recipient.phoneObfuscated,
          type: "blast",
          message: personalizedMessage,
        });

        smsRecipients.push({
          phoneNumber: recipient.decryptedPhone,
          clerkUserId: recipient.clerkUserId,
          notificationId: notificationId as Id<"smsNotifications">,
          personalizedMessage,
          mediaUrl: qrCodeMediaUrl,
        });
      }

      // Send bulk SMS - Twilio handles promotional messages via standard API
      const result = await ctx.runAction(internal.smsActions.sendBulkSmsInternal, {
        recipients: smsRecipients,
        message: args.message,
        batchSize: 10, // Send 10 at a time
        messageType: "Promotional",
      });

      // Update blast with final counts
      await ctx.runMutation(internal.textBlasts.updateBlastCounts, {
        blastId,
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
        blastId,
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

    // Verify user is host of this event (using org:admin role)
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    const role = (identity as any).role;
    const hasHostRole = role === "org:admin";
    if (!hasHostRole) {
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
    if (!identity) return [];

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
 * Get RSVPs with names for text blast recipient selection
 * Returns RSVPs filtered by target lists and SMS consent
 */
export const getRecipientsForSelection = query({
  args: {
    eventId: v.id("events"),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ rsvpId: Id<"rsvps">; name: string; listKey: string }>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Verify user is host of this event
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    const role = (identity as any).role;
    const hasHostRole = role === "org:admin";
    if (!hasHostRole) {
      throw new Error("Not authorized for this event");
    }

    // Get approved/attending RSVPs matching target lists
    const approvedRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_status", (q) => 
        q.eq("eventId", args.eventId).eq("status", "approved")
      )
      .collect();

    const attendingRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_status", (q) => 
        q.eq("eventId", args.eventId).eq("status", "attending")
      )
      .collect();

    let rsvps = [...approvedRsvps, ...attendingRsvps];

    const normalizedTargetListKeys = new Set(
      args.targetLists.map((listKey) => listKey.toLowerCase()),
    );

    // Filter by target lists and SMS consent
    let filteredRsvps = rsvps.filter((rsvp) => {
      const rsvpListKeyNormalized = rsvp.listKey?.toLowerCase();
      if (!rsvpListKeyNormalized) return false;
      return normalizedTargetListKeys.has(rsvpListKeyNormalized) && rsvp.smsConsent === true;
    });

    // Apply recipient filter if specified
    if (args.recipientFilter === "approved_no_approval_sms") {
      const filteredWithApprovalSmsStatus = await Promise.all(
        filteredRsvps.map(async (rsvp) => {
          const approvalSms = await ctx.db
            .query("smsNotifications")
            .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
            .filter((q) =>
              q.and(
                q.eq(q.field("recipientClerkUserId"), rsvp.clerkUserId),
                q.eq(q.field("type"), "approval"),
                q.eq(q.field("status"), "sent")
              )
            )
            .first();
          return approvalSms ? null : rsvp;
        })
      );
      filteredRsvps = filteredWithApprovalSmsStatus.filter((rsvp): rsvp is typeof filteredRsvps[0] => rsvp !== null);
    }

    // Enrich with user names
    const enriched = await Promise.all(
      filteredRsvps.map(async (rsvp) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", rsvp.clerkUserId))
          .unique();
        const firstName = user?.firstName;
        const lastName = user?.lastName;
        const name = [firstName, lastName].filter(Boolean).join(" ") || rsvp.userName || "Unknown";
        return {
          rsvpId: rsvp._id,
          name,
          listKey: rsvp.listKey,
        };
      })
    );

    // Sort by name
    enriched.sort((a, b) => a.name.localeCompare(b.name));

    return enriched;
  },
});

/**
 * Get available recipient lists for an event with counts
 * Returns distinct listKeys with recipient counts for each list
 */
export const getAvailableListsForEvent = query({
  args: {
    eventId: v.id("events"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ listKey: string; recipientCount: number; totalRsvps: number }>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Verify user is host of this event (using org:admin role)
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    const role = (identity as any).role;
    const hasHostRole = role === "org:admin";
    if (!hasHostRole) {
      throw new Error("Not authorized for this event");
    }

    // Get all approved or attending RSVPs for this event
    // Query for both approved and attending statuses
    const approvedRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_status", (q) => 
        q.eq("eventId", args.eventId).eq("status", "approved")
      )
      .collect();

    const attendingRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_status", (q) => 
        q.eq("eventId", args.eventId).eq("status", "attending")
      )
      .collect();

    // Combine both sets of RSVPs
    const rsvps = [...approvedRsvps, ...attendingRsvps];
    
    // Debug logging
    console.log(`Found ${approvedRsvps.length} approved RSVPs and ${attendingRsvps.length} attending RSVPs for event ${args.eventId}`);
    if (rsvps.length > 0) {
      console.log(`Sample RSVP: listKey=${rsvps[0].listKey}, smsConsent=${rsvps[0].smsConsent}, clerkUserId=${rsvps[0].clerkUserId}`);
    }

    // Group by listKey - collect all lists first, then count eligible recipients
    const listUserMap = new Map<string, Set<string>>();
    const listSmsConsentMap = new Map<string, Set<string>>();

    // First pass: collect all listKeys and users with SMS consent
    for (const rsvp of rsvps) {
      // Ensure listKey exists (it's required in schema, but double-check)
      if (!rsvp.listKey) {
        console.warn(`RSVP ${rsvp._id} missing listKey, skipping`);
        continue;
      }

      // Track all lists (even without SMS consent)
      if (!listUserMap.has(rsvp.listKey)) {
        listUserMap.set(rsvp.listKey, new Set());
        listSmsConsentMap.set(rsvp.listKey, new Set());
      }
      listUserMap.get(rsvp.listKey)!.add(rsvp.clerkUserId);
      
      // Track users with SMS consent separately
      if (rsvp.smsConsent === true) {
        listSmsConsentMap.get(rsvp.listKey)!.add(rsvp.clerkUserId);
      }
    }

    // Second pass: count unique users with SMS consent AND phone numbers per list
    const result: Array<{ listKey: string; recipientCount: number; totalRsvps: number }> = [];

    // Process ALL lists that have approved RSVPs (not just those with SMS consent)
    for (const [listKey, allUserIds] of listUserMap.entries()) {
      // Get users with SMS consent for this list
      const smsConsentUserIds = listSmsConsentMap.get(listKey) || new Set();
      
      let count = 0;
      for (const clerkUserId of smsConsentUserIds) {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
          .unique();

        if (profile?.phoneEnc) {
          count++;
        }
      }
      // Include all lists with approved RSVPs, even if recipientCount is 0
      // Log for debugging
      console.log(`List ${listKey}: ${allUserIds.size} total RSVPs, ${smsConsentUserIds.size} with SMS consent, ${count} with phone numbers`);
      result.push({ listKey, recipientCount: count, totalRsvps: allUserIds.size });
    }

    // Sort by listKey for consistent ordering
    result.sort((a, b) => a.listKey.localeCompare(b.listKey));

    return result;
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
      recipientFilter: originalBlast.recipientFilter,
    });

    const now = Date.now();
    return await ctx.db.insert("textBlasts", {
      eventId: originalBlast.eventId,
      name: `${originalBlast.name} (Copy)`,
      message: originalBlast.message,
      targetLists: originalBlast.targetLists,
      recipientFilter: originalBlast.recipientFilter,
      includeQrCodes: originalBlast.includeQrCodes ?? false,
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
 * Internal query to get event details
 */
export const getEventInternal = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.eventId);
  },
});

/**
 * Internal mutation to create a blast record
 */
export const createBlastInternal = internalMutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    message: v.string(),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()),
    includeQrCodes: v.optional(v.boolean()),
    recipientCount: v.number(),
    sentBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("textBlasts", {
      eventId: args.eventId,
      name: args.name,
      message: args.message,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      includeQrCodes: args.includeQrCodes ?? false,
      recipientCount: args.recipientCount,
      sentCount: 0,
      failedCount: 0,
      sentBy: args.sentBy,
      status: "draft",
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });
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
    recipientFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get all approved or attending RSVPs for this event
    const approvedRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_status", (q) => 
        q.eq("eventId", args.eventId).eq("status", "approved")
      )
      .collect();

    const attendingRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_status", (q) => 
        q.eq("eventId", args.eventId).eq("status", "attending")
      )
      .collect();

    // Combine both sets
    let rsvps = [...approvedRsvps, ...attendingRsvps];

    const normalizedTargetListKeys = new Set(
      args.targetLists.map((listKey) => listKey.toLowerCase()),
    );

    // Filter by target lists (case-insensitive) and SMS consent
    let filteredRsvps = rsvps.filter((rsvp) => {
      const rsvpListKeyNormalized = rsvp.listKey?.toLowerCase();
      if (!rsvpListKeyNormalized) return false;
      return normalizedTargetListKeys.has(rsvpListKeyNormalized) && rsvp.smsConsent === true;
    });

    // Apply fine-grained recipient filter if specified
    if (args.recipientFilter === "approved_no_approval_sms") {
      // Filter to only include users who haven't received a successfully sent approval SMS
      const filteredWithApprovalSmsStatus = await Promise.all(
        filteredRsvps.map(async (rsvp) => {
          // Check if user has received an approval SMS that was successfully sent (status === "sent")
          // We only exclude users who have received successfully sent messages, not failed or pending ones
          const approvalSms = await ctx.db
            .query("smsNotifications")
            .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
            .filter((q) =>
              q.and(
                q.eq(q.field("recipientClerkUserId"), rsvp.clerkUserId),
                q.eq(q.field("type"), "approval"),
                q.eq(q.field("status"), "sent") // Only count successfully sent messages
              )
            )
            .first();

          // Only include if no successfully sent approval SMS was found
          return approvalSms ? null : rsvp;
        })
      );

      filteredRsvps = filteredWithApprovalSmsStatus.filter((rsvp): rsvp is typeof filteredRsvps[0] => rsvp !== null);
    }

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
    recipientFilter: v.optional(v.string()), // 'all' | 'approved_no_approval_sms'
    selectedRsvpIds: v.optional(v.array(v.id("rsvps"))), // Filter to specific RSVP IDs if provided
  },
  handler: async (
    ctx,
    args,
  ): Promise<BlastRecipient[]> => {
    // Get all approved RSVPs for target lists
    const rsvps = await ctx.runQuery(internal.textBlasts.getApprovedRsvpsForListsInternal, {
      eventId: args.eventId,
      targetLists: args.targetLists,
      recipientFilter: args.recipientFilter,
      selectedRsvpIds: args.selectedRsvpIds,
    });

    console.log(`[getRecipientsWithPhonesInternal] Found ${rsvps.length} RSVPs with SMS consent for lists: ${args.targetLists.join(", ")}`);

    const recipients: BlastRecipient[] = [];
    const processedUsers = new Set<string>();
    let skippedNoConsent = 0;
    let skippedNoPhone = 0;
    let skippedDuplicate = 0;

    // Import Clerk client for fallback phone lookup
    const { createClerkClient } = await import("@clerk/backend");
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    let clerkClient: ReturnType<typeof createClerkClient> | null = null;

    // Helper function to resolve phone number with fallbacks
    const resolvePhoneNumber = async (
      clerkUserId: string,
      profile: any,
      userRecord: Doc<"users"> | null,
    ): Promise<string | null> => {
      let decryptedPhone: string | null = null;
      
      // First try: decrypt from profile.phoneEnc
      if (profile?.phoneEnc) {
        try {
          decryptedPhone = await ctx.runAction(internal.profilesNode.decryptPhoneInternal, {
            phoneEnc: profile.phoneEnc,
          });
          if (decryptedPhone) return decryptedPhone;
        } catch (error) {
          console.error(`[getRecipientsWithPhonesInternal] Failed to decrypt phone for user ${clerkUserId}:`, error);
        }
      }

      // Second try: fetch from Clerk API
      if (!decryptedPhone && clerkSecretKey) {
        try {
          if (!clerkClient) {
            clerkClient = createClerkClient({ secretKey: clerkSecretKey });
          }
          const clerkUser = await clerkClient.users.getUser(clerkUserId);
          const preferredPhone =
            (clerkUser.primaryPhoneNumberId &&
              clerkUser.phoneNumbers.find(
                (phone) => phone.id === clerkUser.primaryPhoneNumberId,
              )?.phoneNumber) ||
            clerkUser.phoneNumbers[0]?.phoneNumber;
          if (preferredPhone) {
            return preferredPhone;
          }
        } catch (error) {
          console.error(`[getRecipientsWithPhonesInternal] Failed to fetch phone from Clerk for user ${clerkUserId}:`, error);
        }
      }

      // Third try: check users table
      if (!userRecord) {
        const fetchedUser = await ctx.runQuery(internal.textBlasts.getUserByClerkUserIdInternal, {
          clerkUserId,
        });
        if (fetchedUser?.phone) {
          return fetchedUser.phone;
        }
      } else if (userRecord.phone) {
        return userRecord.phone;
      }

      return null;
    };

    for (const rsvp of rsvps) {
      // Skip if we already processed this user
      if (processedUsers.has(rsvp.clerkUserId)) {
        skippedDuplicate++;
        continue;
      }
      processedUsers.add(rsvp.clerkUserId);

      // Check SMS consent - only send to users who have consented
      // Note: This should already be filtered by getApprovedRsvpsForListsInternal, but double-check
      if (rsvp.smsConsent !== true) {
        skippedNoConsent++;
        console.warn(`[getRecipientsWithPhonesInternal] RSVP ${rsvp._id} does not have SMS consent`);
        continue;
      }

      // Get user's profile
      const profile = await ctx.runQuery(internal.profiles.getByClerkUserIdInternal, {
        clerkUserId: rsvp.clerkUserId,
      });

      const userRecord = await ctx.runQuery(internal.textBlasts.getUserByClerkUserIdInternal, {
        clerkUserId: rsvp.clerkUserId,
      });

      // Try to resolve phone number with fallbacks
      const decryptedPhone = await resolvePhoneNumber(rsvp.clerkUserId, profile, userRecord);

      if (!decryptedPhone) {
        skippedNoPhone++;
        console.warn(`[getRecipientsWithPhonesInternal] User ${rsvp.clerkUserId} does not have a phone number in profile, Clerk, or users table`);
        continue;
      }

      const firstNameFromUserRecord = userRecord?.firstName?.trim();
      const firstNameFromUserName = rsvp.userName?.trim().split(/\s+/)[0];

      // Get redemption code for this user/event if available
      // Uses the exact same query pattern as api.redemptions.forCurrentUserEvent
      // to ensure we get the same redemption code the user would see on their ticket page
      const redemption = await ctx.runQuery(internal.textBlasts.getRedemptionForUserEventInternal, {
        eventId: args.eventId,
        clerkUserId: rsvp.clerkUserId,
      });

      recipients.push({
        clerkUserId: rsvp.clerkUserId,
        decryptedPhone,
        phoneObfuscated: profile?.phoneObfuscated || "***-***-****",
        listKey: rsvp.listKey,
        firstName: firstNameFromUserRecord || firstNameFromUserName || undefined,
        userName: rsvp.userName ?? undefined,
        // Use the exact redemption code as stored in the database
        // This is identical to what users see on their ticket page
        redemptionCode: redemption?.code,
      });
    }

    console.log(`[getRecipientsWithPhonesInternal] Final count: ${recipients.length} recipients. Skipped: ${skippedNoConsent} no consent, ${skippedNoPhone} no phone, ${skippedDuplicate} duplicates`);

    return recipients;
  },
});

/**
 * Internal query to get user by Clerk user ID
 */
export const getUserByClerkUserIdInternal = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});

/**
 * Internal query to get redemption code for a user/event
 * Uses the exact same query pattern as api.redemptions.forCurrentUserEvent
 * to ensure we retrieve the same redemption code the user would see on their ticket page
 * This guarantees 100% compatibility between text blast QR codes and user-facing QR codes
 */
export const getRedemptionForUserEventInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", args.eventId).eq("clerkUserId", args.clerkUserId)
      )
      .unique();
  },
});

/**
 * Internal query to get approved RSVPs for specific lists
 */
export const getApprovedRsvpsForListsInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()), // 'all' | 'approved_no_approval_sms'
    selectedRsvpIds: v.optional(v.array(v.id("rsvps"))), // Filter to specific RSVP IDs if provided
  },
  handler: async (ctx, args) => {
    // Get all approved or attending RSVPs for this event
    const approvedRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_status", (q) => 
        q.eq("eventId", args.eventId).eq("status", "approved")
      )
      .collect();

    const attendingRsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event_status", (q) => 
        q.eq("eventId", args.eventId).eq("status", "attending")
      )
      .collect();

    // Combine both sets
    let rsvps = [...approvedRsvps, ...attendingRsvps];

    const normalizedTargetListKeys = new Set(
      args.targetLists.map((listKey) => listKey.toLowerCase()),
    );

    // Filter by target lists (case-insensitive) and SMS consent
    let filteredRsvps = rsvps.filter((rsvp) => {
      const rsvpListKeyNormalized = rsvp.listKey?.toLowerCase();
      if (!rsvpListKeyNormalized) return false;
      return normalizedTargetListKeys.has(rsvpListKeyNormalized) && rsvp.smsConsent === true;
    });

    // Apply fine-grained recipient filter if specified
    if (args.recipientFilter === "approved_no_approval_sms") {
      // Filter to only include users who haven't received a successfully sent approval SMS
      const filteredWithApprovalSmsStatus = await Promise.all(
        filteredRsvps.map(async (rsvp) => {
          // Check if user has received an approval SMS that was successfully sent (status === "sent")
          // We only exclude users who have received successfully sent messages, not failed or pending ones
          const approvalSms = await ctx.db
            .query("smsNotifications")
            .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
            .filter((q) =>
              q.and(
                q.eq(q.field("recipientClerkUserId"), rsvp.clerkUserId),
                q.eq(q.field("type"), "approval"),
                q.eq(q.field("status"), "sent") // Only count successfully sent messages
              )
            )
            .first();

          // Only include if no successfully sent approval SMS was found
          return approvalSms ? null : rsvp;
        })
      );

      filteredRsvps = filteredWithApprovalSmsStatus.filter((rsvp): rsvp is typeof filteredRsvps[0] => rsvp !== null);
    }

    // If specific RSVP IDs are provided, filter to only those RSVPs
    if (args.selectedRsvpIds && args.selectedRsvpIds.length > 0) {
      const selectedRsvpIdsSet = new Set(args.selectedRsvpIds);
      filteredRsvps = filteredRsvps.filter((rsvp) => selectedRsvpIdsSet.has(rsvp._id));
    }

    console.log(`[getApprovedRsvpsForListsInternal] Found ${rsvps.length} approved/attending RSVPs, ${filteredRsvps.length} with SMS consent and matching target lists${args.recipientFilter ? ` (filter: ${args.recipientFilter})` : ""}${args.selectedRsvpIds && args.selectedRsvpIds.length > 0 ? ` (${args.selectedRsvpIds.length} selected)` : ""}`);

    return filteredRsvps;
  },
});
