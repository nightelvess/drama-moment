const http = require('http');
const fs = require('fs');
const path = require('path');

// 我们模拟一下服务器的逻辑
const DATA_DIR = path.join(__dirname, 'data');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

console.log("Testing media serving logic...");
console.log("DATA_DIR:", DATA_DIR);

const testPath = '/media/%E5%8C%97%E6%B4%BE%E5%AF%BB%E5%AE%9D%E7%AC%94%E8%AE%B0/%E7%AC%AC63%E9%9B%86.mp4';
console.log("\nTest path:", testPath);

// 复制我们刚刚写的逻辑
const dataDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

console.log("\nData dirs:", dataDirs);

const rest = testPath.replace(/^\/media\//, "");
console.log("\nREST:", rest);

let dramaName = null;
let filePart = null;

for (const realDir of dataDirs) {
    const encodedRealDir = encodeURIComponent(realDir);
    console.log("\nChecking realDir:", realDir, "encoded:", encodedRealDir);
    
    if (rest.startsWith(encodedRealDir)) {
        console.log("Match with encoded dir!");
        dramaName = realDir;
        filePart = rest.slice(encodedRealDir.length + 1);
        break;
    }
    
    if (decodeURIComponent(rest).startsWith(realDir)) {
        console.log("Match with decoded dir!");
        dramaName = realDir;
        const decoded = decodeURIComponent(rest);
        filePart = decoded.slice(realDir.length + 1);
        break;
    }
}

console.log("\nDrama name:", dramaName);
console.log("File part:", filePart);

let filePath = null;
if (dramaName && filePart) {
    const dramaDir = path.join(DATA_DIR, dramaName);
    const files = fs.readdirSync(dramaDir, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => entry.name);
    console.log("\nFiles in drama dir:", files);
    
    for (const f of files) {
        if (filePart.includes(f) || decodeURIComponent(filePart).includes(f)) {
            filePath = path.join(dramaDir, f);
            break;
        }
        if (filePart.includes(encodeURIComponent(f))) {
            filePath = path.join(dramaDir, f);
            break;
        }
    }
}

console.log("\nFound file path:", filePath);

if (!filePath) {
    console.log("\nTrying brute force match...");
    for (const realDir of dataDirs) {
        const dramaDir = path.join(DATA_DIR, realDir);
        const files = fs.readdirSync(dramaDir, { withFileTypes: true })
            .filter(entry => entry.isFile())
            .map(entry => entry.name);
        
        for (const f of files) {
            const testPath = path.join(dramaDir, f);
            if (f.toLowerCase().endsWith('.mp4')) {
                const fileNameEncoded = encodeURIComponent(f);
                if (testPath.includes(fileNameEncoded) || testPath.includes(f)) {
                    filePath = testPath;
                    dramaName = realDir;
                    break;
                }
            }
        }
        if (filePath) break;
    }
}

console.log("\nFinal file path:", filePath);
console.log("File exists:", filePath ? fs.existsSync(filePath) : false);
