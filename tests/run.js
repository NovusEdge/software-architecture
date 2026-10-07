#!/usr/bin/env node
// Structural checks for the plugin. Content quality is reviewed by people; this
// catches the mechanical drift: a principle missing a field, an unmarked or
// unlinked source, a broken relative link, frontmatter or manifests that do not
// parse or disagree.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REFS = path.join(ROOT, 'skills', 'architecture', 'references');
const FIELDS = ['Claim.', 'Why it holds.', 'When it does not apply.', 'Sources.', 'Reviewer checks.'];

let failures = 0;

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures++;
  console.log(`  FAIL ${name}`);
  if (detail) console.log(String(detail).split('\n').map(l => `       ${l}`).join('\n'));
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function markdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// Flat "key: value" YAML is all the frontmatter here uses; a nested or
// multi-line value would show up as a missing key and fail loudly.
function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    fields[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return fields;
}

// Splits a reference file into principles (## headings) and each principle
// into its labelled fields, keeping the lines under each label.
function principles(text) {
  const out = [];
  let current = null;
  let field = null;
  for (const line of text.split('\n')) {
    const heading = line.match(/^## (.+)/);
    if (heading) {
      current = { title: heading[1].trim(), fields: {}, order: [] };
      out.push(current);
      field = null;
      continue;
    }
    if (!current) continue;
    const label = line.match(/^\*\*([^*]+)\*\*/);
    if (label && FIELDS.includes(label[1])) {
      field = label[1];
      current.order.push(field);
      current.fields[field] = [line.slice(label[0].length).trim()].filter(Boolean);
      continue;
    }
    if (field && line.trim()) current.fields[field].push(line);
  }
  return out;
}

console.log('software-architecture');

const refFiles = fs.readdirSync(REFS).filter(f => f.endsWith('.md')).sort();
assert('reference files exist', refFiles.length > 0);

let total = 0;
const counts = [];
for (const file of refFiles) {
  const text = fs.readFileSync(path.join(REFS, file), 'utf8');
  const list = principles(text);
  counts.push(`${file}: ${list.length}`);
  total += list.length;
  assert(`${file} has principles`, list.length > 0);

  for (const p of list) {
    const where = `${file} / ${p.title}`;
    const missing = FIELDS.filter(f => !(f in p.fields));
    assert(`${where}: all five fields`, missing.length === 0, `missing: ${missing.join(', ')}`);
    assert(
      `${where}: fields in order, once each`,
      JSON.stringify(p.order) === JSON.stringify(FIELDS),
      `found: ${p.order.join(' | ')}`
    );

    const sources = (p.fields['Sources.'] || []).filter(l => l.startsWith('- '));
    assert(`${where}: has sources`, sources.length > 0);
    const unmarked = sources.filter(l => !/^- \[(V|U|I)\] /.test(l));
    assert(`${where}: every source marked [V], [U] or [I]`, unmarked.length === 0, unmarked.join('\n'));
    const verified = sources.filter(l => l.startsWith('- [V] '));
    const noUrl = verified.filter(l => !/https?:\/\/\S+/.test(l));
    assert(`${where}: every [V] source has a URL`, noUrl.length === 0, noUrl.join('\n'));
    const noDate = verified.filter(l => !/fetched \d{4}-\d{2}-\d{2}/.test(l));
    assert(`${where}: every [V] source has a fetch date`, noDate.length === 0, noDate.join('\n'));

    const checks = (p.fields['Reviewer checks.'] || []).filter(l => l.startsWith('- '));
    assert(`${where}: has reviewer checks`, checks.length > 0);
  }
}
console.log(`  ${counts.join('\n  ')}\n  total principles: ${total}`);

{
  const skill = read('skills/architecture/SKILL.md');
  const linked = new Set([...skill.matchAll(/\]\(references\/([^)#]+)\)/g)].map(m => m[1]));
  const unlisted = refFiles.filter(f => !linked.has(f));
  assert('architecture SKILL.md links every reference file', unlisted.length === 0, unlisted.join('\n'));
}

for (const file of markdownFiles(ROOT)) {
  const text = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  const broken = [];
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
    const resolved = path.resolve(path.dirname(file), target.split('#')[0]);
    if (!fs.existsSync(resolved)) broken.push(target);
  }
  assert(`${path.relative(ROOT, file)}: relative links resolve`, broken.length === 0, broken.join('\n'));
}

const SKILLS = [
  { file: 'skills/architecture/SKILL.md', name: 'architecture' },
  { file: 'skills/review/SKILL.md', name: 'review' },
];
for (const { file, name } of SKILLS) {
  const fm = frontmatter(read(file));
  assert(`${file}: frontmatter parses`, fm !== null);
  if (!fm) continue;
  assert(`${file}: name matches directory`, fm.name === name, `name: ${fm.name}`);
  assert(`${file}: has a description`, Boolean(fm.description && fm.description.length > 40));
}

{
  const file = 'agents/architecture-reviewer.md';
  const fm = frontmatter(read(file));
  assert(`${file}: frontmatter parses`, fm !== null);
  if (fm) {
    const missing = ['name', 'description', 'model', 'effort', 'tools'].filter(k => !fm[k]);
    assert(`${file}: required keys present`, missing.length === 0, `missing: ${missing.join(', ')}`);
    assert(`${file}: name is architecture-reviewer`, fm.name === 'architecture-reviewer', fm.name);
  }
}

{
  let plugin = null;
  let market = null;
  try { plugin = JSON.parse(read('.claude-plugin/plugin.json')); } catch (e) { plugin = e; }
  try { market = JSON.parse(read('.claude-plugin/marketplace.json')); } catch (e) { market = e; }
  assert('plugin.json parses', !(plugin instanceof Error), plugin && plugin.message);
  assert('marketplace.json parses', !(market instanceof Error), market && market.message);
  if (!(plugin instanceof Error) && !(market instanceof Error)) {
    const entry = (market.plugins || []).find(p => p.name === plugin.name);
    assert('marketplace lists the plugin by name', Boolean(entry), JSON.stringify(market.plugins));
    assert('marketplace name matches plugin name', market.name === plugin.name, `${market.name} vs ${plugin.name}`);
    assert(
      'marketplace and plugin versions agree',
      Boolean(entry) && entry.version === plugin.version,
      `${entry && entry.version} vs ${plugin.version}`
    );
  }
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
