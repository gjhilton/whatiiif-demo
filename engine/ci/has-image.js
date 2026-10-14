#!/usr/bin/env node
// Tells the deploy workflow whether content/ holds an image yet, so a fresh copy of the template
// skips publishing quietly instead of failing before its owner has added one.
import { appendFile } from 'node:fs/promises';
import { listImages } from '../lib/source.js';

const { images, unsupported } = await listImages('content');
const image = images.length + unsupported.length > 0;

if (!image) console.log('::notice::No image in content/ yet. Commit one TIFF, PNG or JPEG there and it will be published.');
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `image=${image}\n`);
