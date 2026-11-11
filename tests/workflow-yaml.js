// A small YAML reader for the workflow files (no dependencies), shared by the workflow tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function indentOf(line) {
 return /^ */.exec(line)[0].length;
}

function stripHash(line) {
 let quote = null;
 for (let i = 0; i < line.length; i++) {
  const c = line[i];
  if (quote) {
   if (c === quote) quote = null;
   continue;
  }
  if (c === '"' || c === "'") {
   quote = c;
   continue;
  }
  if (c === '#') return line.slice(0, i);
 }
 return line;
}

function unquote(value) {
 if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
  return value.slice(1, -1);
 }
 return value;
}

function scalar(value) {
 if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return unquote(value);
 if (value === 'true' || value === 'True' || value === 'TRUE') return true;
 if (value === 'false' || value === 'False' || value === 'FALSE') return false;
 if (value === 'null' || value === '~' || value === 'Null' || value === 'NULL') return null;
 if (/^-?\d+$/.test(value)) return Number(value);
 return value;
}

function splitCommas(value) {
 const parts = [];
 let current = '';
 let quote = null;
 for (const c of value) {
  if (quote) {
   current += c;
   if (c === quote) quote = null;
   continue;
  }
  if (c === '"' || c === "'") {
   quote = c;
   current += c;
   continue;
  }
  if (c === ',') {
   parts.push(current);
   current = '';
   continue;
  }
  current += c;
 }
 if (current) parts.push(current);
 return parts;
}

function parseYaml(text) {
 const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
 let pos = 0;

 function fail(message) {
  throw new Error(`${message} (line ${Math.min(pos + 1, lines.length)})`);
 }

 function skipNoise() {
  while (pos < lines.length && (/^\s*$/.test(lines[pos]) || /^\s*#/.test(lines[pos]))) pos++;
 }

 function peek() {
  skipNoise();
  return pos < lines.length ? lines[pos] : null;
 }

 function parseBlock(parentIndent) {
  const chunks = [];
  let blockIndent = null;
  while (pos < lines.length) {
   const line = lines[pos];
   if (line.trim() === '') {
    chunks.push('');
    pos++;
    continue;
   }
   const indent = indentOf(line);
   if (blockIndent == null) {
    if (indent <= parentIndent) break;
    blockIndent = indent;
   }
   if (indent < blockIndent) break;
   chunks.push(line.slice(blockIndent));
   pos++;
  }
  while (chunks.length && chunks[chunks.length - 1] === '') chunks.pop();
  return `${chunks.join('\n')}\n`;
 }

 function parseFlow(value) {
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];
  return splitCommas(inner).map((part) => scalar(part.trim()));
 }

 function assignRest(target, key, rest, keyIndent) {
  if (rest === '|' || rest === '|-' || rest === '|+') {
   target[key] = parseBlock(keyIndent);
   if (rest === '|-') target[key] = target[key].replace(/\n$/, '');
   return;
  }
  if (rest === '') {
   const next = peek();
   target[key] = next && indentOf(next) > keyIndent ? parseValue(indentOf(next)) : null;
   return;
  }
  if (rest.startsWith('[') && rest.endsWith(']')) {
   target[key] = parseFlow(rest);
   return;
  }
  target[key] = scalar(rest);
 }

 function parseMap(expectedIndent) {
  const map = {};
  while (true) {
   const line = peek();
   if (line == null || indentOf(line) !== expectedIndent || line.trim().startsWith('- ')) break;
   pos++;
   const body = stripHash(line).trim();
   const match = body.match(/^([^:]+):(.*)$/);
   if (!match) fail(`expected a key: ${body}`);
   assignRest(map, unquote(match[1].trim()), match[2].trim(), expectedIndent);
  }
  return map;
 }

 function parseSeq(dashIndent) {
  const seq = [];
  while (true) {
   const line = peek();
   if (line == null || indentOf(line) !== dashIndent || !line.trim().startsWith('- ')) break;
   pos++;
   const after = stripHash(line).trim().slice(2);
   const contentIndent = indentOf(line) + 2;
   if (after === '') {
    seq.push(parseValue(contentIndent));
   } else if (after.includes(':')) {
    const item = {};
    const match = after.match(/^([^:]+):(.*)$/);
    if (!match) fail(`expected a key in a list: ${after}`);
    assignRest(item, unquote(match[1].trim()), match[2].trim(), contentIndent);
    Object.assign(item, parseMap(contentIndent));
    seq.push(item);
   } else {
    seq.push(scalar(after));
   }
  }
  return seq;
 }

 function parseValue(minIndent) {
  const line = peek();
  if (line == null || indentOf(line) < minIndent) return null;
  if (line.trim().startsWith('- ')) return parseSeq(indentOf(line));
  return parseMap(indentOf(line));
 }

 const value = parseValue(0);
 skipNoise();
 if (pos < lines.length) fail(`stopped before the end: ${lines[pos].trim()}`);
 return value;
}

function workflow(rel) {
 return parseYaml(read(rel));
}

function step(job, name) {
 const found = job.steps.find((item) => item.name === name || item.uses === name);
 assert.ok(found, name);
 return found;
}

module.exports = {read, parseYaml, workflow, step, unquote};
