import { describe, it, expect } from 'bun:test'
import { hmacFingerprint, hashPassword, verifyPassword } from '../convex/lib/passwordUtils'

const MOCK_SECRET = 'test-secret-for-fingerprinting'

describe('Password Utilities - Case Insensitivity', () => {
  describe('hmacFingerprint', () => {
    it('should generate identical fingerprints for passwords with different cases', () => {
      const passwords = ['coucou', 'COUCOU', 'CouCou', 'cOuCoU', 'Coucou']
      const fingerprints = passwords.map(password => hmacFingerprint(MOCK_SECRET, password))

      // All fingerprints should be identical
      const uniqueFingerprints = new Set(fingerprints)
      expect(uniqueFingerprints.size).toBe(1)

      // Each specific case should match the lowercase baseline
      const baselineFingerprint = hmacFingerprint(MOCK_SECRET, 'coucou')
      passwords.forEach(password => {
        expect(hmacFingerprint(MOCK_SECRET, password)).toBe(baselineFingerprint)
      })
    })

    it('should generate different fingerprints for different passwords (case normalized)', () => {
      const password1Fingerprint = hmacFingerprint(MOCK_SECRET, 'password1')
      const password2Fingerprint = hmacFingerprint(MOCK_SECRET, 'PASSWORD2')
      const password3Fingerprint = hmacFingerprint(MOCK_SECRET, 'Different')

      expect(password1Fingerprint).not.toBe(password2Fingerprint)
      expect(password2Fingerprint).not.toBe(password3Fingerprint)
      expect(password1Fingerprint).not.toBe(password3Fingerprint)
    })

    it('should consistently normalize mixed case passwords', () => {
      const testCases = [
        { input: 'MyPassword123', normalized: 'mypassword123' },
        { input: 'ALLCAPS', normalized: 'allcaps' },
        { input: 'mixedCASE', normalized: 'mixedcase' },
        { input: 'Special@123!', normalized: 'special@123!' }
      ]

      testCases.forEach(({ input, normalized }) => {
        const inputFingerprint = hmacFingerprint(MOCK_SECRET, input)
        const normalizedFingerprint = hmacFingerprint(MOCK_SECRET, normalized)
        expect(inputFingerprint).toBe(normalizedFingerprint)
      })
    })
  })

  describe('hashPassword', () => {
    it('should generate identical hashes for passwords with different cases', () => {
      const passwords = ['testpass', 'TESTPASS', 'TestPass', 'tEsTpAsS']
      const hashes = passwords.map(password => hashPassword(password))

      // While salts will be different, we can verify case insensitivity by
      // using the same salt for verification
      const baselineHash = hashes[0]

      passwords.forEach(password => {
        // Verify each password against the baseline hash
        const isValid = verifyPassword(
          password,
          baselineHash.hashB64,
          baselineHash.saltB64,
          baselineHash.iterations
        )
        expect(isValid).toBe(true)
      })
    })

    it('should generate consistent hash structure regardless of case', () => {
      const hash1 = hashPassword('MySecretPassword')
      const hash2 = hashPassword('MYSECRETPASSWORD')
      const hash3 = hashPassword('mysecretpassword')

      // Structure should be consistent
      expect(hash1).toHaveProperty('saltB64')
      expect(hash1).toHaveProperty('hashB64')
      expect(hash1).toHaveProperty('iterations')

      expect(hash2).toHaveProperty('saltB64')
      expect(hash2).toHaveProperty('hashB64')
      expect(hash2).toHaveProperty('iterations')

      expect(hash3).toHaveProperty('saltB64')
      expect(hash3).toHaveProperty('hashB64')
      expect(hash3).toHaveProperty('iterations')

      // Iterations should be the same
      expect(hash1.iterations).toBe(hash2.iterations)
      expect(hash2.iterations).toBe(hash3.iterations)
    })
  })

  describe('verifyPassword', () => {
    it('should verify passwords regardless of input case', () => {
      const originalPassword = 'MyTestPassword123'
      const { hashB64, saltB64, iterations } = hashPassword(originalPassword)

      const testCases = [
        'mytestpassword123',  // all lowercase
        'MYTESTPASSWORD123',  // all uppercase
        'MyTestPassword123',  // original case
        'mYtEsTpAsSwOrD123',  // mixed case
        'MyTESTPASSWORD123'   // partial uppercase
      ]

      testCases.forEach(testPassword => {
        const isValid = verifyPassword(testPassword, hashB64, saltB64, iterations)
        expect(isValid).toBe(true)
      })
    })

    it('should reject incorrect passwords regardless of case', () => {
      const originalPassword = 'CorrectPassword'
      const { hashB64, saltB64, iterations } = hashPassword(originalPassword)

      const incorrectPasswords = [
        'wrongpassword',
        'WRONGPASSWORD',
        'CorrectPassword1',  // extra character
        'orrectPassword',    // missing character
        'CorrectPasswor',    // truncated
        'Different123'
      ]

      incorrectPasswords.forEach(wrongPassword => {
        const isValid = verifyPassword(wrongPassword, hashB64, saltB64, iterations)
        expect(isValid).toBe(false)
      })
    })

    it('should maintain timing-safe comparison behavior', () => {
      const password = 'TestingPassword'
      const { hashB64, saltB64, iterations } = hashPassword(password)

      // Test with various lengths and cases
      const testInputs = [
        'testingpassword',     // correct but lowercase
        'TESTINGPASSWORD',     // correct but uppercase
        'testingpassword1',    // correct + extra char
        'testingpasswor',      // correct - last char
        'wrongpassword',       // completely wrong
        'a',                   // very short
        'a'.repeat(100)        // very long
      ]

      testInputs.forEach(input => {
        // Should not throw errors and should return boolean
        const result = verifyPassword(input, hashB64, saltB64, iterations)
        expect(typeof result).toBe('boolean')
      })
    })
  })

  describe('Integration - Complete Password Flow', () => {
    it('should maintain case insensitivity through complete hash-verify cycle', () => {
      const testPasswords = [
        'SimplePassword',
        'Complex@Password123!',
        'ALLUPPERCASE',
        'alllowercase',
        'MiXeDcAsE123',
        'Special!@#$%^&*()Characters',
        'Numbers123456789',
        'UnicodeCharsáéíóú'
      ]

      testPasswords.forEach(originalPassword => {
        // Hash the original password
        const { hashB64, saltB64, iterations } = hashPassword(originalPassword)

        // Create variations of the same password with different cases
        const variations = [
          originalPassword.toLowerCase(),
          originalPassword.toUpperCase(),
          originalPassword,
          // Create a mixed case version
          originalPassword.split('').map((char, index) =>
            index % 2 === 0 ? char.toLowerCase() : char.toUpperCase()
          ).join('')
        ]

        // All variations should verify successfully
        variations.forEach(variation => {
          const isValid = verifyPassword(variation, hashB64, saltB64, iterations)
          expect(isValid).toBe(true)
        })

        // Generate fingerprints for all variations - they should be identical
        const fingerprints = variations.map(variation =>
          hmacFingerprint(MOCK_SECRET, variation)
        )
        const uniqueFingerprints = new Set(fingerprints)
        expect(uniqueFingerprints.size).toBe(1)
      })
    })

    it('should reject passwords that differ in more than just case', () => {
      const basePassword = 'BasePassword123'
      const { hashB64, saltB64, iterations } = hashPassword(basePassword)

      const incorrectVariations = [
        'BasePassword124',    // different number
        'BasePassword12',     // shorter
        'BasePassword1234',   // longer
        'BasePasswod123',     // typo
        'BasePassword 123',   // added space
        'BasePassword123!',   // added special char
        ''                    // empty string
      ]

      incorrectVariations.forEach(incorrectPassword => {
        const isValid = verifyPassword(incorrectPassword, hashB64, saltB64, iterations)
        expect(isValid).toBe(false)
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty passwords consistently', () => {
      const emptyPasswords = ['', '  ', '\t', '\n']

      emptyPasswords.forEach(emptyPassword => {
        // Should not throw errors
        const fingerprint = hmacFingerprint(MOCK_SECRET, emptyPassword)
        const hash = hashPassword(emptyPassword)
        const isValid = verifyPassword(emptyPassword, hash.hashB64, hash.saltB64, hash.iterations)

        expect(typeof fingerprint).toBe('string')
        expect(typeof hash.hashB64).toBe('string')
        expect(isValid).toBe(true)
      })
    })

    it('should handle special characters and unicode', () => {
      const specialPasswords = [
        'Password@123!',
        'пароль123',        // Cyrillic
        'パスワード123',      // Japanese
        'كلمة123',          // Arabic
        'Пароль@123!',
        'emoji🔒password🔑',
        'tab\there',
        'newline\nhere'
      ]

      specialPasswords.forEach(password => {
        const { hashB64, saltB64, iterations } = hashPassword(password)

        // Test case variations
        const lowerCase = password.toLowerCase()
        const upperCase = password.toUpperCase()

        expect(verifyPassword(lowerCase, hashB64, saltB64, iterations)).toBe(true)
        expect(verifyPassword(upperCase, hashB64, saltB64, iterations)).toBe(true)
        expect(verifyPassword(password, hashB64, saltB64, iterations)).toBe(true)
      })
    })
  })
})