# Arpey MusicFree Aggregator

一个面向 MusicFree 安卓版与桌面版的 CommonJS 聚合插件框架。

## 重要说明

本项目**不会内置网易云、QQ音乐、酷狗、酷我或 B 站的非官方解析接口**，也不会破解会员、绕过 DRM、规避地区/版权限制。

五个平台的搜索与播放适配器都已预留，但要真正启用某个平台，必须配置你有权使用的官方 API、合作 API，或你自己运营且已取得相应授权的服务端。没有配置时，插件会跳过该平台并写日志，不会伪造播放链接。

MusicFree 插件协议本身是 CommonJS 模块；主要入口为 `search(query, page, type)` 和 `getMediaSource(mediaItem, quality)`。桌面版与安卓版均可安装 `.js` 插件，具体请以当前客户端版本为准。

## 项目结构

```text
Arpey-MusicFree-Aggregator/
├─ src/
│  └─ plugin.js             # 插件主程序：五平台并行搜索、去重、播放回退
├─ dist/
│  └─ ArpeyMusicAggregator.js # 构建后直接安装到 MusicFree
├─ scripts/
│  └─ build.js              # 构建脚本
├─ test/
│  └─ smoke.js              # Node.js 冒烟测试
├─ package.json
└─ README.md
```

## Windows 开发环境

安装 Node.js 18 或更高版本，然后在项目目录打开 PowerShell：

```powershell
npm install
npm test
npm run build
```

构建产物：

```text
dist\ArpeyMusicAggregator.js
```

在 MusicFree：
- 安卓：设置 / 插件设置 / 从本地安装，选择该 JS 文件。
- 桌面：插件管理 / 从本地安装，选择该 JS 文件。

## 接入平台 API 的统一契约

为了避免每个平台的数据结构不同，建议先由你有权调用的 API 网关统一成下面的 JSON。

### 1. 搜索接口

插件会向每个平台配置的 `searchEndpoint` 发起 GET 请求：

```text
GET /search?q=关键词&page=1&limit=20
Authorization: Bearer <token>   # 配置 token 时才发送
```

返回：

```json
{
  "isEnd": true,
  "data": [
    {
      "id": "provider-track-id",
      "title": "歌曲名",
      "artist": "歌手",
      "album": "专辑",
      "artwork": "https://example.com/cover.jpg",
      "duration": 213000
    }
  ]
}
```

### 2. 授权播放接口

插件会按优先顺序尝试 `playEndpoint`。先尝试歌曲所属平台，再尝试其他已配置平台：

```text
GET /play?id=provider-track-id&title=歌曲名&artist=歌手&quality=standard
Authorization: Bearer <token>
```

成功响应必须明确返回授权状态：

```json
{
  "authorized": true,
  "url": "https://合法授权的实际音频地址",
  "headers": {
    "Referer": "https://provider.example/"
  }
}
```

未授权、无权限、无版权或没有真实 HTTPS 地址时，接口必须返回 `authorized: false` 或错误状态。插件会继续尝试下一个来源。

**注意：** 自动回退只能处理“获取播放地址阶段”的失败。如果某个 CDN 在 MusicFree 开始播放后才断流，插件协议没有提供播放器运行时的逐段播放失败回调，因此无法保证在所有断流场景下无缝切换。

## 配置五个平台

编辑 `src/plugin.js` 顶部的 `PROVIDERS` 数组，将每个平台的：

- `searchEndpoint`：你有权使用的搜索接口
- `playEndpoint`：你有权使用的授权播放接口
- `token`：服务端签发的访问令牌（不要提交到公开 Git 仓库）

填好后执行：

```powershell
npm test
npm run build
```

重新安装 `dist/ArpeyMusicAggregator.js`。

### 当前默认状态

五个平台的接口地址与令牌默认为空。因此，项目下载后可以构建、安装、运行和测试，但在配置授权 API 前不会返回实际歌曲结果。这是有意设计的安全默认值。

## 日志

插件使用 `console.info / warn / error` 输出：
- 哪个平台未配置
- 各平台搜索结果数量
- 单个平台请求异常
- 播放回退尝试顺序
- 全部来源失败原因

日志具体显示位置取决于 MusicFree 客户端版本和调试环境。

## 开发顺序建议

1. 先取得一个平台的正式 API/合作 API 访问权限，打通搜索和播放。
2. 再逐个平台接入，先验证账号权限与版权范围。
3. 为每个平台补充单元测试、超时与限流策略。
4. 最后做匹配评分（歌名、歌手、时长、版本）和缓存。
