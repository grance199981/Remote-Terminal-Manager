const fs = require("node:fs");
const path = require("node:path");

const dist = path.resolve(__dirname, "..", "dist");
const appRoot = path.resolve(__dirname, "..");

if (!dist.startsWith(appRoot + path.sep)) {
  throw new Error(`Refusing to delete unsafe path: ${dist}`);
}

fs.rmSync(dist, { recursive: true, force: true });
