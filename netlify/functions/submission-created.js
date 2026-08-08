// Runs automatically on Netlify when a form is submitted.
// For the "review" form, it adds the review to data/reviews.json as "not published yet",
// so it shows up in /admin ready to be validated (published: false).

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const payload = body.payload || {};

    // Only handle the review form (ignore booking submissions)
    if (payload.form_name !== 'review') {
      return { statusCode: 200, body: 'ignored (not the review form)' };
    }

    const data = payload.data || {};
    const name = String(data.name || '').trim();
    const txt = String(data.review || '').trim();
    let rating = parseInt(data.rating, 10);
    if (!rating || rating < 1 || rating > 5) rating = 5;
    const lang = (String(data.lang || 'fr').trim() || 'fr');
    if (!name || !txt) return { statusCode: 200, body: 'incomplete review, skipped' };

    const token = process.env.GH_TOKEN;
    if (!token) return { statusCode: 200, body: 'GH_TOKEN not configured' };

    const repo = 'putochinez-web/putochinez';
    const path = 'data/reviews.json';
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'puto-reviews-bot',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    // 1) read the current file
    const getRes = await fetch(`${url}?ref=main`, { headers });
    if (!getRes.ok) return { statusCode: 200, body: 'get failed: ' + getRes.status };
    const file = await getRes.json();
    const json = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    if (!Array.isArray(json.reviews)) json.reviews = [];

    // 2) add the new review at the top, NOT published yet
    const today = new Date().toISOString().slice(0, 10);
    json.reviews.unshift({
      name: name,
      rating: rating,
      lang: lang,
      date: today,
      txt: txt,
      published: false
    });

    // 3) commit it back (this triggers an auto-deploy)
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

    return { statusCode: 200, body: putRes.ok ? 'review added (pending)' : ('put failed: ' + putRes.status) };
  } catch (e) {
    return { statusCode: 200, body: 'error: ' + (e && e.message) };
  }
};
