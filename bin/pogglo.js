#!/usr/bin/env node
import { main } from '../src/index.js';
main(process.argv.slice(2)).catch((err) => {
  // Errors print verbatim to stderr: rejection messages from the platform are
  // written FOR the calling AI agent to read and self-correct. Never truncate.
  console.error(err.message ?? err);
  process.exit(1);
});
