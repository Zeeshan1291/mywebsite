const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');

const oldCode = "const info = await ytdl.getInfo(url);";
const newCode = `const info = await ytdl.getInfo(url, {
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    });`;

let count = 0;
while (s.includes(oldCode)) {
  s = s.replace(oldCode, newCode);
  count++;
}

fs.writeFileSync('server.js', s);
console.log(`✅ Replaced ${count} occurrence(s)`);
