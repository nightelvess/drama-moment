// 测试新的存储结构
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

console.log('=== Testing new DB structure ===');

try {
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const db = JSON.parse(raw);
  console.log('✅ DB loaded successfully');

  console.log(`\n📊 Drama count: ${Object.keys(db.dramas).length}`);
  console.log(`📺 Episode count: ${Object.keys(db.episodes).length}`);
  console.log(`✨ Highlight count: ${db.highlights.length}`);
  console.log(`💬 Interaction count: ${db.interactions.length}`);

  console.log('\n🎯 First 3 highlights:');
  db.highlights.slice(0, 3).forEach(h => {
    console.log(`  - ${h.type} @ ${h.startTime}-${h.endTime}s (${h.status})`);
  });

  console.log('\n✅ All looks good!');
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
