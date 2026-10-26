/**
 * Utility script for administrators to inspect or safely verify legacy user accounts.
 *
 * Usage:
 *   Dry-run mode (safe inspection, default):
 *     node server/scripts/verifyExistingUsers.js --dry-run
 *
 *   Confirm mode (updates unverified legacy accounts):
 *     node server/scripts/verifyExistingUsers.js --confirm
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const User = require("../model/userModel");

async function run() {
  const isConfirm = process.argv.includes("--confirm");
  const mongoUri = process.env.MONGODB_URL;

  if (!mongoUri) {
    console.error("Error: MONGODB_URL is not set in environment.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    const totalUsers = await User.countDocuments();
    const unverifiedUsers = await User.find({
      $or: [{ emailVerified: { $ne: true } }, { emailVerified: { $exists: false } }],
    }).select("username email emailVerified createdAt");

    console.log(`\n--- Orbit User Verification Audit ---`);
    console.log(`Total accounts in database: ${totalUsers}`);
    console.log(`Accounts requiring verification: ${unverifiedUsers.length}\n`);

    if (unverifiedUsers.length === 0) {
      console.log("All accounts are verified.");
      return;
    }

    console.log("Unverified accounts found:");
    unverifiedUsers.forEach((u, i) => {
      console.log(`  ${i + 1}. ${u.username} (${u.email}) - created: ${u.createdAt || "N/A"}`);
    });

    if (!isConfirm) {
      console.log(`\n[DRY RUN] No changes were made to the database.`);
      console.log(`To verify these legacy accounts, re-run with: node server/scripts/verifyExistingUsers.js --confirm`);
    } else {
      console.log(`\n[CONFIRM] Marking ${unverifiedUsers.length} legacy accounts as verified...`);
      const result = await User.updateMany(
        { $or: [{ emailVerified: { $ne: true } }, { emailVerified: { $exists: false } }] },
        {
          $set: { emailVerified: true },
          $unset: { emailVerificationTokenHash: "", emailVerificationExpires: "" },
        }
      );
      console.log(`Successfully verified ${result.modifiedCount} accounts.`);
    }
  } finally {
    await mongoose.connection.close();
    console.log("Database connection closed.");
  }
}

run().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
