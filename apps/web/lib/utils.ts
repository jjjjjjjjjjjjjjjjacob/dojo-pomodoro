import { clsx, type ClassValue } from "clsx"

export type { ClassValue }
import { twMerge } from "tailwind-merge"
import { toast } from "sonner"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatEventDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString(undefined, { weekday: "long" });
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
  return `${day} ${month}.${dayOfMonth}.${year} at ${time}`;
}

export function copyEventLink(eventId: string): void {
  const eventUrl = `${window.location.origin}/events/${eventId}`;
  navigator.clipboard.writeText(eventUrl).then(() => {
    toast.success("Event link copied to clipboard");
  }).catch(() => {
    toast.error("Failed to copy event link");
  });
}
