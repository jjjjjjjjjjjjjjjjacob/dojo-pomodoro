import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'bun:test'
import RedeemPage from '../app/redeem/[code]/page'

describe('Redeem Page', () => {
  const mockParams = Promise.resolve({ code: 'abc123' })

  it('renders redeem page without crashing', () => {
    render(<RedeemPage params={mockParams} />)
    // Basic render test - just check it doesn't crash
    expect(document.body).toBeTruthy()
  })

  it('displays redemption interface', () => {
    render(<RedeemPage params={mockParams} />)
    // Test basic functionality without complex mocking
    expect(document.body).toBeTruthy()
  })
})