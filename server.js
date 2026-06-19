const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MOBILE_UA  = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const CONSENT_COOKIE = 'CONSENT=YES+1; SOCS=CAESEwgDEgk0OTM4ODI0NjIaAmVuIAEaBgiA_LysBg';

// Simple in-memory cache with TTL
const cache = new Map();
function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.value;
}
function cacheSet(key, value, ttlMs) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

app.use((req, res, next) => {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// GET /?action=tracks&v=VIDEO_ID
// GET /?url=CAPTION_URL
app.get('/', async (req, res) => {
  const { action, v, url } = req.query;

  if (action === 'tracks') {
    if (!v) return res.status(400).json({ error: 'missing_id' });
    return handleTracks(v, res);
  }

  if (url) {
    return handleProxy(url, res);
  }

  res.status(400).send('Missing action or url parameter');
});

async function handleTracks(videoId, res) {
  const cacheKey = 'tracks_v2_' + videoId;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const result = await fetchTracks(videoId);

  if (!result.error) {
    cacheSet(cacheKey, result, 10 * 60 * 1000); // 10 minutes
  }

  res.json(result);
}

async function fetchTracks(videoId) {
  const attempts = [
    { url: `https://www.youtube.com/watch?v=${videoId}&hl=en&gl=US`, ua: DESKTOP_UA },
    { url: `https://m.youtube.com/watch?v=${videoId}&hl=en&gl=US`,   ua: MOBILE_UA  },
    { url: `https://www.youtube.com/watch?v=${videoId}&hl=en&gl=US`, ua: DESKTOP_UA },
  ];

  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await sleep(1500);
    try {
      const { url, ua } = attempts[i];
      const response = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': CONSENT_COOKIE,
        },
      });

      if (response.status === 429) continue;
      if (!response.ok) return { error: 'http_' + response.status };

      const html = await response.text();
      const tracks = extractTracks(html);
      if (!tracks || tracks.length === 0) continue;

      return { title: extractTitle(html), tracks };
    } catch (_) { continue; }
  }

  return { error: 'rate_limited' };
}

async function handleProxy(targetUrl, res) {
  let parsed;
  try { parsed = new URL(targetUrl); } catch { return res.status(400).send('Invalid URL'); }
  if (!['www.youtube.com', 'youtube.com'].includes(parsed.hostname)) {
    return res.status(403).send('Domain not allowed');
  }
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': DESKTOP_UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': CONSENT_COOKIE,
      },
    });
    const text = await response.text();
    const ct = response.headers.get('Content-Type') || 'text/xml; charset=utf-8';
    res.setHeader('Content-Type', ct);
    res.status(response.status).send(text);
  } catch (err) {
    res.status(502).send('Fetch failed: ' + err.message);
  }
}

function extractTracks(html) {
  const idx = html.indexOf('"captionTracks"');
  if (idx === -1) return null;
  const start = html.indexOf('[', idx);
  if (start === -1) return null;
  let depth = 0, i = start, inStr = false, esc = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (esc)                  { esc = false; continue; }
    if (c === '\\' && inStr)  { esc = true;  continue; }
    if (c === '"')            { inStr = !inStr; continue; }
    if (inStr)                continue;
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) break; }
  }
  try {
    return JSON.parse(html.substring(start, i + 1))
      .map(t => ({
        langCode: t.languageCode || 'en',
        langName: (t.name && t.name.simpleText) || t.languageCode || 'Unknown',
        kind: t.kind || '',
        baseUrl: t.baseUrl || '',
      }))
      .filter(t => t.baseUrl);
  } catch (_) { return null; }
}

function extractTitle(html) {
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
  if (og) return decodeEntities(og[1]);
  const t = html.match(/<title>([^<]+)<\/title>/);
  if (t) return decodeEntities(t[1]).replace(/ - YouTube$/, '').trim();
  return '';
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.listen(PORT, () => console.log(`yt-proxy listening on port ${PORT}`));
