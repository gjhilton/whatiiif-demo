// The documents: the README, and docs/ beside it. Every link from one to another, or to a heading, goes somewhere, and
// the README, the Quickstart and the page for LLMs each lead to the others.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { repo } from './support/harness.js';

const documents = async () => ['README.md', ...(await readdir(join(repo, 'docs'))).filter((name) => name.endsWith('.md')).map((name) => `docs/${name}`)];
/** A document's text, without its code, whose links and headings are examples. */
const prose = async (path) => (await readFile(join(repo, path), 'utf8')).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
/** The anchors GitHub gives a document's headings. */
const anchors = async (path) => {
  const seen = new Map();
  return new Set(
    [...(await prose(path)).matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) => {
      const slug = heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
      const count = seen.get(slug) ?? 0;
      seen.set(slug, count + 1);
      return count ? `${slug}-${count}` : slug;
    }),
  );
};
/** The links a document makes to files in this repository, and headings, as paths from the top of it. */
const links = async (path) =>
  [...(await prose(path)).matchAll(/\]\(([^)\s]+)\)/g)]
    .map(([, href]) => href)
    .filter((href) => !/^[a-z]+:/i.test(href))
    .map((href) => {
      const [file, anchor] = href.split('#');
      return { href, file: file ? relative(repo, join(repo, dirname(path), file)) : path, anchor };
    });

test('every link between the documents, and to a heading in one, goes somewhere', async () => {
  const broken = [];
  for (const path of await documents()) {
    for (const { href, file, anchor } of await links(path)) {
      const exists = await stat(join(repo, file)).then(() => true, () => false);
      if (!exists) broken.push(`${path}: ${href} (no ${file})`);
      else if (anchor && file.endsWith('.md') && !(await anchors(file)).has(anchor)) broken.push(`${path}: ${href} (no heading #${anchor} in ${file})`);
    }
  }
  assert.deepEqual(broken, []);
});

test('the README, the Quickstart and the page for LLMs each lead to the others', async () => {
  const leadsTo = async (from, to) => (await links(from)).some(({ file }) => file === to);
  for (const [from, to] of [
    ['README.md', 'docs/QUICKSTART.md'],
    ['README.md', 'docs/FOR-LLMS.md'],
    ['docs/QUICKSTART.md', 'docs/FOR-LLMS.md'],
    ['docs/QUICKSTART.md', 'README.md'],
    ['docs/FOR-LLMS.md', 'docs/QUICKSTART.md'],
    ['docs/FOR-LLMS.md', 'README.md'],
  ]) {
    assert.ok(await leadsTo(from, to), `${from} leads to ${to}`);
  }
});
