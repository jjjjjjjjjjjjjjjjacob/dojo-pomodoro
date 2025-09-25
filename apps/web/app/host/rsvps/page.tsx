"use client";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Select, SelectOption } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import QRCode from "react-qr-code";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { Spinner } from "@/components/ui/spinner";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  Copy,
  MoreHorizontal,
  QrCode,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";

export default function RsvpsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Convert to TanStack Query
  const eventsQuery = useQuery({
    ...convexQuery(api.events.listAll, {}),
  });
  const events = eventsQuery.data;
  const eventsSorted = (events ?? [])
    .slice()
    .sort((a: any, b: any) => (b.eventDate ?? 0) - (a.eventDate ?? 0));
  const initialId = searchParams.get("eventId") ?? eventsSorted[0]?._id;
  const [eventId, setEventId] = React.useState<string | undefined>(initialId);
  React.useEffect(() => {
    if (!eventId && eventsSorted[0]?._id) setEventId(eventsSorted[0]._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsSorted.map((event: any) => event._id).join(","), eventId]);

  React.useEffect(() => {
    if (!eventId) return;
    const params = new URLSearchParams(searchParams as any);
    params.set("eventId", eventId);
    router.replace(`/host/rsvps?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const rsvpsQuery = useQuery({
    ...convexQuery(
      api.rsvps.listForEvent,
      eventId ? { eventId: eventId as Id<"events"> } : "skip"
    ),
  });
  const rsvps = rsvpsQuery.data;

  const currentEventQuery = useQuery({
    ...convexQuery(
      api.events.get,
      eventId ? { eventId: eventId as Id<"events"> } : "skip"
    ),
  });
  const currentEvent = currentEventQuery.data;

  const listCredentialsQuery = useQuery({
    ...convexQuery(
      api.credentials.getCredsForEvent,
      eventId ? { eventId: eventId as Id<"events"> } : "skip"
    ),
  });
  const listCredentials = listCredentialsQuery.data;
  // Convert mutations to TanStack Query
  const approveMutation = useMutation({
    mutationFn: useConvexMutation(api.approvals.approve),
  });
  const denyMutation = useMutation({
    mutationFn: useConvexMutation(api.approvals.deny),
  });
  const toggleRedemptionStatusMutation = useMutation({
    mutationFn: useConvexMutation(api.redemptions.toggleRedemptionStatus),
  });
  const updateTicketStatusMutation = useMutation({
    mutationFn: useConvexMutation(api.redemptions.updateTicketStatus),
  });
  const updateRsvpCompleteMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.updateRsvpComplete),
  });
  const updateRsvpListKeyMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.updateRsvpListKey),
  });
  const deleteRsvpCompleteMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.deleteRsvpComplete),
  });
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "guest", desc: false },
  ]);
  const [guestSearch, setGuestSearch] = React.useState("");
  const debouncedGuest = useDebounce(guestSearch, 250);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [listFilter, setListFilter] = React.useState<string>("all");
  const [redemptionFilter, setRedemptionFilter] = React.useState<string>("all");
  const [pendingChanges, setPendingChanges] = React.useState<
    Record<
      string,
      {
        originalApprovalStatus: string;
        originalTicketStatus: string;
        currentApprovalStatus: string;
        currentTicketStatus: string;
      }
    >
  >({});
  const [showQR, setShowQR] = React.useState(false);
  const [qr, setQr] = React.useState<{
    code: string;
    url: string;
    status?: string;
    listKey?: string;
  } | null>(null);

  // Generate dynamic custom field columns
  const customFieldColumns = React.useMemo(() => {
    if (!currentEvent?.customFields) return [];

    return currentEvent.customFields.map((field) => ({
      id: `custom_${field.key}`,
      header: field.label,
      accessorFn: (r: any) => r.metadata?.[field.key] || "",
      cell: ({ getValue }: any) => {
        const value = getValue() as string;
        const isCopyEnabled = field.copyEnabled;

        const handleCopyClick = async () => {
          if (!isCopyEnabled || !value || value === "-") return;

          try {
            await navigator.clipboard.writeText(value);
            toast.success(`Copied: ${value}`);
          } catch (err) {
            toast.error("Failed to copy to clipboard");
          }
        };

        if (!isCopyEnabled || !value || value === "-") {
          return <span className="truncate max-w-32">{value || "-"}</span>;
        }

        return (
          <div
            className={cn(
              "flex items-center justify-between w-full group cursor-pointer transition-colors duration-150 rounded px-2 py-1 -mx-2 -my-1",
            )}
            onClick={handleCopyClick}
          >
            <span className="truncate max-w-32">{value}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 bg-muted transition-opacity duration-150 ml-2 flex-shrink-0" />
              </TooltipTrigger>
              <TooltipContent
                align="center"
                variant="secondary"
                className="py-1 px-2 z-10"
              >
                copy
              </TooltipContent>
            </Tooltip>
          </div>
        );
      },
    }));
  }, [currentEvent?.customFields]);

  const cols = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: "guest",
        header: "Guest",
        accessorFn: (r: any) => {
          const displayName = `${r.firstName || ""} ${r.lastName || ""}`.trim();
          return (
            displayName ||
            r.name ||
            r.contact?.email ||
            r.contact?.phone ||
            "(no contact)"
          );
        },
        cell: (ctx) => {
          const guestName = ctx.getValue() as string;
          return <span>{guestName}</span>;
        },
      },
      {
        id: "listKey",
        header: "List",
        accessorKey: "listKey",
        cell: ({ row }) => {
          const rsvp = row.original;
          const currentListKey = rsvp.listKey;
          const availableListKeys =
            listCredentials?.map((cred) => cred.listKey) || [];

          const handleListKeyChange = async (newListKey: string) => {
            if (newListKey === currentListKey) return;

            // Get guest name for toast
            const displayName =
              `${rsvp.firstName || ""} ${rsvp.lastName || ""}`.trim();
            const guestName =
              displayName ||
              rsvp.name ||
              rsvp.contact?.email ||
              rsvp.contact?.phone ||
              "Guest";

            updateRsvpListKeyMutation.mutate(
              {
                rsvpId: rsvp.id,
                listKey: newListKey,
              },
              {
                onSuccess: () => {
                  toast.success(
                    `Changed ${guestName}'s list to '${newListKey.toUpperCase()}'`,
                  );
                },
                onError: (error) => {
                  toast.error(
                    `Failed to update ${guestName}'s list: ` +
                      (error as Error).message,
                  );
                },
              }
            );
          };

          if (availableListKeys.length <= 1) {
            // If only one list or no lists, show as text
            return <span>{currentListKey?.toUpperCase()}</span>;
          }

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="xs"
                  className="h-6 px-2 text-xs"
                  disabled={updateRsvpListKeyMutation.isPending}
                >
                  {updateRsvpListKeyMutation.isPending && (
                    <Spinner className="mr-1 h-3 w-3" />
                  )}
                  {currentListKey?.toUpperCase()}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={currentListKey}
                  onValueChange={handleListKeyChange}
                >
                  {availableListKeys.map((listKey) => (
                    <DropdownMenuRadioItem key={listKey} value={listKey}>
                      {listKey.toUpperCase()}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        id: "attendees",
        header: "Attendees",
        accessorFn: (r: any) => r.attendees ?? 1,
        cell: ({ getValue }) => {
          const attendees = getValue() as number;
          return <span className="text-sm">{attendees}</span>;
        },
      },
      {
        id: "createdAt",
        header: "Created",
        accessorKey: "createdAt",
        cell: ({ getValue }) => {
          const timestamp = getValue() as number;
          const date = new Date(timestamp);
          return (
            <div className="text-xs">
              <div>{date.toLocaleDateString()}</div>
              <div className="text-muted-foreground">
                {date.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          );
        },
      },
      // Insert custom field columns here
      ...customFieldColumns,
      {
        id: "approvalStatus",
        header: "Approval",
        accessorKey: "status",
        cell: ({ row }) => {
          const rsvp = row.original;
          const originalApprovalStatus = rsvp.status || "pending";
          const currentApprovalStatus = originalApprovalStatus;

          const handleStatusChange = async (newStatus: string) => {
            if (newStatus === originalApprovalStatus) return;

            // Get guest name for toast
            const displayName =
              `${rsvp.firstName || ""} ${rsvp.lastName || ""}`.trim();
            const guestName =
              displayName ||
              rsvp.name ||
              rsvp.contact?.email ||
              rsvp.contact?.phone ||
              "Guest";

            updateRsvpCompleteMutation.mutate(
              {
                rsvpId: rsvp.id,
                approvalStatus: newStatus as any,
              },
              {
                onSuccess: () => {
                  const statusText =
                    newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
                  toast.success(`Changed ${guestName}'s RSVP to '${statusText}'`);
                },
                onError: (error) => {
                  toast.error(
                    `Failed to update ${guestName}'s approval status: ` +
                      (error as Error).message,
                  );
                },
              }
            );
          };

          const getStatusColor = (currentStatus: string) => {
            switch (currentStatus) {
              case "approved":
                return "text-green-700 border-green-200 bg-green-50";
              case "denied":
                return "text-red-700 border-red-200 bg-red-50";
              case "pending":
              default:
                return "text-amber-700 border-amber-200 bg-amber-50";
            }
          };

          return (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-18" asChild>
                <Button
                  variant="outline"
                  size="xs"
                  className={cn(getStatusColor(currentApprovalStatus))}
                  disabled={updateRsvpCompleteMutation.isPending}
                >
                  {updateRsvpCompleteMutation.isPending && (
                    <Spinner className="mr-1 h-3 w-3" />
                  )}
                  {currentApprovalStatus.charAt(0).toUpperCase() +
                    currentApprovalStatus.slice(1)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={currentApprovalStatus}
                  onValueChange={handleStatusChange}
                >
                  <DropdownMenuRadioItem value="pending">
                    <span className="text-amber-700">Pending</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="approved">
                    <span className="text-green-700">Approved</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="denied">
                    <span className="text-red-700">Denied</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        id: "ticketStatus",
        header: "Ticket",
        accessorFn: (r: any) => r.redemptionStatus,
        cell: ({ row }) => {
          const rsvp = row.original;
          const originalTicketStatus =
            rsvp.redemptionStatus === "none"
              ? "not-issued"
              : rsvp.redemptionStatus;
          const currentTicketStatus = originalTicketStatus;
          const isRedeemed = originalTicketStatus === "redeemed";

          const handleTicketStatusChange = async (newStatus: string) => {
            if (isRedeemed) return; // Cannot change redeemed status
            if (newStatus === originalTicketStatus) return;

            // Get guest name for toast
            const displayName =
              `${rsvp.firstName || ""} ${rsvp.lastName || ""}`.trim();
            const guestName =
              displayName ||
              rsvp.name ||
              rsvp.contact?.email ||
              rsvp.contact?.phone ||
              "Guest";

            updateRsvpCompleteMutation.mutate(
              {
                rsvpId: rsvp.id,
                ticketStatus: newStatus as any,
              },
              {
                onSuccess: () => {
                  const statusText = getTicketStatusLabel(newStatus);
                  toast.success(`Changed ${guestName}'s ticket to '${statusText}'`);
                },
                onError: (error) => {
                  toast.error(
                    `Failed to update ${guestName}'s ticket status: ` +
                      (error as Error).message,
                  );
                },
              }
            );
          };

          const getTicketStatusColor = (status: string) => {
            switch (status) {
              case "issued":
                return "text-purple-700 border-purple-200 bg-purple-50";
              case "redeemed":
                return "text-blue-700 border-blue-200 bg-blue-50";
              case "disabled":
                return "text-red-700 border-red-200 bg-red-50";
              case "not-issued":
              default:
                return "text-gray-700 border-gray-200 bg-gray-50";
            }
          };

          const getTicketStatusLabel = (status: string) => {
            switch (status) {
              case "issued":
                return "Issued";
              case "redeemed":
                return "Redeemed";
              case "disabled":
                return "Disabled";
              case "not-issued":
              default:
                return "None";
            }
          };

          return (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-16" asChild>
                <Button
                  variant="outline"
                  size="xs"
                  className={cn(getTicketStatusColor(currentTicketStatus))}
                  disabled={isRedeemed || updateRsvpCompleteMutation.isPending}
                >
                  {updateRsvpCompleteMutation.isPending && (
                    <Spinner className="mr-1 h-3 w-3" />
                  )}
                  {getTicketStatusLabel(currentTicketStatus)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={currentTicketStatus}
                  onValueChange={handleTicketStatusChange}
                >
                  <DropdownMenuRadioItem value="not-issued">
                    <span className="text-gray-700">None</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="issued">
                    <span className="text-purple-700">Issued</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="disabled">
                    <span className="text-red-700">Disabled</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                {(currentTicketStatus === "issued" ||
                  currentTicketStatus === "redeemed") &&
                  rsvp.redemptionCode && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          const url = `${window.location.origin}/redeem/${rsvp.redemptionCode}`;
                          setQr({
                            code: rsvp.redemptionCode,
                            url,
                            status: currentTicketStatus,
                            listKey: rsvp.listKey,
                          });
                          setShowQR(true);
                        }}
                      >
                        <QrCode className="w-4 h-4 mr-2" />
                        View QR Code
                      </DropdownMenuItem>
                    </>
                  )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => {
          const rsvp = row.original;
          const changes = pendingChanges[rsvp.id];
          const hasChanges =
            changes &&
            (changes.currentApprovalStatus !== changes.originalApprovalStatus ||
              changes.currentTicketStatus !== changes.originalTicketStatus);

          const handleSave = async () => {
            if (!changes || !hasChanges) return;

            updateRsvpCompleteMutation.mutate(
              {
                rsvpId: rsvp.id,
                approvalStatus:
                  changes.currentApprovalStatus !==
                  changes.originalApprovalStatus
                    ? (changes.currentApprovalStatus as any)
                    : undefined,
                ticketStatus:
                  changes.currentTicketStatus !== changes.originalTicketStatus
                    ? (changes.currentTicketStatus as any)
                    : undefined,
              },
              {
                onSuccess: () => {
                  // Clear pending changes for this row
                  setPendingChanges((prev) => {
                    const updated = { ...prev };
                    delete updated[rsvp.id];
                    return updated;
                  });

                  toast.success("Changes saved successfully");
                },
                onError: (error) => {
                  toast.error(
                    "Failed to save changes: " + (error as Error).message,
                  );
                },
              }
            );
          };

          const handleDelete = async () => {
            deleteRsvpCompleteMutation.mutate(
              { rsvpId: rsvp.id },
              {
                onSuccess: () => {
                  // Clear pending changes for this row
                  setPendingChanges((prev) => {
                    const updated = { ...prev };
                    delete updated[rsvp.id];
                    return updated;
                  });

                  toast.success("RSVP deleted successfully");
                },
                onError: (error) => {
                  toast.error("Failed to delete RSVP: " + (error as Error).message);
                },
              }
            );
          };

          return (
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={deleteRsvpCompleteMutation.isPending}
                  >
                    {deleteRsvpCompleteMutation.isPending && (
                      <Spinner className="mr-1 h-3 w-3" />
                    )}
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete RSVP</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this RSVP? This will
                      permanently remove the RSVP, any associated
                      ticket/redemption codes, and approval history. This action
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                    >
                      Delete RSVP
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      pendingChanges,
      updateRsvpCompleteMutation,
      deleteRsvpCompleteMutation,
      updateRsvpListKeyMutation,
      customFieldColumns,
    ],
  );

  const filtered = React.useMemo(() => {
    let result = (rsvps ?? []) as any[];

    // Apply guest search filter
    const query = debouncedGuest.trim().toLowerCase();
    if (query) {
      result = result.filter((rsvp: any) => {
        const name = (rsvp.name ?? "").toLowerCase();
        const email = (rsvp.contact?.email ?? "").toLowerCase();
        const phone = (rsvp.contact?.phone ?? "").toLowerCase();
        return (
          name.includes(query) || email.includes(query) || phone.includes(query)
        );
      });
    }

    // Apply status filter
    if (statusFilter !== "all") {
      result = result.filter((rsvp: any) => rsvp.status === statusFilter);
    }

    // Apply list filter
    if (listFilter !== "all") {
      result = result.filter((rsvp: any) => rsvp.listKey === listFilter);
    }

    // Apply redemption filter
    if (redemptionFilter !== "all") {
      if (redemptionFilter === "not-issued") {
        result = result.filter((rsvp: any) => rsvp.redemptionStatus === "none");
      } else {
        result = result.filter(
          (rsvp: any) => rsvp.redemptionStatus === redemptionFilter,
        );
      }
    }

    return result;
  }, [rsvps, debouncedGuest, statusFilter, listFilter, redemptionFilter]);

  // Get unique values for filter dropdowns
  const uniqueListKeys = React.useMemo(() => {
    const lists = new Set((rsvps ?? []).map((rsvp: any) => rsvp.listKey));
    return Array.from(lists).sort();
  }, [rsvps]);

  const uniqueStatuses = React.useMemo(() => {
    const statuses = new Set((rsvps ?? []).map((rsvp: any) => rsvp.status));
    return Array.from(statuses).sort();
  }, [rsvps]);

  // Clear all filters function
  const clearAllFilters = () => {
    setGuestSearch("");
    setStatusFilter("all");
    setListFilter("all");
    setRedemptionFilter("all");
  };

  // Check if any filters are active
  const hasActiveFilters =
    guestSearch.trim() !== "" ||
    statusFilter !== "all" ||
    listFilter !== "all" ||
    redemptionFilter !== "all";

  const table = useReactTable({
    data: filtered,
    columns: cols,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 20,
      },
    },
  });

  // Check if any main queries are loading
  const isLoading = eventsQuery.isLoading || rsvpsQuery.isLoading || currentEventQuery.isLoading;

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">RSVPs</h2>
          <p className="text-muted-foreground">
            Manage guest responses and ticket status
          </p>
        </div>
      </div>
      {/* Event Selector */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm text-foreground/70">Event:</span>
        <Select value={eventId} onValueChange={setEventId} className="max-w-sm">
          {eventsSorted.map((event: any) => (
            <SelectOption key={event._id} value={event._id}>
              {new Date(event.eventDate).toLocaleDateString()} • {event.name}
            </SelectOption>
          ))}
        </Select>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <Input
          className="h-8 max-w-xs text-sm"
          placeholder="Search guest"
          value={guestSearch}
          onChange={(e) => setGuestSearch(e.target.value)}
        />
        <span className="mx-2 h-6 w-px bg-foreground/20" />
        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="w-32"
        >
          <SelectOption value="all">All Approval</SelectOption>
          {uniqueStatuses.map((status) => (
            <SelectOption key={status} value={status}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </SelectOption>
          ))}
        </Select>
        <Select
          value={listFilter}
          onValueChange={setListFilter}
          className="w-32"
        >
          <SelectOption value="all">All Lists</SelectOption>
          {uniqueListKeys.map((listKey) => (
            <SelectOption key={listKey} value={listKey}>
              {listKey.toUpperCase()}
            </SelectOption>
          ))}
        </Select>
        <Select
          value={redemptionFilter}
          onValueChange={setRedemptionFilter}
          className="w-36"
        >
          <SelectOption value="all">All Tickets</SelectOption>
          <SelectOption value="issued">Issued</SelectOption>
          <SelectOption value="redeemed">Redeemed</SelectOption>
          <SelectOption value="disabled">Disabled</SelectOption>
          <SelectOption value="not-issued">None</SelectOption>
        </Select>
        {hasActiveFilters && (
          <Button
            size="sm"
            variant="outline"
            onClick={clearAllFilters}
            className="text-xs"
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-sm text-foreground/70">Active filters:</span>
          {guestSearch.trim() !== "" && (
            <Badge variant="secondary" className="gap-1">
              Search: &ldquo;{guestSearch}&rdquo;
              <button
                onClick={() => setGuestSearch("")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Approval:{" "}
              {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
              <button
                onClick={() => setStatusFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {listFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              List: {listFilter.toUpperCase()}
              <button
                onClick={() => setListFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {redemptionFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Ticket:{" "}
              {redemptionFilter === "not-issued"
                ? "None"
                : redemptionFilter.charAt(0).toUpperCase() +
                  redemptionFilter.slice(1)}
              <button
                onClick={() => setRedemptionFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          <span className="text-xs text-foreground/60">
            (Showing {filtered.length} of {(rsvps ?? []).length} total RSVPs)
          </span>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={10} columns={8} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="text-left text-foreground/70">
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className="px-2 py-1 cursor-pointer"
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {{ asc: " ▲", desc: " ▼" }[
                        h.column.getIsSorted() as string
                      ] ?? null}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const rsvp = row.original;
                const changes = pendingChanges[rsvp.id];
                const hasChanges =
                  changes &&
                  (changes.currentApprovalStatus !==
                    changes.originalApprovalStatus ||
                    changes.currentTicketStatus !== changes.originalTicketStatus);

                return (
                  <tr
                    key={row.id}
                    className={`border-t border-foreground/10 ${
                      hasChanges ? "bg-yellow-50 border-yellow-200" : ""
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-2 py-1">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-foreground/70">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount() || 1}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              {[10, 20, 50, 100].map((number) => (
                <SelectOption key={number} value={String(number)}>
                  {number} / page
                </SelectOption>
              ))}
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guest QR Code</DialogTitle>
            <DialogDescription>
              QR code for guest entry. Show this at the door for admission.
            </DialogDescription>
          </DialogHeader>
          {qr && (
            <div className="flex flex-col items-center gap-3 py-2">
              <QRCode value={qr.url} size={200} />

              {/* Status and List Key Info */}
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Status:</span>
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs ${
                      qr.status === "disabled"
                        ? "bg-gray-200 text-gray-800"
                        : qr.status === "redeemed"
                          ? "bg-blue-100 text-blue-800"
                          : qr.status === "issued"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-foreground/10 text-foreground/80"
                    }`}
                  >
                    {qr.status === "disabled"
                      ? "Disabled"
                      : qr.status === "redeemed"
                        ? "Redeemed"
                        : qr.status === "issued"
                          ? "Issued"
                          : "Unknown"}
                  </span>
                </div>

                {qr.listKey && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">List:</span>
                    <span className="text-sm">{qr.listKey.toUpperCase()}</span>
                  </div>
                )}
              </div>

              <div className="text-xs break-all text-center text-foreground/70">
                {qr.url}
              </div>

              {qr.status === "disabled" && (
                <div className="text-xs text-red-600 text-center font-medium">
                  ⚠️ This QR code is disabled and cannot be redeemed
                </div>
              )}

              {qr.status === "redeemed" && (
                <div className="text-xs text-blue-600 text-center font-medium">
                  ✅ This QR code has already been redeemed
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(qr.url);
                    toast.success("Link copied");
                  }}
                >
                  Copy link
                </Button>
                <Button size="sm" onClick={() => setShowQR(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
