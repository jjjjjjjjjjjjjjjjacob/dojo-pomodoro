"use client";
import { useUser, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, Calendar, Users, Settings } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";

export default function ProfilePage() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-screen">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card>
          <CardContent className="text-center py-12">
            <h2 className="text-lg font-medium mb-2">Not signed in</h2>
            <p className="text-muted-foreground mb-6">
              Please sign in to view your profile.
            </p>
            <Link href="/sign-in">
              <Button>Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const organizationMemberships = user.organizationMemberships || [];
  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId
  );
  const primaryPhone = user.phoneNumbers.find(
    (phone) => phone.id === user.primaryPhoneNumberId
  );

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Profile</h1>

      <div className="space-y-6">
        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={user.imageUrl} alt={user.fullName || ""} />
                <AvatarFallback>
                  {user.firstName?.[0]}{user.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-semibold">
                  {user.fullName || "User"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Member since{" "}
                  {new Date(user.createdAt!).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {primaryEmail && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{primaryEmail.emailAddress}</span>
                {primaryEmail.verification?.status === "verified" && (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Verified
                  </Badge>
                )}
              </div>
            )}

            {primaryPhone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{primaryPhone.phoneNumber}</span>
                {primaryPhone.verification?.status === "verified" && (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Verified
                  </Badge>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>
                Joined {new Date(user.createdAt!).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Organizations Card */}
        {organizationMemberships.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Organizations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {organizationMemberships.map((membership) => (
                  <div
                    key={membership.organization.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={membership.organization.imageUrl}
                          alt={membership.organization.name}
                        />
                        <AvatarFallback>
                          {membership.organization.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-medium">
                          {membership.organization.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {membership.organization.slug}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {membership.role.replace("org:", "")}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/tickets">
              <Button variant="outline" className="w-full justify-start">
                View My Tickets
              </Button>
            </Link>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-8 h-8"
                  }
                }}
              />
              <span className="text-sm">Manage Account Settings</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}