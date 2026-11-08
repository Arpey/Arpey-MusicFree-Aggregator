// Arpey MusicFree Aggregator API server (Node.js 18+, no runtime dependencies)
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const API_TOKEN = process.env.API_TOKEN || "";
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 8000);
const LIMIT = Math.min(50, Math.max(1, Number(process.env.SEARCH_LIMIT || 20)));

const PROVIDERS = [
  ["netease", "网易云音乐", "NETEASE"],
  ["qq", "QQ音乐", "QQ"],
  ["kugou", "酷狗音乐", "KUGOU"],
  ["kuwo", "酷我音乐", "KUWO"],
  ["bilibili", "B站", "BILIBILI"],
].map(([id, name, prefix]) => ({
  id, name,
  searchEndpoint: process.env[prefix + "_SEARCH_URL"] || "",
  playEndpoint: process.env[prefix + "_PLAY_URL"] || "",
  token: process.env[prefix + "_TOKEN"] || "",
}));

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Cache-Control": "no-store",
  });
  res.end(body);
}
function clean(v) { return typeof v === "string" ? v.trim() : ""; }
function norm(v) { return clean(v).toLowerCase().replace(/[\s·•・_（）()【】\[\]《》"'’]/g, ""); }
function headers(provider) {
  const h = { Accept: "application/json" };
  if (provider.token) h.Authorization = "Bearer " + provider.token;
  return h;
}
async function getJson(endpoint, params, provider) {
  const url = new URL(endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v) !== "") url.searchParams.set(k, String(v));
  }
  const response = await fetch(url, {
    method: "GET",
    headers: headers(provider),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Upstream HTTP " + response.status);
  return response.json();
}
function normalizeRows(body) {
  if (Array.isArray(body)) return body;
  return body && Array.isArray(body.data) ? body.data : [];
}
async function searchProvider(provider, q, page) {
  if (!provider.searchEndpoint) return [];
  const body = await getJson(provider.searchEndpoint, { q, page, limit: LIMIT }, provider);
  return normalizeRows(body).slice(0, LIMIT).map(row => {
    if (!row || row.id === undefined || !clean(row.title)) return null;
    return {
      id: provider.id + ":" + String(row.id),
      originalId: String(row.id),
      provider: provider.id,
      providerName: provider.name,
      title: clean(row.title),
      artist: clean(row.artist) || "未知艺术家",
      album: clean(row.album),
      artwork: clean(row.artwork),
      duration: Number(row.duration) || 0,
    };
  }).filter(Boolean);
}
async function searchAll(q, page) {
  const results = await Promise.all(PROVIDERS.map(async p => {
    try {
      const data = await searchProvider(p, q, page);
      console.info("[search]", p.id, data.length);
      return data;
    } catch (e) {
      console.warn("[search:error]", p.id, e.message);
      return [];
    }
  }));
  const seen = new Set();
  const data = results.flat().filter(item => {
    const key = norm(item.title) + "::" + norm(item.artist);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { isEnd: data.length < LIMIT, data };
}
async function resolvePlayback(params) {
  const preferred = PROVIDERS.find(p => p.id === params.provider);
  const ordered = preferred ? [preferred, ...PROVIDERS.filter(p => p.id !== preferred.id)] : PROVIDERS;
  const errors = [];
  for (const p of ordered) {
    if (!p.playEndpoint) continue;
    try {
      const body = await getJson(p.playEndpoint, {
        id: p.id === params.provider ? params.id : "",
        title: params.title,
        artist: params.artist,
        quality: params.quality || "standard",
      }, p);
      if (!body || body.authorized !== true || !/^https:\/\//i.test(clean(body.url))) {
        throw new Error("未确认授权或未返回 HTTPS 播放地址");
      }
      return { authorized: true, provider: p.id, url: body.url, headers: body.headers || undefined, userAgent: body.userAgent || undefined };
    } catch (e) {
      errors.push(p.name + ": " + e.message);
      console.warn("[play:error]", p.id, e.message);
    }
  }
  const error = new Error(errors.join("; ") || "没有配置可用的授权播放接口");
  error.status = 404;
  throw error;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  let url;
  try { url = new URL(req.url, "http://localhost"); }
  catch (_) { return send(res, 400, { error: "Bad URL" }); }

  if (API_TOKEN) {
    const supplied = req.headers["x-api-key"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (supplied !== API_TOKEN) return send(res, 401, { error: "Unauthorized" });
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, { ok: true, service: "Arpey MusicFree Aggregator", version: "0.2.0" });
  }
  if (req.method === "GET" && url.pathname === "/api/providers") {
    return send(res, 200, { data: PROVIDERS.map(p => ({ id: p.id, name: p.name, searchEnabled: !!p.searchEndpoint, playEnabled: !!p.playEndpoint })) });
  }
  if (req.method === "GET" && url.pathname === "/api/search") {
    const q = clean(url.searchParams.get("q"));
    if (!q) return send(res, 400, { error: "Missing q" });
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    try { return send(res, 200, await searchAll(q, page)); }
    catch (e) { return send(res, 500, { error: e.message }); }
  }
  if (req.method === "GET" && url.pathname === "/api/play") {
    const params = {
      provider: clean(url.searchParams.get("provider")),
      id: clean(url.searchParams.get("id")),
      title: clean(url.searchParams.get("title")),
      artist: clean(url.searchParams.get("artist")),
      quality: clean(url.searchParams.get("quality")) || "standard",
    };
    if (!params.title) return send(res, 400, { error: "Missing title" });
    try { return send(res, 200, await resolvePlayback(params)); }
    catch (e) { return send(res, e.status || 502, { authorized: false, error: e.message }); }
  }
  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.info("Arpey Aggregator API listening on http://" + HOST + ":" + PORT);
  console.info("Configured providers:", PROVIDERS.map(p => p.id + (p.searchEndpoint ? ":search" : "") + (p.playEndpoint ? ":play" : "")).join(", "));
});
