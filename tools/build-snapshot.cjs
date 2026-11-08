// Build an encrypted website snapshot from a bounded Google Sheets connector read.
// Input: {"Сотрудники": rows, "События": rows, "Дни рождения": rows, "Задачи": rows}.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
function fail(message) { throw new Error(message); }
function argument(name) {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function bytes(x) { return Array.isArray(x) ? Buffer.from(x) : Buffer.from(x, 'base64url'); }
function date(value) {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) !== iso) fail('Invalid source date');
  return iso;
}
function number(value) {
  if (value == null || value === '') return '';
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) fail('Invalid day count');
  return n;
}
function records(source, tab, expected) {
  const rows = source[tab];
  if (!Array.isArray(rows) || !expected.every((header, i) => rows[0]?.[i] === header)) fail(`Missing or unexpected headers: ${tab}`);
  const result = rows.slice(1).filter(r => r?.[0]);
  if (new Set(result.map(r => String(r[0]))).size !== result.length) fail(`Duplicate IDs: ${tab}`);
  return result;
}
function decrypt(env, key) {
  const raw = bytes(env.data);
  const d = crypto.createDecipheriv('aes-256-gcm', key, bytes(env.iv));
  d.setAuthTag(raw.subarray(-16));
  let plain = Buffer.concat([d.update(raw.subarray(0, -16)), d.final()]);
  if (env.compressed === 'gzip') plain = zlib.gunzipSync(plain);
  return JSON.parse(plain);
}
function main() {
  const sourceFile = argument('--source'), keyFile = argument('--key'), outputFile = argument('--out');
  if (!sourceFile || !keyFile || !outputFile) fail('Usage: node tools/build-snapshot.cjs --source private/drive-audit.json --key <key-file> --out private/data.enc.json');
  const source = read(sourceFile), keyConfig = read(keyFile), key = bytes(keyConfig.key);
  if (keyConfig.alg !== 'A256GCM' || key.length !== 32) fail('Invalid shared key file');
  const original = read(argument('--baseline') || path.join(root, 'data.enc.json'));
  const previous = decrypt(original, key);
  function editMetadata(sheet,row){const headers=source[sheet]?.[0]||[],author=headers.indexOf('Кто изменил'),at=headers.indexOf('Когда изменено');return {...(author>=0&&row[author]?{enteredBy:row[author]}:{}),...(at>=0&&row[at]?{modifiedAt:row[at]}:{})};}
  const previousPeople = new Map(previous.people.map(p => [p.id, p]));
  const people = records(source, 'Сотрудники', ['ID', 'ФИО', 'Краткое имя']).map(r => ({
    id:r[0], full:r[1] || r[2] || '', short:r[2] || r[1] || '', role:r[3] || '', category:r[4] || '',
    birthdate:date(r[5] || previousPeople.get(r[0])?.birthdate || ''), ...editMetadata('Сотрудники',r)
  }));
  const oldEvents = new Map(previous.events.map(e => [e.id, e]));
  const extensionColumn = source['События']?.[0]?.indexOf('Даты продления отпуска') ?? -1;
  function extension(r){
    const dates=extensionColumn<0?[]:String(r[extensionColumn]||'').split(/[;,]/).map(x=>x.trim()).filter(Boolean).map(date);
    if(new Set(dates).size!==dates.length || dates.some(d=>d<date(r[4])||d>date(r[5]||r[4])))fail('Invalid leave extension dates');
    if(dates.length&&!['Основной отпуск','Летний отпуск','Отпуск ВБД','Дополнительный отпуск','Отпуск по семейным обстоятельствам'].includes(r[3]))fail('Extension on non-leave event');
    return dates.length?{extensionDates:dates}:{};
  }
  const events = records(source, 'События', ['ID события', 'Сотрудник ID', 'Сотрудник', 'Тип события']).map(r => ({
    id:r[0], personId:r[1] || '', type:r[3] || '', start:date(r[4]), end:date(r[5]),
    days:number(r[6]), status:r[7] || '', basis:r[8] || '', comment:r[9] || '',
    linkedEvent:r[14] || oldEvents.get(r[0])?.linkedEvent || '', ...(String(r[12]||'').startsWith('Карточка дашборда')?{enteredBy:r[10]||''}:{}), ...extension(r), ...editMetadata('События',r)
  }));
  const birthdays = records(source, 'Дни рождения', ['Сотрудник ID', 'Сотрудник', 'Дата рождения']).map(r => ({
    id:r[0], name:r[1] || '', date:date(r[2]), affiliation:r[7] || 'Наш отдел', ...editMetadata('Дни рождения',r)
  }));
  const controlColumn = source['Задачи']?.[0]?.indexOf('Контроль') ?? -1;
  function taskControl(row) {
    const value = controlColumn < 0 ? '' : String(row[controlColumn] ?? '').trim();
    if (value && !['На контроле','Не на контроле'].includes(value)) fail('Invalid task control value');
    return value ? value === 'На контроле' : row[8] === 'На контроле';
  }
  const tasks = records(source, 'Задачи', ['ID задачи', 'Исполнитель ID', 'Исполнитель', 'Задача']).map(r => ({
    id:r[0], controlled:taskControl(r), personId:r[1] || '', title:r[3] || '', description:r[4] || '', created:date(r[5]),
    deadline:date(r[6]), priority:r[7] || '', status:r[8] === 'На контроле' ? 'В работе' : r[8] || '', completed:date(r[9]), author:r[10] || '', comment:r[11] || '', ...editMetadata('Задачи',r)
  }));
  const snapshot = {people, events, tasks, birthdays};
  const peopleIds = new Set(people.map(p => p.id));
  for (const e of [...events, ...tasks]) if (e.personId && !peopleIds.has(e.personId)) fail('Unknown employee reference');
  for (const e of events) if (!e.start || !e.type || (e.end && e.end < e.start)) fail('Invalid event interval or type');
  // Refuse silent deletion. Reconcile deletions explicitly before building a snapshot.
  for (const collection of ['people','events','tasks','birthdays']) {
    const ids = new Set(snapshot[collection].map(x => x.id));
    if ((previous[collection] || []).some(x => !ids.has(x.id))) fail(`Source omits existing records: ${collection}`);
  }
  const metadataFile = argument('--metadata');
  const metadata = metadataFile ? read(metadataFile) : null;
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  if (metadata) {
    snapshot.meta = {
      contentHash,
      sourceModifiedAt: metadata.modifiedTime || null,
      modifiedBy: metadata.lastModifyingUser?.displayName || null,
      publishedAt: new Date().toISOString(),
      source: 'Google Sheets'
    };
  } else if (previous.meta) {
    // Never carry forward an editor/date that belongs to older content.
    snapshot.meta = {contentHash, sourceModifiedAt:null, modifiedBy:null,
      publishedAt:new Date().toISOString(), source:'Google Sheets'};
  }
  const previousData = Object.fromEntries(['people','events','tasks','birthdays'].map(k=>[k,previous[k] || []]));
  const sameData = crypto.createHash('sha256').update(JSON.stringify(previousData)).digest('hex') === contentHash;
  const sameMetadata = metadata && previous.meta?.sourceModifiedAt === snapshot.meta.sourceModifiedAt && previous.meta?.modifiedBy === snapshot.meta.modifiedBy;
  const unchanged = sameData && (!metadata || sameMetadata);
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(JSON.stringify(snapshot));
  const data = Buffer.concat([cipher.update(zlib.gzipSync(plain)), cipher.final(), cipher.getAuthTag()]);
  const envelope = {v:original.v || 1, alg:'A256GCM', compressed:'gzip', iv:iv.toString('base64'), data:data.toString('base64')};
  if (JSON.stringify(decrypt(envelope, key)) !== JSON.stringify(snapshot)) fail('Encryption verification failed');
  const output = path.resolve(outputFile);
  if ([path.resolve(keyFile),path.resolve(sourceFile)].includes(output)) fail('Output would overwrite input');
  if (fs.existsSync(output)) fail('Output already exists; choose a new path');
  fs.mkdirSync(path.dirname(output), {recursive:true});
  fs.writeFileSync(output, JSON.stringify(unchanged ? original : envelope) + '\n', {flag:'wx'});
  console.log(JSON.stringify({output, changed:!unchanged, counts:Object.fromEntries(['people','events','tasks','birthdays'].map(k=>[k,snapshot[k].length])), encryption:'verified'},null,2));
}
try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
