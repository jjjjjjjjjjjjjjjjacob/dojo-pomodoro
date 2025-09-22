"use client";

import React, { useState } from "react";
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
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";

export default function UsersPage() {
  const { isSignedIn } = useAuth();
  const usersQuery = useQuery({
    ...convexQuery(api.users.listOrganizationUsers, {}),
    enabled: !!isSignedIn,
  });
  const users = usersQuery.data;

  const userStatsQuery = useQuery({
    ...convexQuery(api.users.getUserStats, {}),
    enabled: !!isSignedIn,
  });
  const userStats = userStatsQuery.data;
  const updateUserRole = useMutation({
    mutationFn: useConvexMutation(api.users.updateUserRole),
  });

  const promoteUserToOrganization = useMutation({
    mutationFn: useConvexMutation(api.users.promoteUserToOrganization),
  });
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>(
    {},
  );

  const filteredUsers = React.useMemo(() => {
    if (!users) return [];

    let result = [...users];

    // Apply search filter
    const searchTerm = debouncedSearch.trim().toLowerCase();
    if (searchTerm) {
      result = result.filter((user) => {
        const name = (user.name || "").toLowerCase();
        const firstName = (user.firstName || "").toLowerCase();
        const lastName = (user.lastName || "").toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
        const role = (user.role || "").toLowerCase();

        return (
          name.includes(searchTerm) ||
          firstName.includes(searchTerm) ||
          lastName.includes(searchTerm) ||
          fullName.includes(searchTerm) ||
          role.includes(searchTerm)
        );
      });
    }

    // Apply role filter
    if (roleFilter !== "all") {
      result = result.filter((user) => user.role === roleFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case "name":
          aValue =
            `${a.firstName || ""} ${a.lastName || ""}`.trim() || a.name || "";
          bValue =
            `${b.firstName || ""} ${b.lastName || ""}`.trim() || b.name || "";
          break;
        case "role":
          aValue = a.role || "";
          bValue = b.role || "";
          break;
        case "createdAt":
        default:
          aValue = a.createdAt;
          bValue = b.createdAt;
          break;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [users, debouncedSearch, roleFilter, sortBy, sortOrder]);

  // Clear all filters function
  const clearAllFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    setSortBy("createdAt");
    setSortOrder("desc");
  };

  // Check if any filters are active
  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    roleFilter !== "all" ||
    sortBy !== "createdAt" ||
    sortOrder !== "desc";

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

  if (!users || !userStats) {
    return <UsersSkeleton />;
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
          Showing {filteredUsers.length} of {users?.length || 0} users
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
        <span className="mx-2 h-6 w-px bg-foreground/20" />
        <Select value={sortBy} onValueChange={setSortBy} className="w-36">
          <SelectOption value="createdAt">Date Joined</SelectOption>
          <SelectOption value="name">Name</SelectOption>
          <SelectOption value="role">Role</SelectOption>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          className="px-3"
        >
          {sortOrder === "asc" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
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
          {sortBy !== "createdAt" && (
            <Badge variant="secondary" className="gap-1">
              Sort:{" "}
              {sortBy === "name"
                ? "Name"
                : sortBy === "role"
                  ? "Role"
                  : "Date Joined"}
              <button
                onClick={() => setSortBy("createdAt")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {sortOrder !== "desc" && (
            <Badge variant="secondary" className="gap-1">
              Order: Ascending
              <button
                onClick={() => setSortOrder("desc")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          <span className="text-xs text-foreground/60">
            (Showing {filteredUsers.length} of {users?.length || 0} total users)
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
                <tr className="text-left text-foreground/70 border-b">
                  <th className="px-2 py-3">User</th>
                  <th className="px-2 py-3">Role</th>
                  <th className="px-2 py-3">Joined</th>
                  <th className="px-2 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const currentRole = pendingChanges[user._id] || user.role;
                  const hasChanges = currentRole !== user.role;

                  return (
                    <tr
                      key={user._id}
                      className={cn(
                        "border-b border-foreground/10",
                        hasChanges ? "bg-yellow-50 border-yellow-200" : "",
                      )}
                    >
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.imageUrl || undefined} />
                            <AvatarFallback>
                              {(user.firstName || user.name || "U")
                                .charAt(0)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">
                              {`${user.firstName || ""} ${user.lastName || ""}`.trim() ||
                                user.name ||
                                "Unknown User"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ID: {user.clerkUserId?.slice(-8) || "Unknown"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        {currentRole === "guest" ? (
                          <Badge
                            variant="outline"
                            className={cn(getRoleColor(currentRole))}
                          >
                            <div className="flex items-center gap-1">
                              {getRoleIcon(currentRole)}
                              {getRoleLabel(currentRole)}
                            </div>
                          </Badge>
                        ) : (
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
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <span className="text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        {user.role === "guest" && !hasChanges ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                              >
                                Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(user._id, "member", true)
                                }
                              >
                                <Shield className="mr-2 h-4 w-4" />
                                Promote to Member
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(user._id, "admin", true)
                                }
                              >
                                <Crown className="mr-2 h-4 w-4" />
                                Promote to Admin
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : hasChanges ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              handleRoleChange(
                                user._id,
                                currentRole,
                                user.role === "guest",
                              )
                            }
                            className="text-xs"
                          >
                            Save
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
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
    </div>
  );
}

function UsersSkeleton() {
  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse mt-2" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted rounded animate-pulse" />
              <div className="h-3 w-32 bg-muted rounded animate-pulse mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                <div className="h-6 w-16 bg-muted rounded animate-pulse ml-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
