import { exec } from 'node:child_process';
import { request } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const API_URL = 'http://127.0.0.1:8000/openapi.json';
const OUTPUT_FILE = 'src/types/api.types.ts';
const CHECK_INTERVAL = 3000;

let lastHash = '';
let isGenerating = false;

// Ensure output directory exists
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function checkSchema() {
  if (isGenerating) return;

  const req = request(API_URL, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 200) {
        // We use a simple length/hash approach to detect changes
        const currentHash = data.length + '_' + data.slice(0, 100) + data.slice(-100);
        
        if (lastHash !== currentHash) {
          if (lastHash !== '') {
            console.log('🔄 OpenAPI schema changed. Regenerating types...');
          } else {
            console.log('🚀 Initial OpenAPI types generation...');
          }
          lastHash = currentHash;
          isGenerating = true;

          exec(`bunx openapi-typescript ${API_URL} -o ${OUTPUT_FILE}`, (err, stdout, stderr) => {
            isGenerating = false;
            if (err) {
              console.error(`❌ Error generating types: ${err.message}`);
              return;
            }
            console.log(`✅ Types updated: ${OUTPUT_FILE}`);
          });
        }
      }
    });
  });

  req.on('error', (e) => {
    // Silently ignore connection errors (backend might be restarting or not up yet)
    if (e.code !== 'ECONNREFUSED' && e.code !== 'ECONNRESET') {
      console.error(`Problem fetching OpenAPI schema: ${e.message}`);
    }
  });

  req.end();
}

console.log(`👀 Watching for OpenAPI schema changes at ${API_URL}...`);
// Initial check delayed to give backend time to start
setTimeout(checkSchema, 2000);
setInterval(checkSchema, CHECK_INTERVAL);
