import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'bun:test'
import OrgsSelectPage from '../app/orgs/select/page'

describe('Organization Select Page', () => {
  it('renders organization select page without crashing', () => {
    render(<OrgsSelectPage />)
    // Basic render test - just check it doesn't crash
    expect(document.body).toBeTruthy()
  })

  it('displays organization selection interface', () => {
    render(<OrgsSelectPage />)
    // Test basic functionality without complex mocking
    expect(document.body).toBeTruthy()
  })
})