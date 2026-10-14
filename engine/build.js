#!/usr/bin/env node
// Usage: node engine/build.js [--content content] [--out dist]
import { parseArgs } from 'node:util';
import { build } from './lib/build.js';

const { values } = parseArgs({ options: { content: { type: 'string', default: 'content' }, out: { type: 'string', default: 'dist' } } });

try {
  await build({ contentDir: values.content, outDir: values.out, log: console.log });
} catch (error) {
  console.error(`\nBuild failed: ${error.message}`);
  process.exit(1);
}
