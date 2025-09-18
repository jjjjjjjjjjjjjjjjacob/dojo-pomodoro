# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**IMPORTANT: Always use `bun` as the package manager - NEVER use npm, yarn, or pnpm**

### Build Commands
- `bun dev` - Start development server for all apps in parallel (uses Turbo)
- `bun build` - Build all apps for production (uses Turbo)
- `bun lint` - Run linting across all apps (uses Turbo)

### Web App (apps/web)
- `cd apps/web && bun dev` - Start Next.js development server on port 2345
- `cd apps/web && bun build` - Build Next.js app for production
- `cd apps/web && bun lint` - Run Next.js ESLint (currently minimal config)

### Convex Backend (apps/convex)
- `cd apps/convex && npx convex dev` - Start Convex development server
- `cd apps/convex && npx convex deploy` - Deploy Convex backend

## Architecture Overview

This is a monorepo using Turbo with workspaces for a Next.js event management application with Convex backend.

### Key Technologies
- **Frontend**: Next.js 15 with App Router, React 19, TypeScript
- **Backend**: Convex (real-time database with serverless functions)
- **Authentication**: Clerk
- **Styling**: Tailwind CSS v4, Radix UI components
- **State Management**: TanStack Query integrated with Convex
- **Package Manager**: Bun
- **Monorepo**: Turbo

### Project Structure
```
apps/
├── web/          # Next.js frontend application
│   ├── app/      # App Router pages and layouts
│   ├── components/ # Reusable UI components
│   └── lib/      # Utilities and hooks
└── convex/       # Convex backend
    └── convex/   # Database schema, functions, and API endpoints
```

### Authentication & State
- Clerk handles user authentication and organization management
- ConvexProviderWithClerk integrates Clerk auth with Convex
- TanStack Query provides client-side caching with Convex integration
- Global providers configured in `apps/web/app/providers.tsx`

### Core Features
Based on the codebase structure, this appears to be an event management system with:
- Event creation and management
- RSVP functionality
- User profiles and organizations
- File uploads
- QR code generation
- Real-time notifications

### Environment Configuration
- Convex URL configured via `NEXT_PUBLIC_CONVEX_URL`
- Development server uses polling for file watching
- Node.js version 22 specified for Convex functions

## Code Style Guidelines

### Variable Naming
- **Always use verbose, descriptive variable names**
- Avoid abbreviations and shortened names
- Examples of BAD naming: `d`, `ts`, `pw`, `sp`, `qpPassword`, `authRes`, `userDoc`
- Examples of GOOD naming: `date`, `timestamp`, `password`, `searchParams`, `queryParamPassword`, `authResult`, `userDocument`
- Variable names should clearly explain what the data represents
- Prefer readability over brevity - code is read more than it's written

### General Code Style
- Use verbose naming throughout: variables, functions, parameters
- No single-letter variables except for very short-lived loop indices
- No unnecessary abbreviations (e.g., `res` → `result`, `req` → `request`)
- Function names should be action-oriented and descriptive
- Component names should clearly indicate their purpose

## Notes
- No test suite currently configured
- ESLint configuration is minimal due to toolchain compatibility issues
- Uses Bun as package manager with workspaces configuration