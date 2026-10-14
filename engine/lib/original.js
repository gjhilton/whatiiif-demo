import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname } from 'node:path';

const run = promisify(execFile);

/**
 * Whether git stores `file` as a Git LFS pointer. The checked-out file is the real image either way, and
 * .gitattributes only says what should happen: an image uploaded on github.com, or committed without
 * git-lfs installed, is stored whole whatever the attributes say.
 */
export async function committedToLfs(file) {
  try {
    // A pointer is about 130 bytes; anything that overflows the buffer is a real image.
    const { stdout } = await run('git', ['cat-file', '-p', `HEAD:./${basename(file)}`], { cwd: dirname(file), maxBuffer: 1024 });
    return stdout.startsWith('version https://git-lfs.github.com/spec/v1');
  } catch {
    return false;
  }
}

/** Public URL of the original committed file, or undefined when not running against a GitHub repo. */
export function originalUrl({ repo, ref, path, lfs }) {
  if (!repo) return undefined;
  // The media host serves only LFS objects (404 for anything else); the raw host would serve the pointer text.
  const host = lfs ? 'media.githubusercontent.com/media' : 'raw.githubusercontent.com';
  const encoded = `${ref}/${path}`.split('/').map(encodeURIComponent).join('/');
  return `https://${host}/${repo}/${encoded}`;
}
