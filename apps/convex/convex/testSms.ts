/**
 * Test SMS functionality - REMOVE BEFORE PRODUCTION
 * This is just for testing the SMS integration
 */

"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const testApprovalSms = action({
  args: {
    testPhoneNumber: v.string(), // e.g., "+1234567890"
    testEventName: v.string(),
    testEventLocation: v.string(),
    testTicketCode: v.string(),
  },
  handler: async (ctx, args) => {
    const baseUrl = process.env.APP_BASE_URL || "http://localhost:2345";

    // Format test message
    const message = `🎉 Your RSVP for ${args.testEventName} is approved!

📅 ${new Date().toLocaleDateString()}
📍 ${args.testEventLocation}

🎫 Your ticket: ${baseUrl}/redeem/${args.testTicketCode}

Show this link at the door for entry.`;

    try {
      // Send test SMS directly
      const result = await ctx.runAction(internal.smsActions.sendSmsInternal, {
        phoneNumber: args.testPhoneNumber,
        message: message,
      });

      return {
        success: true,
        messageId: result.messageId,
        phone: result.phone,
        message: "Test SMS sent successfully!",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

export const testEncryption = action({
  args: {
    testPhoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Get encryption key
      const encryptionKey = process.env.ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error("ENCRYPTION_KEY not configured");
      }

      // Test encryption
      const { encryptPhoneNumber, decryptPhoneNumber, obfuscatePhoneNumber } = await import("./lib/encryption");

      const encrypted = encryptPhoneNumber(args.testPhoneNumber, encryptionKey);
      const decrypted = decryptPhoneNumber(encrypted, encryptionKey);
      const obfuscated = obfuscatePhoneNumber(args.testPhoneNumber);

      return {
        success: true,
        original: args.testPhoneNumber,
        encrypted: encrypted,
        decrypted: decrypted,
        obfuscated: obfuscated,
        matches: decrypted === args.testPhoneNumber,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
});