import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function processFile(filePath) {
  if (!filePath.match(/\.(vue|js|postcss|css|json)$/)) return;

  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // 1. Replace "..." with "…" in templates and strings, but NOT in JS spread syntax (...)
  // We can look for literal strings "..." or >...< in Vue
  content = content.replace(/"\.\.\."/g, '"…"');
  content = content.replace(/'\.\.\.'/g, "'…'");
  content = content.replace(/>\.\.\.</g, '>…<');
  content = content.replace(/Loading\.\.\./g, 'Loading…');
  content = content.replace(/Claiming\.\.\./g, 'Claiming…');
  content = content.replace(/Saving\.\.\./g, 'Saving…');
  content = content.replace(/Synchronizing Vibe Engine\.\.\./g, 'Synchronizing Vibe Engine…');
  content = content.replace(/Finding drivers\.\.\./g, 'Finding drivers…');
  content = content.replace(/Submitting\.\.\./g, 'Submitting…');
  content = content.replace(/Uploading\.\.\./g, 'Uploading…');
  content = content.replace(/Share the vibe\.\.\./g, 'Share the vibe…');

  // 2. Replace transition-all with transition (Tailwind specific)
  // Be careful not to replace it if it's already part of a valid property, but space/quote bounded is safe.
  content = content.replace(/([\s"'`])transition-all([\s"'`])/g, '$1transition$2');

  // 3. Replace inline transition: alls
  content = content.replace(/transition:\s*all\b/g, 'transition: opacity, transform, background-color, border-color, color, fill, stroke, box-shadow');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

walkDir('./src', processFile);
console.log('Mass replace complete.');
