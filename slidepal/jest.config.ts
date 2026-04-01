// slidepal/jest.config.ts
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/fileMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/lib/**/*.test.ts'],
      preset: 'ts-jest',
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['**/__tests__/components/**/*.test.tsx'],
      preset: 'ts-jest',
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/fileMock.js',
      },
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    },
  ],
}

export default config
