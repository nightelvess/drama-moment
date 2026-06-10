const http = require('http');

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });
    req.end();
  });
}

async function test() {
  try {
    console.log('Testing /api/dramas...');
    const dramas = await makeRequest('/api/dramas');
    console.log('Status:', dramas.status);
    console.log('Response:', dramas.data);
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
