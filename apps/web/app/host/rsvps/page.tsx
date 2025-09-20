"use client";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Select, SelectOption } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { toast } from "sonner";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { MoreHorizontal, QrCode, ToggleLeft, ToggleRight, Info, X } from "lucide-react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";

export default function RsvpsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const events = useQuery(api.events.listAll, {});
  const eventsSorted = (events ?? [])
    .slice()
    .sort((a: any, b: any) => (b.eventDate ?? 0) - (a.eventDate ?? 0));
  const initialId = searchParams.get("eventId") ?? eventsSorted[0]?._id;
  const [eventId, setEventId] = React.useState<string | undefined>(initialId);
  React.useEffect(() => {
    if (!eventId && eventsSorted[0]?._id) setEventId(eventsSorted[0]._id);
  }, [eventsSorted.map((event: any) => event._id).join(","), eventId]);

  React.useEffect(() => {
    if (!eventId) return;
    const params = new URLSearchParams(searchParams as any);
    params.set("eventId", eventId);
    router.replace(`/host/rsvps?${params.toString()}`);
  }, [eventId]);

  const rsvps = useQuery(api.rsvps.listForEvent, eventId ? { eventId: eventId as Id<"events"> } : "skip");
  const approve = useMutation(api.approvals.approve);
  const deny = useMutation(api.approvals.deny);
  const toggleRedemptionStatus = useMutation(api.redemptions.toggleRedemptionStatus);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "guest", desc: false },
  ]);
  const [guestSearch, setGuestSearch] = React.useState("");
  const debouncedGuest = useDebounce(guestSearch, 250);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [listFilter, setListFilter] = React.useState<string>("all");
  const [redemptionFilter, setRedemptionFilter] = React.useState<string>("all");
  const [showQR, setShowQR] = React.useState(false);
  const [qr, setQr] = React.useState<{
    code: string;
    url: string;
    status?: string;
    listKey?: string;
  } | null>(null);

  const cols = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: "guest",
        header: "Guest",
        accessorFn: (r: any) =>
          r.name || r.contact?.email || r.contact?.phone || "(no contact)",
        cell: (ctx) => {
          const guestName = ctx.getValue() as string;
          const rsvp = ctx.row.original;
          const metadata = rsvp.metadata;
          const hasMetadata = metadata && Object.keys(metadata).length > 0;
          const metadataEntries = hasMetadata ? Object.entries(metadata).slice(0, 3) : [];

          if (!hasMetadata) {
            return <span>{guestName}</span>;
          }

          return (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="flex items-center gap-1 cursor-context-menu">
                  <span>{guestName}</span>
                  <Info className="w-3 h-3 text-muted-foreground" />
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuLabel>Additional Info</ContextMenuLabel>
                <ContextMenuSeparator />
                {metadataEntries.map(([key, value]) => (
                  <ContextMenuItem key={key} className="flex flex-col items-start">
                    <span className="text-xs text-muted-foreground capitalize">{key}</span>
                    <span className="text-sm">{String(value)}</span>
                  </ContextMenuItem>
                ))}
              </ContextMenuContent>
            </ContextMenu>
          );
        },
      },
      {
        id: "listKey",
        header: "List",
        accessorKey: "listKey",
        cell: ({ getValue }) => (getValue() as string)?.toUpperCase(),
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue }) => {
          const value = (getValue() as string) || "";
          const colorClass =
            value === "approved"
              ? "bg-green-100 text-green-800"
              : value === "pending"
                ? "bg-amber-100 text-amber-800"
                : "bg-red-100 text-red-800";
          return (
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs ${colorClass}`}
            >
              {value}
            </span>
          );
        },
      },
      {
        id: "redemption",
        header: "Redemption",
        accessorFn: (r: any) => r.redemptionStatus,
        cell: ({ getValue }) => {
          const value = getValue() as string;
          const label =
            value === "disabled"
              ? "Disabled"
              : value === "redeemed"
                ? "Redeemed"
                : value === "issued"
                  ? "Issued"
                  : "Not issued";
          const colorClass =
            value === "disabled"
              ? "bg-gray-200 text-gray-800"
              : value === "redeemed"
                ? "bg-blue-100 text-blue-800"
                : value === "issued"
                  ? "bg-purple-100 text-purple-800"
                  : "bg-foreground/10 text-foreground/80";
          return (
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs ${colorClass}`}
            >
              {label}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => {
          const rsvp = row.original;
          const hasRedemption =
            rsvp.redemptionStatus && rsvp.redemptionStatus !== "none";
          const isRedeemed = rsvp.redemptionStatus === "redeemed";
          const isDisabled = rsvp.redemptionStatus === "disabled";

          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1" align="end">
                <div className="space-y-1">
                  <button
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground flex items-center"
                    onClick={async () => {
                      try {
                        const result = await approve({
                          rsvpId: rsvp.id,
                        });
                        if ((result as any)?.code) {
                          const url =
                            (result as any).redeemUrl ||
                            `${window.location.origin}/redeem/${(result as any).code}`;
                          setQr({
                            code: (result as any).code,
                            url,
                            status: "issued",
                            listKey: (result as any).listKey || rsvp.listKey,
                          });
                          setShowQR(true);
                          toast.success("Approved");
                        }
                      } catch (error) {
                        toast.error("Failed to approve RSVP");
                      }
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground flex items-center"
                    onClick={async () => {
                      try {
                        await deny({ rsvpId: rsvp.id });
                        toast.success("Denied");
                      } catch (error) {
                        toast.error("Failed to deny RSVP");
                      }
                    }}
                  >
                    Deny
                  </button>
                  {hasRedemption && (
                    <>
                      <div className="h-px bg-border my-1" />
                      <button
                        className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground flex items-center"
                        onClick={async () => {
                          try {
                            if (rsvp.redemptionStatus === "none" || !rsvp.redemptionCode) {
                              toast.error("No QR code found for this guest");
                              return;
                            }

                            const url = `${window.location.origin}/redeem/${rsvp.redemptionCode}`;
                            setQr({
                              code: rsvp.redemptionCode,
                              url,
                              status: rsvp.redemptionStatus,
                              listKey: rsvp.listKey,
                            });
                            setShowQR(true);
                          } catch (error) {
                            toast.error("Failed to load QR code");
                          }
                        }}
                      >
                        <QrCode className="w-4 h-4 mr-2" />
                        View QR Code
                      </button>
                      {!isRedeemed && (
                        <button
                          className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground flex items-center"
                          onClick={async () => {
                            try {
                              const result =
                                await toggleRedemptionStatus({
                                  rsvpId: rsvp.id,
                                });
                              toast.success(
                                `Redemption ${result.status === "enabled" ? "enabled" : "disabled"}`,
                              );
                            } catch (error) {
                              toast.error("Failed to toggle redemption status");
                            }
                          }}
                        >
                          {isDisabled ? (
                            <>
                              <ToggleRight className="w-4 h-4 mr-2" />
                              Enable Redemption
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-4 h-4 mr-2" />
                              Disable Redemption
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          );
        },
      },
    ],
    [approve, deny, toggleRedemptionStatus],
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
        result = result.filter((rsvp: any) => rsvp.redemptionStatus === redemptionFilter);
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
  const hasActiveFilters = guestSearch.trim() !== "" || statusFilter !== "all" || listFilter !== "all" || redemptionFilter !== "all";

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

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">RSVPs</h2>
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
        <Select value={statusFilter} onValueChange={setStatusFilter} className="w-32">
          <SelectOption value="all">All Status</SelectOption>
          {uniqueStatuses.map((status) => (
            <SelectOption key={status} value={status}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </SelectOption>
          ))}
        </Select>
        <Select value={listFilter} onValueChange={setListFilter} className="w-32">
          <SelectOption value="all">All Lists</SelectOption>
          {uniqueListKeys.map((listKey) => (
            <SelectOption key={listKey} value={listKey}>
              {listKey.toUpperCase()}
            </SelectOption>
          ))}
        </Select>
        <Select value={redemptionFilter} onValueChange={setRedemptionFilter} className="w-36">
          <SelectOption value="all">All Redemptions</SelectOption>
          <SelectOption value="issued">Issued</SelectOption>
          <SelectOption value="redeemed">Redeemed</SelectOption>
          <SelectOption value="disabled">Disabled</SelectOption>
          <SelectOption value="not-issued">Not Issued</SelectOption>
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
              Status: {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
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
              Redemption: {redemptionFilter === "not-issued" ? "Not Issued" : redemptionFilter.charAt(0).toUpperCase() + redemptionFilter.slice(1)}
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
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-foreground/10">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-2 py-1">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    </section>
  );
}
