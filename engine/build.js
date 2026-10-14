#!/usr/bin/env node
// Usage: node engine/build.js [--content content] [--out dist]
// In a GitHub Actions run, problems also go on the run's page as annotations, and the run gets a summary.
import { appendFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { build } from './lib/build.js';
import { annotation, builtSummary, failedSummary } from './lib/report.js';

const { values } = parseArgs({ options: { content: { type: 'string', default: 'content' }, out: { type: 'string', default: 'dist' } } });
const actions = process.env.GITHUB_ACTIONS === 'true';
const summarise = async (markdown) => {
  if (actions && process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
};

const warnings = [];
const warn = (message) => {
  warnings.push(message);
  console.log(actions ? annotation('warning', 'Worth a look', message) : `Worth a look: ${message}`);
};

try {
  const built = await build({ contentDir: values.content, outDir: values.out, log: console.log, warn });
  await summarise(builtSummary(built, warnings));
} catch (error) {
  console.error(`\nBuild failed: ${error.message}`);
  if (actions) console.log(annotation('error', 'Your site was not built', error.message));
  await summarise(failedSummary(error.message));
  process.exit(1);
}
