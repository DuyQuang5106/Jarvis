import { getDb } from '../src/db/client';
import { importHustMaterials } from '../src/server/migration/import-hust-materials';
import { getStorage } from '../src/server/storage';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const readFlag = (prefix: string) => {
    const hit = args.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : undefined;
  };

  const contextRoot =
    readFlag('--context=') ??
    String.raw`C:\Users\LENOVO\.gemini\antigravity\brain\de93ed1b-9787-4529-a0b1-78589816c3a6\scratch\context-zips`;
  const rawRoot = readFlag('--raw=') ?? String.raw`C:\Users\LENOVO\OneDrive\HUST\2026.1`;

  const report = await importHustMaterials(await getDb(), getStorage(), {
    contextRoot,
    rawRoot,
    dryRun: !apply,
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
