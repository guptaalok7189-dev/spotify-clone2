const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─── PLAN LIMITS ──────────────────────────────────────────────
const PLANS = {
  free:    { uploadLimit: 5,         playlistLimit: 2,  visualizer: false, queue: false, analytics: false, price: 0   },
  premium: { uploadLimit: 50,        playlistLimit: 999, visualizer: true,  queue: true,  analytics: false, price: 99  },
  pro:     { uploadLimit: 999999,    playlistLimit: 999, visualizer: true,  queue: true,  analytics: true,  price: 299 },
};

// ─── DATABASE ─────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'db', 'data.json');
function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const init = { songs: [], playlists: [], liked: [], users: [], sessions: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
    return init;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (!db.users)    db.users    = [];
  if (!db.sessions) db.sessions = [];
  if (!db.liked)    db.liked    = [];
  return db;
}
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

// ─── AUTH HELPERS ──────────────────────────────────────────────
function hashPassword(p) {
  return crypto.createHash('sha256').update(p + 'spoti_salt_99').digest('hex');
}
function generateToken() { return uuidv4() + uuidv4(); }

function requireAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  const db = readDB();
  const session = db.sessions.find(s => s.token === token);
  if (!session) return res.status(401).json({ error: 'Invalid session' });
  req.userId   = session.userId;
  req.username = session.username;
  next();
}

function optionalAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (token) {
    const db = readDB();
    const session = db.sessions.find(s => s.token === token);
    if (session) { req.userId = session.userId; req.username = session.username; }
  }
  next();
}

// ─── PLAN HELPER ───────────────────────────────────────────────
function getUserPlan(userId) {
  const db   = readDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) return 'free';
  if (!user.plan || user.plan === 'free') return 'free';
  // Check expiry
  if (user.planExpiry && new Date(user.planExpiry) < new Date()) {
    // Plan expired — reset to free
    user.plan       = 'free';
    user.planExpiry = null;
    writeDB(db);
    return 'free';
  }
  return user.plan;
}

// ─── AUTH ROUTES ───────────────────────────────────────────────
app.post('/api/auth/signup', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)       return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3)          return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 4)          return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const db = readDB();
  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase()))
    return res.status(400).json({ error: 'Username already taken' });
  const user = {
    id: uuidv4(), username,
    password: hashPassword(password),
    plan: 'free', planExpiry: null,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  const token = generateToken();
  db.sessions.push({ token, userId: user.id, username: user.username });
  writeDB(db);
  res.status(201).json({ token, username: user.username, userId: user.id, plan: 'free' });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const db   = readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user)                              return res.status(400).json({ error: 'User not found' });
  if (user.password !== hashPassword(password)) return res.status(400).json({ error: 'Wrong password' });
  const plan = getUserPlan(user.id);
  const token = generateToken();
  db.sessions.push({ token, userId: user.id, username: user.username });
  writeDB(db);
  res.json({
    token, username: user.username, userId: user.id,
    plan, planExpiry: user.planExpiry || null
  });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization'];
  const db    = readDB();
  db.sessions = db.sessions.filter(s => s.token !== token);
  writeDB(db);
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const plan = getUserPlan(req.userId);
  const db   = readDB();
  const user = db.users.find(u => u.id === req.userId);
  res.json({
    userId: req.userId, username: req.username,
    plan, planExpiry: user?.planExpiry || null,
    planFeatures: PLANS[plan]
  });
});

// ─── MEMBERSHIP ROUTES ─────────────────────────────────────────

// Get all plans info
app.get('/api/plans', (req, res) => {
  res.json(PLANS);
});

// Get current user's plan status
app.get('/api/membership', requireAuth, (req, res) => {
  const plan = getUserPlan(req.userId);
  const db   = readDB();
  const user = db.users.find(u => u.id === req.userId);
  const mySongs = db.songs.filter(s => s.uploadedBy === req.userId).length;
  const myPlaylists = db.playlists.filter(p => p.userId === req.userId).length;
  res.json({
    plan,
    planExpiry:   user?.planExpiry || null,
    features:     PLANS[plan],
    usage: {
      songs:     mySongs,
      playlists: myPlaylists,
      songLimit:     PLANS[plan].uploadLimit,
      playlistLimit: PLANS[plan].playlistLimit,
    }
  });
});

// Upgrade plan (fake payment — validate card format then upgrade)
app.post('/api/membership/upgrade', requireAuth, (req, res) => {
  const { plan, cardNumber, cardName, expiry, cvv } = req.body;

  // Validate plan
  if (!['premium', 'pro'].includes(plan))
    return res.status(400).json({ error: 'Invalid plan' });

  // Validate card details
  if (!cardName || cardName.trim().length < 2)
    return res.status(400).json({ error: 'Please enter cardholder name' });

  const cleanCard = cardNumber?.replace(/\s/g, '');
  if (!cleanCard || !/^\d{16}$/.test(cleanCard))
    return res.status(400).json({ error: 'Card number must be 16 digits' });

  if (!expiry || !/^(0[1-9]|1[0-2])\/([2-9]\d)$/.test(expiry.replace(/\s/g,'')))
    return res.status(400).json({ error: 'Invalid expiry date (MM/YY)' });

  // Check expiry not in past
  const [mm, yy] = expiry.replace(/\s/g,'').split('/');
  const expDate  = new Date(2000 + parseInt(yy), parseInt(mm) - 1, 1);
  if (expDate < new Date())
    return res.status(400).json({ error: 'Card has expired' });

  if (!cvv || !/^\d{3,4}$/.test(cvv))
    return res.status(400).json({ error: 'CVV must be 3 or 4 digits' });

  // All valid — upgrade user
  const db   = readDB();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Set plan expiry to 30 days from now
  const expiry30 = new Date();
  expiry30.setDate(expiry30.getDate() + 30);

  user.plan       = plan;
  user.planExpiry = expiry30.toISOString();

  // Save masked card info for display
  user.cardLast4  = cleanCard.slice(-4);
  user.cardName   = cardName.trim();

  writeDB(db);

  res.json({
    success: true,
    plan,
    planExpiry:  expiry30.toISOString(),
    features:    PLANS[plan],
    cardLast4:   cleanCard.slice(-4),
    message:     `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan activated!`
  });
});

// Cancel / downgrade to free
app.post('/api/membership/cancel', requireAuth, (req, res) => {
  const db   = readDB();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.plan       = 'free';
  user.planExpiry = null;
  writeDB(db);
  res.json({ success: true, plan: 'free', message: 'Subscription cancelled' });
});

// ─── MULTER ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.ogg', '.flac', '.m4a'];
    allowed.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(new Error('Audio files only'));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ─── SONGS ─────────────────────────────────────────────────────
app.get('/api/songs', (req, res) => {
  const db = readDB();
  let songs = db.songs;
  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    songs   = songs.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      (s.album || '').toLowerCase().includes(q)
    );
  }
  res.json(songs);
});

app.post('/api/songs', requireAuth, upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });
  const { title, artist, album, duration } = req.body;
  if (!title || !artist) return res.status(400).json({ error: 'Title and artist required' });

  // Check upload limit
  const db       = readDB();
  const plan     = getUserPlan(req.userId);
  const myCount  = db.songs.filter(s => s.uploadedBy === req.userId).length;
  const limit    = PLANS[plan].uploadLimit;
  if (myCount >= limit) {
    // Delete uploaded file since we're rejecting
    fs.unlinkSync(path.join(uploadDir, req.file.filename));
    return res.status(403).json({
      error: `Upload limit reached! ${plan} plan allows ${limit} songs. Upgrade to upload more.`,
      limitReached: true,
      plan
    });
  }

  const song = {
    id: uuidv4(), title, artist,
    album:      album || 'Unknown Album',
    duration:   parseFloat(duration) || 0,
    filename:   req.file.filename,
    url:        `/uploads/${req.file.filename}`,
    cover:      null,
    uploadedBy: req.userId,
    uploadedByUsername: req.username,
    createdAt:  new Date().toISOString()
  };
  db.songs.push(song);
  writeDB(db);
  res.status(201).json(song);
});

app.delete('/api/songs/:id', requireAuth, (req, res) => {
  const db  = readDB();
  const idx = db.songs.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Song not found' });
  if (db.songs[idx].uploadedBy !== req.userId)
    return res.status(403).json({ error: 'Not your song' });
  const filePath = path.join(uploadDir, db.songs[idx].filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.playlists.forEach(p => { p.songs = p.songs.filter(id => id !== req.params.id); });
  db.songs.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// ─── PLAYLISTS ──────────────────────────────────────────────────
app.get('/api/playlists', optionalAuth, (req, res) => {
  const db = readDB();
  let pl   = req.userId ? db.playlists.filter(p => p.userId === req.userId) : [];
  res.json(pl.map(p => ({ ...p, songCount: p.songs.length })));
});

app.get('/api/playlists/:id', (req, res) => {
  const db       = readDB();
  const playlist = db.playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });
  const songs    = playlist.songs.map(sid => db.songs.find(s => s.id === sid)).filter(Boolean);
  res.json({ ...playlist, songs });
});

app.post('/api/playlists', requireAuth, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  // Check playlist limit
  const db    = readDB();
  const plan  = getUserPlan(req.userId);
  const myCount = db.playlists.filter(p => p.userId === req.userId).length;
  const limit = PLANS[plan].playlistLimit;
  if (myCount >= limit) {
    return res.status(403).json({
      error: `Playlist limit reached! ${plan} plan allows ${limit} playlists. Upgrade to create more.`,
      limitReached: true,
      plan
    });
  }

  const playlist = {
    id: uuidv4(), name,
    description: description || '',
    songs:   [],
    userId:  req.userId,
    username: req.username,
    createdAt: new Date().toISOString()
  };
  db.playlists.push(playlist);
  writeDB(db);
  res.status(201).json(playlist);
});

app.delete('/api/playlists/:id', requireAuth, (req, res) => {
  const db  = readDB();
  const idx = db.playlists.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (db.playlists[idx].userId !== req.userId)
    return res.status(403).json({ error: 'Not your playlist' });
  db.playlists.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

app.post('/api/playlists/:id/songs', requireAuth, (req, res) => {
  const db       = readDB();
  const playlist = db.playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });
  if (!playlist.songs.includes(req.body.songId)) {
    playlist.songs.push(req.body.songId);
    writeDB(db);
  }
  res.json(playlist);
});

app.delete('/api/playlists/:id/songs/:songId', requireAuth, (req, res) => {
  const db       = readDB();
  const playlist = db.playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });
  playlist.songs = playlist.songs.filter(id => id !== req.params.songId);
  writeDB(db);
  res.json(playlist);
});

// ─── LIKED ──────────────────────────────────────────────────────
app.get('/api/liked', requireAuth, (req, res) => {
  const db  = readDB();
  const ids = db.liked.filter(l => l.userId === req.userId).map(l => l.songId);
  res.json(ids.map(id => db.songs.find(s => s.id === id)).filter(Boolean));
});

app.post('/api/liked/:songId', requireAuth, (req, res) => {
  const db = readDB();
  if (!db.liked.find(l => l.userId === req.userId && l.songId === req.params.songId)) {
    db.liked.push({ userId: req.userId, songId: req.params.songId });
    writeDB(db);
  }
  res.json({ liked: true });
});

app.delete('/api/liked/:songId', requireAuth, (req, res) => {
  const db = readDB();
  db.liked = db.liked.filter(l => !(l.userId === req.userId && l.songId === req.params.songId));
  writeDB(db);
  res.json({ liked: false });
});

// ─── ANALYTICS (Pro only) ───────────────────────────────────────
app.post('/api/songs/:id/play', optionalAuth, (req, res) => {
  const db  = readDB();
  const idx = db.songs.findIndex(s => s.id === req.params.id);
  if (idx !== -1) {
    db.songs[idx].playCount = (db.songs[idx].playCount || 0) + 1;
    writeDB(db);
  }
  res.json({ success: true });
});

app.get('/api/analytics', requireAuth, (req, res) => {
  const plan = getUserPlan(req.userId);
  if (plan !== 'pro')
    return res.status(403).json({ error: 'Analytics is a Pro feature. Upgrade to access.' });
  const db      = readDB();
  const mySongs = db.songs.filter(s => s.uploadedBy === req.userId);
  const data    = mySongs.map(s => ({
    id: s.id, title: s.title, artist: s.artist,
    playCount: s.playCount || 0,
    createdAt: s.createdAt
  })).sort((a, b) => b.playCount - a.playCount);
  const totalPlays = data.reduce((sum, s) => sum + s.playCount, 0);
  res.json({ songs: data, totalPlays, totalSongs: data.length });
});

// ─── START ──────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🎵 Running at http://localhost:${PORT}`));