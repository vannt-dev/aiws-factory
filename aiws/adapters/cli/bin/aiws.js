#!/usr/bin/env node
import { main } from '../src/cli.js';
import { AiwsError } from '../src/util.js';

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((err) => {
    if (err instanceof AiwsError) {
      process.stderr.write(`aiws: ${err.message}\n`);
      process.exitCode = err.exitCode;
    } else {
      process.stderr.write(`aiws: unexpected error\n${err.stack ?? err}\n`);
      process.exitCode = 1;
    }
  });
