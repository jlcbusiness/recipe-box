import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

function runSupabase(args) {
  const result = spawnSync('supabase', args, {
    stdio: 'ignore',
  });

  if (result.error || result.status !== 0) {
    console.error(`Local Supabase command failed: supabase ${args.join(' ')}.`);
    process.exit(1);
  }
}

async function getLocalSupabaseConfig() {
  const status = spawn('supabase', ['status', '--output', 'env'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let apiUrl;
  let anonKey;

  for await (const line of createInterface({ input: status.stdout })) {
    if (line.startsWith('API_URL=')) {
      apiUrl = line.slice('API_URL='.length).replace(/^"|"$/g, '');
    } else if (line.startsWith('ANON_KEY=')) {
      anonKey = line.slice('ANON_KEY='.length).replace(/^"|"$/g, '');
    }
  }

  const exitCode = await new Promise((resolveExit) => {
    status.once('close', resolveExit);
  });

  if (exitCode !== 0 || !apiUrl || !anonKey) {
    console.error('Could not read local Supabase public settings.');
    process.exit(1);
  }

  return { apiUrl, anonKey };
}

const args = process.argv.slice(2);
const shouldReset = args.includes('--reset');
const testMode = args.includes('--test');
const nextArgs = args.filter((argument) => argument !== '--reset' && argument !== '--test');
const portIndex = nextArgs.indexOf('--port');
const port = portIndex === -1 ? '3000' : nextArgs[portIndex + 1];
const nextExecutable = resolve('node_modules/next/dist/bin/next');

runSupabase(['start']);
runSupabase(shouldReset ? ['db', 'reset'] : ['migration', 'up']);

const { apiUrl, anonKey } = await getLocalSupabaseConfig();
const nextProcess = spawn(process.execPath, [nextExecutable, 'dev', ...nextArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
    ...(testMode ? { NEXT_DIST_DIR: '.next-e2e' } : {}),
  },
});

process.once('SIGINT', () => nextProcess.kill('SIGINT'));
process.once('SIGTERM', () => nextProcess.kill('SIGTERM'));

nextProcess.once('error', (error) => {
  console.error(`Could not start Next.js: ${error.message}`);
  process.exitCode = 1;
});

nextProcess.once('close', (code) => {
  process.exitCode = code ?? 1;
});
