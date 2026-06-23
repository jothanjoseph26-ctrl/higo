/** @type {import('jest').Config} */
module.exports = {
  displayName: '@higo/api',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.app.json' },
    ],
  },
};