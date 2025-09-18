import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, mock } from 'bun:test'

// Mock the redirect function since HostPage uses redirect() which returns void
const mockRedirect = mock(() => {})
mock.module('next/navigation', () => ({
  redirect: mockRedirect
}))

// Import after mocking
import HostPage from '../app/host/page'

describe('Host Page', () => {
  it('redirects to host events page', () => {
    // HostPage calls redirect so we can't render it as JSX
    // Instead we test that it calls redirect with the correct URL
    HostPage()
    expect(mockRedirect).toHaveBeenCalledWith('/host/events')
  })
})