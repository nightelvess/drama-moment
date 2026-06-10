const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
console.log('DATA_DIR:', DATA_DIR);
console.log('Contents of data dir:', fs.readdirSync(DATA_DIR));

const testDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
console.log('Subdirectories:', testDirs.map(d => ({ name: d.name, isDir: d.isDirectory() })));

testDirs.forEach(dir => {
  const fullPath = path.join(DATA_DIR, dir.name);
  console.log(`Contents of ${dir.name}:`, fs.readdirSync(fullPath));
  const firstFile = fs.readdirSync(fullPath).find(f => f.endsWith('.mp4'));
  if (firstFile) {
    const testFilePath = path.join(fullPath, firstFile);
    console.log(`Testing ${testFilePath}: exists=${fs.existsSync(testFilePath)}, stat=${JSON.stringify(fs.statSync(testFilePath), null, 2)}`);
  }
});
