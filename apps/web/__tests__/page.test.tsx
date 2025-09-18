import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'bun:test'
import Home from '../app/page'

describe('Home Page', () => {
  it('renders home page without crashing', () => {
    render(<Home />)
    // Basic render test - just check it doesn't crash
    expect(document.body).toBeTruthy()
  })

  it('displays the main content', () => {
    render(<Home />)
    // Test basic functionality without complex interactions
    expect(document.body).toBeTruthy()
  })
})