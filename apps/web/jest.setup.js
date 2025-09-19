// Set up environment variables first
process.env.NODE_ENV = 'test'
process.env.NEXT_PUBLIC_POSTHOG_KEY = ''

// Clear all modules to ensure clean mocking
jest.resetModules()

// Mock PostHog module IMMEDIATELY - prevent any real loading
jest.doMock('posthog-js', () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
    capture: jest.fn(),
    isFeatureEnabled: jest.fn(() => false),
    onFeatureFlags: jest.fn(),
    getFeatureFlag: jest.fn(),
    feature_flags: {},
    loaded: jest.fn(),
  },
}), { virtual: true })

// Mock the specific module that's causing issues
jest.doMock('posthog-js/dist/main.js', () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
    capture: jest.fn(),
    isFeatureEnabled: jest.fn(() => false),
    onFeatureFlags: jest.fn(),
    getFeatureFlag: jest.fn(),
    feature_flags: {},
    loaded: jest.fn(),
  },
}), { virtual: true })

// Mock modules BEFORE any imports
const React = require('react')

// Mock HapticProvider context immediately before any imports
jest.doMock('@/contexts/haptic-context', () => {
  return {
    __esModule: true,
    HapticProvider: ({ children }) => React.createElement('div', { 'data-testid': 'haptic-provider' }, children),
    useHapticContext: () => ({
      settings: { enabled: true, intensity: 'medium' },
      updateSettings: jest.fn(),
      trigger: jest.fn(() => true),
      isSupported: true,
    }),
  }
}, { virtual: true })

import '@testing-library/jest-dom'

// Global mocks
global.jest = require('jest')

// PostHog already mocked above

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isSignedIn: true,
    orgRole: 'admin',
    has: jest.fn(() => true),
    userId: 'user_123',
  }),
  useUser: () => ({
    user: {
      id: 'user_123',
      fullName: 'Test User',
      firstName: 'Test',
      lastName: 'User',
      primaryPhoneNumber: { phoneNumber: '+1234567890' },
      phoneNumbers: [{ phoneNumber: '+1234567890' }],
    },
  }),
  useClerk: () => ({
    openUserProfile: jest.fn(),
  }),
  useSession: () => ({
    session: {
      id: 'session_123',
      user: { id: 'user_123', fullName: 'Test User' },
    },
  }),
  SignedIn: ({ children }) => children,
  UserProfile: () => React.createElement('div', { 'data-testid': 'user-profile' }, 'User Profile'),
}))

// Mock Convex
jest.mock('convex/react', () => ({
  useQuery: jest.fn(() => ({
    _id: 'event_123',
    name: 'Test Event',
    location: 'Test Location',
    eventDate: Date.now(),
    status: 'active',
  })),
  useMutation: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
  useAction: jest.fn(() => jest.fn().mockResolvedValue({ ok: true })),
}))

// Mock TanStack Query
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({
    data: {
      _id: 'event_123',
      name: 'Test Event',
      location: 'Test Location',
      eventDate: Date.now(),
      status: 'active',
    },
    isLoading: false,
    isError: false,
    error: null,
  })),
  useMutation: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
}))

// Mock Convex React Query
jest.mock('@convex-dev/react-query', () => ({
  convexQuery: jest.fn((queryFn, args) => ({ queryFn, args })),
  useConvexMutation: jest.fn(() => jest.fn()),
}))

// Mock Next.js
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
  }),
  useSearchParams: () => ({
    get: jest.fn((key) => {
      if (key === 'password') return 'test123'
      if (key === 'eventId') return 'event_123'
      return null
    }),
    has: jest.fn(() => false),
    getAll: jest.fn(() => []),
    keys: jest.fn(() => []),
    values: jest.fn(() => []),
    entries: jest.fn(() => []),
    toString: jest.fn(() => ''),
  }),
  useParams: () => ({
    eventId: 'event_123',
    code: 'abc123',
  }),
}))

jest.mock('next/link', () => {
  return function MockLink({ children, href, ...props }) {
    return React.createElement('a', { href, ...props }, children)
  }
})

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  use: jest.fn((promise) => {
    if (promise && typeof promise.then === 'function') {
      return { eventId: 'event_123', code: 'abc123' }
    }
    return promise || { eventId: 'event_123', code: 'abc123' }
  }),
}))

// PostHog already mocked above

// HapticProvider already mocked above

// Mock useHaptic hook
jest.mock('@/lib/hooks/use-haptic', () => ({
  useHaptic: () => ({
    hapticFeedback: jest.fn(() => true),
    isHapticSupported: () => true,
    cleanup: jest.fn(),
  }),
}))

// Mock PostHog provider
jest.mock('@/app/posthog-provider', () => ({
  PostHogProvider: ({ children }) => children,
  usePostHog: () => ({ posthog: null }),
}))

// Mock other dependencies
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
}))

jest.mock('react-qr-code', () => {
  return function MockQRCode({ value, ...props }) {
    return React.createElement('div', {
      'data-testid': 'qr-code',
      'data-value': value,
      ...props,
    }, 'QR Code')
  }
})

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    origin: 'http://localhost:3000',
    href: 'http://localhost:3000/',
    search: '',
    pathname: '/',
  },
  writable: true,
})

// Mock navigator.userAgent for PostHog
Object.defineProperty(global.navigator, 'userAgent', {
  value: 'Mozilla/5.0 (Node.js) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/20.0.0',
  writable: true,
})

// Mock localStorage and other browser APIs
const localStorageMock = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(() => null),
}

// Set up global mocks for browser APIs
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Mock document methods
Object.defineProperty(document, 'createElement', {
  value: jest.fn(() => ({
    style: {},
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    click: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })),
  writable: true,
})

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // Deprecated
    removeListener: jest.fn(), // Deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Suppress console warnings during tests
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is deprecated')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})