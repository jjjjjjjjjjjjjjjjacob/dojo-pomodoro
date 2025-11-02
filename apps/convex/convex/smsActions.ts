/**
 * SMS actions that require Node.js runtime
 * Uses Twilio for sending SMS messages
 */

"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import twilio from "twilio";
import { formatPhoneNumberForSms, obfuscatePhoneNumber } from "./lib/phoneUtils";

/**
 * Determines if we're in development mode with SMS disabled
 */
function isDevWithSmsDisabled(): boolean {
  return process.env.DEV_TWILIO_ENABLED === "false";
}

/**
 * Validates Twilio credentials and throws error in production if missing
 * Returns false if dev mode with SMS disabled (should skip gracefully)
 */
function validateTwilioCredentials(): { accountSid: string; authToken: string; fromNumber: string } | null {
  const isDevDisabled = isDevWithSmsDisabled();
  
  if (isDevDisabled) {
    // Dev mode with SMS disabled - warn but don't throw
    console.warn("⚠️  SMS disabled in development (DEV_TWILIO_ENABLED=false). SMS will be skipped.");
    return null;
  }

  // Production mode (or dev with SMS enabled) - validate credentials
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    const missingKeys = [];
    if (!accountSid) missingKeys.push("TWILIO_ACCOUNT_SID");
    if (!authToken) missingKeys.push("TWILIO_AUTH_TOKEN");
    if (!fromNumber) missingKeys.push("TWILIO_PHONE_NUMBER");
    
    throw new Error(
      `Twilio credentials not configured. Missing environment variables: ${missingKeys.join(", ")}`
    );
  }

  return { accountSid, authToken, fromNumber };
}

/**
 * Calculate SMS cost based on message length
 * Twilio charges per 160-character segment for US numbers
 * ~$0.00645 per segment for US SMS
 */
function calculateSmsCost(messageLength: number): number {
  const segments = Math.ceil(messageLength / 160);
  const costPerSegment = 0.00645; // US SMS cost per segment
  return segments * costPerSegment;
}

/**
 * Internal action to send SMS via Twilio
 * Only callable from other Convex functions, not from client
 */
export const sendSmsInternal = internalAction({
  args: {
    phoneNumber: v.string(),
    message: v.string(),
    notificationId: v.optional(v.id("smsNotifications")),
    mediaUrl: v.optional(v.string()), // URL for MMS image attachment
    messageType: v.optional(v.string()), // 'Transactional' | 'Promotional'
  },
  handler: async (ctx, args) => {
    // Validate credentials (throws error in production if missing, returns null in dev if disabled)
    const credentials = validateTwilioCredentials();
    
    if (!credentials) {
      // Dev mode with SMS disabled - update notification status and return gracefully
      const errorMessage = "Twilio disabled in development (DEV_TWILIO_ENABLED=false)";
      console.error(`[sendSmsInternal] ${errorMessage}`);
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "failed",
          errorMessage,
        });
      }
      return {
        success: false,
        messageId: undefined,
        phone: obfuscatePhoneNumber(args.phoneNumber),
        error: errorMessage,
      };
    }

    const { accountSid, authToken, fromNumber } = credentials;

    // Format phone number for international format
    let formattedPhone: string;
    try {
      formattedPhone = formatPhoneNumberForSms(args.phoneNumber);
    } catch (error: any) {
      const errorMessage = `Invalid phone number format: ${error.message}`;
      console.error(`[sendSmsInternal] Phone formatting failed for ${obfuscatePhoneNumber(args.phoneNumber)}: ${errorMessage}`);
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "failed",
          errorMessage,
        });
      }
      return {
        success: false,
        messageId: undefined,
        phone: obfuscatePhoneNumber(args.phoneNumber),
        error: errorMessage,
      };
    }

    // Check if user has opted out
    // Wrap in try-catch to handle authentication errors gracefully (internal actions shouldn't need auth)
    let hasOptedOut = false;
    try {
      hasOptedOut = await ctx.runAction(internal.smsMonitoringActions.checkOptOutAction, {
        phoneNumber: formattedPhone,
      });
    } catch (error: any) {
      // If we get an authentication error (OIDC token), log it but continue
      // Internal actions shouldn't require authentication, so this is likely a Convex bug
      const errorMessage = error.message || String(error);
      if (errorMessage.includes("OIDC") || errorMessage.includes("Unauthenticated")) {
        console.warn(`[sendSmsInternal] Authentication error checking opt-out status (continuing anyway): ${errorMessage}`);
        // Continue without opt-out check - better to send than to fail silently
        hasOptedOut = false;
      } else {
        // Re-throw other errors
        throw error;
      }
    }

    if (hasOptedOut) {
      // User has opted out - update notification status and skip sending
      const errorMessage = "User has opted out of SMS notifications";
      console.warn(`[sendSmsInternal] User opted out: ${obfuscatePhoneNumber(formattedPhone)}`);
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "failed",
          errorMessage,
        });
      }
      return {
        success: false,
        messageId: undefined,
        phone: obfuscatePhoneNumber(formattedPhone),
        skipped: "opted_out",
        error: errorMessage,
      };
    }

    // Create Twilio client
    const twilioClient = twilio(accountSid, authToken);

    try {
      // Send SMS/MMS via Twilio
      const messageConfig: {
        body: string;
        from: string;
        to: string;
        mediaUrl?: string[];
      } = {
        body: args.message,
        from: fromNumber,
        to: formattedPhone,
      };
      
      // Add media URL for MMS if provided
      if (args.mediaUrl) {
        messageConfig.mediaUrl = [args.mediaUrl];
      }

      const message = await twilioClient.messages.create(messageConfig);

      // Calculate message length and cost
      const messageLength = args.message.length;
      const estimatedCost = calculateSmsCost(messageLength);
      const messageType = args.messageType || "Transactional";

      // Log SMS usage
      // Wrap in try-catch to handle authentication errors gracefully (internal actions shouldn't need auth)
      try {
        await ctx.runAction(internal.smsMonitoringActions.logSmsUsageAction, {
          messageId: message.sid,
          phoneNumber: formattedPhone,
          messageLength,
          messageType,
          estimatedCost,
          timestamp: Date.now(),
        });
      } catch (error: any) {
        // If we get an authentication error (OIDC token), log it but continue
        // Internal actions shouldn't require authentication, so this is likely a Convex bug
        const errorMessage = error.message || String(error);
        if (errorMessage.includes("OIDC") || errorMessage.includes("Unauthenticated")) {
          console.warn(`[sendSmsInternal] Authentication error logging SMS usage (continuing anyway): ${errorMessage}`);
          // Continue without logging - SMS was sent successfully, logging is secondary
        } else {
          // Log other errors but don't fail the SMS send
          console.error(`[sendSmsInternal] Error logging SMS usage: ${errorMessage}`);
        }
      }

      // Update notification status if ID provided
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "sent",
          messageId: message.sid,
          sentAt: Date.now(),
        });
      }

      return {
        success: true,
        messageId: message.sid,
        phone: obfuscatePhoneNumber(formattedPhone),
      };
    } catch (error: any) {
      // Update notification status with error if ID provided
      const errorMessage = error.message || String(error);
      console.error(`[sendSmsInternal] Failed to send SMS to ${obfuscatePhoneNumber(formattedPhone)}: ${errorMessage}`, error);
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "failed",
          errorMessage,
        });
      }

      throw new Error(`SMS send failed: ${errorMessage}`);
    }
  },
});

/**
 * Internal action to send bulk SMS messages
 * Processes in batches to avoid overwhelming Twilio
 */
export const sendBulkSmsInternal = internalAction({
  args: {
    recipients: v.array(
      v.object({
        phoneNumber: v.string(),
        clerkUserId: v.string(),
        notificationId: v.optional(v.id("smsNotifications")),
        personalizedMessage: v.optional(v.string()),
        mediaUrl: v.optional(v.string()),
      })
    ),
    message: v.string(),
    batchSize: v.optional(v.number()),
    messageType: v.optional(v.string()), // 'Transactional' | 'Promotional'
  },
  handler: async (ctx, args) => {
    // Validate credentials (throws error in production if missing, returns null in dev if disabled)
    const credentials = validateTwilioCredentials();
    
    if (!credentials) {
      // Dev mode with SMS disabled - return failure for all recipients
      console.error(`[sendBulkSmsInternal] Twilio disabled - failing all ${args.recipients.length} recipients`);
      return {
        totalRecipients: args.recipients.length,
        successCount: 0,
        failureCount: args.recipients.length,
        results: args.recipients.map((recipient) => ({
          clerkUserId: recipient.clerkUserId,
          success: false,
          error: "Twilio disabled in development (DEV_TWILIO_ENABLED=false)",
        })),
      };
    }

    const batchSize = args.batchSize || 10; // Process 10 SMS at a time
    const results: Array<{
      clerkUserId: string;
      success: boolean;
      messageId?: string;
      error?: string;
    }> = [];

    console.log(`[sendBulkSmsInternal] Starting bulk send: ${args.recipients.length} recipients, batch size: ${batchSize}`);

    // Process recipients in batches
    for (let i = 0; i < args.recipients.length; i += batchSize) {
      const batch = args.recipients.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(args.recipients.length / batchSize);
      
      console.log(`[sendBulkSmsInternal] Processing batch ${batchNumber}/${totalBatches} (${batch.length} recipients)`);

      // Send batch of SMS messages
      // Wrap each call in try-catch to handle authentication errors gracefully
      // Internal actions shouldn't require authentication, but tokens can expire during long operations
      const batchResults = await Promise.allSettled(
        batch.map(async (recipient) => {
          try {
            return await ctx.runAction(internal.smsActions.sendSmsInternal, {
              phoneNumber: recipient.phoneNumber,
              message: recipient.personalizedMessage ?? args.message,
              notificationId: recipient.notificationId,
              mediaUrl: recipient.mediaUrl,
              messageType: args.messageType,
            });
          } catch (error: any) {
            // Handle authentication errors specifically - these shouldn't happen for internal actions
            // but can occur when tokens expire during long-running operations
            const errorMessage = error.message || String(error);
            const errorCode = error.code || "";
            const errorString = String(error);
            
            // Try to parse error if it's a JSON string
            let parsedError: any = null;
            try {
              if (typeof errorMessage === "string" && errorMessage.trim().startsWith("{")) {
                parsedError = JSON.parse(errorMessage);
              }
            } catch {
              // Not JSON, continue with original error handling
            }
            
            // Check for authentication errors in multiple ways:
            // 1. Error code is "Unauthenticated"
            // 2. Parsed error code is "Unauthenticated" (if error was JSON)
            // 3. Error message contains "OIDC" or "Unauthenticated"
            // 4. Error string contains authentication-related text
            const isAuthError = 
              errorCode === "Unauthenticated" ||
              parsedError?.code === "Unauthenticated" ||
              errorMessage.includes("OIDC") ||
              errorMessage.includes("Unauthenticated") ||
              errorString.includes("OIDC") ||
              errorString.includes("Unauthenticated");
            
            if (isAuthError) {
              const finalErrorMessage = parsedError?.message || errorMessage;
              console.warn(`[sendBulkSmsInternal] Authentication error sending SMS to user ${recipient.clerkUserId} (token expired). Internal actions shouldn't require auth - this may be a Convex limitation: ${finalErrorMessage}`);
              // Return a failure result instead of throwing, so we can continue processing other recipients
              return {
                success: false,
                messageId: undefined,
                phone: obfuscatePhoneNumber(recipient.phoneNumber),
                error: `Authentication token expired during bulk send: ${finalErrorMessage}`,
              };
            }
            // Re-throw other errors to be handled by Promise.allSettled
            throw error;
          }
        })
      );

      // Collect results
      batchResults.forEach((result, index) => {
        const recipient = batch[index];
        if (result.status === "fulfilled") {
          // Check if SMS was actually sent successfully, not just if promise fulfilled
          if (result.value.success) {
            results.push({
              clerkUserId: recipient.clerkUserId,
              success: true,
              messageId: result.value.messageId,
            });
          } else {
            // Promise fulfilled but SMS wasn't sent (e.g., opted out, dev mode disabled, auth error)
            const errorMessage = result.value.error || "SMS send failed but no error provided";
            console.error(`[sendBulkSmsInternal] SMS failed for user ${recipient.clerkUserId}: ${errorMessage}`);
            results.push({
              clerkUserId: recipient.clerkUserId,
              success: false,
              error: errorMessage,
            });
          }
        } else {
          // Promise rejected - exception thrown (shouldn't happen with our try-catch, but handle anyway)
          const errorMessage =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason ?? "Unknown error");
          console.error(`[sendBulkSmsInternal] Exception sending SMS to user ${recipient.clerkUserId}: ${errorMessage}`);
          results.push({
            clerkUserId: recipient.clerkUserId,
            success: false,
            error: errorMessage,
          });
        }
      });

      // Small delay between batches to be respectful to Twilio
      if (i + batchSize < args.recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Calculate success/failure counts
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log(`[sendBulkSmsInternal] Bulk send complete: ${successCount} succeeded, ${failureCount} failed out of ${args.recipients.length} total`);
    
    if (failureCount > 0) {
      const errorMessages = results
        .filter((r) => !r.success && r.error)
        .map((r) => r.error)
        .slice(0, 5); // Show first 5 errors
      console.error(`[sendBulkSmsInternal] Sample errors:`, errorMessages);
    }

    return {
      totalRecipients: args.recipients.length,
      successCount,
      failureCount,
      results,
    };
  },
});

/**
 * Send automated help response via Twilio when users text HELP
 */
export const sendHelpResponse = internalAction({
  args: {
    to: v.string(),
    from: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate credentials (throws error in production if missing, returns null in dev if disabled)
    const credentials = validateTwilioCredentials();
    
    if (!credentials) {
      // Dev mode with SMS disabled - skip gracefully
      return;
    }

    const { accountSid, authToken } = credentials;

    try {
      const twilioClient = twilio(accountSid, authToken);

      await twilioClient.messages.create({
        body: "Dojo Events SMS. Reply STOP to opt-out, START to opt-in. Questions? Visit our website.",
        from: args.from,
        to: args.to,
      });

      console.log(`Help response sent to ${args.to}`);
    } catch (error: any) {
      console.error("Failed to send help response:", error);
    }
  },
});
