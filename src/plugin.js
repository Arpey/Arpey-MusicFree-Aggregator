/**
 * Arpey MusicFree Aggregator
 * MusicFree CommonJS plugin.
 *
 * IMPORTANT:
 * Each provider must point to an API you are authorized to use.
 * The API contract is documented in README.md. No unofficial/VIP-bypass
 * endpoints are bundled.
 */
const axios = require("axios");

const VERSION = "0.1.0";
const TIMEOUT_MS = 8000;
const MAX_RESULTS_PER_PROVIDER = 20;

// Configure these with official/licensed API gateways you control or are
// authorized to call. Keep private tokens out of public repositories.
const PROVIDERS = [
  { id: "netease", name: "网易云音乐", searchEndpoint: "", playEndpoint: "", token: "" },
  { id: "qq",      name: "QQ音乐",     searchEndpoint: "", playEndpoint: "", token: "" },
  { id: "kugou",   name: "酷狗音乐",   searchEndpoint: "", playEndpoint: "", token: "" },
  { id: "kuwo",    name: "酷我音乐",   searchEndpoint: "", playEndpoint: "", token: "" },
  { id: "bilibili",name: "B站",        searchEndpoint: "", playEndpoint: "", token: "" },
];

function log(level, message, extra) {
  const prefix = `[ArpeyAggregator ${VERSION}]`;
  const fn = console && console[level] ? console[level] : console.log;
  try {
    fn(`${prefix} ${message}`, extra || "");
  } catch (_) {}
}

function cleanString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : (fallback || "");
}

function normalizeTrack(raw, provider) {
  if (!raw || raw.id === undefined || raw.id === null || !raw.title) return null;
  return {
    id: `${provider.id}:${String(raw.id)}`,
    title: cleanString(raw.title, "未知歌曲"),
    artist: cleanString(raw.artist, "未知艺术家"),
    album: cleanString(raw.album, ""),
    artwork: cleanString(raw.artwork, ""),
    duration: Number(raw.duration) || 0,
    // Keep provider identity and original ID for authorized playback lookup.
    _arpey: {
      providerId: provider.id,
      providerName: provider.name,
      originalId: String(raw.id),
      sourceUrl: cleanString(raw.url, ""),
      authorized: raw.authorized === true,
      queryTitle: cleanString(raw.title, ""),
      queryArtist: cleanString(raw.artist, ""),
    },
  };
}

function headersFor(provider) {
  const headers = { "Accept": "application/json" };
  if (provider.token) headers.Authorization = `Bearer ${provider.token}`;
  return headers;
}

/**
 * API response contract:
 * Search GET {searchEndpoint}?q=<query>&page=<page>&limit=<limit>
 * -> { data: [{id,title,artist,album,artwork,duration}], isEnd: boolean }
 */
async function searchProvider(provider, query, page) {
  if (!provider.searchEndpoint) {
    log("warn", `${provider.name}: searchEndpoint 未配置，跳过`);
    return [];
  }
  const response = await axios.get(provider.searchEndpoint, {
    params: { q: query, page, limit: MAX_RESULTS_PER_PROVIDER },
    headers: headersFor(provider),
    timeout: TIMEOUT_MS,
  });
  const body = response && response.data;
  const rows = Array.isArray(body) ? body : (body && Array.isArray(body.data) ? body.data : []);
  return rows
    .slice(0, MAX_RESULTS_PER_PROVIDER)
    .map(row => normalizeTrack(row, provider))
    .filter(Boolean);
}

function normalizeText(value) {
  return cleanString(value, "").toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[·•・_（）()【】\[\]《》"'’]/g, "");
}

function similarity(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  return 0;
}

function sortFallbackProviders(preferredId) {
  const preferred = PROVIDERS.find(p => p.id === preferredId);
  return preferred
    ? [preferred, ...PROVIDERS.filter(p => p.id !== preferredId)]
    : PROVIDERS.slice();
}

/**
 * Play API contract:
 * GET {playEndpoint}?id=<provider track id>&title=<title>&artist=<artist>&quality=<quality>
 * -> {
 *      "authorized": true,
 *      "url": "https://...",
 *      "headers": {"Referer":"..."} // optional
 *    }
 *
 * The API must enforce the user's entitlement and return only a playback URL
 * that the user is legally authorized to access.
 */
async function resolveProviderPlayback(provider, musicItem, quality) {
  if (!provider.playEndpoint) {
    throw new Error(`${provider.name}: playEndpoint 未配置`);
  }

  const meta = musicItem._arpey || {};
  const response = await axios.get(provider.playEndpoint, {
    params: {
      id: meta.providerId === provider.id ? meta.originalId : "",
      title: musicItem.title,
      artist: musicItem.artist,
      quality: quality || "standard",
    },
    headers: headersFor(provider),
    timeout: TIMEOUT_MS,
  });

  const body = response && response.data;
  if (!body || body.authorized !== true) {
    throw new Error(`${provider.name}: API 未确认该账号拥有播放权限`);
  }

  const url = cleanString(body.url, "");
  if (!/^https:\/\//i.test(url)) {
    throw new Error(`${provider.name}: 未返回有效 HTTPS 播放地址`);
  }

  return {
    url,
    headers: body.headers && typeof body.headers === "object" ? body.headers : undefined,
    userAgent: cleanString(body.userAgent, "") || undefined,
  };
}

async function getMediaSourceWithFallback(musicItem, quality) {
  const meta = musicItem && musicItem._arpey ? musicItem._arpey : {};
  const ordered = sortFallbackProviders(meta.providerId);
  const errors = [];

  for (const provider of ordered) {
    try {
      const result = await resolveProviderPlayback(provider, musicItem, quality);
      log("info", `播放源获取成功：${provider.name} / ${musicItem.title}`);
      return result;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      errors.push(`${provider.name}: ${message}`);
      log("warn", `播放源失败，尝试下一个来源：${provider.name}`, message);
    }
  }

  log("error", `所有已配置来源均无法播放：${musicItem && musicItem.title}`, errors);
  throw new Error(`没有找到可合法播放的来源。${errors.join("；")}`);
}

module.exports = {
  platform: "Arpey Music 聚合音源",
  author: "Arpey",
  version: VERSION,
  cacheControl: "no-store",
  primaryKey: ["id", "_arpey"],

  async search(query, page, type) {
    if (type && type !== "music") {
      return { isEnd: true, data: [] };
    }
    const keyword = cleanString(query, "");
    if (!keyword) return { isEnd: true, data: [] };

    const pageNo = Math.max(1, Number(page) || 1);
    const jobs = PROVIDERS.map(async provider => {
      try {
        const data = await searchProvider(provider, keyword, pageNo);
        log("info", `${provider.name} 搜索完成：${data.length} 条`);
        return data;
      } catch (error) {
        log("error", `${provider.name} 搜索异常`, error && error.message ? error.message : error);
        return [];
      }
    });

    const settled = await Promise.all(jobs);
    const all = settled.flat();

    // Remove exact duplicate title+artist results but retain different versions.
    const seen = new Set();
    const unique = all.filter(item => {
      const key = `${normalizeText(item.title)}::${normalizeText(item.artist)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { isEnd: all.length < MAX_RESULTS_PER_PROVIDER, data: unique };
  },

  async getMediaSource(musicItem, quality) {
    if (!musicItem || !musicItem.title) {
      throw new Error("缺少歌曲信息，无法解析播放源");
    }
    return getMediaSourceWithFallback(musicItem, quality);
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
