const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'db', 'data.json');
function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { songs: [], playlists: [], liked: [], users: [], sessions: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (!db.users) db.users = [];
  if (!db.sessions) db.sessions = [];
  if (!db.liked) db.liked = [];
  return db;
}
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
function hashPassword(p) { return crypto.createHash('sha256').update(p + 'spoti_salt_99').digest('hex'); }
function generateToken() { return uuidv4() + uuidv4(); }

function requireAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  const db = readDB();
  const session = db.sessions.find(s => s.token === token);
  if (!session) return res.status(401).json({ error: 'Invalid session' });
  req.userId = session.userId;
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

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/auth/signup', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const db = readDB();
  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase()))
    return res.status(400).json({ error: 'Username already taken' });
  const user = { id: uuidv4(), username, password: hashPassword(password), createdAt: new Date().toISOString() };
  db.users.push(user);
  const token = generateToken();
  db.sessions.push({ token, userId: user.id, username: user.username });
  writeDB(db);
  res.status(201).json({ token, username: user.username, userId: user.id });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const db = readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(400).json({ error: 'User not found' });
  if (user.password !== hashPassword(password)) return res.status(400).json({ error: 'Wrong password' });
  const token = generateToken();
  db.sessions.push({ token, userId: user.id, username: user.username });
  writeDB(db);
  res.json({ token, username: user.username, userId: user.id });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization'];
  const db = readDB();
  db.sessions = db.sessions.filter(s => s.token !== token);
  writeDB(db);
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ userId: req.userId, username: req.username });
});

// ─── MULTER ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.ogg', '.flac', '.m4a'];
    allowed.includes(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('Audio only'));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ─── SONGS ────────────────────────────────────────────────────────────────────
app.get('/api/songs', (req, res) => {
  const db = readDB();
  let songs = db.songs;
  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    songs = songs.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
  }
  res.json(songs);
});

app.post('/api/songs', requireAuth, upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });
  const { title, artist, album, duration } = req.body;
  if (!title || !artist) return res.status(400).json({ error: 'Title and artist required' });
  const db = readDB();
  const song = {
    id: uuidv4(), title, artist,
    album: album || 'Unknown Album',
    duration: parseFloat(duration) || 0,
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    cover: null,
    uploadedBy: req.userId,
    uploadedByUsername: req.username,
    createdAt: new Date().toISOString()
  };
  db.songs.push(song);
  writeDB(db);
  res.status(201).json(song);
});

app.delete('/api/songs/:id', requireAuth, (req, res) => {
  const db = readDB();
  const idx = db.songs.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Song not found' });
  if (db.songs[idx].uploadedBy !== req.userId) return res.status(403).json({ error: 'Not your song' });
  const filePath = path.join(uploadDir, db.songs[idx].filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.playlists.forEach(p => { p.songs = p.songs.filter(id => id !== req.params.id); });
  db.songs.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// ─── PLAYLISTS ────────────────────────────────────────────────────────────────
app.get('/api/playlists', optionalAuth, (req, res) => {
  const db = readDB();
  let pl = req.userId ? db.playlists.filter(p => p.userId === req.userId) : [];
  res.json(pl.map(p => ({ ...p, songCount: p.songs.length })));
});

app.get('/api/playlists/:id', (req, res) => {
  const db = readDB();
  const playlist = db.playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });
  const songs = playlist.songs.map(sid => db.songs.find(s => s.id === sid)).filter(Boolean);
  res.json({ ...playlist, songs });
});

app.post('/api/playlists', requireAuth, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const db = readDB();
  const playlist = { id: uuidv4(), name, description: description || '', songs: [], userId: req.userId, username: req.username, createdAt: new Date().toISOString() };
  db.playlists.push(playlist);
  writeDB(db);
  res.status(201).json(playlist);
});

app.delete('/api/playlists/:id', requireAuth, (req, res) => {
  const db = readDB();
  const idx = db.playlists.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (db.playlists[idx].userId !== req.userId) return res.status(403).json({ error: 'Not your playlist' });
  db.playlists.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

app.post('/api/playlists/:id/songs', requireAuth, (req, res) => {
  const db = readDB();
  const playlist = db.playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });
  if (!playlist.songs.includes(req.body.songId)) { playlist.songs.push(req.body.songId); writeDB(db); }
  res.json(playlist);
});

app.delete('/api/playlists/:id/songs/:songId', requireAuth, (req, res) => {
  const db = readDB();
  const playlist = db.playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });
  playlist.songs = playlist.songs.filter(id => id !== req.params.songId);
  writeDB(db);
  res.json(playlist);
});

// ─── LIKED ────────────────────────────────────────────────────────────────────
app.get('/api/liked', requireAuth, (req, res) => {
  const db = readDB();
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

app.listen(PORT, () => console.log(`🎵 Running at http://localhost:${PORT}`));
