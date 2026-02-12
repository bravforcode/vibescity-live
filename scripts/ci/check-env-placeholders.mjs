#!/usr/bin/env node
/**
 * CI Check: Detect placeholder values in environment variables
 * Fails if any VITE_* variable contains <...> pattern
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PLACEHOLDER_PATTERN = /<[^>]+>/g;
const ENV_FILES = ['.env', '.env.production', '.env.local'];

let hasErrors = false;

console.log('🔍 Checking for placeholder values in env files...\n');

for (const envFile of ENV_FILES) {
  const filePath = join(process.cwd(), envFile);
  
  if (!existsSync(filePath)) {
    continue;
  }

  console.log(`📄 Checking ${envFile}...`);
  
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip comments and empty lines
    if (!line || line.startsWith('#')) continue;
    
    // Check for VITE_ prefixed variables
    if (line.startsWith('VITE_')) {
      const matches = line.match(PLACEHOLDER_PATTERN);
      if (matches) {
        console.error(`❌ Line ${i + 1}: ${line}`);
        console.error(`   Found placeholder(s): ${matches.join(', ')}`);
        hasErrors = true;
      }
    }
  }
}

if (hasErrors) {
  console.error('\n💥 FAILED: Placeholder values detected in env files.');
  console.error('   Replace <...> placeholders with real values before deploying.');
  process.exit(1);
} else {
  console.log('\n✅ No placeholder values found in VITE_* variables.');
  process.exit(0);
}
