// A short-lived read-only Google OAuth token is supplied by GitHub Actions.
const fs = require('node:fs');
const path = require('node:path');
const id = '1q83XSPLXRd9Fgk20gSs601SX9LZWA1yQvkZQQEQ49KU';
const token = process.env.GOOGLE_ACCESS_TOKEN;
async function get(url) {
  const response = await fetch(url, {
    headers:{Authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Google read failed: HTTP ${response.status}`);
  return response.json();
}
async function main() {
  if (!token) throw new Error('Missing read-only Google access token');
  const folder = process.argv[2];
  if (!folder) throw new Error('Usage: node tools/fetch-sheets.cjs <private-output-directory>');
  const metadataUrl = `https://www.googleapis.com/drive/v3/files/${id}?fields=id,modifiedTime,lastModifyingUser(displayName)`;
  const before = await get(metadataUrl);
  if (before.id !== id || !before.modifiedTime) throw new Error('Source identity or revision metadata missing');
  const metadata = await get(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(properties(title,gridProperties(rowCount,columnCount)))`);
  const wanted = ['Сотрудники','События','Дни рождения','Задачи'];
  const ranges = wanted.map(title => {
    const sheet = metadata.sheets?.find(x => x.properties.title === title)?.properties;
    if (!sheet || sheet.gridProperties.columnCount < 14) throw new Error('Required source sheet missing or too narrow');
    if (sheet.gridProperties.rowCount > 20000) throw new Error('Source sheet exceeds configured read limit');
    return `'${title}'!A1:N${sheet.gridProperties.rowCount}`;
  });
  const query = new URLSearchParams({valueRenderOption:'FORMATTED_VALUE'});
  ranges.forEach(range => query.append('ranges',range));
  const response = await get(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${query}`);
  if (response.valueRanges?.length !== wanted.length) throw new Error('Incomplete Google Sheets response');
  const after = await get(metadataUrl);
  if (before.modifiedTime !== after.modifiedTime) throw new Error('Table changed while reading; retry on next run');
  const data = Object.fromEntries(wanted.map((title,i) => [title,response.valueRanges[i].values || []]));
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'source.json'),JSON.stringify(data),{mode:0o600});
  fs.writeFileSync(path.join(folder,'metadata.json'),JSON.stringify(after),{mode:0o600});
  console.log('Read-only table export verified. No source content written to logs.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
