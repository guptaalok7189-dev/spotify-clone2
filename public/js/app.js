/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
const state = {
  songs: [], playlists: [], likedIds: new Set(),
  currentQueue: [], currentIndex: -1,
  isPlaying: false, isShuffle: false, repeatMode: 0,
  isDraggingProgress: false,
  addToPlaylistSongId: null,
  currentPlaylistId: null,
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
};

const audio = document.getElementById('audioPlayer');

/* ═══════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const fmt = s => { if (!s || isNaN(s)) return '0:00'; const m = Math.floor(s/60); return `${m}:${Math.floor(s%60).toString().padStart(2,'0')}`; };
const escHtml = str => { const el = document.createElement('div'); el.textContent = str||''; return el.innerHTML; };

function toast(msg, type = 'default') {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.background = type === 'error' ? '#3a1212' : '';
  t.style.color = type === 'error' ? '#f87171' : '';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

function coverHTML(url, cls = 'row-cover') {
  if (url) return `<div class="${cls}"><img src="${url}" alt="cover" loading="lazy"></div>`;
  return `<div class="${cls}"><i class="fas fa-music"></i></div>`;
}

function getInitial(name) { return (name || 'U')[0].toUpperCase(); }

/* ═══════════════════════════════════════════════════════════════
   API
═══════════════════════════════════════════════════════════════ */
const api = {
  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (state.token) h['Authorization'] = state.token;
    return h;
  },
  async get(url) {
    const r = await fetch(url, { headers: this.headers() });
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    return r.json();
  },
  async delete(url) {
    const r = await fetch(url, { method: 'DELETE', headers: this.headers() });
    return r.json();
  },
  async put(url, body) {
    const r = await fetch(url, { method: 'PUT', headers: this.headers(), body: JSON.stringify(body) });
    return r.json();
  },
};

/* ═══════════════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════════════ */
function togglePw(id) {
  const input = $(id);
  const btn = input.parentElement.querySelector('.toggle-pw i');
  if (input.type === 'password') { input.type = 'text'; btn.className = 'fas fa-eye-slash'; }
  else { input.type = 'password'; btn.className = 'fas fa-eye'; }
}

// Switch between login/signup
$('goToSignup').addEventListener('click', e => {
  e.preventDefault();
  $('loginForm').style.display = 'none';
  $('signupForm').style.display = 'block';
  $('loginError').textContent = '';
});
$('goToLogin').addEventListener('click', e => {
  e.preventDefault();
  $('signupForm').style.display = 'none';
  $('loginForm').style.display = 'block';
  $('signupError').textContent = '';
});

// Login
$('loginBtn').addEventListener('click', async () => {
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  if (!username || !password) { $('loginError').textContent = 'Please fill in all fields'; return; }
  $('loginBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
  const res = await api.post('/api/auth/login', { username, password });
  $('loginBtn').innerHTML = '<span>Log In</span><i class="fas fa-arrow-right"></i>';
  if (res.error) { $('loginError').textContent = res.error; return; }
  loginSuccess(res);
});

// Signup
$('signupBtn').addEventListener('click', async () => {
  const username = $('signupUsername').value.trim();
  const password = $('signupPassword').value;
  const confirm = $('signupConfirm').value;
  if (!username || !password) { $('signupError').textContent = 'Please fill in all fields'; return; }
  if (password !== confirm) { $('signupError').textContent = 'Passwords do not match'; return; }
  if (password.length < 4) { $('signupError').textContent = 'Password must be at least 4 characters'; return; }
  $('signupBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
  const res = await api.post('/api/auth/signup', { username, password });
  $('signupBtn').innerHTML = '<span>Create Account</span><i class="fas fa-arrow-right"></i>';
  if (res.error) { $('signupError').textContent = res.error; return; }
  loginSuccess(res);
});

// Enter key support
[$('loginUsername'), $('loginPassword')].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); }));
[$('signupUsername'), $('signupPassword'), $('signupConfirm')].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') $('signupBtn').click(); }));

function loginSuccess(res) {
  state.token = res.token;
  state.user = { userId: res.userId, username: res.username };
  localStorage.setItem('token', res.token);
  localStorage.setItem('user', JSON.stringify(state.user));
  showApp();
}

// Logout
$('logoutBtn').addEventListener('click', async () => {
  await api.post('/api/auth/logout', {});
  state.token = null; state.user = null;
  localStorage.removeItem('token'); localStorage.removeItem('user');
  location.reload();
});

function showApp() {
  $('authContainer').style.display = 'none';
  $('appLayout').style.display = 'grid';
  $('player').style.display = 'grid';
  document.body.classList.remove('auth-page');

  // Set profile info
  const name = state.user?.username || 'User';
  const initial = getInitial(name);
  $('profileAvatar').textContent = initial;
  $('dropdownAvatar').textContent = initial;
  $('profileUsername').textContent = name;
  $('dropdownUsername').textContent = name;
  $('profileBigAvatar').textContent = initial;
  $('profileHeroName').textContent = name;

  loadAll();
}

// Check if already logged in
if (state.token && state.user) {
  showApp();
} else {
  $('player').style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE DROPDOWN
═══════════════════════════════════════════════════════════════ */
$('profileBtn').addEventListener('click', e => {
  e.stopPropagation();
  $('profileDropdown').classList.toggle('open');
});
document.addEventListener('click', () => $('profileDropdown').classList.remove('open'));

// Dropdown nav items
document.querySelectorAll('.dropdown-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => { switchView(btn.dataset.view); $('profileDropdown').classList.remove('open'); });
});

/* ═══════════════════════════════════════════════════════════════
   VIEWS
═══════════════════════════════════════════════════════════════ */
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const view = $(`view-${name}`);
  if (view) view.classList.add('active');
  const nav = document.querySelector(`[data-view="${name}"]`);
  if (nav) nav.classList.add('active');
  if (name === 'home') loadHome();
  if (name === 'library') loadLibrary();
  if (name === 'liked') loadLiked();
  if (name === 'profile') loadProfile();
  if (name === 'search') $('searchInput').focus();
}

document.querySelectorAll('[data-view]').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); switchView(el.dataset.view); });
});

/* ═══════════════════════════════════════════════════════════════
   LOAD DATA
═══════════════════════════════════════════════════════════════ */
async function loadAll() {
  const [songs, playlists, liked] = await Promise.all([
    api.get('/api/songs'),
    api.get('/api/playlists'),
    api.get('/api/liked'),
  ]);
  state.songs = songs;
  state.playlists = playlists;
  state.likedIds = new Set(liked.map(s => s.id));
  renderSidebarPlaylists();
  loadHome();
}

/* ═══════════════════════════════════════════════════════════════
   HOME
═══════════════════════════════════════════════════════════════ */
function loadHome() {
  const h = new Date().getHours();
  $('homeGreeting').textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  renderSongList($('allSongsList'), state.songs, 'all');
}

/* ═══════════════════════════════════════════════════════════════
   LIBRARY
═══════════════════════════════════════════════════════════════ */
function loadLibrary() { renderPlaylistGrid($('libraryPlaylists'), state.playlists); }

/* ═══════════════════════════════════════════════════════════════
   LIKED
═══════════════════════════════════════════════════════════════ */
async function loadLiked() {
  const liked = await api.get('/api/liked');
  $('likedCount').textContent = `${liked.length} song${liked.length !== 1 ? 's' : ''}`;
  renderSongList($('likedSongsList'), liked, 'liked');
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE
═══════════════════════════════════════════════════════════════ */
async function loadProfile() {
  const [liked, playlists] = await Promise.all([api.get('/api/liked'), api.get('/api/playlists')]);
  const mySongs = state.songs.filter(s => s.uploadedBy === state.user?.userId);
  $('statSongs').textContent = mySongs.length;
  $('statPlaylists').textContent = playlists.length;
  $('statLiked').textContent = liked.length;
  renderSongList($('profileSongsList'), mySongs, 'profile');
}

/* ═══════════════════════════════════════════════════════════════
   RENDER SONG LIST
═══════════════════════════════════════════════════════════════ */
function renderSongList(container, songs, context = 'all', playlistId = null) {
  if (!songs.length) {
    const msgs = {
      liked: ['No liked songs yet', 'Click the ❤️ on any song to like it'],
      profile: ['No uploads yet', 'Upload your first song!'],
      default: ['No songs here', 'This list is empty']
    };
    const [title, sub] = msgs[context] || msgs.default;
    container.innerHTML = `<div class="empty-state"><i class="fas fa-music"></i><h3>${title}</h3><p>${sub}</p></div>`;
    return;
  }

  const currentSongId = state.currentQueue[state.currentIndex]?.id;

  container.innerHTML = songs.map((s, i) => `
    <div class="song-row ${s.id === currentSongId ? 'playing' : ''}" data-id="${s.id}">
      <span class="row-num">${s.id === currentSongId ? '<i class="fas fa-volume-up" style="color:var(--green)"></i>' : i + 1}</span>
      <span class="row-play" style="display:none"><i class="fas fa-play"></i></span>
      ${coverHTML(s.cover)}
      <div class="row-info">
        <div class="row-title">${escHtml(s.title)}</div>
        <div class="row-artist">${escHtml(s.artist)}${s.album && s.album !== 'Unknown Album' ? ` · ${escHtml(s.album)}` : ''}</div>
      </div>
      <div class="row-duration">${fmt(s.duration)}</div>
      <div class="row-actions">
        <button class="row-action-btn like-song-btn ${state.likedIds.has(s.id) ? 'liked' : ''}" data-id="${s.id}" title="Like">
          <i class="${state.likedIds.has(s.id) ? 'fas' : 'far'} fa-heart"></i>
        </button>
        <button class="row-action-btn add-to-playlist-btn" data-id="${s.id}" title="Add to playlist"><i class="fas fa-plus"></i></button>
        ${playlistId ? `<button class="row-action-btn remove-from-playlist-btn" data-id="${s.id}" data-playlist="${playlistId}" title="Remove"><i class="fas fa-minus"></i></button>` : ''}
        ${s.uploadedBy === state.user?.userId ? `<button class="row-action-btn delete-song-btn" data-id="${s.id}" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.song-row').forEach(row => {
    row.addEventListener('click', e => { if (e.target.closest('button')) return; playSong(row.dataset.id, songs); });
  });
  container.querySelectorAll('.like-song-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); toggleLike(btn.dataset.id); }));
  container.querySelectorAll('.add-to-playlist-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openAddToPlaylist(btn.dataset.id); }));
  container.querySelectorAll('.remove-from-playlist-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); removeFromPlaylist(btn.dataset.playlist, btn.dataset.id); }));
  container.querySelectorAll('.delete-song-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); if (confirm('Delete this song?')) deleteSong(btn.dataset.id); }));
}

/* ═══════════════════════════════════════════════════════════════
   RENDER PLAYLIST GRID
═══════════════════════════════════════════════════════════════ */
function renderPlaylistGrid(container, playlists) {
  if (!playlists.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-list"></i><h3>No playlists yet</h3><p>Create a playlist to organize your music</p></div>`;
    return;
  }
  container.innerHTML = playlists.map(p => `
    <div class="playlist-card" data-id="${p.id}">
      <div class="playlist-card-cover"><i class="fas fa-music"></i></div>
      <div class="playlist-card-title">${escHtml(p.name)}</div>
      <div class="playlist-card-desc">${p.songCount} song${p.songCount !== 1 ? 's' : ''}</div>
    </div>
  `).join('');
  container.querySelectorAll('.playlist-card').forEach(card => card.addEventListener('click', () => openPlaylist(card.dataset.id)));
}

function renderSidebarPlaylists() {
  const container = $('sidebarPlaylists');
  container.innerHTML = state.playlists.map(p => `
    <a href="#" class="nav-item" data-playlist-id="${p.id}">${escHtml(p.name)}</a>
  `).join('');
  container.querySelectorAll('[data-playlist-id]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); openPlaylist(el.dataset.playlistId); });
  });
}

/* ═══════════════════════════════════════════════════════════════
   PLAYLIST VIEW
═══════════════════════════════════════════════════════════════ */
async function openPlaylist(id) {
  const playlist = await api.get(`/api/playlists/${id}`);
  state.currentPlaylistId = id;
  $('playlistViewName').textContent = playlist.name;
  $('playlistViewDesc').textContent = playlist.description || '';
  $('playlistViewCount').textContent = `${playlist.songs.length} song${playlist.songs.length !== 1 ? 's' : ''}`;
  renderSongList($('playlistSongsList'), playlist.songs, 'playlist', id);
  $('playPlaylistBtn').onclick = () => { if (playlist.songs.length) playSong(playlist.songs[0].id, playlist.songs); };
  $('deletePlaylistBtn').onclick = () => {
    if (confirm(`Delete "${playlist.name}"?`)) {
      api.delete(`/api/playlists/${id}`).then(() => {
        state.playlists = state.playlists.filter(p => p.id !== id);
        renderSidebarPlaylists();
        toast('Playlist deleted');
        switchView('library');
      });
    }
  };
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $('view-playlist').classList.add('active');
}

async function removeFromPlaylist(playlistId, songId) {
  await api.delete(`/api/playlists/${playlistId}/songs/${songId}`);
  toast('Removed from playlist');
  openPlaylist(playlistId);
}

/* ═══════════════════════════════════════════════════════════════
   PLAYBACK
═══════════════════════════════════════════════════════════════ */
function playSong(id, queue = state.songs) {
  const idx = queue.findIndex(s => s.id === id);
  if (idx === -1) return;
  state.currentQueue = queue;
  state.currentIndex = idx;
  loadTrack(queue[idx]);
  audio.play();
  state.isPlaying = true;
  updatePlayBtn();
  updateQueuePanel();
}

function loadTrack(song) {
  if (!song) return;
  audio.src = song.url;
  $('playerTitle').textContent = song.title;
  $('playerArtist').textContent = song.artist;
  const cover = $('playerCover');
  cover.innerHTML = song.cover ? `<img src="${song.cover}" alt="cover">` : `<i class="fas fa-music"></i>`;
  cover.classList.add('spinning');

  const lb = $('playerLikeBtn');
  lb.className = `like-btn ${state.likedIds.has(song.id) ? 'liked' : ''}`;
  lb.innerHTML = `<i class="${state.likedIds.has(song.id) ? 'fas' : 'far'} fa-heart"></i>`;
  lb.onclick = () => toggleLike(song.id);

  document.title = `${song.title} — ${song.artist}`;
  $('progressPlayed').style.width = '0';
  $('currentTime').textContent = '0:00';

  // Re-render song list to update playing state
  const activeList = document.querySelector('.view.active .song-list');
  if (activeList) {
    activeList.querySelectorAll('.song-row').forEach(row => {
      row.classList.toggle('playing', row.dataset.id === song.id);
    });
  }
}

function updatePlayBtn() {
  $('playPauseBtn').innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
  if (state.isPlaying) $('playerCover').classList.add('spinning');
  else $('playerCover').classList.remove('spinning');
}

$('playPauseBtn').addEventListener('click', () => {
  if (!audio.src) return;
  if (state.isPlaying) { audio.pause(); state.isPlaying = false; }
  else { audio.play(); state.isPlaying = true; }
  updatePlayBtn();
});

$('nextBtn').addEventListener('click', playNext);
$('prevBtn').addEventListener('click', () => { if (audio.currentTime > 3) { audio.currentTime = 0; return; } playPrev(); });

$('shuffleBtn').addEventListener('click', () => {
  state.isShuffle = !state.isShuffle;
  $('shuffleBtn').classList.toggle('active', state.isShuffle);
  toast(state.isShuffle ? 'Shuffle on' : 'Shuffle off');
});

$('repeatBtn').addEventListener('click', () => {
  state.repeatMode = (state.repeatMode + 1) % 3;
  const btn = $('repeatBtn');
  if (state.repeatMode === 0) { btn.innerHTML = '<i class="fas fa-redo"></i>'; btn.classList.remove('active'); toast('Repeat off'); }
  if (state.repeatMode === 1) { btn.innerHTML = '<i class="fas fa-redo"></i>'; btn.classList.add('active'); toast('Repeat all'); }
  if (state.repeatMode === 2) { btn.innerHTML = '<i class="fas fa-redo-alt"></i>'; btn.classList.add('active'); toast('Repeat one'); }
});

function playNext() {
  if (!state.currentQueue.length) return;
  if (state.repeatMode === 2) { audio.currentTime = 0; audio.play(); return; }
  let idx = state.isShuffle ? Math.floor(Math.random() * state.currentQueue.length) : state.currentIndex + 1;
  if (idx >= state.currentQueue.length) { if (state.repeatMode === 1) idx = 0; else return; }
  state.currentIndex = idx;
  loadTrack(state.currentQueue[idx]);
  audio.play(); state.isPlaying = true; updatePlayBtn(); updateQueuePanel();
}

function playPrev() {
  if (!state.currentQueue.length) return;
  let idx = state.currentIndex - 1;
  if (idx < 0) idx = state.repeatMode === 1 ? state.currentQueue.length - 1 : 0;
  state.currentIndex = idx;
  loadTrack(state.currentQueue[idx]);
  audio.play(); state.isPlaying = true; updatePlayBtn(); updateQueuePanel();
}

audio.addEventListener('ended', playNext);
audio.addEventListener('play', () => { state.isPlaying = true; updatePlayBtn(); });
audio.addEventListener('pause', () => { state.isPlaying = false; updatePlayBtn(); });
audio.addEventListener('timeupdate', () => {
  if (state.isDraggingProgress) return;
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  $('progressPlayed').style.width = pct + '%';
  $('progressThumb').style.left = pct + '%';
  $('currentTime').textContent = fmt(audio.currentTime);
  $('totalTime').textContent = fmt(audio.duration);
});

/* ═══════════════════════════════════════════════════════════════
   PROGRESS SCRUBBING
═══════════════════════════════════════════════════════════════ */
const progressTrack = $('progressTrack');
progressTrack.addEventListener('mousedown', e => {
  state.isDraggingProgress = true;
  scrub(e, progressTrack);
  const move = e => scrub(e, progressTrack);
  const up = () => { state.isDraggingProgress = false; window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', move); };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
});
function scrub(e, track) {
  const rect = track.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  if (audio.duration) { audio.currentTime = pct * audio.duration; $('progressPlayed').style.width = (pct*100)+'%'; $('progressThumb').style.left = (pct*100)+'%'; }
}

/* ═══════════════════════════════════════════════════════════════
   VOLUME
═══════════════════════════════════════════════════════════════ */
const volumeTrack = $('volumeTrack');
volumeTrack.addEventListener('mousedown', e => {
  setVolume(e);
  const move = e => setVolume(e);
  const up = () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', move); };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
});
function setVolume(e) {
  const rect = volumeTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.volume = pct;
  $('volumeFill').style.width = (pct*100)+'%';
  $('volumeThumb').style.left = (pct*100)+'%';
}
audio.volume = 0.7;

/* ═══════════════════════════════════════════════════════════════
   LIKE
═══════════════════════════════════════════════════════════════ */
async function toggleLike(songId) {
  if (state.likedIds.has(songId)) {
    await api.delete(`/api/liked/${songId}`);
    state.likedIds.delete(songId);
    toast('Removed from Liked Songs');
  } else {
    await api.post(`/api/liked/${songId}`, {});
    state.likedIds.add(songId);
    toast('Added to Liked Songs ❤️');
  }
  const cur = state.currentQueue[state.currentIndex];
  if (cur?.id === songId) {
    $('playerLikeBtn').className = `like-btn ${state.likedIds.has(songId) ? 'liked' : ''}`;
    $('playerLikeBtn').innerHTML = `<i class="${state.likedIds.has(songId) ? 'fas' : 'far'} fa-heart"></i>`;
  }
  if ($('view-liked').classList.contains('active')) loadLiked();

  // Update heart icon in current list
  document.querySelectorAll(`.like-song-btn[data-id="${songId}"]`).forEach(btn => {
    btn.className = `row-action-btn like-song-btn ${state.likedIds.has(songId) ? 'liked' : ''}`;
    btn.innerHTML = `<i class="${state.likedIds.has(songId) ? 'fas' : 'far'} fa-heart"></i>`;
  });
}

/* ═══════════════════════════════════════════════════════════════
   SEARCH
═══════════════════════════════════════════════════════════════ */
let searchTimeout;
$('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  if (!q) { $('searchResultTitle').textContent = 'Search for something'; $('searchResults').innerHTML = ''; return; }
  searchTimeout = setTimeout(async () => {
    const songs = await api.get(`/api/songs?search=${encodeURIComponent(q)}`);
    $('searchResultTitle').textContent = songs.length ? `Results for "${q}"` : `No results for "${q}"`;
    renderSongList($('searchResults'), songs, 'search');
  }, 300);
});

/* ═══════════════════════════════════════════════════════════════
   UPLOAD
═══════════════════════════════════════════════════════════════ */
function openUpload() { openModal('uploadModal'); }
$('openUploadBtn').addEventListener('click', openUpload);
$('homeUploadBtn').addEventListener('click', openUpload);
$('closeUploadModal').addEventListener('click', () => closeModal('uploadModal'));

const dropZone = $('dropZone');
const audioFileInput = $('audioFileInput');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]); });
dropZone.addEventListener('click', () => audioFileInput.click());
audioFileInput.addEventListener('change', e => { if (e.target.files[0]) handleFileSelect(e.target.files[0]); });

function handleFileSelect(file) {
  $('selectedFileName').textContent = file.name;
  audioFileInput._file = file;
  if (!$('uploadTitle').value) $('uploadTitle').value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
}

$('uploadSongBtn').addEventListener('click', async () => {
  const file = audioFileInput._file || audioFileInput.files[0];
  const title = $('uploadTitle').value.trim();
  const artist = $('uploadArtist').value.trim();
  const album = $('uploadAlbum').value.trim();
  if (!file) { toast('Please select an audio file', 'error'); return; }
  if (!title || !artist) { toast('Title and artist are required', 'error'); return; }

  const duration = await getAudioDuration(file);
  const formData = new FormData();
  formData.append('audio', file);
  formData.append('title', title);
  formData.append('artist', artist);
  formData.append('album', album);
  formData.append('duration', duration);

  $('uploadProgress').style.display = 'flex';
  $('progressFill').style.width = '0%';

  const xhr = new XMLHttpRequest();
  xhr.upload.onprogress = e => {
    if (e.lengthComputable) { const pct = (e.loaded/e.total*100).toFixed(0); $('progressFill').style.width = pct+'%'; $('progressText').textContent = `Uploading... ${pct}%`; }
  };
  xhr.onload = () => {
    if (xhr.status === 201) {
      const song = JSON.parse(xhr.responseText);
      state.songs.push(song);
      toast('🎵 Song uploaded!');
      closeModal('uploadModal');
      resetUploadForm();
      loadHome();
    } else { toast('Upload failed', 'error'); }
    $('uploadProgress').style.display = 'none';
  };
  xhr.onerror = () => { toast('Upload failed', 'error'); $('uploadProgress').style.display = 'none'; };
  xhr.open('POST', '/api/songs');
  xhr.setRequestHeader('Authorization', state.token);
  xhr.send(formData);
});

function getAudioDuration(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const a = new Audio(url);
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(a.duration || 0); };
    a.onerror = () => resolve(0);
  });
}

function resetUploadForm() {
  $('uploadTitle').value = ''; $('uploadArtist').value = ''; $('uploadAlbum').value = '';
  $('selectedFileName').textContent = ''; audioFileInput.value = ''; audioFileInput._file = null;
  $('uploadProgress').style.display = 'none';
}

async function deleteSong(id) {
  await api.delete(`/api/songs/${id}`);
  state.songs = state.songs.filter(s => s.id !== id);
  state.likedIds.delete(id);
  toast('Song deleted');
  loadHome();
  if ($('view-profile').classList.contains('active')) loadProfile();
}

/* ═══════════════════════════════════════════════════════════════
   PLAYLISTS
═══════════════════════════════════════════════════════════════ */
$('createPlaylistBtn').addEventListener('click', () => openModal('createPlaylistModal'));
$('closePlaylistModal').addEventListener('click', () => closeModal('createPlaylistModal'));
$('createPlaylistSubmit').addEventListener('click', async () => {
  const name = $('playlistName').value.trim();
  if (!name) { toast('Playlist name required', 'error'); return; }
  const p = await api.post('/api/playlists', { name, description: $('playlistDesc').value.trim() });
  if (p.error) { toast(p.error, 'error'); return; }
  state.playlists.push(p);
  renderSidebarPlaylists();
  toast(`✅ Playlist "${name}" created`);
  closeModal('createPlaylistModal');
  $('playlistName').value = ''; $('playlistDesc').value = '';
  openPlaylist(p.id);
});

function openAddToPlaylist(songId) {
  state.addToPlaylistSongId = songId;
  const list = $('playlistPickerList');
  if (!state.playlists.length) {
    list.innerHTML = `<div class="empty-state"><p>No playlists yet. Create one first!</p></div>`;
  } else {
    list.innerHTML = state.playlists.map(p => `
      <div class="playlist-picker-item" data-id="${p.id}">
        <div class="playlist-picker-icon"><i class="fas fa-music"></i></div>
        <div class="playlist-picker-name">${escHtml(p.name)}</div>
      </div>
    `).join('');
    list.querySelectorAll('.playlist-picker-item').forEach(item => {
      item.addEventListener('click', async () => {
        const res = await api.post(`/api/playlists/${item.dataset.id}/songs`, { songId: state.addToPlaylistSongId });
        if (res.error) { toast(res.error, 'error'); return; }
        toast('Added to playlist ✅');
        closeModal('addToPlaylistModal');
        const updated = await api.get('/api/playlists');
        state.playlists = updated;
        renderSidebarPlaylists();
      });
    });
  }
  openModal('addToPlaylistModal');
}
$('closeAddToPlaylist').addEventListener('click', () => closeModal('addToPlaylistModal'));

/* ═══════════════════════════════════════════════════════════════
   QUEUE PANEL
═══════════════════════════════════════════════════════════════ */
$('queueBtn').addEventListener('click', () => {
  $('queuePanel').classList.toggle('open');
  updateQueuePanel();
});
$('closeQueue').addEventListener('click', () => $('queuePanel').classList.remove('open'));

function updateQueuePanel() {
  const cur = state.currentQueue[state.currentIndex];
  if (!cur) { $('queueNowPlaying').innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Nothing playing</p>'; $('queueNextList').innerHTML = ''; return; }

  $('queueNowPlaying').innerHTML = `
    <div class="queue-song active">
      ${coverHTML(cur.cover, 'queue-song-cover')}
      <div class="queue-song-info">
        <div class="queue-song-title">${escHtml(cur.title)}</div>
        <div class="queue-song-artist">${escHtml(cur.artist)}</div>
      </div>
    </div>
  `;

  const next = state.currentQueue.slice(state.currentIndex + 1, state.currentIndex + 6);
  if (!next.length) { $('queueNextList').innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Nothing next</p>'; return; }
  $('queueNextList').innerHTML = next.map((s, i) => `
    <div class="queue-song" data-id="${s.id}" style="cursor:pointer">
      ${coverHTML(s.cover, 'queue-song-cover')}
      <div class="queue-song-info">
        <div class="queue-song-title">${escHtml(s.title)}</div>
        <div class="queue-song-artist">${escHtml(s.artist)}</div>
      </div>
    </div>
  `).join('');
  $('queueNextList').querySelectorAll('.queue-song').forEach(el => {
    el.addEventListener('click', () => playSong(el.dataset.id, state.currentQueue));
  });
}

/* ═══════════════════════════════════════════════════════════════
   MUSIC VISUALIZER
═══════════════════════════════════════════════════════════════ */
let audioCtx, analyser, source, vizAnimId;

function setupVisualizer() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 64;
  source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  drawVisualizer();
}

function drawVisualizer() {
  const canvas = $('visualizer');
  const ctx = canvas.getContext('2d');
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    vizAnimId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barW = (canvas.width / bufferLength) * 2.5;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const barH = (dataArray[i] / 255) * canvas.height;
      const green = 29 + (dataArray[i] / 255) * 100;
      ctx.fillStyle = `rgb(29, ${green}, 84)`;
      ctx.fillRect(x, canvas.height - barH, barW - 1, barH);
      x += barW;
    }
  }
  draw();
}

audio.addEventListener('play', () => {
  try { setupVisualizer(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch(e) {}
});

/* ═══════════════════════════════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════════════════════════════ */
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); $('playPauseBtn').click(); }
  if (e.code === 'ArrowRight' && e.shiftKey) playNext();
  else if (e.code === 'ArrowRight') { audio.currentTime = Math.min(audio.duration||0, audio.currentTime+10); }
  if (e.code === 'ArrowLeft' && e.shiftKey) playPrev();
  else if (e.code === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime-10); }
  if (e.code === 'ArrowUp') { audio.volume = Math.min(1, audio.volume+0.1); $('volumeFill').style.width=(audio.volume*100)+'%'; }
  if (e.code === 'ArrowDown') { audio.volume = Math.max(0, audio.volume-0.1); $('volumeFill').style.width=(audio.volume*100)+'%'; }
  if (e.code === 'KeyQ') $('queueBtn').click();
});
