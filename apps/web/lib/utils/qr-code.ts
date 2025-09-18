/**
 * QR code utilities for common QR operations
 */

import { showErrorToast, showSuccessToast } from "../error-utils";

/**
 * Generates QR code data URL using QRCode library
 */
export async function generateQRCodeDataURL(
  text: string,
  options: {
    size?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  } = {}
): Promise<string | null> {
  const { size = 200, errorCorrectionLevel = "M" } = options;

  try {
    // Dynamically import QR code library
    const QRCode = await import("qr.js") as any;
    const qr = new QRCode.default(-1, errorCorrectionLevel);
    qr.addData(text);
    qr.make();

    // Create canvas and draw QR code
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create canvas context");
    }

    const moduleCount = qr.getModuleCount();
    const cellSize = size / moduleCount;
    canvas.width = size;
    canvas.height = size;

    // Fill background white
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    // Draw QR modules
    ctx.fillStyle = "#000000";
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }

    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("Failed to generate QR code:", error);
    return null;
  }
}

/**
 * Downloads QR code as PNG file
 */
export async function downloadQRCode(
  text: string,
  filename: string = "qr-code.png",
  options: {
    size?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  } = {}
): Promise<boolean> {
  try {
    const dataURL = await generateQRCodeDataURL(text, options);
    if (!dataURL) {
      showErrorToast("Failed to generate QR code");
      return false;
    }

    // Convert data URL to blob
    const response = await fetch(dataURL);
    const blob = await response.blob();

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSuccessToast("QR code downloaded successfully");
    return true;
  } catch (error) {
    showErrorToast(error, "Failed to download QR code");
    return false;
  }
}

/**
 * Creates QR code for event ticket
 */
export async function generateEventTicketQR(
  eventId: string,
  guestId: string,
  options: {
    size?: number;
    includeEventInfo?: boolean;
  } = {}
): Promise<string | null> {
  const { size = 200, includeEventInfo = false } = options;

  try {
    let qrData: string;

    if (includeEventInfo) {
      // Include more detailed information in QR code
      const ticketData = {
        type: "event-ticket",
        eventId,
        guestId,
        timestamp: Date.now(),
        url: `${window.location.origin}/events/${eventId}/ticket?guest=${guestId}`,
      };
      qrData = JSON.stringify(ticketData);
    } else {
      // Simple URL format
      qrData = `${window.location.origin}/events/${eventId}/ticket?guest=${guestId}`;
    }

    return await generateQRCodeDataURL(qrData, { size });
  } catch (error) {
    console.error("Failed to generate event ticket QR:", error);
    showErrorToast(error, "Failed to generate QR code");
    return null;
  }
}

/**
 * Creates QR code for door access
 */
export async function generateDoorAccessQR(
  code: string,
  options: { size?: number } = {}
): Promise<string | null> {
  const { size = 200 } = options;

  try {
    const qrData = `${window.location.origin}/redeem/${code}`;
    return await generateQRCodeDataURL(qrData, { size });
  } catch (error) {
    console.error("Failed to generate door access QR:", error);
    showErrorToast(error, "Failed to generate QR code");
    return null;
  }
}

/**
 * Validates QR code data and extracts information
 */
export function parseQRCodeData(qrData: string): {
  type: "url" | "event-ticket" | "door-access" | "unknown";
  data: any;
} {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(qrData);
    if (parsed.type === "event-ticket") {
      return { type: "event-ticket", data: parsed };
    }
  } catch {
    // Not JSON, check if it's a URL
  }

  // Check if it's an event ticket URL
  const eventTicketMatch = qrData.match(/\/events\/([^\/\?]+)\/ticket\?guest=([^&]+)/);
  if (eventTicketMatch) {
    return {
      type: "event-ticket",
      data: {
        eventId: eventTicketMatch[1],
        guestId: eventTicketMatch[2],
        url: qrData,
      },
    };
  }

  // Check if it's a door access URL
  const doorAccessMatch = qrData.match(/\/redeem\/([^\/\?]+)/);
  if (doorAccessMatch) {
    return {
      type: "door-access",
      data: {
        code: doorAccessMatch[1],
        url: qrData,
      },
    };
  }

  // Check if it's any URL
  if (qrData.startsWith("http")) {
    return { type: "url", data: { url: qrData } };
  }

  return { type: "unknown", data: { raw: qrData } };
}