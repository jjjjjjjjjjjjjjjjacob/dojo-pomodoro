import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const cleanupUserNames = mutation({
  args: {
    dryRun: v.optional(v.boolean()), // If true, just log what would happen without making changes
    requireBothNames: v.optional(v.boolean()), // If true, only cleanup users who have both firstName AND lastName
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true; // Default to dry run for safety
    const requireBothNames = args.requireBothNames ?? true; // Default to requiring both names

    console.log(`Starting user name cleanup ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
    console.log(`Require both names: ${requireBothNames}`);

    // Get all users that have a name field and need cleanup
    const users = await ctx.db.query("users").collect();
    let usersToCleanup;

    if (requireBothNames) {
      // Only cleanup users who have both firstName and lastName
      usersToCleanup = users.filter(user =>
        user.name && user.name.trim() !== "" &&
        user.firstName && user.firstName.trim() !== "" &&
        user.lastName && user.lastName.trim() !== ""
      );
    } else {
      // Cleanup users who have at least firstName
      usersToCleanup = users.filter(user =>
        user.name && user.name.trim() !== "" &&
        user.firstName && user.firstName.trim() !== ""
      );
    }

    console.log(`Found ${usersToCleanup.length} users to cleanup out of ${users.length} total users`);

    // Show some examples of what would be cleaned up
    const examples = usersToCleanup.slice(0, 5);
    console.log('Examples of users to cleanup:');
    examples.forEach(user => {
      console.log(`  User ${user._id}: name="${user.name}" -> firstName="${user.firstName}", lastName="${user.lastName || '(none)'}"`);
    });

    if (usersToCleanup.length === 0) {
      console.log('No users need cleanup');
      return {
        totalUsers: users.length,
        usersToCleanup: 0,
        successCount: 0,
        errorCount: 0,
        errors: [],
        dryRun,
      };
    }

    if (dryRun) {
      console.log('DRY RUN - No changes will be made');
      return {
        totalUsers: users.length,
        usersToCleanup: usersToCleanup.length,
        successCount: 0,
        errorCount: 0,
        errors: [],
        dryRun: true,
      };
    }

    // Confirm this is a live run with safety check
    console.log('⚠️  LIVE RUN - This will permanently clear the name field for users!');

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ userId: string, name: string, error: string }> = [];

    for (const user of usersToCleanup) {
      try {
        // Clear the name field by setting it to undefined
        await ctx.db.patch(user._id, {
          name: undefined,
          updatedAt: Date.now(),
        });

        console.log(`Cleaned up user ${user._id}: cleared name field`);
        successCount++;
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          userId: user._id,
          name: user.name || '',
          error: errorMessage
        });
        console.error(`Error cleaning up user ${user._id} (${user.name}):`, errorMessage);
      }
    }

    const summary = {
      totalUsers: users.length,
      usersToCleanup: usersToCleanup.length,
      successCount,
      errorCount,
      errors,
      dryRun: false,
    };

    console.log('Cleanup summary:', summary);

    return summary;
  },
});

export const verifyCleanupSafety = mutation({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    const analysis = {
      total: users.length,
      hasName: users.filter(u => u.name && u.name.trim() !== '').length,
      hasFirstName: users.filter(u => u.firstName && u.firstName.trim() !== '').length,
      hasLastName: users.filter(u => u.lastName && u.lastName.trim() !== '').length,
      hasBothFirstAndLast: users.filter(u =>
        u.firstName && u.firstName.trim() !== '' &&
        u.lastName && u.lastName.trim() !== ''
      ).length,
      hasOnlyFirst: users.filter(u =>
        u.firstName && u.firstName.trim() !== '' &&
        (!u.lastName || u.lastName.trim() === '')
      ).length,
      hasNameButNoFirst: users.filter(u =>
        u.name && u.name.trim() !== '' &&
        (!u.firstName || u.firstName.trim() === '')
      ).length,
      wouldBeCleanedUp: users.filter(u =>
        u.name && u.name.trim() !== "" &&
        u.firstName && u.firstName.trim() !== "" &&
        u.lastName && u.lastName.trim() !== ""
      ).length,
    };

    const isSafeToCleanup = analysis.hasNameButNoFirst === 0;

    console.log('Cleanup safety verification:', {
      ...analysis,
      isSafeToCleanup,
      safetyMessage: isSafeToCleanup
        ? '✅ Safe to cleanup - all users with names have firstName populated'
        : '❌ NOT safe to cleanup - some users have names but no firstName'
    });

    return {
      ...analysis,
      isSafeToCleanup,
    };
  },
});