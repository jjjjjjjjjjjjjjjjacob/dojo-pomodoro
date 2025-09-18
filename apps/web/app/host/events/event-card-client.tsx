"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import EditEventDialog from "./edit-event-dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Event } from "@/lib/types";
import { formatEventDateTime, copyEventLink } from "@/lib/utils";

export default function EventCardClient({ event, fileUrl }: { event: Event; fileUrl?: string | null }) {
  const router = useRouter();
  const removeEvent = useMutation(api.events.remove);

  return (
    <div className="rounded border border-foreground/10 p-4">
      {fileUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl} alt="Flyer" className="h-24 w-full object-cover rounded mb-3" />
      ) : (
        <div className="h-24 bg-foreground/5 rounded mb-3" />
      )}
      <div className="font-medium">{event.name}</div>
      <div className="text-xs text-foreground/70">
        {formatEventDateTime(event.eventDate)} • {event.location}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          className="text-sm px-2 py-1 border rounded"
          onClick={() => router.push(`/events/${event._id}`)}
        >
          View
        </button>
        <EditEventDialog event={event} />
        <button
          className="text-sm px-2 py-1 border rounded"
          onClick={() => copyEventLink(event._id)}
        >
          Copy Link
        </button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="text-sm px-2 py-1 border rounded">Delete</button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this event?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the event and its list credentials.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await removeEvent({ eventId: event._id });
                  router.refresh();
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
