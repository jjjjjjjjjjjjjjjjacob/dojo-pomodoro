"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import CreatedToastOnce from "./toast-client";
import EventCardClient from "./event-card-client";
import EditEventDialog from "./edit-event-dialog";
import { Event } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectOption } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Grid,
  List,
  Search,
  Filter,
  MoreHorizontal,
  ExternalLink,
  Edit,
  Trash2,
  CheckCircle,
} from "lucide-react";
import { formatEventDateTime, copyEventLink } from "@/lib/utils";
import { toast } from "sonner";

type ViewMode = "card" | "list";
type SortOption = "date" | "name" | "rsvps";
type FilterOption = "all" | "upcoming" | "past";

export default function EventsPage() {
  const events = useQuery(api.events.listAll, {});
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");

  const filteredAndSortedEvents = useMemo(() => {
    if (!events) return [];

    let filtered = events.filter((event: any) => {
      // Search filter
      const matchesSearch =
        event.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.location?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Date filter
      if (filterBy === "all") return true;

      const now = Date.now();
      const eventDate = event.eventDate || 0;

      if (filterBy === "upcoming") return eventDate > now;
      if (filterBy === "past") return eventDate <= now;

      return true;
    });

    // Sort
    filtered.sort((a: any, b: any) => {
      switch (sortBy) {
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        case "date":
          return (b.eventDate || 0) - (a.eventDate || 0);
        case "rsvps":
          // We'll need to add RSVP count to the event data or fetch separately
          return 0; // Placeholder for now
        default:
          return 0;
      }
    });

    return filtered;
  }, [events, searchQuery, sortBy, filterBy]);

  return (
    <div className="flex-1 space-y-4">
      <CreatedToastOnce />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Events</h2>
          <p className="text-muted-foreground">
            Manage and view all your events
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Filters */}
          <Select
            value={filterBy}
            onValueChange={(value) => setFilterBy(value as FilterOption)}
          >
            <SelectOption value="all">All Events</SelectOption>
            <SelectOption value="upcoming">Upcoming</SelectOption>
            <SelectOption value="past">Past</SelectOption>
          </Select>

          {/* Sort */}
          <Select
            value={sortBy}
            onValueChange={(value) => setSortBy(value as SortOption)}
          >
            <SelectOption value="date">Sort by Date</SelectOption>
            <SelectOption value="name">Sort by Name</SelectOption>
            <SelectOption value="rsvps">Sort by RSVPs</SelectOption>
          </Select>
        </div>

        {/* View Toggle */}
        <div className="flex gap-1 border rounded-lg p-1">
          <Button
            variant={viewMode === "card" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("card")}
            className="px-2"
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="px-2"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Results Count */}
      {events && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredAndSortedEvents.length} of {events.length} events
        </div>
      )}

      {/* Empty State */}
      {(!events || events.length === 0) && (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <p className="text-lg text-muted-foreground mb-2">No events yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first event to get started
          </p>
        </div>
      )}

      {/* No Results State */}
      {events && events.length > 0 && filteredAndSortedEvents.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <p className="text-lg text-muted-foreground mb-2">No events found</p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search or filters
          </p>
        </div>
      )}

      {/* Events Display */}
      {viewMode === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedEvents.map((event: any) => (
            <EventCard key={event._id} event={event} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAndSortedEvents.map((event: any) => (
            <EventListItem key={event._id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: any }) {
  return <EventCardClient event={event} fileUrl={null} />;
}

function EventListItem({ event }: { event: any }) {
  const router = useRouter();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const removeEvent = useMutation(api.events.remove);
  const setFeaturedEvent = useMutation(api.events.setFeaturedEvent);
  const now = Date.now();
  const isUpcoming = (event.eventDate || 0) > now;

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{event.name}</h3>
              {event.isFeatured && (
                <Badge variant="secondary" className="text-xs">
                  Featured
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatEventDateTime(event.eventDate)} • {event.location}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/events/${event._id}`)}
          >
            View
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/host/rsvps?eventId=${event._id}`)}
          >
            RSVPs
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyEventLink(event._id)}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share</p>
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onSelect={async (e) => {
                  e.preventDefault();
                  try {
                    await setFeaturedEvent({ eventId: event._id });
                    toast.success(`"${event.name}" is now the featured event`);
                    router.refresh();
                  } catch (error) {
                    toast.error(
                      "Failed to set featured event: " + (error as Error).message,
                    );
                  }
                }}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Set as Featured
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove the event and its list
                      credentials.
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <EditEventDialog
          event={event}
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          showTrigger={false}
        />
      </CardContent>
    </Card>
  );
}
