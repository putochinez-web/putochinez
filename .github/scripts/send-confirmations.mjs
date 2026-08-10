// Runs on GitHub Actions when data/bookings.json changes.
// For each booking that is "Confirmee" and not yet emailed, sends the
// confirmation email to the client via Resend, then marks it as sent.

import fs from 'fs';

const RESEND = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || 'Puto Chinez <onboarding@resend.dev>';
const REPLYTO = process.env.MAIL_REPLYTO || 'putochinez@gmail.com';
const PATH = 'data/bookings.json';

if (!RESEND) { console.log('No RESEND_API_KEY set — skipping.'); process.exit(0); }

function fmtDate(iso, lang) {
  if (!iso) return '';
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  try { return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  catch (e) { return iso; }
}

function buildEmail(b) {
  const lang = (b.lang === 'en') ? 'en' : 'fr';
  const date = fmtDate(b.confirm_date, lang);
  const start = b.confirm_start || '';
  const end = b.confirm_end || '';
  let addr = (b.confirm_addr_autre || '').trim();
  if (!addr) { addr = b.confirm_addr || ''; if (addr.indexOf('Autre') === 0) addr = ''; }
  const extra = (b.confirm_msg || '').trim();
  const course = b.course || '';
  const name = b.name || '';
  const studio = !!b.confirm_studio;
  if (lang === 'en') {
    let s = "Hi " + name + ",\n\n";
    s += "Thank you for your request! I'm happy to confirm your " + course + " class.\n\n";
    s += "Proposed slot:\n";
    s += "Date: " + date + "\n";
    s += "Time: from " + start + " to " + end + "\n";
    s += "Location: " + addr + "\n";
    if (studio) s += "Or you can book a dance studio in Paris, at your own expense.\n";
    if (extra) s += "\n" + extra + "\n";
    s += "\nPayment is made on site. If this slot works for you, reply to confirm — otherwise we'll find another date together.\n\n";
    s += "See you soon!\nPuto Chinez";
    return { subject: "Your class is confirmed — Puto Chinez", text: s };
  }
  let s = "Bonjour " + name + ",\n\n";
  s += "Merci pour votre demande ! J'ai le plaisir de vous confirmer votre cours " + course + ".\n\n";
  s += "Créneau proposé :\n";
  s += "Date : " + date + "\n";
  s += "Horaire : de " + start + " à " + end + "\n";
  s += "Lieu : " + addr + "\n";
  if (studio) s += "Ou possibilité de réserver un studio de danse à Paris, à votre charge.\n";
  if (extra) s += "\n" + extra + "\n";
  s += "\nLe paiement se fait sur place. Si ce créneau vous convient, répondez-moi pour valider — sinon nous trouverons une autre date ensemble.\n\n";
  s += "À très vite !\nPuto Chinez";
  return { subject: "Confirmation de votre cours — Puto Chinez", text: s };
}

const data = JSON.parse(fs.readFileSync(PATH, 'utf8'));
let changed = false;

for (const b of (data.bookings || [])) {
  if (b.status === 'Confirmee' && !b.emailed && b.email && /@/.test(b.email)) {
    const { subject, text } = buildEmail(b);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [b.email], reply_to: REPLYTO, subject, text })
    });
    if (res.ok) {
      b.emailed = new Date().toISOString().slice(0, 16).replace('T', ' ');
      changed = true;
      console.log('Sent to', b.email);
    } else {
      console.log('Resend error for', b.email, res.status, await res.text());
    }
  }
}

if (changed) { fs.writeFileSync(PATH, JSON.stringify(data, null, 2)); console.log('Updated flags.'); }
else { console.log('Nothing to send.'); }
