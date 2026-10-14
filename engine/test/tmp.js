import { mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every test temp dir lives under one root that is removed when the test process exits,
// so fixtures (tens of MB each) never pile up in the system temp directory.
const root = mkdtempSync(join(tmpdir(), 'whatiiif-test-'));
process.on('exit', () => rmSync(root, { recursive: true, force: true }));

export const tempDir = (name) => mkdtemp(join(root, `${name}-`));
