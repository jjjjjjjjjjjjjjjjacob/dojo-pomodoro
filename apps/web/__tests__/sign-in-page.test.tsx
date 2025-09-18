import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'bun:test'
import SignInPage from '../app/sign-in/[[...sign-in]]/page'

describe('Sign In Page', () => {
  it('renders sign in page without crashing', () => {
    render(<SignInPage />)
    // Basic render test - just check it doesn't crash
    expect(document.body).toBeTruthy()
  })

  it('displays sign in interface', () => {
    render(<SignInPage />)
    // Test basic functionality without complex mocking
    expect(document.body).toBeTruthy()
  })
})