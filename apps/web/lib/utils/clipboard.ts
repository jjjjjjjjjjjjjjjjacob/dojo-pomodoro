/**
 * Clipboard utilities for common copy operations
 */

import { showSuccessToast, showErrorToast } from "../error-utils";

/**
 * Copies text to clipboard with toast feedback
 */
export async function copyToClipboard(
  text: string,
  options: {
    successMessage?: string;
    errorMessage?: string;
    showToast?: boolean;
  } = {}
): Promise<boolean> {
  const {
    successMessage = "Copied to clipboard",
    errorMessage = "Failed to copy to clipboard",
    showToast = true,
  } = options;

  try {
    await navigator.clipboard.writeText(text);
    if (showToast) {
      showSuccessToast(successMessage);
    }
    return true;
  } catch (error) {
    if (showToast) {
      showErrorToast(error, errorMessage);
    }
    return false;
  }
}

/**
 * Copies event link to clipboard
 */
export async function copyEventLink(eventId: string): Promise<boolean> {
  const eventUrl = `${window.location.origin}/events/${eventId}`;
  return copyToClipboard(eventUrl, {
    successMessage: "Event link copied",
    errorMessage: "Failed to copy link",
  });
}

/**
 * Copies QR code as text to clipboard
 */
export async function copyQRCodeData(data: string): Promise<boolean> {
  return copyToClipboard(data, {
    successMessage: "QR code data copied",
    errorMessage: "Failed to copy QR code data",
  });
}

/**
 * Copies formatted guest information to clipboard
 */
export async function copyGuestInfo(guest: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  responses?: Record<string, string>;
}): Promise<boolean> {
  const guestName = `${guest.firstName || ""} ${guest.lastName || ""}`.trim() || "Unknown";
  const guestInfo = [
    `Name: ${guestName}`,
    guest.email ? `Email: ${guest.email}` : null,
    guest.phone ? `Phone: ${guest.phone}` : null,
    guest.responses ? Object.entries(guest.responses)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n') : null,
  ].filter(Boolean).join('\n');

  return copyToClipboard(guestInfo, {
    successMessage: "Guest information copied",
    errorMessage: "Failed to copy guest information",
  });
}