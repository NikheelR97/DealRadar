#!/usr/bin/env node
/* global process, console */
/**
 * Deploy gate (SPRINT_PLAN). Scans built output (frontend/dist, backend/dist) for
 * patterns matching known secret formats. Exits 1 on any match. Pure Node, no deps.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['frontend/dist', 'backend/dist'];
const MAX_FILES = 10_000; // Law 2 — bounded.

// Each pattern names a concrete secret shape. Generic high-entropy is intentionally
// NOT flagged to avoid false positives on minified bundles.
const PATTERNS = [
  { name: 'Google OAuth client secret', re: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: 'Resend API key', re: /\bre_[A-Za-z0-9]{20,}\b/ },
  { name: 'Postgres URL with credentials', re: /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s:@/]+@/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: 'JSON web token', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

let scanned = 0;
const findings = [];

function walk(dir) {
  if (scanned >= MAX_FILES) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (++scanned >= MAX_FILES) return;
    const content = readFileSync(full, 'utf8');
    for (const { name, re } of PATTERNS) {
      if (re.test(content)) findings.push({ file: full, name });
    }
  }
}

for (const root of ROOTS) {
  if (existsSync(root)) walk(root);
}

if (findings.length > 0) {
  console.error('FAIL: potential secrets found in build output:');
  for (const f of findings) console.error(`  - ${f.name} in ${f.file}`);
  process.exit(1);
}

console.log(`OK: scanned ${scanned} build file(s); no secrets found.`);
