# Arpey MusicFree Aggregator

MusicFree 插件 + 自建 Node.js 聚合服务端。支持把多个**合法授权**的上游搜索/播放 API 统一成一个服务。

## 当前版本：0.2.0

- MusicFree 插件只请求统一服务端。
- 服务端提供健康检查、平台状态、并行搜索、去重、播放地址回退。
- 支持网易云、QQ音乐、酷狗、酷我、B站五个上游配置槽位。
- 未配置上游时会明确返回空结果；不会伪造歌曲或播放 URL。
- 播放响应必须 `authorized: true` 且为 HTTPS。

## 目录

```text
server/                 # 自建 Node.js API 服务
  index.js
  .env.example
  README.md
src/plugin.js           # MusicFree 客户端插件源码
dist/ArpeyMusicAggregator.js
scripts/build.js
test/
```

## 第一步：启动服务端（Windows）

安装 Node.js 18+，下载仓库后打开 PowerShell：

```powershell
cd Arpey-MusicFree-Aggregator
Copy-Item server/.env.example server/.env
notepad server/.env
node server/index.js
```

检查服务：
- http://127.0.0.1:8787/api/health
- http://127.0.0.1:8787/api/providers

服务端默认监听 `0.0.0.0:8787`。当前没有配置上游时，health 会正常，但搜索结果仍为空。这是正常现象。

## 第二步：让手机访问电脑

安卓手机和 Windows 电脑连接同一个 Wi-Fi。在 Windows PowerShell 运行：

```powershell
ipconfig
```

找到当前 Wi-Fi 网卡的 IPv4 地址，例如 `192.168.1.20`。在 `src/plugin.js` 把：

```js
const API_BASE_URL = "http://127.0.0.1:8787";
```

改成：

```js
const API_BASE_URL = "http://192.168.1.20:8787";
```

在 Windows 防火墙中允许专用网络入站 TCP 8787。手机浏览器打开 `http://192.168.1.20:8787/api/health`，看到 `ok: true` 才说明手机已连通电脑服务端。

桌面版和服务端在同一台电脑时可使用 `127.0.0.1`。手机不能把自己的 `127.0.0.1` 当作电脑地址。

如果要在外网使用，应部署到 VPS 并配置 HTTPS；不要把未鉴权服务直接暴露到公网。

## 第三步：构建并安装插件

```powershell
npm install
npm test
npm run build
```

安装 `dist/ArpeyMusicAggregator.js` 到 MusicFree。每次修改 `API_BASE_URL` 后都要重新构建并重新安装更新后的 JS。

## 上游接口配置（必须有授权）

在 `server/.env` 配置对应平台的 `*_SEARCH_URL`、`*_PLAY_URL`、`*_TOKEN`。具体统一契约和样例见 [server/README.md](server/README.md)。

当前仓库只实现了聚合网关与适配协议，并未内置任何平台的非官方解析器，也没有自动获得平台 API 权限。未取得授权 API 前，服务端不会凭空产生歌曲列表或音频地址。

## API

- `GET /api/health`
- `GET /api/providers`
- `GET /api/search?q=关键词&page=1`
- `GET /api/play?provider=qq&id=上游歌曲ID&title=歌曲名&artist=歌手&quality=standard`

详见 [server/README.md](server/README.md)。
