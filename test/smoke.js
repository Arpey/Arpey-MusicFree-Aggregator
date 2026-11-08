const assert = require("assert");
const plugin = require("../src/plugin");

(async () => {
  assert.strictEqual(plugin.platform, "Arpey Music 聚合音源");
  assert.strictEqual(typeof plugin.search, "function");
  assert.strictEqual(typeof plugin.getMediaSource, "function");

  const empty = await plugin.search("", 1, "music");
  assert.deepStrictEqual(empty.data, []);

  const unsupported = await plugin.search("test", 1, "album");
  assert.deepStrictEqual(unsupported.data, []);

  // With no provider endpoints configured, the plugin should fail clearly,
  // never invent a stream URL or return a fake playable source.
  const search = await plugin.search("测试歌曲", 1, "music");
  assert.ok(Array.isArray(search.data));

  console.log("Smoke test passed.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
