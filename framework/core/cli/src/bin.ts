#!/usr/bin/env bun

import { runCli } from "./index";

const code = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr
});

process.exit(code);
