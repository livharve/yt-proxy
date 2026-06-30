const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const INNERTUBE_KEY = 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39o';

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://invidious.nerdvpn.de',
  'https://yt.cdaut.de',
  'https://invidious.projectsegfau.lt',
];

const ALLOWED_PROXY_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'inv.nadeko.net',
  'invidious.privacydev.net',
  'invidious.nerdvpn.de',
  'yt.cdaut.de',
  'invidious.projectsegfau.lt',
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

app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.get('/health', (req, res) => res.send('ok'));

// ── TTS ───────────────────────────────────────────────────────────────────────

// Default neural voice per language code
const EDGE_VOICES = {
  en: 'en-US-AriaNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
  'zh-TW': 'zh-TW-HsiaoChenNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  pt: 'pt-BR-FranciscaNeural',
  id: 'id-ID-GadisNeural',
  ar: 'ar-EG-SalmaNeural',
  hi: 'hi-IN-SwaraNeural',
  ru: 'ru-RU-SvetlanaNeural',
  th: 'th-TH-PremwadeeNeural',
  vi: 'vi-VN-HoaiMyNeural',
  it: 'it-IT-ElsaNeural',
  nl: 'nl-NL-ColetteNeural',
  pl: 'pl-PL-ZofiaNeural',
  sv: 'sv-SE-SofieNeural',
  tr: 'tr-TR-EmelNeural',
};

// ── Voice list ────────────────────────────────────────────────────────────────

const BUILTIN_VOICES = [
  // English
  { name: 'en-US-AriaNeural',        gender: 'Female', locale: 'en-US' },
  { name: 'en-US-JennyNeural',       gender: 'Female', locale: 'en-US' },
  { name: 'en-US-MichelleNeural',    gender: 'Female', locale: 'en-US' },
  { name: 'en-US-GuyNeural',         gender: 'Male',   locale: 'en-US' },
  { name: 'en-US-ChristopherNeural', gender: 'Male',   locale: 'en-US' },
  { name: 'en-US-EricNeural',        gender: 'Male',   locale: 'en-US' },
  { name: 'en-US-RogerNeural',       gender: 'Male',   locale: 'en-US' },
  { name: 'en-GB-SoniaNeural',       gender: 'Female', locale: 'en-GB' },
  { name: 'en-GB-LibbyNeural',       gender: 'Female', locale: 'en-GB' },
  { name: 'en-GB-RyanNeural',        gender: 'Male',   locale: 'en-GB' },
  { name: 'en-AU-NatashaNeural',     gender: 'Female', locale: 'en-AU' },
  { name: 'en-AU-WilliamNeural',     gender: 'Male',   locale: 'en-AU' },
  // Chinese Simplified
  { name: 'zh-CN-XiaoxiaoNeural',    gender: 'Female', locale: 'zh-CN' },
  { name: 'zh-CN-XiaoyiNeural',      gender: 'Female', locale: 'zh-CN' },
  { name: 'zh-CN-XiaohanNeural',     gender: 'Female', locale: 'zh-CN' },
  { name: 'zh-CN-XiaomoNeural',      gender: 'Female', locale: 'zh-CN' },
  { name: 'zh-CN-YunjianNeural',     gender: 'Male',   locale: 'zh-CN' },
  { name: 'zh-CN-YunxiNeural',       gender: 'Male',   locale: 'zh-CN' },
  { name: 'zh-CN-YunyangNeural',     gender: 'Male',   locale: 'zh-CN' },
  { name: 'zh-CN-YunxiaNeural',      gender: 'Male',   locale: 'zh-CN' },
  // Chinese Traditional
  { name: 'zh-TW-HsiaoChenNeural',   gender: 'Female', locale: 'zh-TW' },
  { name: 'zh-TW-HsiaoYuNeural',     gender: 'Female', locale: 'zh-TW' },
  { name: 'zh-TW-YunJheNeural',      gender: 'Male',   locale: 'zh-TW' },
  { name: 'zh-HK-HiuMaanNeural',     gender: 'Female', locale: 'zh-HK' },
  { name: 'zh-HK-HiuGaaiNeural',     gender: 'Female', locale: 'zh-HK' },
  { name: 'zh-HK-WanLungNeural',     gender: 'Male',   locale: 'zh-HK' },
  // Japanese
  { name: 'ja-JP-NanamiNeural',      gender: 'Female', locale: 'ja-JP' },
  { name: 'ja-JP-AoiNeural',         gender: 'Female', locale: 'ja-JP' },
  { name: 'ja-JP-MayuNeural',        gender: 'Female', locale: 'ja-JP' },
  { name: 'ja-JP-KeitaNeural',       gender: 'Male',   locale: 'ja-JP' },
  { name: 'ja-JP-DaichiNeural',      gender: 'Male',   locale: 'ja-JP' },
  // Korean
  { name: 'ko-KR-SunHiNeural',       gender: 'Female', locale: 'ko-KR' },
  { name: 'ko-KR-YuJinNeural',       gender: 'Female', locale: 'ko-KR' },
  { name: 'ko-KR-InJoonNeural',      gender: 'Male',   locale: 'ko-KR' },
  // Spanish
  { name: 'es-ES-ElviraNeural',      gender: 'Female', locale: 'es-ES' },
  { name: 'es-ES-AbrilNeural',       gender: 'Female', locale: 'es-ES' },
  { name: 'es-ES-AlvaroNeural',      gender: 'Male',   locale: 'es-ES' },
  { name: 'es-MX-DaliaNeural',       gender: 'Female', locale: 'es-MX' },
  { name: 'es-MX-JorgeNeural',       gender: 'Male',   locale: 'es-MX' },
  // French
  { name: 'fr-FR-DeniseNeural',      gender: 'Female', locale: 'fr-FR' },
  { name: 'fr-FR-EloiseNeural',      gender: 'Female', locale: 'fr-FR' },
  { name: 'fr-FR-HenriNeural',       gender: 'Male',   locale: 'fr-FR' },
  { name: 'fr-CA-SylvieNeural',      gender: 'Female', locale: 'fr-CA' },
  { name: 'fr-CA-AntoineNeural',     gender: 'Male',   locale: 'fr-CA' },
  // German
  { name: 'de-DE-KatjaNeural',       gender: 'Female', locale: 'de-DE' },
  { name: 'de-DE-AmalaNeural',       gender: 'Female', locale: 'de-DE' },
  { name: 'de-DE-ConradNeural',      gender: 'Male',   locale: 'de-DE' },
  { name: 'de-DE-KillianNeural',     gender: 'Male',   locale: 'de-DE' },
  // Portuguese
  { name: 'pt-BR-FranciscaNeural',   gender: 'Female', locale: 'pt-BR' },
  { name: 'pt-BR-ThalitaNeural',     gender: 'Female', locale: 'pt-BR' },
  { name: 'pt-BR-AntonioNeural',     gender: 'Male',   locale: 'pt-BR' },
  { name: 'pt-PT-RaquelNeural',      gender: 'Female', locale: 'pt-PT' },
  { name: 'pt-PT-DuarteNeural',      gender: 'Male',   locale: 'pt-PT' },
  // Indonesian
  { name: 'id-ID-GadisNeural',       gender: 'Female', locale: 'id-ID' },
  { name: 'id-ID-ArdiNeural',        gender: 'Male',   locale: 'id-ID' },
  // Arabic
  { name: 'ar-EG-SalmaNeural',       gender: 'Female', locale: 'ar-EG' },
  { name: 'ar-EG-ShakirNeural',      gender: 'Male',   locale: 'ar-EG' },
  { name: 'ar-SA-ZariyahNeural',     gender: 'Female', locale: 'ar-SA' },
  { name: 'ar-SA-HamedNeural',       gender: 'Male',   locale: 'ar-SA' },
  // Hindi
  { name: 'hi-IN-SwaraNeural',       gender: 'Female', locale: 'hi-IN' },
  { name: 'hi-IN-MadhurNeural',      gender: 'Male',   locale: 'hi-IN' },
  // Russian
  { name: 'ru-RU-SvetlanaNeural',    gender: 'Female', locale: 'ru-RU' },
  { name: 'ru-RU-DariyaNeural',      gender: 'Female', locale: 'ru-RU' },
  { name: 'ru-RU-DmitryNeural',      gender: 'Male',   locale: 'ru-RU' },
  // Italian
  { name: 'it-IT-ElsaNeural',        gender: 'Female', locale: 'it-IT' },
  { name: 'it-IT-IsabellaNeural',    gender: 'Female', locale: 'it-IT' },
  { name: 'it-IT-DiegoNeural',       gender: 'Male',   locale: 'it-IT' },
  // Dutch
  { name: 'nl-NL-ColetteNeural',     gender: 'Female', locale: 'nl-NL' },
  { name: 'nl-NL-FennaNeural',       gender: 'Female', locale: 'nl-NL' },
  { name: 'nl-NL-MaartenNeural',     gender: 'Male',   locale: 'nl-NL' },
  // Polish
  { name: 'pl-PL-ZofiaNeural',       gender: 'Female', locale: 'pl-PL' },
  { name: 'pl-PL-MarekNeural',       gender: 'Male',   locale: 'pl-PL' },
  // Swedish
  { name: 'sv-SE-SofieNeural',       gender: 'Female', locale: 'sv-SE' },
  { name: 'sv-SE-MattiasNeural',     gender: 'Male',   locale: 'sv-SE' },
  // Turkish
  { name: 'tr-TR-EmelNeural',        gender: 'Female', locale: 'tr-TR' },
  { name: 'tr-TR-AhmetNeural',       gender: 'Male',   locale: 'tr-TR' },
  // Thai
  { name: 'th-TH-PremwadeeNeural',   gender: 'Female', locale: 'th-TH' },
  { name: 'th-TH-AcharaNeural',      gender: 'Female', locale: 'th-TH' },
  { name: 'th-TH-NiwatNeural',       gender: 'Male',   locale: 'th-TH' },
  // Vietnamese
  { name: 'vi-VN-HoaiMyNeural',      gender: 'Female', locale: 'vi-VN' },
  { name: 'vi-VN-NamMinhNeural',     gender: 'Male',   locale: 'vi-VN' },
];

app.get('/tts/voices', (req, res) => {
  const lang = (req.query.lang || '').replace(/[^a-zA-Z-]/g, '').toLowerCase();
  const filtered = lang
    ? BUILTIN_VOICES.filter(v => v.locale.toLowerCase().startsWith(lang))
    : BUILTIN_VOICES;
  res.json(filtered);
});

function splitEdgeChunks(text, maxLen) {
  const seps = ['\n\n', '\n', '。', '！', '？', '.', '!', '?', '；', ';', '，', ',', ' '];
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > maxLen) {
    let pos = maxLen;
    for (const sep of seps) {
      const idx = remaining.lastIndexOf(sep, maxLen);
      if (idx > maxLen * 0.4) { pos = idx + sep.length; break; }
    }
    chunks.push(remaining.slice(0, pos).trim());
    remaining = remaining.slice(pos).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.filter(c => c.length > 0);
}

// Lazy-init paragraph pause: synthesised once on first TTS call, reused thereafter.
// '. . .' produces ~500 ms of natural sentence-final silence in any Neural voice,
// at the same codec (24 kHz 48 kbps mono MP3) as the main audio — safe to concat.
let _paraPausePromise = null;
function getParaPause() {
  if (!_paraPausePromise) {
    _paraPausePromise = (async () => {
      const { execFile } = require('child_process');
      const { promisify } = require('util');
      const fs = require('fs').promises;
      const os = require('os');
      const crypto = require('crypto');
      const execFileAsync = promisify(execFile);
      const tmp = require('path').join(os.tmpdir(), 'tts-pause-' + crypto.randomBytes(4).toString('hex') + '.mp3');
      try {
        await execFileAsync('edge-tts', [
          '--text', '. . .', '--voice', 'en-US-AriaNeural', '--write-media', tmp,
        ], { timeout: 15000 });
        const buf = await fs.readFile(tmp);
        fs.unlink(tmp).catch(() => {});
        return buf;
      } catch {
        return Buffer.alloc(0); // graceful degradation: no pause on failure
      }
    })();
  }
  return _paraPausePromise;
}

async function ttsViaEdge(text, lang, rate, volume, voiceOverride) {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const fs = require('fs').promises;
  const os = require('os');
  const path = require('path');
  const crypto = require('crypto');
  const execFileAsync = promisify(execFile);

  const VOICE_RE = /^[a-zA-Z]{2,3}-[a-zA-Z]{2,4}-[a-zA-Z0-9]+$/;
  const voice = (voiceOverride && VOICE_RE.test(voiceOverride)) ? voiceOverride : (EDGE_VOICES[lang] || EDGE_VOICES.en);
  const ratePercent = Math.round((rate - 1.0) * 100);
  const rateStr = (ratePercent >= 0 ? '+' : '') + ratePercent + '%';
  const volPercent = Math.round((volume - 1.0) * 100);
  const volStr = (volPercent >= 0 ? '+' : '') + volPercent + '%';

  async function synthesize(chunk) {
    const tmpFile = path.join(os.tmpdir(), 'tts-' + crypto.randomBytes(8).toString('hex') + '.mp3');
    try {
      await execFileAsync('edge-tts', [
        '--text', chunk, '--voice', voice,
        '--rate', rateStr, '--volume', volStr,
        '--write-media', tmpFile,
      ], { timeout: 30000 });
      return await fs.readFile(tmpFile);
    } finally {
      fs.unlink(tmpFile).catch(() => {});
    }
  }

  // Tier 1: split at paragraph boundaries (\n\n)
  // Tier 2: sub-chunk any paragraph that exceeds 3000 chars at sentence boundaries
  // Only tier-1 boundaries get the paragraph pause — sentence splits within a
  // paragraph are concatenated directly (no artificial gap mid-paragraph).
  const paragraphs = text.split(/\n\n+/).map(s => s.replace(/\n/g, ' ').trim()).filter(Boolean);
  const paraBufs = [];
  for (const para of paragraphs) {
    const subChunks = splitEdgeChunks(para, 3000);
    const subBufs = [];
    for (const chunk of subChunks) subBufs.push(await synthesize(chunk));
    paraBufs.push(Buffer.concat(subBufs));
  }

  if (paraBufs.length <= 1) return Buffer.concat(paraBufs);

  const pause = await getParaPause();
  const out = [];
  for (let i = 0; i < paraBufs.length; i++) {
    out.push(paraBufs[i]);
    if (i < paraBufs.length - 1) out.push(pause);
  }
  return Buffer.concat(out);
}

async function applyAudioEffects(inputBuf, rate, volume) {
  if (rate === 1.0 && volume === 1.0) return inputBuf;
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const fs = require('fs').promises;
  const os = require('os');
  const path = require('path');
  const crypto = require('crypto');
  const execFileAsync = promisify(execFile);
  const tmpIn  = path.join(os.tmpdir(), 'tts-fx-in-'  + crypto.randomBytes(4).toString('hex') + '.mp3');
  const tmpOut = path.join(os.tmpdir(), 'tts-fx-out-' + crypto.randomBytes(4).toString('hex') + '.mp3');
  try {
    await fs.writeFile(tmpIn, inputBuf);
    const filters = [];
    if (rate !== 1.0) {
      // atempo only accepts 0.5–2.0; chain multiple stages for values outside that range
      let r = rate;
      const stages = [];
      while (r > 2.0) { stages.push('atempo=2.0'); r /= 2.0; }
      while (r < 0.5) { stages.push('atempo=0.5'); r *= 2.0; }
      stages.push('atempo=' + r.toFixed(6));
      filters.push(...stages);
    }
    if (volume !== 1.0) filters.push('volume=' + volume.toFixed(6));
    await execFileAsync('ffmpeg', [
      '-i', tmpIn, '-filter:a', filters.join(','), '-y', tmpOut,
    ], { timeout: 30000 });
    return await fs.readFile(tmpOut);
  } finally {
    fs.unlink(tmpIn).catch(() => {});
    fs.unlink(tmpOut).catch(() => {});
  }
}

async function ttsViaGoogle(text, lang) {
  const chunks = splitTextForTTS(text, 190);
  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    const ttsUrl = 'https://translate.google.com/translate_tts?ie=UTF-8' +
      '&q=' + encodeURIComponent(chunks[i]) +
      '&tl=' + lang +
      '&client=tw-ob' +
      '&idx=' + i +
      '&total=' + chunks.length;
    const r = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error('Google TTS error ' + r.status);
    buffers.push(Buffer.from(await r.arrayBuffer()));
  }
  return Buffer.concat(buffers);
}

app.post('/tts', async (req, res) => {
  const text = (req.body && req.body.text || '').trim();
  const lang = (req.body && req.body.lang || 'en').replace(/[^a-zA-Z-]/g, '') || 'en';
  const rate = Math.min(3.0, Math.max(0.1, parseFloat(req.body && req.body.rate) || 1.0));
  const volume = Math.min(2.0, Math.max(0.1, parseFloat(req.body && req.body.volume) || 1.0));
  const voice = (req.body && req.body.voice || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!text) return res.status(400).send('Missing text');
  if (text.length > 20000) return res.status(400).send('Text too long (max 20000 chars)');

  let audio;
  try {
    audio = await ttsViaEdge(text, lang, rate, volume, voice);
  } catch (_edgeErr) {
    try {
      const raw = await ttsViaGoogle(text, lang);
      audio = await applyAudioEffects(raw, rate, volume);
    } catch (err) {
      return res.status(502).send('TTS failed: ' + err.message);
    }
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', 'attachment; filename="speech.mp3"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(audio);
});

// ── Translate ─────────────────────────────────────────────────────────────────

app.post('/translate', async (req, res) => {
  const { texts, target, source = 'auto' } = req.body;
  if (!texts || !Array.isArray(texts) || texts.length === 0) return res.status(400).send('Missing texts');
  if (!target) return res.status(400).send('Missing target');
  if (texts.length > 3000) return res.status(400).send('Too many blocks (max 3000)');
  const sl = (source || 'auto').replace(/[^a-zA-Z-]/g, '') || 'auto';
  const tl = target.replace(/[^a-zA-Z-]/g, '');
  const BATCH = 40;
  const batches = [];
  for (let i = 0; i < texts.length; i += BATCH) batches.push(texts.slice(i, i + BATCH));
  try {
    const batchResults = await Promise.all(batches.map(async (batch) => {
      const joined = batch.join('\n');
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(joined)}`;
      const r = await fetch(url, { headers: { 'User-Agent': DESKTOP_UA }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('Translate API error ' + r.status);
      const data = await r.json();
      const translated = data[0].map(seg => seg[0]).join('');
      const parts = translated.split('\n');
      while (parts.length < batch.length) parts.push('');
      return parts.slice(0, batch.length);
    }));
    res.json({ translations: batchResults.flat() });
  } catch (err) {
    res.status(502).send('Translation failed: ' + err.message);
  }
});

function splitTextForTTS(text, maxLen) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > maxLen) {
    let pos = -1;
    for (const sep of ['. ', '! ', '? ', '; ', ', ', ' ']) {
      const idx = remaining.lastIndexOf(sep, maxLen);
      if (idx > maxLen * 0.4) { pos = idx + sep.length; break; }
    }
    if (pos <= 0) pos = maxLen;
    chunks.push(remaining.slice(0, pos).trim());
    remaining = remaining.slice(pos).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.filter(c => c.length > 0);
}

app.get('/thumbnail', async (req, res) => {
  const { v } = req.query;
  if (!v || !/^[a-zA-Z0-9_-]{11}$/.test(v)) return res.status(400).send('Invalid video ID');
  for (const q of ['maxresdefault', 'sddefault', 'hqdefault']) {
    try {
      const r = await fetch(`https://img.youtube.com/vi/${v}/${q}.jpg`, { headers: { 'User-Agent': DESKTOP_UA } });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 2000) continue; // skip YouTube placeholder image
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(buf);
    } catch (_) { continue; }
  }
  res.status(404).send('Thumbnail not found');
});

// ── YouTube MP3 Download ──────────────────────────────────────────────────────

const YT_URL_RE = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?.*v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{11}/;

app.get('/yt-mp3', async (req, res) => {
  const rawUrl = (req.query.url || '').trim();
  if (!YT_URL_RE.test(rawUrl)) {
    return res.status(400).json({ error: 'Invalid YouTube URL.' });
  }

  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const fs = require('fs');
  const fsP = require('fs').promises;
  const os = require('os');
  const path = require('path');
  const crypto = require('crypto');
  const execFileAsync = promisify(execFile);

  // Step 1: fetch metadata to get title + duration
  let title = 'audio';
  let duration = 0;
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--dump-single-json', '--skip-download', '--no-playlist', '--no-warnings',
      rawUrl,
    ], { timeout: 30000 });
    const info = JSON.parse(stdout);
    title = (info.title || 'audio').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').trim() || 'audio';
    duration = typeof info.duration === 'number' ? info.duration : 0;
  } catch (e) {
    return res.status(502).json({ error: 'Could not fetch video info. The video may be private or unavailable.' });
  }

  if (duration === 0) {
    return res.status(400).json({ error: 'Live streams cannot be downloaded.' });
  }
  if (duration > 1800) {
    return res.status(400).json({ error: `Video is too long (${Math.round(duration / 60)} min). Maximum 30 minutes.` });
  }

  // Step 2: download audio as MP3 to temp file
  const tmpId = crypto.randomBytes(8).toString('hex');
  const tmpBase = path.join(os.tmpdir(), 'ytmp3-' + tmpId);
  const tmpMp3 = tmpBase + '.mp3';

  try {
    await execFileAsync('yt-dlp', [
      '-x', '--audio-format', 'mp3', '--audio-quality', '128K',
      '--no-playlist', '--no-warnings',
      '-o', tmpBase + '.%(ext)s',
      rawUrl,
    ], { timeout: 100000 });
  } catch (e) {
    fsP.unlink(tmpMp3).catch(() => {});
    return res.status(502).json({ error: 'Audio download failed. YouTube may have restricted this video.' });
  }

  try { await fsP.access(tmpMp3); } catch {
    return res.status(502).json({ error: 'MP3 conversion failed.' });
  }

  // Step 3: stream MP3 back to client
  const safeFilename = encodeURIComponent(title + '.mp3');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFilename}`);
  res.setHeader('Cache-Control', 'no-store');

  const stream = fs.createReadStream(tmpMp3);
  stream.pipe(res);

  const cleanup = () => fsP.unlink(tmpMp3).catch(() => {});
  stream.on('end', cleanup);
  stream.on('error', err => { cleanup(); if (!res.headersSent) res.status(500).json({ error: 'Stream error.' }); });
  req.on('close', () => { stream.destroy(); cleanup(); });
});

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
  // 1. yt-dlp — most reliable when not IP-blocked
  const ytdlp = await fetchTracksViaYtDlp(videoId);
  if (!ytdlp.error) return ytdlp;
  // 2. Invidious — routes through their servers, bypasses our IP
  const inv = await fetchTracksViaInvidious(videoId);
  if (!inv.error) return inv;
  // 3. InnerTube — last resort
  return fetchTracksInnerTube(videoId);
}

async function fetchTracksViaInvidious(videoId) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=title,captions`, {
        headers: { 'User-Agent': DESKTOP_UA },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) continue;

      const captions = data.captions || [];
      if (!captions.length) {
        if (data.title) return { error: 'no_captions' };
        continue;
      }

      const tracks = captions.map(c => ({
        langCode: c.language_code || 'en',
        langName: c.label || c.language_code || 'Unknown',
        kind: (c.label && c.label.toLowerCase().includes('auto')) ? 'asr' : '',
        baseUrl: instance + c.url,
      })).filter(t => t.baseUrl);

      if (!tracks.length) continue;
      return { title: data.title || '', tracks };
    } catch (_) { continue; }
  }
  return { error: 'rate_limited' };
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
      return { title: data?.videoDetails?.title || '', tracks, originalLang: data?.videoDetails?.defaultAudioLanguage || '' };
    } catch (_) { continue; }
  }
  return { error: videoExists ? 'no_captions' : 'rate_limited' };
}

async function fetchTracksViaYtDlp(videoId) {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--dump-single-json', '--skip-download', '--no-playlist',
      '--no-warnings', '--extractor-retries', '1',
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: 30000 });

    const data = JSON.parse(stdout);
    const tracks = [];

    if (data.subtitles) {
      for (const [langCode, formats] of Object.entries(data.subtitles)) {
        if (langCode === 'live_chat') continue;
        const fmt = formats.find(f => f.ext === 'vtt' || f.ext === 'xml') || formats[0];
        if (fmt?.url) tracks.push({ langCode, langName: fmt.name || langCode, kind: '', baseUrl: fmt.url });
      }
    }

    if (!tracks.length && data.automatic_captions) {
      for (const [langCode, formats] of Object.entries(data.automatic_captions)) {
        if (langCode === 'live_chat') continue;
        const fmt = formats.find(f => f.ext === 'vtt') || formats[0];
        if (fmt?.url) tracks.push({ langCode, langName: (fmt.name || langCode) + ' (auto)', kind: 'asr', baseUrl: fmt.url });
      }
    }

    if (!tracks.length) return { error: 'no_captions' };
    return { title: data.title || '', tracks, originalLang: data.language || '' };
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
