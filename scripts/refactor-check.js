#!/usr/bin/env node
// Usage: node scripts/refactor-check.js

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const SCAN_DIRS = ['src/pages', 'src/components']
const WATCH_THRESHOLD = 250   // worth keeping an eye on
const ACT_THRESHOLD   = 400   // extract something

function walk(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...walk(full))
    } else if (/\.(jsx|js)$/.test(entry)) {
      results.push(full)
    }
  }
  return results
}

function analyze(filePath) {
  const src = readFileSync(filePath, 'utf8')
  const lines = src.split('\n').length
  const useStateCount = (src.match(/useState\(/g) || []).length
  const useEffectCount = (src.match(/useEffect\(/g) || []).length
  return { lines, useStateCount, useEffectCount }
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))

const results = files
  .map((f) => ({ path: relative(ROOT, f), ...analyze(f) }))
  .filter((r) => r.lines >= WATCH_THRESHOLD)
  .sort((a, b) => b.lines - a.lines)

if (results.length === 0) {
  console.log('\n✅  All good — no files over the watch threshold.\n')
  process.exit(0)
}

const actNow = results.filter((r) => r.lines >= ACT_THRESHOLD)
const watch  = results.filter((r) => r.lines < ACT_THRESHOLD)

const pad = (s, n) => s.padEnd(n)
const col = (n, w) => String(n).padStart(w)

function printTable(rows, label, color) {
  console.log(`\n${color}${label}\x1b[0m`)
  console.log('─'.repeat(72))
  console.log(`  ${ pad('File', 50) } ${ col('Lines', 6) }  useState  useEffect`)
  console.log('─'.repeat(72))
  for (const r of rows) {
    console.log(`  ${ pad(r.path, 50) } ${ col(r.lines, 6) }  ${ col(r.useStateCount, 8) }  ${ col(r.useEffectCount, 9) }`)
  }
  console.log('─'.repeat(72))
}

if (actNow.length > 0) printTable(actNow, '🔴  Act Now  (400+ lines)', '\x1b[31m')
if (watch.length  > 0) printTable(watch,  '🟡  Watch   (250–399 lines)', '\x1b[33m')

console.log(`
Tip: a file is a good refactor candidate when it has multiple useState
calls and a section that could have its own name. Line count alone is
just the trigger to look — not a mandate to split.
`)
