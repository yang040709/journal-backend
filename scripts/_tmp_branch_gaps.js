const fs = require('fs');
const path = require('path');

const finalPath = path.join(__dirname, '../coverage/coverage-final.json');
const data = JSON.parse(fs.readFileSync(finalPath, 'utf8'));

const rows = [];
let totalB = 0;
let coveredB = 0;

for (const [filePath, entry] of Object.entries(data)) {
  if (!entry || !entry.b) continue;
  const branchMap = entry.b;
  let fileTotal = 0;
  let fileCovered = 0;
  for (const hits of Object.values(branchMap)) {
    if (!Array.isArray(hits)) continue;
    for (const h of hits) {
      fileTotal += 1;
      if (h > 0) fileCovered += 1;
    }
  }
  totalB += fileTotal;
  coveredB += fileCovered;
  const miss = fileTotal - fileCovered;
  if (miss <= 0) continue;
  const short = filePath.replace(/\\/g, '/').split('/').slice(-3).join('/');
  rows.push({
    short,
    full: filePath.replace(/\\/g, '/'),
    pct: fileTotal ? Math.round((fileCovered / fileTotal) * 10000) / 100 : 100,
    miss,
    total: fileTotal,
    covered: fileCovered,
  });
}

rows.sort((a, b) => b.miss - a.miss);
console.log('TOTAL branches', coveredB + '/' + totalB, ((coveredB / totalB) * 100).toFixed(2) + '%');
console.log('Need for 70%:', Math.ceil(totalB * 0.7) - coveredB);
console.log('\nTop 50 by missed branches:');
for (const r of rows.slice(0, 50)) {
  console.log(String(r.miss).padStart(4), String(r.pct).padStart(6) + '%', r.short);
}
