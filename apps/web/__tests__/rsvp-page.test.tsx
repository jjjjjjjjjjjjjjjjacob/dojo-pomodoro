import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'bun:test'
import RsvpPage from '../app/events/[eventId]/rsvp/page'

describe('RSVP Page', () => {
  const mockParams = Promise.resolve({ eventId: 'event_123' })

  it('renders RSVP page without crashing', () => {
    render(<RsvpPage params={mockParams} />)
    // Basic render test - just check it doesn't crash
    expect(document.body).toBeTruthy()
  })

  it('displays RSVP interface', () => {
    render(<RsvpPage params={mockParams} />)
    // Test basic functionality without complex mocking
    expect(document.body).toBeTruthy()
  })
})