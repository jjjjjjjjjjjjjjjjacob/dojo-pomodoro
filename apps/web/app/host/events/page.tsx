import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import CreatedToastOnce from "./toast-client";
import EventCardClient from "./event-card-client";
import { Event } from "@/lib/types";

export default async function EventsPage() {
  const events = await fetchQuery(api.events.listAll, {});
  return (
    <section className="space-y-4">
      <CreatedToastOnce />
      <h2 className="text-lg font-medium">Your Events</h2>
      {(!events || events.length === 0) && (
        <p className="text-sm text-foreground/70">No events yet.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(events ?? []).map((event) => (
          <EventCard key={event._id} event={event} />
        ))}
      </div>
    </section>
  );
}

async function EventCard({ event }: { event: any }) {
  const fileUrl = event?.flyerStorageId
    ? await fetchQuery(api.files.getUrl, { storageId: event.flyerStorageId })
    : null;
  return <EventCardClient event={event} fileUrl={fileUrl?.url ?? null} />;
}
