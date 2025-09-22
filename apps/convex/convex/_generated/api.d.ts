/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as approvals from "../approvals.js";
import type * as credentials from "../credentials.js";
import type * as credentialsNode from "../credentialsNode.js";
import type * as dashboard from "../dashboard.js";
import type * as events from "../events.js";
import type * as eventsNode from "../eventsNode.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as lib_passwordUtils from "../lib/passwordUtils.js";
import type * as lib_types from "../lib/types.js";
import type * as migrations_cleanupUserNames from "../migrations/cleanupUserNames.js";
import type * as migrations_parseUserNames from "../migrations/parseUserNames.js";
import type * as notifications from "../notifications.js";
import type * as orgMemberships from "../orgMemberships.js";
import type * as profiles from "../profiles.js";
import type * as profilesNode from "../profilesNode.js";
import type * as redemptions from "../redemptions.js";
import type * as rsvps from "../rsvps.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  approvals: typeof approvals;
  credentials: typeof credentials;
  credentialsNode: typeof credentialsNode;
  dashboard: typeof dashboard;
  events: typeof events;
  eventsNode: typeof eventsNode;
  files: typeof files;
  http: typeof http;
  "lib/passwordUtils": typeof lib_passwordUtils;
  "lib/types": typeof lib_types;
  "migrations/cleanupUserNames": typeof migrations_cleanupUserNames;
  "migrations/parseUserNames": typeof migrations_parseUserNames;
  notifications: typeof notifications;
  orgMemberships: typeof orgMemberships;
  profiles: typeof profiles;
  profilesNode: typeof profilesNode;
  redemptions: typeof redemptions;
  rsvps: typeof rsvps;
  seed: typeof seed;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
