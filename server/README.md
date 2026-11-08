# Arpey Aggregator API Server

Node.js 18+ service. No server-side npm dependencies required.

## Start on Windows

```powershell
cd server
Copy-Item .env.example .env
# Edit .env with authorized upstream API endpoints
node index.js
```

Check:
- http://127.0.0.1:8787/api/health
- http://127.0.0.1:8787/api/providers
- http://127.0.0.1:8787/api/search?q=test

## API routes

- `GET /api/health`
- `GET /api/providers`
- `GET /api/search?q=keyword&page=1`
- `GET /api/play?provider=qq&id=source-id&title=title&artist=artist&quality=standard`

## Upstream contract

For each provider, set `*_SEARCH_URL` and `*_PLAY_URL` in `.env`. The server adds query parameters and optional `Authorization: Bearer <*_TOKEN>`.

Search upstream response:
```json
{
  "isEnd": true,
  "data": [
    {
      "id": "source-track-id",
      "title": "Song",
      "artist": "Artist",
      "album": "Album",
      "artwork": "https://example.com/cover.jpg",
      "duration": 210000
    }
  ]
}
```

Playback upstream response:
```json
{
  "authorized": true,
  "url": "https://licensed-cdn.example/audio",
  "headers": {}
}
```

The server rejects playback responses unless `authorized` is exactly `true` and the media URL is HTTPS. Configure only official, licensed, or otherwise authorized upstream APIs. The server is an adapter/router, not a source of music rights and does not scrape or bypass paid access.

## Android access

On the same Wi-Fi, use the Windows PC's LAN IPv4 address in the plugin, for example `http://192.168.1.20:8787`. Allow inbound TCP port 8787 in Windows Firewall for Private networks. Do not use `127.0.0.1` on Android: that points to the phone itself.

For access outside the home network, deploy behind HTTPS on a VPS/reverse proxy. Do not expose an unauthenticated server to the public internet. If enabling `API_TOKEN`, configure the same token in a private plugin build; never commit real credentials to this public repository.
