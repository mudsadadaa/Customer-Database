// server.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
require('dotenv').config();

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- middleware
app.use(cors());                 // frontend is served by same app; fine for demo
app.use(express.json());
app.use(morgan('dev'));

// When running behind a proxy/HTTPS (Cloud Run), this lets secure cookies work:
app.set('trust proxy', 1);

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-change-me';
const COOKIE_SECURE = (process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true';
const DEMO_MODE     = (process.env.DEMO_MODE || 'false').toLowerCase() === 'true';

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,        // helps block XSS from reading the cookie
      sameSite: 'lax',       // keeps login working on same-site navigations
      secure: COOKIE_SECURE, // set true on Cloud Run (HTTPS)
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

// serve the frontend
app.use(express.static(path.join(__dirname, 'public')));

// ---------- validation helpers (basic but useful)
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^[0-9+()\-.\s]{7,20}$/;
const normStatus = (s) =>
  String(s || 'active').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';

function assertClientCreate(body) {
  const errors = [];
  if (!body.name || String(body.name).trim().length < 1) errors.push('name required');
  if (body.name && String(body.name).length > 100) errors.push('name too long');
  if (body.email && !emailRe.test(body.email)) errors.push('invalid email');
  if (body.phone && !phoneRe.test(body.phone)) errors.push('invalid phone');
  return errors;
}
function assertClientUpdate(body) {
  const errors = [];
  if ('name' in body && (!body.name || String(body.name).trim().length < 1)) errors.push('name required if provided');
  if ('name' in body && String(body.name).length > 100) errors.push('name too long');
  if ('email' in body && body.email && !emailRe.test(body.email)) errors.push('invalid email');
  if ('phone' in body && body.phone && !phoneRe.test(body.phone)) errors.push('invalid phone');
  return errors;
}

// ---------- auth: seed one admin on boot if missing
async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme';
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM users WHERE email = ?', [adminEmail], async (e, row) => {
      if (e) return reject(e);
      if (row) return resolve('admin exists');
      try {
        const hash = await bcrypt.hash(adminPassword, 12);
        db.run('INSERT INTO users(email, password_hash) VALUES(?, ?)', [adminEmail, hash], (e2) => {
          if (e2) reject(e2);
          else {
            console.log(`Seeded admin user: ${adminEmail} (change password!)`);
            resolve('seeded');
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// ---------- login/logout/me endpoints
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  db.get('SELECT id, password_hash, email FROM users WHERE email = ?', [email], async (e, row) => {
    if (e) return res.status(500).json({ error: 'db error' });
    if (!row) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    req.session.userId = row.id; // <- this sets your “I’m logged in” session
    res.json({ email: row.email });
  });
});

app.post('/auth/logout', (req, res) => {
  req.session?.destroy(() => res.json({ ok: true }));
});

app.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'unauthorized' });
  db.get('SELECT email FROM users WHERE id = ?', [req.session.userId], (e, row) => {
    if (e || !row) return res.status(401).json({ error: 'unauthorized' });
    res.json({ email: row.email });
  });
});

// ---------- optional demo login (no password) ----------
app.post('/auth/demo', (req, res) => {
  if (!DEMO_MODE) return res.status(404).json({ error: 'demo disabled' });
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@local';
  db.get('SELECT id, email FROM users WHERE email = ?', [adminEmail], (e, row) => {
    if (e || !row) return res.status(500).json({ error: 'admin not found' });
    req.session.userId = row.id;
    res.json({ email: row.email, demo: true });
  });
});

// ---------- CRUD (now protected by requireAuth)
app.get('/clients', requireAuth, (_, res) => {
  db.all('SELECT * FROM clients ORDER BY id DESC', [], (e, rows) =>
    e ? res.status(500).json({ e: String(e) }) : res.json(rows)
  );
});

app.get('/clients/:id', requireAuth, (req, res) => {
  db.get('SELECT * FROM clients WHERE id = ?', [req.params.id], (e, row) =>
    row ? res.json(row) : res.status(404).json({ error: 'Not found' })
  );
});

app.post('/clients', requireAuth, (req, res) => {
  const body = req.body || {};
  const errs = assertClientCreate(body);
  if (errs.length) return res.status(400).json({ error: errs.join(', ') });

  const { name, email, phone, address } = body;
  const status = normStatus(body.status);

  db.run(
    'INSERT INTO clients(name,email,phone,address,status) VALUES(?,?,?,?,?)',
    [String(name).trim(), email || null, phone || null, address || null, status],
    function (e) {
      e ? res.status(500).json({ e: String(e) }) : res.json({ id: this.lastID });
    }
  );
});

app.put('/clients/:id', requireAuth, (req, res) => {
  const body = req.body || {};
  const errs = assertClientUpdate(body);
  if (errs.length) return res.status(400).json({ error: errs.join(', ') });

  const name = 'name' in body ? String(body.name).trim() : undefined;
  const email = 'email' in body ? body.email || null : undefined;
  const phone = 'phone' in body ? body.phone || null : undefined;
  const address = 'address' in body ? body.address || null : undefined;
  const status = 'status' in body ? normStatus(body.status) : undefined;

  db.run(
    `UPDATE clients SET 
      name=COALESCE(?,name),
      email=COALESCE(?,email),
      phone=COALESCE(?,phone),
      address=COALESCE(?,address),
      status=COALESCE(?,status),
      updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
    [name, email, phone, address, status, req.params.id],
    function (e) {
      e ? res.status(500).json({ e: String(e) }) : res.json({ updated: this.changes });
    }
  );
});

app.delete('/clients/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM clients WHERE id=?', [req.params.id], function (e) {
    e ? res.status(500).json({ e: String(e) }) : res.json({ deleted: this.changes });
  });
});

// ---------- boot
seedAdmin().catch((e) => console.error('Admin seed error:', e));
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
