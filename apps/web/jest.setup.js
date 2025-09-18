import '@testing-library/jest-dom'

// Global mocks
global.jest = require('jest')

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