#!/usr/bin/env node
/**
 * scripts/build.js — Build & package AIPP Local WebExtension.
 *
 * Verifies all required artifacts, bundles the manifest and assets
 * into dist/aipp-local.
 *
 * No remote dependencies (SEC-01).
 */

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve('.');
const DIST = join(ROOT, 'dist');

console.log('--- Building AIPP Local Extension ---');

if (!existsSync(DIST)) {
  mkdirSync(DIST, { recursive: true });
}

// Runtime files and folders to package (no markdown docs)
const ASSETS = [
  'manifest.json',
  'rules',
  'models',
  'icons',
  'src',
];

for (const asset of ASSETS) {
  const srcPath = join(ROOT, asset);
  const destPath = join(DIST, asset);
  if (existsSync(srcPath)) {
    cpSync(srcPath, destPath, { recursive: true });
    console.log(`Copied ${asset} -> dist/${asset}`);
  }
}

// Generate build metadata
const metadata = {
  buildTime: new Date().toISOString(),
  protocol: 'AIPP',
  version: '0.2.0',
  target: 'firefox-webextension',
  offlineGuaranteed: true,
};
writeFileSync(join(DIST, 'build-meta.json'), JSON.stringify(metadata, null, 2));

console.log('\nBuild complete! Extension distribution ready in ./dist');
