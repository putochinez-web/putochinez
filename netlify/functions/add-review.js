// Direct endpoint called by the review form.
// Adds the review to data/reviews.json as "not published yet" (published:false),
// so it shows up in /admin ready to be validated in one click.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'method' }) };
  }
  try {
    const input = JSON.parse(event.body || '{}');

    // simple bot trap: if the honeypot is filled, pretend success and do nothing
    if (input.hp) return { statusCode: 200, body: JSON.stringify({ ok: true }) };

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

    const getRes = await fetch(`${url}?ref=main`, { headers });
    if (!getRes.ok) return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'get ' + getRes.status }) };
    const file = await getRes.json();
    const json = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    if (!Array.isArray(json.reviews)) json.reviews = [];

    const today = new Date().toISOString().slice(0, 10);
    json.reviews.unshift({ name, rating, lang, date: today, txt, published: false });

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
    if (!putRes.ok) {
      const t = await putRes.text();
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'put ' + putRes.status, detail: t.slice(0, 200) }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message) }) };
  }
};
