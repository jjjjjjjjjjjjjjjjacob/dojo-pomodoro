/**
 * Shared date formatting utilities
 */

/**
 * Formats a timestamp to a readable date string
 */
export function formatEventDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Formats a timestamp to a readable time string
 */
export function formatEventTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

/**
 * Formats a timestamp to a readable date and time string
 */
export function formatEventDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

/**
 * Converts a date object to YYYY-MM-DD format for input fields
 */
export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Converts a date object to HH:MM format for input fields
 */
export function formatTimeForInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Creates a timestamp from date and time strings
 */
export function createTimestamp(dateString: string, timeString?: string): number {
  const [year, month, day] = dateString.split("-").map(value => parseInt(value, 10));

  if (timeString) {
    const [hours, minutes] = timeString.split(":").map(value => parseInt(value, 10));
    return new Date(Date.UTC(year, month - 1, day, hours || 0, minutes || 0)).getTime();
  } else {
    return new Date(Date.UTC(year, month - 1, day)).getTime();
  }
}

/**
 * Formats a relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const difference = timestamp - now;
  const absDifference = Math.abs(difference);

  const minute = 60 * 1000;
  const hour = minute * 60;
  const day = hour * 24;
  const week = day * 7;
  const month = day * 30;
  const year = day * 365;

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absDifference < minute) {
    return "just now";
  } else if (absDifference < hour) {
    const minutes = Math.floor(absDifference / minute);
    return rtf.format(difference > 0 ? minutes : -minutes, "minute");
  } else if (absDifference < day) {
    const hours = Math.floor(absDifference / hour);
    return rtf.format(difference > 0 ? hours : -hours, "hour");
  } else if (absDifference < week) {
    const days = Math.floor(absDifference / day);
    return rtf.format(difference > 0 ? days : -days, "day");
  } else if (absDifference < month) {
    const weeks = Math.floor(absDifference / week);
    return rtf.format(difference > 0 ? weeks : -weeks, "week");
  } else if (absDifference < year) {
    const months = Math.floor(absDifference / month);
    return rtf.format(difference > 0 ? months : -months, "month");
  } else {
    const years = Math.floor(absDifference / year);
    return rtf.format(difference > 0 ? years : -years, "year");
  }
}