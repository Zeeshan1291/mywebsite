const fs = require('fs');
const path = 'views/home.ejs';
let e = fs.readFileSync(path, 'utf8');
e = e.replace(
  /<%\s*if\s*\(adminData\.admins\.includes\(user\)\)\s*\{\s*%>/,
  "<% if (typeof adminData !== 'undefined' && adminData && adminData.admins && adminData.admins.includes(user)) { %>"
);
fs.writeFileSync(path, e);
console.log('✅ home.ejs patched safely');
