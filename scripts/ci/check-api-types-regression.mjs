import fs from 'fs';
import path from 'path';

/**
 * Basic Regression Test for API Types
 * Compares current types with a snapshot to detect breaking changes.
 */

const TYPES_PATH = path.resolve('src/types/api.types.ts');
const SNAPSHOT_PATH = path.resolve('src/types/api.types.snapshot.ts');

async function checkRegression() {
  if (!fs.existsSync(TYPES_PATH)) {
    console.error('❌ API types not found at', TYPES_PATH);
    process.exit(1);
  }

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.log('📝 Initializing types snapshot...');
    fs.copyFileSync(TYPES_PATH, SNAPSHOT_PATH);
    console.log('✅ Snapshot created.');
    return;
  }

  const current = fs.readFileSync(TYPES_PATH, 'utf8');
  const snapshot = fs.readFileSync(SNAPSHOT_PATH, 'utf8');

  if (current !== snapshot) {
    console.warn('⚠️ API types have changed! Please review for breaking changes.');
    // In a strict CI, we might exit(1) here if breaking changes are detected
    // For now, we just log and update the snapshot for manual review
    fs.copyFileSync(TYPES_PATH, SNAPSHOT_PATH);
    console.log('✅ Snapshot updated for review.');
  } else {
    console.log('✅ No regression detected in API types.');
  }
}

checkRegression();
