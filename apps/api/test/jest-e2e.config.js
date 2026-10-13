/** E2E tests: real Postgres (amz_saas_test) + Redis db 1 from docker compose. */
module.exports = {
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }] },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/env.ts'],
  globalSetup: '<rootDir>/global-setup.js',
  testTimeout: 60_000,
};
