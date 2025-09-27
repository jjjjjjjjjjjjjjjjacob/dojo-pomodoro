"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectOption } from "@/components/ui/select";
import {
  Search,
  Users,
  Crown,
  Shield,
  User,
  ChevronUp,
  ChevronDown,
  Filter,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useAuth } from "@clerk/nextjs";
import { convexQuery, useConvexMutation, useConvexAction } from "@convex-dev/react-query";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function UsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn } = useAuth();

  // Read pagination directly from URL params
  const pageIndex = parseInt(searchParams.get("page") || "0");
  const pageSize = parseInt(searchParams.get("pageSize") || "10");

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const usersQuery = useQuery({
    ...convexQuery(api.users.listOrganizationUsersPaginated, {
      pageIndex,
      pageSize,
      search: debouncedSearch,
      roleFilter,
    }),
    enabled: !!isSignedIn,
  });
  const usersData = usersQuery.data;
  const users = usersData?.users;

  const userStatsQuery = useQuery({
    ...convexQuery(api.users.getUserStats, {}),
    enabled: !!isSignedIn,
  });
  const userStats = userStatsQuery.data;
  const updateUserRole = useMutation({
    mutationFn: useConvexAction(api.users.updateUserRoleWithClerk),
  });

  const promoteUserToOrganization = useMutation({
    mutationFn: useConvexAction(api.users.promoteUserToOrganizationWithClerk),
  });
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>(
    {},
  );

  const filteredUsers = users || [];

  // Clear all filters function
  const clearAllFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    setSorting([{ id: "createdAt", desc: true }]);
    const params = new URLSearchParams(searchParams as any);
    params.set("page", "0");
    router.replace(`/host/users?${params.toString()}`, { scroll: false });
  };

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams as any);
    params.set("page", "0");
    router.replace(`/host/users?${params.toString()}`, { scroll: false });
  }, [debouncedSearch, roleFilter, router, searchParams]);

  // Check if any filters are active
  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    roleFilter !== "all" ||
    sorting.length > 1 ||
    (sorting.length === 1 &&
      (sorting[0].id !== "createdAt" || !sorting[0].desc));

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Crown className="h-4 w-4" />;
      case "member":
        return <Shield className="h-4 w-4" />;
      case "guest":
        return <User className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin":
        return "text-yellow-700 border-yellow-200 bg-yellow-50";
      case "member":
        return "text-blue-700 border-blue-200 bg-blue-50";
      case "guest":
        return "text-gray-700 border-gray-200 bg-gray-50";
      default:
        return "text-gray-700 border-gray-200 bg-gray-50";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "Admin";
      case "member":
        return "Member";
      case "guest":
        return "Guest";
      default:
        return "Unknown";
    }
  };

  // Pagination change handler that updates URL
  const handlePaginationChange = (updaterOrValue: any) => {
    const newPagination =
      typeof updaterOrValue === "function"
        ? updaterOrValue({ pageIndex, pageSize })
        : updaterOrValue;

    const params = new URLSearchParams(searchParams as any);
    params.set("page", newPagination.pageIndex.toString());
    params.set("pageSize", newPagination.pageSize.toString());
    router.replace(`/host/users?${params.toString()}`, { scroll: false });
  };

  // Define table columns
  const columns = React.useMemo<ColumnDef<any>[]>(() => {
    const handleRoleChange = async (
      userId: string,
      newRole: string,
      isGuest = false,
    ) => {
      try {
        if (isGuest) {
          await promoteUserToOrganization.mutateAsync({
            userId: userId as any,
            role: newRole,
          });
        } else {
          await updateUserRole.mutateAsync({ userId: userId as any, newRole });
        }

        // Clear pending changes for this user
        setPendingChanges((prev) => {
          const updated = { ...prev };
          delete updated[userId];
          return updated;
        });

        toast.success(
          isGuest
            ? "User promoted successfully"
            : "User role updated successfully",
        );
      } catch (error) {
        toast.error("Failed to update user role: " + (error as Error).message);
      }
    };
    return [
      {
        id: "user",
        header: "User",
        accessorFn: (row) => {
          const displayName =
            `${row.firstName || ""} ${row.lastName || ""}`.trim();
          return displayName || "Unknown User";
        },
        cell: ({ row }) => {
          const user = row.original;
          const displayName =
            `${user.firstName || ""} ${user.lastName || ""}`.trim();
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.imageUrl || undefined} />
                <AvatarFallback>
                  {(user.firstName || "U").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">
                  {displayName || "Unknown User"}
                </div>
                <div className="text-xs text-muted-foreground">
                  ID: {user.clerkUserId?.slice(-8) || "Unknown"}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: "role",
        header: "Role",
        accessorKey: "role",
        cell: ({ row }) => {
          const user = row.original;
          const currentRole = pendingChanges[user._id] || user.role;
          const hasChanges = currentRole !== user.role;

          if (currentRole === "guest") {
            return (
              <Badge
                variant="outline"
                className={cn(getRoleColor(currentRole))}
              >
                <div className="flex items-center gap-1">
                  {getRoleIcon(currentRole)}
                  {getRoleLabel(currentRole)}
                </div>
              </Badge>
            );
          }

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(getRoleColor(currentRole))}
                >
                  <div className="flex items-center gap-1">
                    {getRoleIcon(currentRole)}
                    {getRoleLabel(currentRole)}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={currentRole}
                  onValueChange={(value) =>
                    setPendingChanges((prev) => ({
                      ...prev,
                      [user._id]: value,
                    }))
                  }
                >
                  <DropdownMenuRadioItem value="member">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span>Member</span>
                    </div>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="admin">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4" />
                      <span>Admin</span>
                    </div>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        id: "createdAt",
        header: "Joined",
        accessorKey: "createdAt",
        cell: ({ getValue }) => {
          const timestamp = getValue() as number;
          const date = new Date(timestamp);
          return (
            <span className="text-muted-foreground">
              {date.toLocaleDateString()}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const user = row.original;
          const currentRole = pendingChanges[user._id] || user.role;
          const hasChanges = currentRole !== user.role;

          if (user.role === "guest" && !hasChanges) {
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs">
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => handleRoleChange(user._id, "member", true)}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Promote to Member
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleRoleChange(user._id, "admin", true)}
                  >
                    <Crown className="mr-2 h-4 w-4" />
                    Promote to Admin
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          } else if (hasChanges) {
            return (
              <Button
                size="sm"
                onClick={() =>
                  handleRoleChange(user._id, currentRole, user.role === "guest")
                }
                className="text-xs"
              >
                Save
              </Button>
            );
          }
          return null;
        },
      },
    ];
  }, [pendingChanges, promoteUserToOrganization, updateUserRole]);

  const table = useReactTable({
    data: filteredUsers,
    columns,
    state: { sorting, pagination: { pageIndex, pageSize } },
    autoResetPageIndex: false,
    onSortingChange: setSorting,
    onPaginationChange: handlePaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: usersData?.pagination?.totalPages || 1,
  });

  if (!users || !userStats) {
    return <TableSkeleton rows={10} columns={4} />;
  }

  return (
    <div className="flex-1 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">
            Manage organization member roles and permissions
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats.total}</div>
            <p className="text-xs text-muted-foreground">
              All organization members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Admins</CardTitle>
            <Crown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats.admin}</div>
            <p className="text-xs text-muted-foreground">Full access users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats.member}</div>
            <p className="text-xs text-muted-foreground">Door staff</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Guests</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats.guest}</div>
            <p className="text-xs text-muted-foreground">Event attendees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organization</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {userStats.organizationMembers}
            </div>
            <p className="text-xs text-muted-foreground">Total staff</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {usersData?.pagination ? (
            <>
              Showing {usersData.pagination.startIndex}-
              {usersData.pagination.endIndex} of{" "}
              {usersData.pagination.totalCount} users
            </>
          ) : (
            <>Showing {filteredUsers.length} users</>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select
          value={roleFilter}
          onValueChange={setRoleFilter}
          className="w-32"
        >
          <SelectOption value="all">All Roles</SelectOption>
          <SelectOption value="admin">Admin</SelectOption>
          <SelectOption value="member">Member</SelectOption>
          <SelectOption value="guest">Guest</SelectOption>
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
          {searchQuery.trim() !== "" && (
            <Badge variant="secondary" className="gap-1">
              Search: &ldquo;{searchQuery}&rdquo;
              <button
                onClick={() => setSearchQuery("")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {roleFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Role: {roleFilter.charAt(0).toUpperCase() + roleFilter.slice(1)}
              <button
                onClick={() => setRoleFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {(sorting.length > 1 ||
            (sorting.length === 1 &&
              (sorting[0].id !== "createdAt" || !sorting[0].desc))) && (
            <Badge variant="secondary" className="gap-1">
              Sort:{" "}
              {sorting[0]?.id === "user"
                ? "Name"
                : sorting[0]?.id === "role"
                  ? "Role"
                  : "Date Joined"}
              {sorting[0]?.desc ? " (desc)" : " (asc)"}
              <button
                onClick={() => setSorting([{ id: "createdAt", desc: true }])}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          <span className="text-xs text-foreground/60">
            {usersData?.pagination ? (
              <>
                ({usersData.pagination.startIndex}-
                {usersData.pagination.endIndex} of{" "}
                {usersData.pagination.totalCount} total users)
              </>
            ) : (
              <>(Showing {filteredUsers.length} users)</>
            )}
          </span>
        </div>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Manage roles for organization members and promote event guests to
            staff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="text-left text-foreground/70 border-b"
                  >
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-2 py-3 cursor-pointer"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {{ asc: " ▲", desc: " ▼" }[
                          header.column.getIsSorted() as string
                        ] ?? null}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => {
                  const user = row.original;
                  const currentRole = pendingChanges[user._id] || user.role;
                  const hasChanges = currentRole !== user.role;

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-foreground/10",
                        hasChanges ? "bg-yellow-50 border-yellow-200" : "",
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-2 py-3">
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

          {table.getRowModel().rows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-lg text-muted-foreground mb-2">
                No users found
              </p>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? "Try adjusting your search query"
                  : "No users found in the system"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-foreground/70">
          {usersData?.pagination ? (
            <>
              Page {pageIndex + 1} of {usersData.pagination.totalPages || 1}
            </>
          ) : (
            <>Page 1 of 1</>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              const params = new URLSearchParams(searchParams as any);
              params.set("pageSize", value);
              params.set("page", "0"); // Reset to first page when changing page size
              router.replace(`/host/users?${params.toString()}`, {
                scroll: false,
              });
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
            onClick={() => {
              const params = new URLSearchParams(searchParams as any);
              params.set("page", (pageIndex - 1).toString());
              router.replace(`/host/users?${params.toString()}`, {
                scroll: false,
              });
            }}
            disabled={!usersData?.pagination?.hasPreviousPage}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const params = new URLSearchParams(searchParams as any);
              params.set("page", (pageIndex + 1).toString());
              router.replace(`/host/users?${params.toString()}`, {
                scroll: false,
              });
            }}
            disabled={!usersData?.pagination?.hasNextPage}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
