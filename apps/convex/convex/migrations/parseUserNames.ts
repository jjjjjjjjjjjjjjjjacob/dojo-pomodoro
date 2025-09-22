import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const parseUserNames = mutation({
  args: {
    dryRun: v.optional(v.boolean()), // If true, just log what would happen without making changes
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true; // Default to dry run for safety

    console.log(`Starting user name parsing migration ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);

    // Get all users that have a name field but are missing firstName/lastName
    const users = await ctx.db.query("users").collect();
    const usersToMigrate = users.filter(user =>
      user.name && user.name.trim() !== "" && (!user.firstName || !user.lastName)
    );

    console.log(`Found ${usersToMigrate.length} users to migrate out of ${users.length} total users`);

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ userId: string, name: string, error: string }> = [];

    for (const user of usersToMigrate) {
      try {
        const name = (user.name || '').trim();

        if (!name) {
          console.log(`Skipping user ${user._id} - empty name`);
          continue;
        }

        // Parse the name
        const parts = name.split(' ').filter(part => part.trim() !== '');
        let firstName = '';
        let lastName = '';

        if (parts.length === 1) {
          // Single name goes to firstName
          firstName = parts[0];
          lastName = '';
        } else if (parts.length >= 2) {
          // Last part is lastName, everything else is firstName
          lastName = parts[parts.length - 1];
          firstName = parts.slice(0, -1).join(' ');
        }

        console.log(`User ${user._id}: "${name}" -> firstName: "${firstName}", lastName: "${lastName}"`);

        if (!dryRun) {
          // Update the user record
          await ctx.db.patch(user._id, {
            firstName,
            lastName,
            updatedAt: Date.now(),
          });
        }

        successCount++;
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          userId: user._id,
          name: user.name || '',
          error: errorMessage
        });
        console.error(`Error processing user ${user._id} (${user.name}):`, errorMessage);
      }
    }

    const summary = {
      totalUsers: users.length,
      usersToMigrate: usersToMigrate.length,
      successCount,
      errorCount,
      errors,
      dryRun,
    };

    console.log('Migration summary:', summary);

    return summary;
  },
});

export const checkMigrationStatus = mutation({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    const stats = {
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
      needsMigration: users.filter(u =>
        u.name && u.name.trim() !== '' &&
        (!u.firstName || !u.lastName)
      ).length,
    };

    console.log('Migration status:', stats);
    return stats;
  },
});