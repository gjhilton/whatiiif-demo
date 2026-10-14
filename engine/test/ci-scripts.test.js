// The scripts in engine/ci are what the workflows run, so they are tested by running them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile, chmod, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './tmp.js';

const run = promisify(execFile);
const script = (name) => fileURLToPath(new URL(`../ci/${name}`, import.meta.url));

/** Runs has-image.js in a repository whose content/ holds the given files; returns what it told the workflow. */
async function lookForImage(...files) {
  const repo = await tempDir('repo');
  await mkdir(join(repo, 'content'));
  for (const file of files) await writeFile(join(repo, 'content', file), 'x');
  const output = join(repo, 'github-output');
  await writeFile(output, '');
  const { stdout } = await run('node', [script('has-image.js')], { cwd: repo, env: { ...process.env, GITHUB_OUTPUT: output } });
  return { output: await readFile(output, 'utf8'), stdout };
}

test('tells the deploy workflow there is nothing to publish while content/ has no image', async () => {
  const { output, stdout } = await lookForImage('whatiiif.toml', '.gitkeep');
  assert.equal(output, 'image=false\n');
  assert.match(stdout, /::notice::.*content\//);
});

test('tells the deploy workflow to go ahead once an image is committed', async () => {
  assert.equal((await lookForImage('whatiiif.toml', 'harbour.tif')).output, 'image=true\n');
});

test('lets the build run, and explain itself, when the only image is in an unsupported format', async () => {
  assert.equal((await lookForImage('scan.jp2')).output, 'image=true\n');
});

test('the update workflow does nothing, successfully, in the template repository itself', async () => {
  const repo = await tempDir('repo');
  const bin = await tempDir('bin');
  await mkdir(join(repo, 'engine'));
  await writeFile(join(repo, 'engine/UPSTREAM'), 'gjhilton/whatiiif\n');
  await writeFile(join(repo, 'engine/VERSION'), '0.1.0\n');
  // A stand-in gh: any call to it means the script went looking for a release to install.
  await writeFile(join(bin, 'gh'), '#!/bin/sh\ntouch "$(dirname "$0")/called"\nexit 1\n');
  await chmod(join(bin, 'gh'), 0o755);

  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'gjhilton/whatiiif' };
  const code = await run('bash', [script('update.sh')], { cwd: repo, env }).then(() => 0, (error) => error.code);

  assert.equal(code, 0);
  assert.equal(await access(join(bin, 'called')).then(() => true, () => false), false);
});
