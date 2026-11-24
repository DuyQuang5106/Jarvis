import { getDb } from '@/db/client';
import { migrateToDocuments } from '@/server/migration/migrate-to-documents';

async function main() {
  const apply = process.argv.includes('--apply');
  const db = await getDb();
  const report = await migrateToDocuments(db, { dryRun: !apply });
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) process.exitCode = 1;
}

void main();
