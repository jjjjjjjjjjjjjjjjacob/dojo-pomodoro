"use client";
import React, { useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Event } from "@/lib/types";
import { formatEventDateTime, copyEventLink } from "@/lib/utils";
import { toast } from "sonner";
import {
  MoreHorizontal,
  ExternalLink,
  Edit,
  Trash2,
  CheckCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

export default function EventCardClient({
  event,
  fileUrl,
}: {
  event: Event;
  fileUrl?: string | null;
}) {
  const router = useRouter();
  const removeEvent = useMutation(api.events.remove);
  const setFeaturedEvent = useMutation(api.events.setFeaturedEvent);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const now = Date.now();
  const isUpcoming = (event.eventDate || 0) > now;

  return (
    <Card className="flex flex-col h-content">
      <CardHeader className="pb-0">
        {fileUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fileUrl}
            alt="Flyer"
            className="h-24 w-full object-cover rounded mb-3"
          />
        ) : (
          <div className="h-24 bg-foreground/5 rounded mb-3" />
        )}
      </CardHeader>
      <div className="flex flex-col flex-grow justify-between">
        <CardContent className="pb-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="font-medium">{event.name}</div>
            {event.isFeatured && (
              <Badge variant="secondary" className="text-xs">
                Featured
              </Badge>
            )}
          </div>
          <div className="text-xs text-foreground/70 mb-3">
            {formatEventDateTime(event.eventDate, event.eventTimezone)} • {event.location}
          </div>
        </CardContent>
        <CardFooter className="pt-0">
          <div className="w-full flex items-center justify-between mt-3 gap-1">
            <div className="flex gap-2">
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
            </div>

            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="aspect-square"
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
                    <MoreHorizontal className="h-6 w-6" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onSelect={async (e) => {
                      e.preventDefault();
                      try {
                        await setFeaturedEvent({ eventId: event._id });
                        toast.success(
                          `"${event.name}" is now the featured event`,
                        );
                        router.refresh();
                      } catch (error) {
                        toast.error(
                          "Failed to set featured event: " +
                            (error as Error).message,
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
          </div>
        </CardFooter>
      </div>

      <EditEventDialog
        event={event}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        showTrigger={false}
      />
    </Card>
  );
}
