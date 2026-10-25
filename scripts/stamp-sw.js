#!/usr/bin/env node
// Stampea CACHE_NAME en public/sw.js con el SHA del commit (o timestamp local como fallback).
// Lo corre Vercel en cada build (ver vercel.json buildCommand) — así cada deploy obtiene
// un cache name único y los service workers de los usuarios se auto-actualizan sin tocar
// nada manualmente.
const fs = require('fs');
const path = require('path');

const sha = process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.COMMIT_SHA
  || String(Date.now());
const stamp = sha.slice(0, 8);

const swPath = path.join(__dirname, '..', 'public', 'sw.js');
const original = fs.readFileSync(swPath, 'utf8');
const stamped = original.replace(
  /const CACHE_NAME = '[^']+';/,
  `const CACHE_NAME = 'rendimientos-tty-${stamp}';`
);

if (stamped === original) {
  console.error('[stamp-sw] no se encontró CACHE_NAME en public/sw.js — nada que reemplazar');
  process.exit(0);
}

fs.writeFileSync(swPath, stamped);
console.log(`[stamp-sw] CACHE_NAME = rendimientos-tty-${stamp}`);
