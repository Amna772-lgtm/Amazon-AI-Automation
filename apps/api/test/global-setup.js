// Applies pending migrations to the dedicated test database (non-destructive).
// Tests use unique per-run emails, so no data wipe is needed between runs.
const { execSync } = require('node:child_process');
const path = require('node:path');

module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://app:app@localhost:5432/amz_saas_test?schema=public';
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../../../packages/db'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
};
