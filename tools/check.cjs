const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let count = 0;
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  new vm.Script(match[1], {filename: `index.html:script-${++count}`});
}
if (!count) throw new Error('No application scripts found');
new vm.Script(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));
for (const file of fs.readdirSync(__dirname).filter(file => file.endsWith('.cjs'))) {
  new vm.Script(fs.readFileSync(path.join(__dirname, file), 'utf8'), {filename:file});
}
for (const file of ['manifest.json', 'data.enc.json', 'package.json']) {
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}
console.log(`OK: ${count} inline script(s), service worker and JSON syntax. Browser behavior is not tested.`);
