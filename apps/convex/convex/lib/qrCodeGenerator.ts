"use node";
import QRCode from "qrcode";
import { v } from "convex/values";
import { internalAction, action } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Generate a QR code image and upload it to Convex storage
 * Returns the storage ID of the uploaded QR code image
 */
export const generateAndUploadQrCode = internalAction({
  args: {
    value: v.string(), // The value to encode in the QR code
    qrCodeColor: v.optional(v.string()), // Hex color for QR code (defaults to black)
  },
  handler: async (ctx, args) => {
    // Generate QR code as PNG buffer
    const qrCodeColor = args.qrCodeColor || "#000000";
    const qrCodeBuffer = await QRCode.toBuffer(args.value, {
      type: "png",
      width: 500,
      margin: 2,
      color: {
        dark: qrCodeColor,
        light: "#FFFFFF",
      },
    });

    // Upload to Convex storage
    // Convert Buffer to Uint8Array for Blob compatibility
    const qrCodeUint8Array = new Uint8Array(qrCodeBuffer);
    const storageId = await ctx.storage.store(
      new Blob([qrCodeUint8Array], { type: "image/png" }),
    );

    return storageId;
  },
});

/**
 * Generate a QR code image and upload it to Convex storage (action wrapper)
 * This version can be called from other actions and preserves authentication context
 * Returns the storage ID and URL of the uploaded QR code image
 */
export const generateAndUploadQrCodeWithAuth = action({
  args: {
    value: v.string(), // The value to encode in the QR code
    qrCodeColor: v.optional(v.string()), // Hex color for QR code (defaults to black)
  },
  handler: async (ctx, args) => {
    // Generate QR code as PNG buffer
    const qrCodeColor = args.qrCodeColor || "#000000";
    const qrCodeBuffer = await QRCode.toBuffer(args.value, {
      type: "png",
      width: 500,
      margin: 2,
      color: {
        dark: qrCodeColor,
        light: "#FFFFFF",
      },
    });

    // Upload to Convex storage using the calling action's authentication context
    // Convert Buffer to Uint8Array for Blob compatibility
    const qrCodeUint8Array = new Uint8Array(qrCodeBuffer);
    const storageId = await ctx.storage.store(
      new Blob([qrCodeUint8Array], { type: "image/png" }),
    );

    // Get publicly accessible URL for the QR code
    const url = await ctx.storage.getUrl(storageId);

    return {
      storageId,
      url: url || undefined,
    };
  },
});

/**
 * Get a publicly accessible URL for a stored QR code image
 * Note: This returns a URL that can be used with Twilio MMS
 */
export const getQrCodeUrl = internalAction({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    // Get the URL for the stored file
    // Convex storage URLs are publicly accessible
    const url = await ctx.storage.getUrl(args.storageId);
    return url;
  },
});





