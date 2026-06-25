const fs = require('fs');

// 1. Fix server.js - add adminData to home route
let s = fs.readFileSync('server.js', 'utf8');
const oldLine = "res.render('home', { user: req.session.user, theme: u?.theme || 'light', unread: notifs.length });";
const newLines = `let adminData = { admins: [] };
  if (fs.existsSync('data/admin.json')) adminData = JSON.parse(fs.readFileSync('data/admin.json'));
  res.render('home', { user: req.session.user, theme: u?.theme || 'light', unread: notifs.length, adminData });`;

if (s.includes(oldLine)) {
  s = s.replace(oldLine, newLines);
  fs.writeFileSync('server.js', s);
  console.log('✅ server.js updated');
} else {
  console.log('⚠️ server.js already updated ya line nahi mili');
}

// 2. Fix home.ejs - remove require() line
const ejsPath = 'views/home.ejs';
let e = fs.readFileSync(ejsPath, 'utf8');
const lines = e.split('\n').filter(line => !line.includes('require("fs")') && !line.includes("require('fs')"));
fs.writeFileSync(ejsPath, lines.join('\n'));
console.log('✅ home.ejs cleaned');

// 3. Create admin.json if missing
if (!fs.existsSync('data/admin.json')) {
  fs.writeFileSync('data/admin.json', JSON.stringify({
    admins: ["Sajidg"],
    settings: { siteName: "MySocialApp", allowSignup: true, maintenanceMode: false }
  }, null, 2));
  console.log('✅ admin.json created with admin: Sajidg');
} else {
  console.log('ℹ️ admin.json already exists');
}
