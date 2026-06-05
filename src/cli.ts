#!/usr/bin/env node
import { runCli } from "./cli-main.js";

process.exit(await runCli(process.argv));
