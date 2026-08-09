// Stores each booking request into data/bookings.json (status "A traiter"),
// so it shows up in /admin → Réservations. Robust: retries on write conflict.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ ok: false }) };
  try {
    const input = JSON.parse(event.body || '{}');
    if (input.hp) return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    const s = (v, n) => String(v || '').trim().slice(0, n || 300);
    const b = {
      status: 'A traiter',
      name: s(input.name, 80),
      email: s(input.email, 120),
      course: s(input.course, 120),
      quantity: s(input.quantity, 10),
      date: s(input.date, 40),
      total: s(input.total, 60),
      promo: s(input.promo, 120),
      message: s(input.message, 2000),
      lang: (['fr', 'en'].indexOf(input.lang) >= 0 ? input.lang : 'fr'),
      received: new Date().toISOString().slice(0, 16).replace('T', ' '),
      note: ''
    };
    if (!b.name && !b.email) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'empty' }) };

    const token = process.env.GH_TOKEN;
    if (!token) return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'no token' }) };
    const repo = 'putochinez-web/putochinez', path = 'data/bookings.json';
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'puto-bookings-bot', 'X-GitHub-Api-Version': '2022-11-28' };

    for (let attempt = 0; attempt < 4; attempt++) {
      const getRes = await fetch(`${url}?ref=main&t=${Date.now()}`, { headers, cache: 'no-store' });
      let sha, json = { bookings: [] };
      if (getRes.ok) { const file = await getRes.json(); sha = file.sha; try { json = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); } catch (e) { json = { bookings: [] }; } }
      else if (getRes.status !== 404) return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'get ' + getRes.status }) };
      if (!Array.isArray(json.bookings)) json.bookings = [];
      json.bookings.unshift(b);
      const newContent = Buffer.from(JSON.stringify(json, null, 2)).toString('base64');
      const body = { message: `Nouvelle reservation de ${b.name}`, content: newContent, branch: 'main' };
      if (sha) body.sha = sha;
      const putRes = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (putRes.ok) return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      if (putRes.status === 409) continue;
      const t = await putRes.text();
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'put ' + putRes.status, detail: t.slice(0, 200) }) };
    }
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'busy' }) };
  } catch (e) { return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message) }) }; }
};
