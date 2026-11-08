const assert = require("assert");
const plugin = require("../src/plugin");

(async () => {
  assert.strictEqual(plugin.platform, "Arpey Music 聚合音源");
  assert.strictEqual(plugin.version, "0.2.0");
  assert.strictEqual(typeof plugin.search, "function");
  assert.strictEqual(typeof plugin.getMediaSource, "function");

  const empty = await plugin.search("", 1, "music");
  assert.deepStrictEqual(empty.data, []);

  const unsupported = await plugin.search("test", 1, "album");
  assert.deepStrictEqual(unsupported.data, []);

  console.log("Plugin smoke test passed (network endpoints are tested separately).");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
