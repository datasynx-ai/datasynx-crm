import { chmodSync } from "fs";
import { existsSync } from "fs";

const cliFiles = ["dist/cli.js", "dist/cli.cjs"];
for (const f of cliFiles) {
  if (existsSync(f)) chmodSync(f, 0o755);
}
