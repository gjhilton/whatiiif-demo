#!/usr/bin/env node
// Tells the deploy workflow whether content/ holds an image yet, or whatiiif.toml names one by its link, so a fresh
// copy of the template skips publishing quietly instead of failing before its owner has added one.
import { appendFile, readFile } from 'node:fs/promises';
import { listImages } from '../lib/source.js';

const { images, unsupported } = await listImages('content');
// No TOML reader here (nothing is installed yet): a line that sets `picture` is enough, and the build reads it properly.
const settings = await readFile('content/whatiiif.toml', 'utf8').catch(() => '');
const linked = /^\s*picture\s*=/m.test(settings);
const image = images.length + unsupported.length > 0 || linked;

if (!image) console.log('::notice::No image in content/ yet. Commit one TIFF, PNG or JPEG there and it will be published.');
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `image=${image}\n`);
