// whatiiif on real GitHub, the way someone new to it might go about it, in a public repository made from the
// template with "Use this template" and deleted afterwards. Run by hand, logged in with gh; about fifteen minutes:
//
//   npm run test:live
//
// The repository holds this commit of the template, so a change can be tried here before it is merged.
// Deleting the repository needs `gh auth refresh -s delete_repo` once; without that, the test says which
// repository to delete by hand.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makePhonePhoto, makeRepeatedNoise } from '../fixtures.js';
import { tempDir } from '../tmp.js';
import { repo as template, run } from '../e2e/harness.js';

const exec = promisify(execFile);
const MINUTE = 60_000;

async function gh(...args) {
  const result = await run('gh', args);
  if (result.code !== 0) throw new Error(`gh ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}
const ghJson = async (...args) => JSON.parse(await gh(...args));

/** Asks `condition` every ten seconds (GitHub's API has a rate limit) until it gives something truthy. */
async function poll(condition, what, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

const owner = await gh('api', 'user', '--jq', '.login');
const name = `whatiiif-trial-${Date.now().toString(36)}`;
const repository = `${owner}/${name}`;
const siteUrl = `https://${owner.toLowerCase()}.github.io/${name}`;
const upstream = (await readFile(join(template, 'engine/UPSTREAM'), 'utf8')).trim();

// Git with an identity, pushing as the gh login over HTTPS. Git LFS only where a step asks for it.
const AS_ME = ['-c', 'user.name=whatiiif live test', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
  '-c', 'commit.gpgsign=false', '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'];
const NO_LFS = ['-c', 'filter.lfs.clean=', '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.process=', '-c', 'filter.lfs.required=false'];
const git = (cwd, args, { lfs = false } = {}) =>
  exec('git', [...AS_ME, ...(lfs ? [] : NO_LFS), ...args], { cwd, env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' }, maxBuffer: 64 * 1024 * 1024 });

/** The Deploy run GitHub started for a commit. */
const deployRunFor = (sha) =>
  poll(async () => (await ghJson('run', 'list', '-R', repository, '--workflow', 'Deploy', '--commit', sha, '--json', 'databaseId'))[0]?.databaseId,
    `Deploy to start for ${sha}`, 5 * MINUTE);

/** A run once it has finished, on the given attempt (a re-run is attempt 2). */
const finished = (id, { attempt = 1, timeout = 15 * MINUTE } = {}) =>
  poll(async () => {
    const view = await ghJson('run', 'view', String(id), '-R', repository, '--json', 'status,conclusion,attempt');
    return view.attempt === attempt && view.status === 'completed' && view;
  }, `run ${id} to finish`, timeout);

async function checkSite() {
  const result = await run('node', ['--test', 'engine/test/e2e/check-site.js'], { cwd: template, env: { E2E_SITE_URL: siteUrl } });
  assert.equal(result.code, 0, `check-site.js against ${siteUrl}:\n${result.stdout}${result.stderr}`);
}

let work;
let firstRun;

before(async () => {
  await gh('repo', 'create', repository, '--template', upstream, '--public', '--description', 'A short-lived test of whatiiif; deleted when the test ends');
  // GitHub copies the template a moment after saying the repository exists.
  await poll(async () => (await run('gh', ['api', `repos/${repository}/contents/engine/VERSION`])).code === 0, 'the template to be copied', 2 * MINUTE);

  // Replace the template's files with this commit's, keeping content/, as deploy-demo.sh does.
  work = join(await tempDir('live'), name);
  await git(template, ['clone', '-q', `https://github.com/${repository}.git`, work]);
  await git(work, ['rm', '-q', '-r', '--', '.', ':!content']);
  const { stdout: top } = await exec('git', ['ls-tree', '--name-only', 'HEAD'], { cwd: template });
  const entries = top.split('\n').filter((entry) => entry && entry !== 'content');
  await exec('bash', ['-c', 'git archive HEAD -- "$@" | tar -x -C "$0"', work, ...entries], { cwd: template });
  await git(work, ['add', '-A']);
  if ((await run('git', ['diff', '--cached', '--quiet'], { cwd: work })).code !== 0) {
    await git(work, ['commit', '-q', '-m', 'The template as it is being tested']);
    await git(work, ['push', '-q', 'origin', 'HEAD']);
  }
});

after(async () => {
  const deleted = await run('gh', ['repo', 'delete', repository, '--yes']);
  if (deleted.code !== 0) console.log(`Delete https://github.com/${repository} by hand: ${deleted.stderr.trim()}`);
});

test('a picture uploaded before Pages is switched on fails, saying how to switch it on', { timeout: 20 * MINUTE }, async () => {
  // Uploaded on github.com: one commit, the file stored whole.
  const photo = await makePhonePhoto();
  const request = join(await tempDir('upload'), 'request.json');
  await writeFile(request, JSON.stringify({ message: 'Add files via upload', content: (await readFile(photo)).toString('base64') }));
  const { commit } = await ghJson('api', '-X', 'PUT', `repos/${repository}/contents/content/harbour.jpg`, '--input', request);

  firstRun = await deployRunFor(commit.sha);
  assert.equal((await finished(firstRun)).conclusion, 'failure');
  const jobs = await ghJson('api', `repos/${repository}/actions/runs/${firstRun}/jobs`);
  const deploy = jobs.jobs.find((job) => job.name === 'deploy');
  const messages = await ghJson('api', `repos/${repository}/check-runs/${deploy.id}/annotations`, '--jq', '[.[].message]');
  assert.ok(
    messages.includes("GitHub Pages is not enabled. Go to Settings > Pages and set Source to 'GitHub Actions', then re-run this workflow."),
    `the run's messages were: ${messages.join(' | ')}`,
  );
});

test('after switching Pages on, re-running the failed jobs publishes the site', { timeout: 20 * MINUTE }, async () => {
  await gh('api', '-X', 'POST', `repos/${repository}/pages`, '-f', 'build_type=workflow');
  await gh('run', 'rerun', String(firstRun), '-R', repository, '--failed');
  assert.equal((await finished(firstRun, { attempt: 2 })).conclusion, 'success');
  await checkSite();
});

test('a picture too big for the browser goes through Git LFS, and a site near the Pages limit leaves out the full-size JPEG', { timeout: 40 * MINUTE }, async () => {
  // About 776 MB of tiles at quality 100: under the 900 MB budget alone, over it with the full-size JPEG.
  const picture = await makeRepeatedNoise(21_504);
  const file = `Survey sheet ${basename(picture)}`;
  await git(work, ['pull', '-q', '--ff-only'], { lfs: true });
  await git(work, ['lfs', 'install', '--local'], { lfs: true });
  await git(work, ['rm', '-q', 'content/harbour.jpg']);
  await exec('cp', [picture, join(work, 'content', file)]);
  await writeFile(join(work, 'content/whatiiif.toml'), '[tiles]\nquality = 100\n');
  await git(work, ['add', '-A'], { lfs: true });
  await git(work, ['commit', '-q', '-m', 'A bigger picture, through Git LFS'], { lfs: true });
  await git(work, ['push', '-q', 'origin', 'HEAD'], { lfs: true });
  const { stdout: pointer } = await git(work, ['cat-file', '-p', `HEAD:content/${file}`]);
  assert.match(pointer, /^version https:\/\/git-lfs\.github\.com\/spec\/v1\n/, 'git holds a pointer, not the picture');

  const { stdout: sha } = await git(work, ['rev-parse', 'HEAD']);
  const id = await deployRunFor(sha.trim());
  assert.equal((await finished(id, { timeout: 35 * MINUTE })).conclusion, 'success');
  // A run's log can take a moment to be available after the run has finished.
  const log = await poll(async () => {
    const { code, stdout } = await run('gh', ['run', 'view', String(id), '-R', repository, '--log']);
    return code === 0 && stdout.includes('Done:') && stdout;
  }, `the log of run ${id}`, 5 * MINUTE);
  assert.match(log, /Site was over the Pages size budget, so the full-size download \(full\/max\) was left out\./);
  const megabytes = Number(log.match(/Done: (\d+) MB of IIIF files/)?.[1]);
  assert.ok(megabytes > 700 && megabytes < 900, `the site holds ${megabytes} MB of IIIF files`);

  const site = await (await fetch(`${siteUrl}/site.json`)).json();
  assert.equal(site.fullUrl, undefined, 'no full-size download is offered');
  assert.equal(site.originalUrl, `https://media.githubusercontent.com/media/${repository}/main/content/${encodeURIComponent(file)}`);
  const original = await fetch(site.originalUrl);
  assert.equal(original.ok, true, `the original is downloadable from ${site.originalUrl}`);
  assert.equal((await original.arrayBuffer()).byteLength, (await stat(picture)).size, 'the original is the picture itself, not its pointer');
  await checkSite();
});
