// The scripts in engine/ci are what the workflows run, so they are tested by running them. GitHub itself is stood
// in for by a `gh` on the PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { commit, git, repo as template, run, templateCopy } from './support/harness.js';
import { tempDir } from './support/tmp.js';

const read = (path) => readFile(path, 'utf8');
const script = (name) => join(template, 'engine/ci', name);

/** Runs has-image.js in a repository whose content/ holds the given files; returns what it told the workflow. */
async function lookForImage(...files) {
  const repo = await tempDir('repo');
  await mkdir(join(repo, 'content'));
  for (const file of files) await writeFile(join(repo, 'content', file), 'x');
  const output = join(repo, 'github-output');
  await writeFile(output, '');
  const { stdout } = await run('node', [script('has-image.js')], { cwd: repo, env: { GITHUB_OUTPUT: output } });
  return { output: await read(output), stdout };
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

test('has-image.js needs nothing installed: the Deploy workflow runs it before installing any packages', async () => {
  const repo = await tempDir('repo');
  await cp(join(template, 'engine'), join(repo, 'engine'), { recursive: true, filter: (path) => !path.includes('node_modules') });
  await mkdir(join(repo, 'content'));
  await writeFile(join(repo, 'content/harbour.tif'), 'x');
  const result = await run('node', ['engine/ci/has-image.js'], { cwd: repo, env: { GITHUB_OUTPUT: join(repo, 'output') } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await read(join(repo, 'output')), 'image=true\n');
});

/**
 * A `gh` on the PATH that knows one upstream release, held in `upstream`, and writes what it was asked to `log`.
 * With `releaseError`, asking for the latest release fails with that message instead, as the real `gh` does.
 */
async function fakeGitHub({ upstream, tag, releaseError }) {
  const bin = await tempDir('bin');
  const log = join(bin, 'calls');
  const releaseView = releaseError ? `echo "${releaseError}" >&2; exit 1` : `echo "${tag}"`;
  await writeFile(
    join(bin, 'gh'),
    `#!/bin/bash
echo "$*" >> "${log}"
case "$1 $2" in
  "release view") ${releaseView} ;;
  "api repos/example/whatiiif/tarball/${tag}") tar -czf - -C "${upstream}/.." --exclude .git --exclude node_modules "$(basename "${upstream}")" ;;
  "pr create") while [ $# -gt 0 ]; do [ "$1" = --body ] && printf '%s' "$2" > "${log}.body"; shift; done ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
`,
  );
  await chmod(join(bin, 'gh'), 0o755);
  await writeFile(log, '');
  return { bin, calls: () => read(log), body: () => read(`${log}.body`) };
}

/** A copy of the template that updates from example/whatiiif, on `version` if given. */
async function userCopy(version) {
  const user = await templateCopy();
  await writeFile(join(user, 'engine/UPSTREAM'), 'example/whatiiif\n');
  if (version) await writeFile(join(user, 'engine/VERSION'), `${version}\n`);
  await commit(user, 'Point at upstream');
  return user;
}

/** Upstream on `version`, with whatever else `change` does to it. */
async function release(version, change = async () => {}) {
  const upstream = await templateCopy();
  await writeFile(join(upstream, 'engine/VERSION'), `${version}\n`);
  await change(upstream);
  await commit(upstream, `Release ${version}`);
  return upstream;
}

const update = (cwd, gh, repository = 'someone/their-image') =>
  run('bash', ['engine/ci/update.sh'], { cwd, env: { PATH: `${gh.bin}:${process.env.PATH}`, GITHUB_REPOSITORY: repository } });

test('a newer release replaces the engine on a branch, leaves content/ alone and opens a pull request', async () => {
  // Upstream has moved on: a new version, a change inside the engine, a file gone, and a workflow edited.
  const upstream = await release('9.9.9', async (dir) => {
    await writeFile(join(dir, 'engine/lib/new-in-999.js'), 'export const added = true;\n');
    await git(dir, ['rm', '-q', 'engine/lib/budget.js']);
    await writeFile(join(dir, '.github/workflows/deploy.yml'), `${await read(join(dir, '.github/workflows/deploy.yml'))}# changed upstream\n`);
  });

  // The user is on the old release, has their own image and settings, and pushes to their own remote.
  const user = await userCopy();
  await writeFile(join(user, 'content/harbour.jpg'), 'my image');
  await writeFile(join(user, 'content/whatiiif.toml'), 'title = "Mine"\n');
  await commit(user, 'My image');
  const origin = await tempDir('origin');
  await git(origin, ['init', '-q', '--bare']);
  await git(user, ['remote', 'add', 'origin', origin]);
  const oldVersion = (await read(join(user, 'engine/VERSION'))).trim();

  const gh = await fakeGitHub({ upstream, tag: 'v9.9.9' });
  const result = await update(user, gh);
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
  assert.match(await gh.calls(), /pr create --title Update whatiiif to 9\.9\.9/);
  const body = await gh.body();
  assert.match(body, new RegExp(`from \\*\\*example/whatiiif\\*\\* ${oldVersion.replaceAll('.', '\\.')} → 9\\.9\\.9`));
  assert.match(body, /Your `content\/` is untouched/);
  assert.match(body, /Workflow files changed upstream.*copy them over by hand/s);
});

test('changes to workflows that only run in the template itself are not passed on as work to do', async () => {
  const upstream = await release('9.9.9', async (dir) => {
    for (const file of ['ci.yml', 'live.yml']) {
      await writeFile(join(dir, '.github/workflows', file), `${await read(join(dir, '.github/workflows', file))}# changed upstream\n`);
    }
  });
  const user = await userCopy();
  const origin = await tempDir('origin');
  await git(origin, ['init', '-q', '--bare']);
  await git(user, ['remote', 'add', 'origin', origin]);

  const gh = await fakeGitHub({ upstream, tag: 'v9.9.9' });
  const result = await update(user, gh);
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(await gh.body(), /Workflow files changed upstream/);
});

const leftAlone = async (user, gh) => {
  assert.doesNotMatch(await gh.calls(), /pr create|tarball/);
  assert.equal((await git(user, ['branch', '--list', 'whatiiif-update-*'])).stdout, '');
};

test('a repository already on the latest release is left alone', async () => {
  const user = await userCopy('0.2.1');
  const gh = await fakeGitHub({ upstream: user, tag: 'v0.2.1' });
  const result = await update(user, gh);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Already on the latest release \(0\.2\.1\)/);
  await leftAlone(user, gh);
});

test('a repository newer than the latest release, made from the template between releases, is not offered a downgrade', async () => {
  const user = await userCopy('0.10.0');
  const gh = await fakeGitHub({ upstream: user, tag: 'v0.9.1' });
  const result = await update(user, gh);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /0\.10\.0 is newer than the latest release \(0\.9\.1\), so there is nothing to update to/);
  await leftAlone(user, gh);
});

test('a template that has not published a release yet is left alone, and that is not a failure', async () => {
  const user = await userCopy();
  // What the real gh says, word for word, when a repository has no releases.
  const gh = await fakeGitHub({ releaseError: 'release not found' });
  const result = await update(user, gh);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /example\/whatiiif has not published a release yet, so there is nothing to update to\./);
  await leftAlone(user, gh);
});

test('when GitHub cannot say what the latest release is, the update fails and passes on why', async () => {
  const user = await userCopy();
  const gh = await fakeGitHub({ releaseError: 'HTTP 502: Bad Gateway (https://api.github.com/repos/example/whatiiif/releases/latest)' });
  const result = await update(user, gh);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /HTTP 502: Bad Gateway/);
  await leftAlone(user, gh);
});

test('the update workflow does nothing, successfully, in the template repository itself', async () => {
  const user = await userCopy();
  const gh = await fakeGitHub({ releaseError: 'any call to gh means the script went looking for a release' });
  const result = await update(user, gh, 'example/whatiiif');

  assert.equal(result.code, 0, result.stderr);
  assert.equal(await gh.calls(), '');
});
