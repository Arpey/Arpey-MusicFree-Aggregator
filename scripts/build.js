const fs = require("fs");
const path = require("path");
const source = path.join(__dirname, "..", "src", "plugin.js");
const outputDir = path.join(__dirname, "..", "dist");
const output = path.join(outputDir, "ArpeyMusicAggregator.js");
fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(source, output);
console.log(`Built: ${output}`);
