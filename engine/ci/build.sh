#!/usr/bin/env bash
# Run by the deploy workflow on a GitHub runner. Locally, just run `npm run build`.
set -euo pipefail

npm ci --omit=dev # only what building a site needs; devDependencies are for developing the template
npm run build
