import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { originalUrl, committedToLfs } from '../lib/original.js';
import { tempDir } from './support/tmp.js';

const run = promisify(execFile);

const args = { repo: 'gjh/harbour', ref: 'main', path: 'content/harbour.tif' };

test('links Git LFS files through the media host', () => {
  assert.equal(
    originalUrl({ ...args, lfs: true }),
    'https://media.githubusercontent.com/media/gjh/harbour/main/content/harbour.tif',
  );
});

test('links plain git files through the raw host', () => {
  assert.equal(
    originalUrl({ ...args, lfs: false }),
    'https://raw.githubusercontent.com/gjh/harbour/main/content/harbour.tif',
  );
});

test('is undefined outside GitHub, where there is no repo to link to', () => {
  assert.equal(originalUrl({ ...args, repo: undefined, lfs: true }), undefined);
});

test('percent-encodes the file name, so one with spaces or accents still makes a valid URL', () => {
  assert.equal(
    originalUrl({ ...args, path: 'content/Harbour view #2 (café).tif', lfs: false }),
    'https://raw.githubusercontent.com/gjh/harbour/main/content/Harbour%20view%20%232%20(caf%C3%A9).tif',
  );
});

/**
 * A repository whose .gitattributes sends images through Git LFS, as the template's does, with
 * `committed` as the content actually stored in git for content/harbour.tif. Git's own LFS filter is
 * switched off so the test decides that, whether or not git-lfs is installed on this machine.
 */
async function repoWith(committed) {
  const repo = await tempDir('repo');
  const git = (...args) => run('git', ['-c', 'filter.lfs.clean=', '-c', 'filter.lfs.process=', '-c', 'filter.lfs.required=false', ...args], { cwd: repo });
  await git('init', '-q');
  await writeFile(join(repo, '.gitattributes'), '*.tif filter=lfs diff=lfs merge=lfs -text\n');
  await writeFile(join(repo, 'harbour.tif'), committed);
  await git('add', '-A');
  await git('-c', 'user.name=Test', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'Add image');
  // What a checkout with LFS leaves on disk is always the real image.
  await writeFile(join(repo, 'harbour.tif'), Buffer.alloc(5000, 7));
  return join(repo, 'harbour.tif');
}

test('recognises an image that git stores as a Git LFS pointer', async () => {
  const pointer = 'version https://git-lfs.github.com/spec/v1\noid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\nsize 5000\n';
  assert.equal(await committedToLfs(await repoWith(pointer)), true);
});

test('does not mistake an image uploaded on github.com for LFS just because .gitattributes says so', async () => {
  assert.equal(await committedToLfs(await repoWith(Buffer.alloc(5000, 7))), false);
});

test('treats an image outside any git repository as not in LFS', async () => {
  const file = join(await tempDir('loose'), 'harbour.tif');
  await writeFile(file, Buffer.alloc(5000, 7));
  assert.equal(await committedToLfs(file), false);
});
