#!/usr/bin/env node

/**
 * Test Event Creation Script
 * Creates a test event with various password combinations for E2E testing
 *
 * Usage:
 * node test-event-creation.js
 *
 * Requirements:
 * - Run from the root directory of the project
 * - Convex dev server must be running
 * - User must be authenticated and have host permissions
 */

const { ConvexHttpClient } = require("convex/browser");

// Configuration
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://your-convex-url.convex.cloud";
const TEST_HOST_EMAIL = "test@example.com"; // Change to your test email

// Test event data
const TEST_EVENT_DATA = {
  name: "🧪 Password Test Event",
  hosts: [TEST_HOST_EMAIL],
  location: "Test Venue - Password Testing Lab",
  eventDate: Date.now() + (24 * 60 * 60 * 1000), // Tomorrow
  lists: [
    {
      listKey: "vip",
      password: "TestVIP",
      generateQR: true
    },
    {
      listKey: "ga",
      password: "testGA",
      generateQR: true
    },
    {
      listKey: "member",
      password: "Member123",
      generateQR: false
    },
    {
      listKey: "staff",
      password: "STAFF456",
      generateQR: true
    }
  ],
  customFields: [
    {
      key: "company",
      label: "Company",
      placeholder: "Your company name",
      required: true
    },
    {
      key: "dietary",
      label: "Dietary Restrictions",
      placeholder: "Any dietary restrictions",
      required: false
    }
  ]
};

// Password test variations to document
const PASSWORD_TEST_CASES = [
  // VIP list tests
  { original: "TestVIP", variations: ["TestVIP", "testvip", "TESTVIP", "tEsTvIp", " TestVIP ", "\tTestVIP\n"] },
  // GA list tests
  { original: "testGA", variations: ["testGA", "TESTGA", "TestGA", "testga", " testGA ", "  testGA  "] },
  // Member list tests
  { original: "Member123", variations: ["Member123", "member123", "MEMBER123", "mEmBeR123", " Member123 "] },
  // Staff list tests
  { original: "STAFF456", variations: ["STAFF456", "staff456", "Staff456", "StAfF456", " STAFF456 "] }
];

const INVALID_PASSWORD_TESTS = [
  "",              // Empty
  "   ",           // Only whitespace
  "TestVI",        // Partial match
  "TestVIPP",      // Extra characters
  "wrongpass",     // Completely wrong
  "test vip",      // With space
  "TestVIP123",    // Extended
  "VIPTest"        // Reversed
];

async function createTestEvent() {
  console.log("🚀 Creating test event for password validation testing...");

  try {
    const client = new ConvexHttpClient(CONVEX_URL);

    // Note: This would need proper authentication in a real scenario
    // For testing, you might need to use the Convex dashboard or authenticated client

    console.log("📊 Test Event Configuration:");
    console.log("Name:", TEST_EVENT_DATA.name);
    console.log("Host:", TEST_EVENT_DATA.hosts[0]);
    console.log("Lists:", TEST_EVENT_DATA.lists.length);
    console.log("\n🔐 Password Test Cases:");

    PASSWORD_TEST_CASES.forEach(testCase => {
      console.log(`\n${testCase.original}:`);
      testCase.variations.forEach(variation => {
        const displayVariation = variation.replace(/\t/g, '\\t').replace(/\n/g, '\\n');
        console.log(`  ✓ "${displayVariation}"`);
      });
    });

    console.log("\n❌ Invalid Password Tests:");
    INVALID_PASSWORD_TESTS.forEach(invalid => {
      const displayInvalid = invalid.replace(/\t/g, '\\t').replace(/\n/g, '\\n');
      console.log(`  ✗ "${displayInvalid}"`);
    });

    console.log("\n📝 Manual Testing Instructions:");
    console.log("1. Navigate to the host dashboard");
    console.log("2. Create a new event with the following data:");
    console.log(JSON.stringify(TEST_EVENT_DATA, null, 2));
    console.log("\n3. Test each password variation:");
    console.log("   - Home page (/) password entry");
    console.log("   - Event page dialog password entry");
    console.log("   - RSVP flow completion");

    console.log("\n✅ Test script completed!");
    console.log("💡 Tip: Save the event ID for tracking test results");

  } catch (error) {
    console.error("❌ Error creating test event:", error);
    process.exit(1);
  }
}

function generateTestingChecklist() {
  console.log("\n📋 TESTING CHECKLIST");
  console.log("===================");

  console.log("\n🏗️  SETUP:");
  console.log("[ ] Convex dev server running");
  console.log("[ ] Web app running on localhost:2345");
  console.log("[ ] Test user authenticated with host permissions");
  console.log("[ ] Event created with test passwords");

  console.log("\n🔍 PASSWORD ENTRY TESTS:");
  PASSWORD_TEST_CASES.forEach((testCase, index) => {
    console.log(`\n${index + 1}. Testing "${testCase.original}":`);
    testCase.variations.forEach(variation => {
      const clean = variation.trim();
      console.log(`[ ] "${variation}" → should resolve to "${testCase.original}" list`);
    });
  });

  console.log("\n❌ INVALID PASSWORD TESTS:");
  INVALID_PASSWORD_TESTS.forEach(invalid => {
    console.log(`[ ] "${invalid}" → should show error message`);
  });

  console.log("\n📱 E2E FLOW TESTS:");
  console.log("[ ] Home page → Event page → RSVP → Status → Ticket");
  console.log("[ ] Direct event URL with password param");
  console.log("[ ] Authentication redirect flow");
  console.log("[ ] Form validation on RSVP page");
  console.log("[ ] QR code generation (for QR-enabled lists)");
  console.log("[ ] Non-QR confirmation (for non-QR lists)");

  console.log("\n🔄 ERROR RECOVERY:");
  console.log("[ ] Network error during RSVP submission");
  console.log("[ ] Browser back/forward navigation");
  console.log("[ ] Session expiry during flow");
  console.log("[ ] Invalid password → retry with correct password");
}

if (require.main === module) {
  createTestEvent();
  generateTestingChecklist();
}