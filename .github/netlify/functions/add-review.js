// Direct endpoint called by the review form.
// Adds the review to data/reviews.json as "not published yet" (published:false).
// Robust: retries on write conflict (409) so a review is never lost, even if
// the panel (/admin) or another review is being saved at the same moment.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'method' }) };
  }
  try {
    const input = JSON.parse(event.body || '{}');
    if (input.hp) return { statusCode: 200, body: JSON.stringify({ ok: true }) }; // bot trap

    const name = String(input.name || '').trim().slice(0, 80);
    const txt = String(input.txt || '').trim().slice(0, 2000);
    let rating = parseInt(input.rating, 10);
    if (!rating || rating < 1 || rating > 5) rating = 5;
    const lang = ['fr', 'en', 'pt', 'es'].indexOf(input.lang) >= 0 ? input.lang : 'fr';
    if (!name || !txt) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'incomplete' }) };
    }

    const token = process.env.GH_TOKEN;
    if (!token) return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'no token' }) };

    const repo = 'putochinez-web/putochinez';
    const path = 'data/reviews.json';
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'puto-reviews-bot',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    const today = new Date().toISOString().slice(0, 10);
    const newReview = { name, rating, lang, date: today, published: false, txt };

    // Try up to 4 times, re-reading the latest file each time (handles concurrent writes)
    for (let attempt = 0; attempt < 4; attempt++) {
      const getRes = await fetch(`${url}?ref=main&t=${Date.now()}`, { headers, cache: 'no-store' });
      if (!getRes.ok) return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'get ' + getRes.status }) };
      const file = await getRes.json();
      let json;
      try { json = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); }
      catch (e) { json = { reviews: [] }; }
      if (!Array.isArray(json.reviews)) json.reviews = [];
      json.reviews.unshift(newReview);

      const newContent = Buffer.from(JSON.stringify(json, null, 2)).toString('base64');
      const putRes = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `Nouvel avis de ${name} (a valider)`,
          content: newContent,
          sha: file.sha,
          branch: 'main'
        })
      });
      if (putRes.ok) return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      if (putRes.status === 409) { continue; } // conflict: someone wrote in between → retry with fresh sha
      const t = await putRes.text();
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'put ' + putRes.status, detail: t.slice(0, 200) }) };
    }
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'busy, please retry' }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message) }) };
  }
};
