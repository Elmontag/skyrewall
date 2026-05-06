'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app         = express();
const PORT        = process.env.PORT || 3334;
const CONFIG_FILE = path.join(__dirname, 'config.json');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '20mb' }));

/* ─── Config (handle + app-password) ──────────────────────────────────────── */

app.get('/api/bluesky/config', (_req, res) => {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return res.json({});
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch {
    res.json({});
  }
});

app.post('/api/bluesky/config', (req, res) => {
  const { handle = '', password = '' } = req.body;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ handle, password }, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Bluesky AT Protocol Proxy ────────────────────────────────────────────── */

const BSKY_HOST = 'https://bsky.social';

/** Extract hashtag facets with correct UTF-8 byte offsets */
function extractHashtagFacets(text) {
  const facets = [];
  const regex  = /#([\w\u00C0-\u024F\u1E00-\u1EFF]+)/gu;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const start = Buffer.byteLength(text.slice(0, m.index),              'utf8');
    const end   = Buffer.byteLength(text.slice(0, m.index + m[0].length), 'utf8');
    facets.push({
      index:    { byteStart: start, byteEnd: end },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[1] }],
    });
  }
  return facets;
}

/**
 * Extract URL facets with correct UTF-8 byte offsets
 * Detects bare domains and https:// URLs in post text
 */
function extractUrlFacets(text) {
  const facets = [];
  const regex  = /https?:\/\/[^\s]+|(?<!\w)[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?(?!\w)/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const raw = m[0];
    const uri = raw.startsWith('http') ? raw : `https://${raw}`;
    const start = Buffer.byteLength(text.slice(0, m.index),              'utf8');
    const end   = Buffer.byteLength(text.slice(0, m.index + raw.length), 'utf8');
    facets.push({
      index:    { byteStart: start, byteEnd: end },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
    });
  }
  return facets;
}

/**
 * POST /api/bluesky/post
 * Body: { handle, password, text, altText?, imageB64? }
 * Returns: { uri, cid }
 */
app.post('/api/bluesky/post', async (req, res) => {
  const { handle, password, text, altText = '', imageB64 = null } = req.body;

  if (!handle || !password || !text) {
    return res.status(400).json({ error: 'handle, password und text sind erforderlich.' });
  }

  try {
    // 1. Authenticate
    const authResp = await fetch(`${BSKY_HOST}/xrpc/com.atproto.server.createSession`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ identifier: handle, password }),
    });
    if (!authResp.ok) {
      const err = await authResp.json().catch(() => ({}));
      throw new Error(err.message || `Auth fehlgeschlagen (HTTP ${authResp.status})`);
    }
    const { accessJwt, did } = await authResp.json();

    // 2. Optionally upload image blob
    let blobRef = null;
    if (imageB64) {
      const imgBuf = Buffer.from(imageB64, 'base64');
      if (imgBuf.length > 976_562) {
        throw new Error('Bild zu groß (max ~1 MB nach Kompression).');
      }
      const uploadResp = await fetch(`${BSKY_HOST}/xrpc/com.atproto.repo.uploadBlob`, {
        method:  'POST',
        headers: {
          'Authorization':  `Bearer ${accessJwt}`,
          'Content-Type':   'image/jpeg',
          'Content-Length': String(imgBuf.length),
        },
        body: imgBuf,
      });
      if (!uploadResp.ok) {
        const err = await uploadResp.json().catch(() => ({}));
        throw new Error(err.message || `Bild-Upload fehlgeschlagen (HTTP ${uploadResp.status})`);
      }
      const { blob } = await uploadResp.json();
      blobRef = {
        $type:    'app.bsky.embed.images#image',
        image:    blob,
        alt:      altText || 'SkyreWall',
        aspectRatio: { width: 1, height: 1 },
      };
    }

    // 3. Build post record
    const record = {
      $type:     'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
      langs:     ['de', 'en'],
    };

    // Merge hashtag + URL facets, deduplicate overlapping ranges
    const allFacets = [...extractHashtagFacets(text), ...extractUrlFacets(text)];
    if (allFacets.length) record.facets = allFacets;

    if (blobRef) {
      record.embed = {
        $type:  'app.bsky.embed.images',
        images: [blobRef],
      };
    }

    // 4. Create record
    const postResp = await fetch(`${BSKY_HOST}/xrpc/com.atproto.repo.createRecord`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${accessJwt}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        repo:       did,
        collection: 'app.bsky.feed.post',
        record,
      }),
    });
    if (!postResp.ok) {
      const err = await postResp.json().catch(() => ({}));
      throw new Error(err.message || `Post fehlgeschlagen (HTTP ${postResp.status})`);
    }
    const result = await postResp.json();
    res.json({ uri: result.uri, cid: result.cid });
  } catch (err) {
    console.error('[bluesky]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────── */

app.listen(PORT, () => {
  console.log('\n  🛡  SkyreWall Social Creator');
  console.log(`  → http://localhost:${PORT}\n`);
});
