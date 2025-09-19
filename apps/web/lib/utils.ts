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
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
  return `${day} ${formattedDate.replace(/\//g, ".")} at ${time}`;
}

export function copyEventLink(eventId: string): void {
  const eventUrl = `${window.location.origin}/events/${eventId}`;
  navigator.clipboard.writeText(eventUrl).then(() => {
    toast.success("Event link copied to clipboard");
  }).catch(() => {
    toast.error("Failed to copy event link");
  });
}
