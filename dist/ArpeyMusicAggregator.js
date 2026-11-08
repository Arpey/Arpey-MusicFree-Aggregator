/**
 * Arpey MusicFree Aggregator client plugin.
 * Set API_BASE_URL to the address reachable by your MusicFree device.
 * The server must be configured with APIs you are authorized to use.
 */
const axios = require("axios");
const VERSION = "0.2.0";
const API_BASE_URL = "http://127.0.0.1:8787"; // Android: replace with PC LAN IP or HTTPS VPS URL.
const API_TOKEN = ""; // Optional; keep real tokens out of the public repository.
const TIMEOUT_MS = 12000;

function log(level, message, extra) {
  try { (console[level] || console.log)(`[ArpeyAggregator ${VERSION}] ${message}`, extra || ""); } catch (_) {}
}
function requestHeaders() {
  const headers = { Accept: "application/json" };
  if (API_TOKEN) headers["X-API-Key"] = API_TOKEN;
  return headers;
}
function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[\s·•・_（）()【】\[\]《》"'’]/g, "");
}
function mapTrack(item) {
  return {
    id: item.id,
    title: item.title,
    artist: item.artist || "未知艺术家",
    album: item.album || "",
    artwork: item.artwork || "",
    duration: Number(item.duration) || 0,
    _arpey: {
      provider: item.provider,
      originalId: item.originalId,
    },
  };
}

module.exports = {
  platform: "Arpey Music 聚合音源",
  author: "Arpey",
  version: VERSION,
  cacheControl: "no-store",
  primaryKey: ["id", "_arpey"],

  async search(query, page, type) {
    if (type && type !== "music") return { isEnd: true, data: [] };
    if (!String(query || "").trim()) return { isEnd: true, data: [] };
    try {
      const response = await axios.get(API_BASE_URL.replace(/\/$/, "") + "/api/search", {
        params: { q: query, page: Math.max(1, Number(page) || 1) },
        headers: requestHeaders(),
        timeout: TIMEOUT_MS,
      });
      const body = response.data || {};
      const data = (Array.isArray(body.data) ? body.data : []).map(mapTrack);
      log("info", `服务端搜索完成：${data.length} 条`);
      return { isEnd: body.isEnd !== false, data };
    } catch (error) {
      log("error", "聚合服务端搜索失败", error && error.message ? error.message : error);
      throw new Error("无法连接 Arpey 聚合服务端，请检查服务端是否启动及 API_BASE_URL 是否正确。");
    }
  },

  async getMediaSource(musicItem, quality) {
    const meta = musicItem && musicItem._arpey ? musicItem._arpey : {};
    try {
      const response = await axios.get(API_BASE_URL.replace(/\/$/, "") + "/api/play", {
        params: {
          provider: meta.provider || "",
          id: meta.originalId || "",
          title: musicItem.title,
          artist: musicItem.artist || "",
          quality: quality || "standard",
        },
        headers: requestHeaders(),
        timeout: TIMEOUT_MS,
      });
      const body = response.data || {};
      if (body.authorized !== true || !/^https:\/\//i.test(String(body.url || ""))) {
        throw new Error("服务端未返回经过授权的 HTTPS 播放地址");
      }
      return { url: body.url, headers: body.headers || undefined, userAgent: body.userAgent || undefined };
    } catch (error) {
      log("error", "播放地址获取失败", error && error.message ? error.message : error);
      throw new Error("没有获取到可合法播放的音源，请检查服务端播放接口配置。");
    }
  },

  async getMusicInfo(musicItem) {
    return {
      title: musicItem.title,
      artist: musicItem.artist,
      album: musicItem.album,
      artwork: musicItem.artwork,
      duration: musicItem.duration,
    };
  },
};
