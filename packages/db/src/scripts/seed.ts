import { loadEnv, requireEnv } from './env';

// Preenchido no item 05 do plano.
export async function runSeed(_url: string) {}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  runSeed(requireEnv('DATABASE_OWNER_URL')).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
