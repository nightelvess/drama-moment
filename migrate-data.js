const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, 'data', 'store.json');
const DB_PATH = path.join(__dirname, 'data', 'db.json');

function migrateData() {
  console.log('🚀 开始数据迁移...');

  // 读取旧数据
  const oldData = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  const newData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

  // 迁移高光数据
  console.log('📝 迁移高光数据...');
  const oldHighlights = oldData.highlights || [];
  const newHighlights = newData.highlights || [];

  // 合并高光数据
  const existingIds = new Set(newHighlights.map(h => h.id));
  oldHighlights.forEach(h => {
    if (!existingIds.has(h.id)) {
      // 转换字段名
      const template = newData.interactionTemplates[h.type] || {
        triggerScore: 7,
        effect: 'screen_flash'
      };

      newHighlights.push({
        ...h,
        triggerScore: template.triggerScore,
        effectConfig: {
          screenFlash: {
            enabled: template.effect === 'screen_flash',
            duration: 700,
            color: "rgba(255, 0, 0, 0.3)"
          },
          heartRain: {
            enabled: template.effect === 'heart_rain',
            count: 30,
            duration: 3000
          }
        }
      });
    }
  });

  newData.highlights = newHighlights;

  // 迁移互动数据
  console.log('📊 迁移互动数据...');
  const oldInteractions = oldData.interactions || [];
  const newInteractions = newData.interactions || [];

  oldInteractions.forEach(i => {
    // 简单去重
    const exists = newInteractions.some(n =>
      n.highlightId === i.highlightId &&
      n.buttonText === i.buttonText &&
      n.timestamp === i.timestamp
    );
    if (!exists) {
      newInteractions.push(i);
    }
  });

  newData.interactions = newInteractions;

  // 保存新数据
  console.log('💾 保存迁移后的数据...');
  fs.writeFileSync(DB_PATH, JSON.stringify(newData, null, 2), 'utf8');

  console.log('✅ 数据迁移完成！');
  console.log(`📝 共 ${newData.highlights.length} 个高光`);
  console.log(`📊 共 ${newData.interactions.length} 条互动记录`);
}

migrateData().catch(console.error);
