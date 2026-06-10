const http = require('http');

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      method: 'GET',
      headers: {
        'Range': 'bytes=0-10000'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      console.log('Status:', res.statusCode);
      console.log('Headers:', res.headers);
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log('Received data length:', data.length);
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (e) => {
      console.error('Error:', e);
      reject(e);
    });
    req.end();
  });
}

async function test() {
  try {
    console.log('Testing media file...');
    await makeRequest('/media/%E5%8C%97%E6%B4%BE%E5%AF%BB%E5%AE%9D%E7%AC%94%E8%AE%B0/%E7%AC%AC63%E9%9B%86.mp4');
  } catch (e) {
    console.error('Test failed:', e);
  }
}

test();
