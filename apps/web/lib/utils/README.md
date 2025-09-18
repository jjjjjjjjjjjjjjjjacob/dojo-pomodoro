# Utility Functions Library

This directory contains shared utility functions that implement DRY (Don't Repeat Yourself) principles across the application. All utilities are designed to reduce code duplication and provide consistent functionality.

## Quick Start

```typescript
// Import all utilities
import { formatEventDateTime, copyEventLink, showSuccessToast } from '@/lib/utils';

// Or import specific utility groups
import { dateUtils, clipboardUtils, toastHelpers } from '@/lib/utils';
```

## Available Utilities

### Date & Time (`date-utils.ts`)

```typescript
import { formatEventDateTime, formatRelativeTime } from '@/lib/utils';

// Format event date and time
const formatted = formatEventDateTime(timestamp); // "Monday, January 1, 2024 at 7:00 PM"

// Show relative time
const relative = formatRelativeTime(timestamp); // "in 2 hours" or "3 days ago"
```

### Clipboard Operations (`clipboard.ts`)

```typescript
import { copyEventLink, copyGuestInfo } from '@/lib/utils';

// Copy event link with toast feedback
await copyEventLink(eventId);

// Copy guest information
await copyGuestInfo({
  name: "John Doe",
  email: "john@example.com",
  responses: { "Dietary restrictions": "None" }
});
```

### QR Code Management (`qr-code.ts`)

```typescript
import { generateEventTicketQR, downloadQRCode } from '@/lib/utils';

// Generate QR code for event ticket
const qrDataURL = await generateEventTicketQR(eventId, guestId);

// Download QR code as PNG
await downloadQRCode("https://example.com", "my-qr-code.png");
```

### URL Manipulation (`url.ts`)

```typescript
import { buildEventURL, buildTicketURL, extractEventIdFromURL } from '@/lib/utils';

// Build consistent URLs
const eventUrl = buildEventURL(eventId); // "/events/123"
const ticketUrl = buildTicketURL(eventId, guestId); // "/events/123/ticket?guest=456"

// Extract information from URLs
const eventId = extractEventIdFromURL(); // Gets from current URL
```

### Toast Messages (`toast-messages.ts`)

```typescript
import { toastHelpers, SUCCESS_MESSAGES } from '@/lib/utils';

// Use predefined toast helpers
toastHelpers.eventCreated();
toastHelpers.rsvpSubmitted();
toastHelpers.eventLinkCopied();

// Use message constants
showSuccessToast(SUCCESS_MESSAGES.EVENT_CREATED);
```

### Error Handling (`error-utils.ts`)

```typescript
import { handleAsyncOperation, showErrorToast } from '@/lib/utils';

// Handle async operations with automatic error handling
const result = await handleAsyncOperation(
  () => submitForm(data),
  {
    successMessage: "Form submitted successfully",
    errorMessage: "Failed to submit form"
  }
);

// Show error toast with proper error extraction
showErrorToast(error, "Operation failed");
```

## Code Examples

### Before (with duplication):

```typescript
// Multiple components copying links
const copyLink = async () => {
  try {
    const url = `${window.location.origin}/events/${eventId}`;
    await navigator.clipboard.writeText(url);
    toast.success("Event link copied");
  } catch (e) {
    toast.error("Failed to copy link");
  }
};

// Multiple components formatting dates
const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};
```

### After (using utilities):

```typescript
import { copyEventLink, formatEventDateTime } from '@/lib/utils';

// One line to copy event link
const copyLink = () => copyEventLink(eventId);

// One line to format date
const formattedDate = formatEventDateTime(timestamp);
```

## Utility Groups

For better organization, utilities are also exported as grouped objects:

```typescript
import { dateUtils, clipboardUtils, qrUtils, urlUtils, toastUtils } from '@/lib/utils';

// Use grouped utilities
dateUtils.formatEventDateTime(timestamp);
clipboardUtils.copyEventLink(eventId);
qrUtils.generateEventTicketQR(eventId, guestId);
urlUtils.buildEventURL(eventId, "rsvp");
toastUtils.toastHelpers.eventCreated();
```

## Benefits

1. **Reduced Duplication**: Common operations are centralized
2. **Consistency**: All components use the same formatting and messaging
3. **Maintainability**: Changes to utility functions update all usage automatically
4. **Type Safety**: Full TypeScript support with proper type inference
5. **Error Handling**: Consistent error handling patterns across the app
6. **Testing**: Utilities can be unit tested independently

## Contributing

When adding new utilities:

1. Place them in the appropriate file or create a new one
2. Export them from the main `index.ts` file
3. Add TypeScript types for all parameters and return values
4. Include JSDoc comments for complex functions
5. Update this README with usage examples

## Estimated Impact

The utility library reduces code duplication by approximately:
- **Date formatting**: 15+ duplicate implementations → 1 utility function
- **Clipboard operations**: 8+ duplicate implementations → 4 specialized utilities
- **Toast messages**: 30+ hardcoded messages → Centralized constants
- **URL building**: 12+ manual URL constructions → 8 specialized builders
- **QR code operations**: 6+ duplicate implementations → 5 specialized utilities

**Total estimated reduction**: ~70 duplicate code blocks across the codebase.