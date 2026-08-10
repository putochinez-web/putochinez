// Returns the bookings list, but ONLY to the owner (secret code required).
// Keeps client data private (the public bookings.json path is blocked separately).
exports.handler = async (event) => {
  const code = (event.queryStringParameters || {}).code || '';
  if (code !== 'leopard') return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
  try {
    const token = process.env.GH_TOKEN;
    if (!token) return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'no token' }) };
    const url = 'https://api.github.com/repos/putochinez-web/putochinez/contents/data/bookings.json?ref=main&t=' + Date.now();
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'puto-bot', 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store'
    });
    if (r.status === 404) return { statusCode: 200, body: JSON.stringify({ ok: true, bookings: [] }) };
    if (!r.ok) return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'get ' + r.status }) };
    const f = await r.json();
    let json = { bookings: [] };
    try { json = JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')); } catch (e) {}
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, bookings: Array.isArray(json.bookings) ? json.bookings : [] }) };
  } catch (e) { return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message) }) }; }
};
