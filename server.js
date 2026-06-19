const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const INNERTUBE_KEY = 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39o';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.projectsegfau.lt',
  'https://pipedapi.adminforge.de',
];

const ALLOWED_PROXY_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'pipedproxy.kavin.rocks',
  'pipedproxy.adminforge.de',
  'pipedproxy.projectsegfau.lt',
  'ytpipedproxy.tiekoetter.com',
  'piped-proxy.garudalinux.org',
]);

// Simple in-memory cache
const cache = new Map();
function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) { cache.delete(key); return null; }
  return e.value;
}
function cacheSet(key, value, ttlMs) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.get('/health', (req, res) => res.send('ok'));

app.get('/', async (req, res) => {
  const { action, v, url } = req.query;
  if (action === 'tracks') {
    if (!v) return res.status(400).json({ error: 'missing_id' });
    return handleTracks(v, res);
  }
  if (url) return handleProxy(url, res);
  res.status(400).send('Missing action or url parameter');
});

// ── Tracks ────────────────────────────────────────────────────────────────────

async function handleTracks(videoId, res) {
  const cached = cacheGet('tracks_' + videoId);
  if (cached) return res.json(cached);

  const result = await fetchTracks(videoId);
  if (!result.error) cacheSet('tracks_' + videoId, result, 10 * 60 * 1000);
  res.json(result);
}

async function fetchTracks(videoId) {
  const r = await fetchTracksInnerTube(videoId);
  if (!r.error) return r;
  const p = await fetchTracksViaPiped(videoId);
  if (!p.error) return p;
  return fetchTracksViaYtDlp(videoId);
}

async function fetchTracksInnerTube(videoId) {
  const clients = [
    {
      clientName: 'ANDROID',
      clientVersion: '19.09.37',
      extra: { androidSdkVersion: 30 },
      headerName: '3',
      ua: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
    },
    {
      clientName: 'TVHTML5',
      clientVersion: '7.20240101.00.00',
      extra: {},
      headerName: '7',
      ua: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
    },
    {
      clientName: 'IOS',
      clientVersion: '19.09.3',
      extra: { deviceModel: 'iPhone16,2' },
      headerName: '5',
      ua: 'com.google.ios.youtube/19.09.3 (iPhone16,2; U; CPU iOS 17_4 like Mac OS X)',
    },
    {
      clientName: 'WEB',
      clientVersion: '2.20240101.00.00',
      extra: {},
      headerName: '1',
      ua: DESKTOP_UA,
    },
  ];

  let videoExists = false;
  for (let i = 0; i < clients.length; i++) {
    if (i > 0) await sleep(600);
    const c = clients[i];
    try {
      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': c.ua,
            'X-YouTube-Client-Name': c.headerName,
            'X-YouTube-Client-Version': c.clientVersion,
          },
          body: JSON.stringify({
            videoId,
            context: { client: { clientName: c.clientName, clientVersion: c.clientVersion, hl: 'en', gl: 'US', ...c.extra } },
          }),
        }
      );
      if (res.status === 429 || !res.ok) continue;
      const data = await res.json();
      if (data?.videoDetails?.videoId) videoExists = true;
      const rawTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!rawTracks || rawTracks.length === 0) continue;
      const tracks = rawTracks
        .map(t => ({ langCode: t.languageCode || 'en', langName: (t.name?.simpleText) || t.languageCode || 'Unknown', kind: t.kind || '', baseUrl: t.baseUrl || '' }))
        .filter(t => t.baseUrl);
      if (!tracks.length) continue;
      return { title: data?.videoDetails?.title || '', tracks };
    } catch (_) { continue; }
  }
  return { error: videoExists ? 'no_captions' : 'rate_limited' };
}

async function fetchTracksViaPiped(videoId) {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        headers: { 'User-Agent': DESKTOP_UA },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) continue;
      const subtitles = data.subtitles || [];
      if (!subtitles.length) {
        if (data.title) return { error: 'no_captions' };
        continue;
      }
      const tracks = subtitles
        .map(s => ({ langCode: s.code || 'en', langName: s.name || s.code || 'Unknown', kind: s.autoGenerated ? 'asr' : '', baseUrl: s.url || '' }))
        .filter(t => t.baseUrl);
      if (!tracks.length) continue;
      return { title: data.title || '', tracks };
    } catch (_) { continue; }
  }
  return { error: 'rate_limited' };
}

async function fetchTracksViaYtDlp(videoId) {
  try {
    const youtubeDl = require('youtube-dl-exec');
    const data = await youtubeDl(`https://www.youtube.com/watch?v=${videoId}`, {
      dumpSingleJson: true,
      skipDownload: true,
      noPlaylist: true,
      noWarnings: true,
      extractorRetries: 1,
    });

    const tracks = [];

    // Manual subtitles first
    if (data.subtitles) {
      for (const [langCode, formats] of Object.entries(data.subtitles)) {
        const fmt = formats.find(f => f.ext === 'vtt' || f.ext === 'xml') || formats[0];
        if (fmt?.url) tracks.push({ langCode, langName: fmt.name || langCode, kind: '', baseUrl: fmt.url });
      }
    }

    // Auto-generated if no manual
    if (!tracks.length && data.automatic_captions) {
      for (const [langCode, formats] of Object.entries(data.automatic_captions)) {
        if (!langCode.startsWith('en')) continue; // prefer English auto-caps first
        const fmt = formats.find(f => f.ext === 'vtt') || formats[0];
        if (fmt?.url) tracks.push({ langCode, langName: (fmt.name || langCode) + ' (auto)', kind: 'asr', baseUrl: fmt.url });
      }
      if (!tracks.length) {
        for (const [langCode, formats] of Object.entries(data.automatic_captions)) {
          const fmt = formats.find(f => f.ext === 'vtt') || formats[0];
          if (fmt?.url) tracks.push({ langCode, langName: (fmt.name || langCode) + ' (auto)', kind: 'asr', baseUrl: fmt.url });
        }
      }
    }

    if (!tracks.length) return { error: 'no_captions' };
    return { title: data.title || '', tracks };
  } catch (_) {
    return { error: 'rate_limited' };
  }
}

// ── Proxy ─────────────────────────────────────────────────────────────────────

async function handleProxy(targetUrl, res) {
  let parsed;
  try { parsed = new URL(targetUrl); } catch { return res.status(400).send('Invalid URL'); }
  if (!ALLOWED_PROXY_HOSTS.has(parsed.hostname)) return res.status(403).send('Domain not allowed');
  try {
    const r = await fetch(targetUrl, { headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9' } });
    const text = await r.text();
    res.setHeader('Content-Type', r.headers.get('Content-Type') || 'text/plain; charset=utf-8');
    res.status(r.status).send(text);
  } catch (err) {
    res.status(502).send('Fetch failed: ' + err.message);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.listen(PORT, () => console.log(`yt-proxy listening on port ${PORT}`));
