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
for (const file of ['sw.js','leave-extension.js','event-draft.js','event-card.js','collaboration.js']) new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
for(const icon of manifest.icons||[])if(!fs.existsSync(path.join(root,icon.src)))throw new Error('Missing app icon: '+icon.src);
for (const file of fs.readdirSync(__dirname).filter(file => file.endsWith('.cjs'))) {
  new vm.Script(fs.readFileSync(path.join(__dirname, file), 'utf8'), {filename:file});
}
for (const file of ['manifest.json', 'data.enc.json', 'package.json']) {
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}
console.log(`OK: ${count} inline script(s), service worker and JSON syntax. Browser behavior is not tested.`);
