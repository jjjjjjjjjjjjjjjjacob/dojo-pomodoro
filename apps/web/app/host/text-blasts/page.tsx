"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Event, TextBlast, TextBlastStatus } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectOption } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Search,
  Plus,
  MoreHorizontal,
  Copy,
  Trash2,
  Send,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatEventDateTime } from "@/lib/utils";
import TextBlastDialog from "./text-blast-dialog";

type FilterOption = "all" | "draft" | "sent" | "failed";
type SortOption = "date" | "name" | "recipients";

function getStatusIcon(status: TextBlastStatus) {
  switch (status) {
    case "draft":
      return <Clock className="h-4 w-4" />;
    case "sending":
      return <Send className="h-4 w-4 animate-pulse" />;
    case "sent":
      return <CheckCircle className="h-4 w-4" />;
    case "failed":
      return <XCircle className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

function getStatusBadgeProps(status: TextBlastStatus): { variant: NonNullable<BadgeProps["variant"]>; label: string } {
  switch (status) {
    case "draft":
      return { variant: "secondary", label: "Draft" };
    case "sending":
      return { variant: "default", label: "Sending" };
    case "sent":
      return { variant: "success", label: "Sent" };
    case "failed":
      return { variant: "destructive", label: "Failed" };
    default:
      return { variant: "secondary", label: status };
  }
}

export default function TextBlastsPage() {
  const textBlasts = useQuery(api.textBlasts.getMyBlasts, {}) as
    | TextBlast[]
    | undefined;
  const events = useQuery(api.events.listAll, {}) as Event[] | undefined;
  const duplicateBlastMutation = useMutation(api.textBlasts.duplicateBlast);
  const deleteBlastMutation = useMutation(api.textBlasts.deleteBlast);
  const sendBlastAction = useAction(api.textBlasts.sendBlast);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [selectedBlastForDialog, setSelectedBlastForDialog] = useState<Id<"textBlasts"> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sendingBlastId, setSendingBlastId] = useState<Id<"textBlasts"> | null>(null);

  const eventsMap = useMemo(() => {
    const map = new Map<Id<"events">, Event>();
    events?.forEach((event) => {
      map.set(event._id, event);
    });
    return map;
  }, [events]);

  const filteredAndSortedBlasts = useMemo<TextBlast[]>(() => {
    if (!textBlasts) return [];

    let filtered = textBlasts.filter((blast) => {
      // Search filter
      const event = eventsMap.get(blast.eventId);
      const matchesSearch =
        blast.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        blast.message.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Status filter
      if (filterBy === "all") return true;
      return blast.status === filterBy;
    });

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "date":
          return b.createdAt - a.createdAt;
        case "recipients":
          return b.recipientCount - a.recipientCount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [textBlasts, searchQuery, filterBy, sortBy, eventsMap]);

  const handleDuplicateBlast = async (blastId: Id<"textBlasts">) => {
    try {
      await duplicateBlastMutation({ blastId });
      toast.success("Text blast duplicated successfully");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to duplicate text blast",
      );
    }
  };

  const handleDeleteBlast = async (blastId: Id<"textBlasts">) => {
    try {
      await deleteBlastMutation({ blastId });
      toast.success("Text blast deleted successfully");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete text blast",
      );
    }
  };

  const handleSendBlast = async (blastId: Id<"textBlasts">) => {
    setSendingBlastId(blastId);
    try {
      const result = await sendBlastAction({ blastId });
      if (result.success) {
        toast.success(
          `Text blast sent successfully! ${result.sentCount} messages delivered.`,
        );
      } else {
        toast.error(result.message || "Failed to send text blast");
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to send text blast",
      );
    } finally {
      setSendingBlastId(null);
    }
  };

  const handleCreateNew = () => {
    setSelectedBlastForDialog(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="flex-1 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Text Blasts</h2>
          <p className="text-muted-foreground">
            Send bulk SMS messages to event attendees
          </p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Text Blast
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search text blasts..."
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
            <SelectOption value="all">All Blasts</SelectOption>
            <SelectOption value="draft">Drafts</SelectOption>
            <SelectOption value="sent">Sent</SelectOption>
            <SelectOption value="failed">Failed</SelectOption>
          </Select>

          {/* Sort */}
          <Select
            value={sortBy}
            onValueChange={(value) => setSortBy(value as SortOption)}
          >
            <SelectOption value="date">Sort by Date</SelectOption>
            <SelectOption value="name">Sort by Name</SelectOption>
            <SelectOption value="recipients">Sort by Recipients</SelectOption>
          </Select>
        </div>
      </div>

      {/* Text Blasts Grid */}
      {filteredAndSortedBlasts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Send className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No text blasts found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || filterBy !== "all"
                ? "Try adjusting your search or filters"
                : "Create your first text blast to send SMS messages to event attendees"}
            </p>
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create Text Blast
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedBlasts.map((blast) => {
            const event = eventsMap.get(blast.eventId);
            const statusBadge = getStatusBadgeProps(blast.status);
            return (
              <Card key={blast._id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="text-lg line-clamp-1">
                        {blast.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {event?.name || "Unknown Event"}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(blast.status === "draft" || blast.status === "failed") && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                disabled={sendingBlastId === blast._id}
                              >
                                <Send className="h-4 w-4 mr-2" />
                                {sendingBlastId === blast._id ? "Sending..." : "Send Now"}
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Send Text Blast</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to send &ldquo;{blast.name}&rdquo; to {blast.recipientCount} recipient{blast.recipientCount !== 1 ? "s" : ""}?
                                  {blast.status === "failed" && " This will retry the failed blast."}
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleSendBlast(blast._id)}>
                                  Send {blast.recipientCount} Message{blast.recipientCount !== 1 ? "s" : ""}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedBlastForDialog(blast._id);
                            setIsDialogOpen(true);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDuplicateBlast(blast._id)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        {blast.status === "draft" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Text Blast</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete &ldquo;{blast.name}&rdquo;? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteBlast(blast._id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={statusBadge.variant}
                      className="flex items-center gap-1"
                    >
                      {getStatusIcon(blast.status)}
                      {statusBadge.label}
                    </Badge>
                  </div>

                  {/* Message Preview */}
                  <p className="text-sm line-clamp-3 text-muted-foreground">
                    {blast.message}
                  </p>

                  {/* Stats */}
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {blast.recipientCount} recipient{blast.recipientCount !== 1 ? "s" : ""}
                    </span>
                    <span>
                      {blast.status === "sent" && blast.sentAt
                        ? `Sent ${formatEventDateTime(blast.sentAt)}`
                        : `Created ${formatEventDateTime(blast.createdAt)}`}
                    </span>
                  </div>

                  {/* Delivery Stats for Sent Blasts */}
                  {blast.status === "sent" && (
                    <div className="flex justify-between text-xs">
                      <span className="text-green-600">
                        ✓ {blast.sentCount} delivered
                      </span>
                      {blast.failedCount > 0 && (
                        <span className="text-red-600">
                          ✗ {blast.failedCount} failed
                        </span>
                      )}
                    </div>
                  )}

                  {/* Target Lists */}
                  <div className="flex flex-wrap gap-1">
                    {blast.targetLists.map((listKey) => (
                      <Badge key={listKey} variant="outline" className="text-xs">
                        {listKey.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Text Blast Dialog */}
      <TextBlastDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setSelectedBlastForDialog(null);
        }}
        blastId={selectedBlastForDialog}
      />
    </div>
  );
}
