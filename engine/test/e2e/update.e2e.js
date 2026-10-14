// The Update workflow, start to finish: a user's repository on an old release, a newer release upstream,
// and engine/ci/update.sh run between them. Only GitHub itself is stood in for: a `gh` that serves the
// upstream release and records the pull request it is asked to open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempDir } from '../tmp.js';
import { commit, git, run, templateCopy } from './harness.js';

const read = (path) => readFile(path, 'utf8');

/**
 * A `gh` on the PATH that knows one upstream release, held in `upstream`, and writes what it was asked to `log`.
 * With `releaseError`, asking for the latest release fails with that message instead, as the real `gh` does.
 */
async function fakeGitHub({ upstream, tag, log, releaseError }) {
  const bin = await tempDir('bin');
  const releaseView = releaseError ? `echo "${releaseError}" >&2; exit 1` : `echo "${tag}"`;
  const script = `#!/bin/bash
echo "$*" >> "${log}"
case "$1 $2" in
  "release view") ${releaseView} ;;
  "api repos/example/whatiiif/tarball/${tag}") tar -czf - -C "${upstream}/.." --exclude .git --exclude node_modules "$(basename "${upstream}")" ;;
  "pr create") while [ $# -gt 0 ]; do [ "$1" = --body ] && printf '%s' "$2" > "${log}.body"; shift; done ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
`;
  await writeFile(join(bin, 'gh'), script);
  await chmod(join(bin, 'gh'), 0o755);
  return bin;
}

test('a newer release replaces the engine on a branch, leaves content/ alone and opens a pull request', async () => {
  // Upstream has moved on: a new version, a change inside the engine, a file gone, and a workflow edited.
  const upstream = await templateCopy();
  await writeFile(join(upstream, 'engine/VERSION'), '9.9.9\n');
  await writeFile(join(upstream, 'engine/lib/new-in-999.js'), 'export const added = true;\n');
  await git(upstream, ['rm', '-q', 'engine/lib/budget.js']);
  await writeFile(join(upstream, '.github/workflows/deploy.yml'), `${await read(join(upstream, '.github/workflows/deploy.yml'))}# changed upstream\n`);
  await commit(upstream, 'Release 9.9.9');

  // The user is on the old release, has their own image and settings, and pushes to their own remote.
  const user = await templateCopy();
  await writeFile(join(user, 'engine/UPSTREAM'), 'example/whatiiif\n');
  await writeFile(join(user, 'content/harbour.jpg'), 'my image');
  await writeFile(join(user, 'content/whatiiif.toml'), 'title = "Mine"\n');
  await commit(user, 'My image');
  const origin = await tempDir('origin');
  await git(origin, ['init', '-q', '--bare']);
  await git(user, ['remote', 'add', 'origin', origin]);
  const oldVersion = (await read(join(user, 'engine/VERSION'))).trim();

  const log = join(await tempDir('gh'), 'calls');
  const bin = await fakeGitHub({ upstream, tag: 'v9.9.9', log });
  const env = { PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'someone/their-image' };
  const result = await run('bash', ['engine/ci/update.sh'], { cwd: user, env });
  assert.equal(result.code, 0, result.stderr);

  // The branch that was pushed holds the new engine and the user's untouched content.
  const show = async (path) => (await git(origin, ['show', `whatiiif-update-9.9.9:${path}`])).stdout;
  assert.equal(await show('engine/VERSION'), '9.9.9\n');
  assert.equal(await show('engine/lib/new-in-999.js'), 'export const added = true;\n');
  await assert.rejects(show('engine/lib/budget.js'), 'a file removed upstream is removed here too');
  assert.equal(await show('content/harbour.jpg'), 'my image');
  assert.equal(await show('content/whatiiif.toml'), 'title = "Mine"\n');
  // Workflow files cannot be changed by the workflow's token, so they must stay as they were...
  assert.doesNotMatch(await show('.github/workflows/deploy.yml'), /changed upstream/);

  // ...and the pull request has to say so.
  assert.match(await read(log), /pr create --title Update whatiiif to 9\.9\.9/);
  const body = await read(`${log}.body`);
  assert.match(body, new RegExp(`from \\*\\*example/whatiiif\\*\\* ${oldVersion.replaceAll('.', '\\.')} → 9\\.9\\.9`));
  assert.match(body, /Your `content\/` is untouched/);
  assert.match(body, /Workflow files changed upstream.*copy them over by hand/s);
});

test('a repository already on the latest release is left alone', async () => {
  const user = await templateCopy();
  await writeFile(join(user, 'engine/UPSTREAM'), 'example/whatiiif\n');
  await commit(user, 'Point at upstream');
  const version = (await read(join(user, 'engine/VERSION'))).trim();

  const log = join(await tempDir('gh'), 'calls');
  const bin = await fakeGitHub({ upstream: user, tag: `v${version}`, log });
  const result = await run('bash', ['engine/ci/update.sh'], { cwd: user, env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'someone/their-image' } });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Already on the latest release/);
  assert.doesNotMatch(await read(log), /pr create|tarball/);
  assert.equal((await git(user, ['branch', '--list', 'whatiiif-update-*'])).stdout, '');
});

async function userOfTemplate() {
  const user = await templateCopy();
  await writeFile(join(user, 'engine/UPSTREAM'), 'example/whatiiif\n');
  await commit(user, 'Point at upstream');
  return user;
}

test('a template that has not published a release yet is left alone, and that is not a failure', async () => {
  const user = await userOfTemplate();
  const log = join(await tempDir('gh'), 'calls');
  // What the real gh says, word for word, when a repository has no releases.
  const bin = await fakeGitHub({ log, releaseError: 'release not found' });
  const result = await run('bash', ['engine/ci/update.sh'], { cwd: user, env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'someone/their-image' } });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /example\/whatiiif has not published a release yet, so there is nothing to update to\./);
  assert.doesNotMatch(await read(log), /pr create|tarball/);
  assert.equal((await git(user, ['branch', '--list', 'whatiiif-update-*'])).stdout, '');
});

test('when GitHub cannot say what the latest release is, the update fails and passes on why', async () => {
  const user = await userOfTemplate();
  const log = join(await tempDir('gh'), 'calls');
  const bin = await fakeGitHub({ log, releaseError: 'HTTP 502: Bad Gateway (https://api.github.com/repos/example/whatiiif/releases/latest)' });
  const result = await run('bash', ['engine/ci/update.sh'], { cwd: user, env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'someone/their-image' } });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /HTTP 502: Bad Gateway/);
  assert.doesNotMatch(await read(log), /pr create|tarball/);
});
