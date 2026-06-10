const http = require('http');
const fs = require('fs');
const path = require('path');

console.log("Testing server...");

// 测试1: /api/dramas
console.log("\n=== Test 1: /api/dramas ===");
http.get('http://127.0.0.1:3000/api/dramas', (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);
  
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`Response: ${data.substring(0, 500)}...`);
    
    // 测试2: /
    console.log("\n=== Test 2: / ===");
    http.get('http://127.0.0.1:3000/', (res2) => {
      console.log(`Status: ${res2.statusCode}`);
      let data2 = '';
      res2.on('data', (chunk) => { data2 += chunk; });
      res2.on('end', () => {
        console.log(`Response length: ${data2.length}`);
        
        // 测试3: media
        console.log("\n=== Test 3: /media/... ===");
        const testMediaUrl = 'http://127.0.0.1:3000/media/%E5%8C%97%E6%B4%BE%E5%AF%BB%E5%AE%9D%E7%AC%94%E8%AE%B0/%E7%AC%AC63%E9%9B%86.mp4';
        const options = { headers: { 'Range': 'bytes=0-99' } };
        
        http.get(testMediaUrl, options, (res3) => {
          console.log(`Status: ${res3.statusCode}`);
          console.log(`Headers: ${JSON.stringify(res3.headers)}`);
          
          let data3 = Buffer.alloc(0);
          res3.on('data', (chunk) => { data3 = Buffer.concat([data3, chunk]); });
          res3.on('end', () => {
            console.log(`Response: got ${data3.length} bytes`);
            console.log("\n=== All tests done ===");
          });
        }).on('error', (e) => {
          console.error(`Test3 error: ${e}`);
        });
      });
    }).on('error', (e) => {
      console.error(`Test2 error: ${e}`);
    });
  });
}).on('error', (e) => {
  console.error(`Test1 error: ${e}`);
});
