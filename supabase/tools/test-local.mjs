// Suite local autocontenida; test:postgres conserva PostgreSQL 15 y concurrencia en CI.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const pglite = fileURLToPath(import.meta.resolve('@electric-sql/pglite'));
const result = spawnSync(process.execPath, [
  '--test', '--test-concurrency=1',
  'test/sql.test.js', 'test/fcm-worker.test.js', 'test/entrega7-state.test.js',
], {
  cwd: new URL('../', import.meta.url),
  env: {...process.env, SQL_TEST_PGLITE_MODULE: pglite},
  stdio: 'inherit',
  shell: false,
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
