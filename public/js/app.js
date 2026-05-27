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
  user:  JSON.parse(localStorage.getItem('user') || 'null'),
  plan:  localStorage.getItem('plan') || 'free',
  planExpiry: localStorage.getItem('planExpiry') || null,
  selectedUpgradePlan: null,
};

const audio = document.getElementById('audioPlayer');

/* ═══════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const fmt = s => { if (!s || isNaN(s)) return '0:00'; return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`; };
const escHtml = str => { const el = document.createElement('div'); el.textContent = str||''; return el.innerHTML; };
const getInitial = name => (name||'U')[0].toUpperCase();

function toast(msg, type='default') {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.background = type==='error' ? '#3a1212' : type==='success' ? '#0a2a15' : '';
  t.style.color = type==='error' ? '#f87171' : type==='success' ? '#1db954' : '';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function coverHTML(url, cls='row-cover') {
  if (url) return `<div class="${cls}"><img src="${url}" alt="cover" loading="lazy"></div>`;
  return `<div class="${cls}"><i class="fas fa-music"></i></div>`;
}

function planBadgeHTML(plan, size='sm') {
  const cls = size==='lg' ? 'plan-badge-lg' : 'plan-badge';
  const label = plan==='pro' ? '👑 Pro Artist' : plan==='premium' ? '⭐ Premium' : 'Free';
  return `<span class="${cls} ${plan}">${label}</span>`;
}

function formatExpiry(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  return `Expires ${d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}`;
}

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
    const r = await fetch(url, { method:'POST', headers:this.headers(), body:JSON.stringify(body) });
    return r.json();
  },
  async delete(url) {
    const r = await fetch(url, { method:'DELETE', headers:this.headers() });
    return r.json();
  },
};

/* ═══════════════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════════════ */
function togglePw(id) {
  const input = $(id);
  const icon  = input.parentElement.querySelector('.toggle-pw i');
  if (input.type==='password') { input.type='text'; icon.className='fas fa-eye-slash'; }
  else { input.type='password'; icon.className='fas fa-eye'; }
}

$('goToSignup').addEventListener('click', e => { e.preventDefault(); $('loginForm').style.display='none'; $('signupForm').style.display='block'; });
$('goToLogin').addEventListener('click',  e => { e.preventDefault(); $('signupForm').style.display='none'; $('loginForm').style.display='block'; });

$('loginBtn').addEventListener('click', async () => {
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  if (!username || !password) { $('loginError').textContent='Please fill in all fields'; return; }
  $('loginBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
  const res = await api.post('/api/auth/login', { username, password });
  $('loginBtn').innerHTML = '<span>Log In</span><i class="fas fa-arrow-right"></i>';
  if (res.error) { $('loginError').textContent=res.error; return; }
  loginSuccess(res);
});

$('signupBtn').addEventListener('click', async () => {
  const username = $('signupUsername').value.trim();
  const password = $('signupPassword').value;
  const confirm  = $('signupConfirm').value;
  if (!username || !password) { $('signupError').textContent='Please fill in all fields'; return; }
  if (password !== confirm)   { $('signupError').textContent='Passwords do not match'; return; }
  if (password.length < 4)    { $('signupError').textContent='Password must be at least 4 characters'; return; }
  $('signupBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
  const res = await api.post('/api/auth/signup', { username, password });
  $('signupBtn').innerHTML = '<span>Create Account</span><i class="fas fa-arrow-right"></i>';
  if (res.error) { $('signupError').textContent=res.error; return; }
  loginSuccess(res);
});

[$('loginUsername'),$('loginPassword')].forEach(el => el.addEventListener('keydown', e => { if(e.key==='Enter') $('loginBtn').click(); }));
[$('signupUsername'),$('signupPassword'),$('signupConfirm')].forEach(el => el.addEventListener('keydown', e => { if(e.key==='Enter') $('signupBtn').click(); }));

function loginSuccess(res) {
  state.token  = res.token;
  state.user   = { userId: res.userId, username: res.username };
  state.plan   = res.plan || 'free';
  state.planExpiry = res.planExpiry || null;
  localStorage.setItem('token', res.token);
  localStorage.setItem('user', JSON.stringify(state.user));
  localStorage.setItem('plan', state.plan);
  localStorage.setItem('planExpiry', state.planExpiry || '');
  showApp();
}

$('logoutBtn').addEventListener('click', async () => {
  await api.post('/api/auth/logout', {});
  ['token','user','plan','planExpiry'].forEach(k => localStorage.removeItem(k));
  location.reload();
});

function showApp() {
  $('authContainer').style.display = 'none';
  $('appLayout').style.display     = 'grid';
  $('player').style.display        = 'grid';
  document.body.classList.remove('auth-page');
  updatePlanUI();
  loadAll();
}

// Check if already logged in
if (state.token && state.user) {
  // Refresh plan from server
  fetch('/api/auth/me', { headers: { 'Authorization': state.token } })
    .then(r => r.json())
    .then(res => {
      if (res.error) { localStorage.removeItem('token'); return; }
      state.plan = res.plan;
      state.planExpiry = res.planExpiry;
      localStorage.setItem('plan', res.plan);
      localStorage.setItem('planExpiry', res.planExpiry || '');
      showApp();
    })
    .catch(() => showApp());
} else {
  $('player').style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════════
   PLAN UI UPDATE
═══════════════════════════════════════════════════════════════ */
function updatePlanUI() {
  const plan = state.plan || 'free';
  const name = state.user?.username || 'User';
  const initial = getInitial(name);

  // Topbar
  $('profileAvatar').textContent  = initial;
  $('profileUsername').textContent = name;
  $('dropdownAvatar').textContent  = initial;
  $('dropdownUsername').textContent = name;
  const planBadge = $('topbarPlanBadge');
  planBadge.className = `plan-badge ${plan}`;
  planBadge.textContent = plan==='pro' ? '👑 Pro' : plan==='premium' ? '⭐ Premium' : 'Free';

  $('dropdownPlanTag').textContent = plan==='pro' ? 'Pro Artist Plan' : plan==='premium' ? 'Premium Plan' : 'Free Plan';

  // Profile
  $('profileBigAvatar').textContent = initial;
  $('profileHeroName').textContent  = name;
  const pb = $('profilePlanBadge');
  pb.className = `plan-badge-lg ${plan}`;
  pb.textContent = plan==='pro' ? '👑 Pro Artist' : plan==='premium' ? '⭐ Premium' : 'Free';
  $('profileExpiry').textContent = state.planExpiry ? formatExpiry(state.planExpiry) : '';

  // Sidebar upgrade label
  $('sidebarPlanLabel').textContent = plan==='free' ? 'Upgrade Plan' : 'Manage Plan';

  // Show analytics in sidebar for pro
  const analyticsNav = document.querySelector('[data-view="analytics"]');
  if (plan==='pro') {
    if (!analyticsNav) {
      const a = document.createElement('a');
      a.href='#'; a.className='nav-item'; a.dataset.view='analytics';
      a.innerHTML='<i class="fas fa-chart-bar"></i><span>Analytics</span>';
      a.addEventListener('click', e => { e.preventDefault(); switchView('analytics'); });
      document.querySelector('.sidebar-section').appendChild(a);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE DROPDOWN
═══════════════════════════════════════════════════════════════ */
$('profileBtn').addEventListener('click', e => { e.stopPropagation(); $('profileDropdown').classList.toggle('open'); });
document.addEventListener('click', () => $('profileDropdown').classList.remove('open'));
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
  if (name==='home')      loadHome();
  if (name==='library')   loadLibrary();
  if (name==='liked')     loadLiked();
  if (name==='profile')   loadProfile();
  if (name==='plans')     loadPlans();
  if (name==='analytics') loadAnalytics();
  if (name==='search')    $('searchInput').focus();
}

document.querySelectorAll('[data-view]').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); switchView(el.dataset.view); });
});

/* ═══════════════════════════════════════════════════════════════
   LOAD ALL
═══════════════════════════════════════════════════════════════ */
async function loadAll() {
  const [songs, playlists, liked] = await Promise.all([
    api.get('/api/songs'),
    api.get('/api/playlists'),
    api.get('/api/liked'),
  ]);
  state.songs     = songs;
  state.playlists = playlists;
  state.likedIds  = new Set(liked.map(s => s.id));
  renderSidebarPlaylists();
  loadHome();
}

/* ═══════════════════════════════════════════════════════════════
   HOME
═══════════════════════════════════════════════════════════════ */
function loadHome() {
  const h = new Date().getHours();
  $('homeGreeting').textContent = h<12 ? 'Good morning' : h<17 ? 'Good afternoon' : 'Good evening';
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
  $('likedCount').textContent = `${liked.length} song${liked.length!==1?'s':''}`;
  renderSongList($('likedSongsList'), liked, 'liked');
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE
═══════════════════════════════════════════════════════════════ */
async function loadProfile() {
  const [membership, liked, playlists] = await Promise.all([
    api.get('/api/membership'),
    api.get('/api/liked'),
    api.get('/api/playlists'),
  ]);
  const mySongs = state.songs.filter(s => s.uploadedBy === state.user?.userId);
  $('statSongs').textContent    = mySongs.length;
  $('statPlaylists').textContent = playlists.length;
  $('statLiked').textContent    = liked.length;

  // Usage bars
  const wrap = $('usageBarWrap');
  const songPct = Math.min(100, (membership.usage.songs / membership.usage.songLimit) * 100);
  const plPct   = Math.min(100, (membership.usage.playlists / (membership.usage.playlistLimit===999?membership.usage.playlists+1:membership.usage.playlistLimit)) * 100);
  const songColor = songPct>90 ? 'danger' : songPct>70 ? 'warning' : '';
  wrap.innerHTML = `
    <div class="usage-bar-card">
      <div class="usage-bar-title">
        <span>Songs Uploaded</span>
        <span>${membership.usage.songs} / ${membership.usage.songLimit===999999?'Unlimited':membership.usage.songLimit}</span>
      </div>
      <div class="usage-bar-track"><div class="usage-bar-fill ${songColor}" style="width:${membership.usage.songLimit===999999?0:songPct}%"></div></div>
    </div>
    <div class="usage-bar-card">
      <div class="usage-bar-title">
        <span>Playlists</span>
        <span>${membership.usage.playlists} / ${membership.usage.playlistLimit>=999?'Unlimited':membership.usage.playlistLimit}</span>
      </div>
      <div class="usage-bar-track"><div class="usage-bar-fill" style="width:${membership.usage.playlistLimit>=999?0:plPct}%"></div></div>
    </div>
  `;

  renderSongList($('profileSongsList'), mySongs, 'profile');
}

/* ═══════════════════════════════════════════════════════════════
   PLANS PAGE
═══════════════════════════════════════════════════════════════ */
async function loadPlans() {
  const plans = await api.get('/api/plans');
  const currentPlan = state.plan || 'free';
  const grid = $('plansGrid');

  const planList = [
    {
      key: 'free', name: 'Free', price: '₹0', period: 'forever',
      color: 'free',
      features: [
        { text: '5 songs upload', yes: true },
        { text: '2 playlists', yes: true },
        { text: 'Basic playback', yes: true },
        { text: 'Music visualizer', yes: false },
        { text: 'Queue system', yes: false },
        { text: 'Unlimited uploads', yes: false },
        { text: 'Artist analytics', yes: false },
      ]
    },
    {
      key: 'premium', name: 'Premium', price: '₹99', period: '/month',
      color: 'premium', popular: true,
      features: [
        { text: '50 songs upload', yes: true },
        { text: 'Unlimited playlists', yes: true },
        { text: 'HD playback', yes: true },
        { text: 'Music visualizer', yes: true },
        { text: 'Queue system', yes: true },
        { text: 'Unlimited uploads', yes: false },
        { text: 'Artist analytics', yes: false },
      ]
    },
    {
      key: 'pro', name: 'Pro Artist', price: '₹299', period: '/month',
      color: 'pro',
      features: [
        { text: 'Unlimited uploads', yes: true },
        { text: 'Unlimited playlists', yes: true },
        { text: 'Lossless audio', yes: true },
        { text: 'Music visualizer', yes: true },
        { text: 'Queue system', yes: true },
        { text: 'Unlimited uploads', yes: true },
        { text: 'Artist analytics', yes: true },
      ]
    },
  ];

  grid.innerHTML = planList.map(p => {
    const isCurrent = p.key === currentPlan;
    let badgeHTML = '';
    if (p.popular && !isCurrent) badgeHTML = `<div class="plan-card-badge popular-badge">Most Popular</div>`;
    if (isCurrent) badgeHTML = `<div class="plan-card-badge current-badge">Current Plan</div>`;

    let btnHTML = '';
    if (isCurrent && p.key !== 'free') {
      btnHTML = `<button class="plan-btn cancel-btn" onclick="cancelPlan()">Cancel Subscription</button>`;
    } else if (isCurrent && p.key === 'free') {
      btnHTML = `<button class="plan-btn free-btn" disabled>Current Plan</button>`;
    } else if (p.key === 'free') {
      btnHTML = `<button class="plan-btn free-btn" onclick="cancelPlan()">Downgrade to Free</button>`;
    } else {
      btnHTML = `<button class="plan-btn ${p.color}-btn" onclick="openPayment('${p.key}')">Get ${p.name}</button>`;
    }

    return `
      <div class="plan-card ${isCurrent?'current':''} ${p.popular&&!isCurrent?'popular':''}">
        ${badgeHTML}
        <div class="plan-name ${p.color}">${p.name}</div>
        <div class="plan-price">${p.price}<span>${p.period}</span></div>
        <div class="plan-features">
          ${p.features.map(f => `
            <div class="plan-feature ${f.yes?'yes':''}">
              <i class="fas ${f.yes?'fa-check yes':'fa-times no'}"></i>
              ${f.text}
            </div>
          `).join('')}
        </div>
        ${btnHTML}
      </div>
    `;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════
   PAYMENT FLOW
═══════════════════════════════════════════════════════════════ */
function openPayment(plan) {
  state.selectedUpgradePlan = plan;
  const isPremium = plan === 'premium';
  $('paymentModalTitle').textContent = `Upgrade to ${isPremium ? 'Premium' : 'Pro Artist'}`;
  $('payBtnText').textContent = `Pay ${isPremium ? '₹99' : '₹299'} — Activate`;
  $('paymentError').textContent = '';

  // Clear form
  ['cardName','cardNumber','cardExpiry','cardCvv'].forEach(id => $(id).value = '');

  $('paymentPlanSummary').innerHTML = `
    <div class="payment-plan-icon" style="background:${isPremium?'rgba(29,185,84,0.15)':'rgba(124,58,237,0.15)'}">
      <i class="fas fa-crown" style="color:${isPremium?'#1db954':'#a78bfa'}"></i>
    </div>
    <div>
      <div class="payment-plan-name">${isPremium ? '⭐ Premium Plan' : '👑 Pro Artist Plan'}</div>
      <div class="payment-plan-price">${isPremium ? '₹99' : '₹299'} / month &bull; 30 days validity</div>
    </div>
  `;
  openModal('paymentModal');
}

// Card number formatting
$('cardNumber').addEventListener('input', e => {
  let v = e.target.value.replace(/\D/g,'').slice(0,16);
  e.target.value = v.replace(/(.{4})/g,'$1 ').trim();
});

// Expiry formatting
$('cardExpiry').addEventListener('input', e => {
  let v = e.target.value.replace(/\D/g,'').slice(0,4);
  if (v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2);
  e.target.value = v;
});

// CVV — numbers only
$('cardCvv').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g,'').slice(0,4);
});

$('payNowBtn').addEventListener('click', async () => {
  const cardName   = $('cardName').value.trim();
  const cardNumber = $('cardNumber').value;
  const expiry     = $('cardExpiry').value;
  const cvv        = $('cardCvv').value;
  const plan       = state.selectedUpgradePlan;

  $('paymentError').textContent = '';

  // Client-side validation
  if (!cardName)            { $('paymentError').textContent = 'Please enter cardholder name'; return; }
  if (cardNumber.replace(/\s/g,'').length !== 16) { $('paymentError').textContent = 'Card number must be 16 digits'; return; }
  if (!expiry.includes('/') || expiry.length < 5)  { $('paymentError').textContent = 'Invalid expiry date (MM/YY)'; return; }
  if (cvv.length < 3)       { $('paymentError').textContent = 'CVV must be 3 or 4 digits'; return; }

  $('payNowBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
  $('payNowBtn').disabled  = true;

  const res = await api.post('/api/membership/upgrade', {
    plan, cardName, cardNumber, expiry, cvv
  });

  $('payNowBtn').innerHTML = `<i class="fas fa-lock"></i> <span id="payBtnText">Pay</span>`;
  $('payNowBtn').disabled  = false;

  if (res.error) { $('paymentError').textContent = res.error; return; }

  // Success!
  state.plan       = res.plan;
  state.planExpiry = res.planExpiry;
  localStorage.setItem('plan', res.plan);
  localStorage.setItem('planExpiry', res.planExpiry);

  closeModal('paymentModal');
  showSuccessModal(res);
  updatePlanUI();
  loadPlans();
});

function showSuccessModal(res) {
  const isPremium = res.plan === 'premium';
  $('successTitle').textContent = `Welcome to ${isPremium ? 'Premium' : 'Pro Artist'}!`;
  $('successSub').textContent   = `Plan is active. ${formatExpiry(res.planExpiry)}. Card ending in ****${res.cardLast4||'0000'}.`;

  const features = isPremium
    ? ['50 songs upload unlocked', 'Music visualizer unlocked', 'Queue system unlocked', 'Unlimited playlists']
    : ['Unlimited uploads unlocked', 'Artist analytics unlocked', 'All Premium features included', 'Lossless audio quality'];

  $('successFeatures').innerHTML = features.map(f =>
    `<div class="success-feature"><i class="fas fa-check"></i>${f}</div>`
  ).join('');

  openModal('successModal');
}

$('successCloseBtn').addEventListener('click', () => {
  closeModal('successModal');
  switchView('home');
  toast('🎉 Plan activated! Enjoy your new features.', 'success');
});

async function cancelPlan() {
  if (!confirm('Are you sure you want to cancel your subscription?')) return;
  const res = await api.post('/api/membership/cancel', {});
  if (res.error) { toast(res.error, 'error'); return; }
  state.plan       = 'free';
  state.planExpiry = null;
  localStorage.setItem('plan', 'free');
  localStorage.removeItem('planExpiry');
  updatePlanUI();
  loadPlans();
  toast('Subscription cancelled. You are now on Free plan.');
}

/* Upgrade prompt when limit hit */
function showUpgradePrompt(title, msg) {
  $('upgradePromptTitle').textContent = title;
  $('upgradePromptMsg').textContent   = msg;
  openModal('upgradePromptModal');
}
$('upgradePromptBtn').addEventListener('click', () => { closeModal('upgradePromptModal'); switchView('plans'); });
$('upgradePromptClose').addEventListener('click', () => closeModal('upgradePromptModal'));

/* ═══════════════════════════════════════════════════════════════
   ANALYTICS (Pro)
═══════════════════════════════════════════════════════════════ */
async function loadAnalytics() {
  if (state.plan !== 'pro') {
    $('analyticsStats').innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><h3>Pro Feature</h3><p>Analytics sirf Pro Artist plan mein available hai.</p><button class="btn-primary" style="margin-top:16px;max-width:200px" onclick="switchView('plans')">Upgrade to Pro</button></div>`;
    $('analyticsList').innerHTML = '';
    return;
  }
  const data = await api.get('/api/analytics');
  if (data.error) { $('analyticsStats').innerHTML = `<div class="empty-state"><i class="fas fa-lock"></i><h3>${data.error}</h3></div>`; return; }

  $('analyticsStats').innerHTML = `
    <div class="analytics-card"><div class="num">${data.totalSongs}</div><div class="lbl">Songs</div></div>
    <div class="analytics-card"><div class="num">${data.totalPlays}</div><div class="lbl">Total Plays</div></div>
    <div class="analytics-card"><div class="num">${data.songs[0]?.playCount||0}</div><div class="lbl">Top Song Plays</div></div>
  `;

  if (!data.songs.length) {
    $('analyticsList').innerHTML = `<div class="empty-state"><i class="fas fa-music"></i><h3>No uploads yet</h3><p>Upload songs to see analytics</p></div>`;
    return;
  }

  $('analyticsList').innerHTML = data.songs.map((s,i) => `
    <div class="song-row">
      <span class="row-num">${i+1}</span>
      <span class="row-play" style="display:none"><i class="fas fa-play"></i></span>
      <div class="row-cover"><i class="fas fa-music"></i></div>
      <div class="row-info">
        <div class="row-title">${escHtml(s.title)}</div>
        <div class="row-artist">${escHtml(s.artist)}</div>
      </div>
      <span class="play-count-badge"><i class="fas fa-play"></i> ${s.playCount}</span>
      <div class="row-actions"></div>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════════
   RENDER SONG LIST
═══════════════════════════════════════════════════════════════ */
function renderSongList(container, songs, context='all', playlistId=null) {
  if (!songs.length) {
    const msgs = { liked:['No liked songs','Click heart on any song'], profile:['No uploads yet','Upload your first song!'], default:['No songs','Empty list'] };
    const [title,sub] = msgs[context]||msgs.default;
    container.innerHTML = `<div class="empty-state"><i class="fas fa-music"></i><h3>${title}</h3><p>${sub}</p></div>`;
    return;
  }
  const curId = state.currentQueue[state.currentIndex]?.id;
  container.innerHTML = songs.map((s,i) => `
    <div class="song-row ${s.id===curId?'playing':''}" data-id="${s.id}">
      <span class="row-num">${s.id===curId?'<i class="fas fa-volume-up" style="color:var(--green)"></i>':i+1}</span>
      <span class="row-play" style="display:none"><i class="fas fa-play"></i></span>
      ${coverHTML(s.cover)}
      <div class="row-info">
        <div class="row-title">${escHtml(s.title)}</div>
        <div class="row-artist">${escHtml(s.artist)}${s.album&&s.album!=='Unknown Album'?` · ${escHtml(s.album)}`:''}</div>
      </div>
      <div class="row-duration">${fmt(s.duration)}</div>
      <div class="row-actions">
        <button class="row-action-btn like-song-btn ${state.likedIds.has(s.id)?'liked':''}" data-id="${s.id}">
          <i class="${state.likedIds.has(s.id)?'fas':'far'} fa-heart"></i>
        </button>
        <button class="row-action-btn add-to-playlist-btn" data-id="${s.id}" title="Add to playlist"><i class="fas fa-plus"></i></button>
        ${playlistId?`<button class="row-action-btn remove-from-playlist-btn" data-id="${s.id}" data-playlist="${playlistId}"><i class="fas fa-minus"></i></button>`:''}
        ${s.uploadedBy===state.user?.userId?`<button class="row-action-btn delete-song-btn" data-id="${s.id}"><i class="fas fa-trash"></i></button>`:''}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.song-row').forEach(row => {
    row.addEventListener('click', e => { if(e.target.closest('button')) return; playSong(row.dataset.id, songs); });
  });
  container.querySelectorAll('.like-song-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); toggleLike(btn.dataset.id); }));
  container.querySelectorAll('.add-to-playlist-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openAddToPlaylist(btn.dataset.id); }));
  container.querySelectorAll('.remove-from-playlist-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); removeFromPlaylist(btn.dataset.playlist, btn.dataset.id); }));
  container.querySelectorAll('.delete-song-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); if(confirm('Delete this song?')) deleteSong(btn.dataset.id); }));
}

/* ═══════════════════════════════════════════════════════════════
   RENDER PLAYLIST GRID
═══════════════════════════════════════════════════════════════ */
function renderPlaylistGrid(container, playlists) {
  if (!playlists.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-list"></i><h3>No playlists yet</h3><p>Create a playlist to get started</p></div>`;
    return;
  }
  container.innerHTML = playlists.map(p => `
    <div class="playlist-card" data-id="${p.id}">
      <div class="playlist-card-cover"><i class="fas fa-music"></i></div>
      <div class="playlist-card-title">${escHtml(p.name)}</div>
      <div class="playlist-card-desc">${p.songCount} song${p.songCount!==1?'s':''}</div>
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
  $('playlistViewName').textContent  = playlist.name;
  $('playlistViewDesc').textContent  = playlist.description||'';
  $('playlistViewCount').textContent = `${playlist.songs.length} song${playlist.songs.length!==1?'s':''}`;
  renderSongList($('playlistSongsList'), playlist.songs, 'playlist', id);
  $('playPlaylistBtn').onclick = () => { if(playlist.songs.length) playSong(playlist.songs[0].id, playlist.songs); };
  $('deletePlaylistBtn').onclick = () => {
    if(confirm(`Delete "${playlist.name}"?`)) {
      api.delete(`/api/playlists/${id}`).then(() => {
        state.playlists = state.playlists.filter(p => p.id!==id);
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
function playSong(id, queue=state.songs) {
  const idx = queue.findIndex(s => s.id===id);
  if (idx===-1) return;
  state.currentQueue = queue;
  state.currentIndex = idx;
  loadTrack(queue[idx]);
  audio.play();
  state.isPlaying = true;
  updatePlayBtn();
  updateQueuePanel();
  // Track play count
  fetch(`/api/songs/${id}/play`, { method:'POST', headers:{ 'Authorization': state.token||'' } }).catch(()=>{});
}

function loadTrack(song) {
  if (!song) return;
  audio.src = song.url;
  $('playerTitle').textContent  = song.title;
  $('playerArtist').textContent = song.artist;
  const cover = $('playerCover');
  cover.innerHTML = song.cover ? `<img src="${song.cover}" alt="cover">` : `<i class="fas fa-music"></i>`;
  cover.classList.add('spinning');
  const lb = $('playerLikeBtn');
  lb.className = `like-btn ${state.likedIds.has(song.id)?'liked':''}`;
  lb.innerHTML = `<i class="${state.likedIds.has(song.id)?'fas':'far'} fa-heart"></i>`;
  lb.onclick = () => toggleLike(song.id);
  document.title = `${song.title} — ${song.artist}`;
  $('progressPlayed').style.width = '0';
  $('currentTime').textContent = '0:00';
}

function updatePlayBtn() {
  $('playPauseBtn').innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
  if (state.isPlaying) $('playerCover').classList.add('spinning');
  else $('playerCover').classList.remove('spinning');
}

$('playPauseBtn').addEventListener('click', () => {
  if (!audio.src) return;
  if (state.isPlaying) { audio.pause(); state.isPlaying=false; }
  else { audio.play(); state.isPlaying=true; }
  updatePlayBtn();
});

$('nextBtn').addEventListener('click', playNext);
$('prevBtn').addEventListener('click', () => { if(audio.currentTime>3) { audio.currentTime=0; return; } playPrev(); });

$('shuffleBtn').addEventListener('click', () => {
  state.isShuffle = !state.isShuffle;
  $('shuffleBtn').classList.toggle('active', state.isShuffle);
  toast(state.isShuffle ? 'Shuffle on' : 'Shuffle off');
});

$('repeatBtn').addEventListener('click', () => {
  state.repeatMode = (state.repeatMode+1)%3;
  const btn = $('repeatBtn');
  if (state.repeatMode===0) { btn.innerHTML='<i class="fas fa-redo"></i>'; btn.classList.remove('active'); toast('Repeat off'); }
  if (state.repeatMode===1) { btn.innerHTML='<i class="fas fa-redo"></i>'; btn.classList.add('active'); toast('Repeat all'); }
  if (state.repeatMode===2) { btn.innerHTML='<i class="fas fa-redo-alt"></i>'; btn.classList.add('active'); toast('Repeat one'); }
});

function playNext() {
  if (!state.currentQueue.length) return;
  if (state.repeatMode===2) { audio.currentTime=0; audio.play(); return; }
  let idx = state.isShuffle ? Math.floor(Math.random()*state.currentQueue.length) : state.currentIndex+1;
  if (idx>=state.currentQueue.length) { if(state.repeatMode===1) idx=0; else return; }
  state.currentIndex=idx; loadTrack(state.currentQueue[idx]); audio.play(); state.isPlaying=true; updatePlayBtn(); updateQueuePanel();
}

function playPrev() {
  if (!state.currentQueue.length) return;
  let idx = state.currentIndex-1;
  if (idx<0) idx = state.repeatMode===1 ? state.currentQueue.length-1 : 0;
  state.currentIndex=idx; loadTrack(state.currentQueue[idx]); audio.play(); state.isPlaying=true; updatePlayBtn(); updateQueuePanel();
}

audio.addEventListener('ended', playNext);
audio.addEventListener('play', () => { state.isPlaying=true; updatePlayBtn(); });
audio.addEventListener('pause', () => { state.isPlaying=false; updatePlayBtn(); });
audio.addEventListener('timeupdate', () => {
  if (state.isDraggingProgress) return;
  const pct = audio.duration ? (audio.currentTime/audio.duration)*100 : 0;
  $('progressPlayed').style.width = pct+'%';
  $('progressThumb').style.left   = pct+'%';
  $('currentTime').textContent    = fmt(audio.currentTime);
  $('totalTime').textContent      = fmt(audio.duration);
});

/* Progress scrubbing */
const progressTrack = $('progressTrack');
progressTrack.addEventListener('mousedown', e => {
  state.isDraggingProgress=true; scrub(e,progressTrack);
  const move=e=>scrub(e,progressTrack);
  const up=()=>{ state.isDraggingProgress=false; window.removeEventListener('mouseup',up); window.removeEventListener('mousemove',move); };
  window.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
});
function scrub(e,track) {
  const rect=track.getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  if(audio.duration){ audio.currentTime=pct*audio.duration; $('progressPlayed').style.width=(pct*100)+'%'; $('progressThumb').style.left=(pct*100)+'%'; }
}

/* Volume */
const volumeTrack=$('volumeTrack');
volumeTrack.addEventListener('mousedown', e => {
  setVolume(e);
  const move=e=>setVolume(e);
  const up=()=>{ window.removeEventListener('mouseup',up); window.removeEventListener('mousemove',move); };
  window.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
});
function setVolume(e) {
  const rect=volumeTrack.getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  audio.volume=pct; $('volumeFill').style.width=(pct*100)+'%'; $('volumeThumb').style.left=(pct*100)+'%';
}
audio.volume=0.7;

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
  const cur=state.currentQueue[state.currentIndex];
  if (cur?.id===songId) {
    $('playerLikeBtn').className=`like-btn ${state.likedIds.has(songId)?'liked':''}`;
    $('playerLikeBtn').innerHTML=`<i class="${state.likedIds.has(songId)?'fas':'far'} fa-heart"></i>`;
  }
  document.querySelectorAll(`.like-song-btn[data-id="${songId}"]`).forEach(btn => {
    btn.className=`row-action-btn like-song-btn ${state.likedIds.has(songId)?'liked':''}`;
    btn.innerHTML=`<i class="${state.likedIds.has(songId)?'fas':'far'} fa-heart"></i>`;
  });
  if ($('view-liked').classList.contains('active')) loadLiked();
}

/* ═══════════════════════════════════════════════════════════════
   SEARCH
═══════════════════════════════════════════════════════════════ */
let searchTimeout;
$('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimeout);
  const q=e.target.value.trim();
  if (!q) { $('searchResultTitle').textContent='Search for something'; $('searchResults').innerHTML=''; return; }
  searchTimeout=setTimeout(async()=>{
    const songs=await api.get(`/api/songs?search=${encodeURIComponent(q)}`);
    $('searchResultTitle').textContent=songs.length?`Results for "${q}"`:  `No results for "${q}"`;
    renderSongList($('searchResults'),songs,'search');
  },300);
});

/* ═══════════════════════════════════════════════════════════════
   UPLOAD
═══════════════════════════════════════════════════════════════ */
function openUpload() { openModal('uploadModal'); }
$('openUploadBtn').addEventListener('click', openUpload);
$('homeUploadBtn').addEventListener('click', openUpload);
$('closeUploadModal').addEventListener('click', ()=>closeModal('uploadModal'));

const dropZone=$('dropZone'), audioFileInput=$('audioFileInput');
dropZone.addEventListener('dragover', e=>{e.preventDefault();dropZone.classList.add('drag-over');});
dropZone.addEventListener('dragleave', ()=>dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e=>{e.preventDefault();dropZone.classList.remove('drag-over');if(e.dataTransfer.files[0])handleFileSelect(e.dataTransfer.files[0]);});
dropZone.addEventListener('click', ()=>audioFileInput.click());
audioFileInput.addEventListener('change', e=>{if(e.target.files[0])handleFileSelect(e.target.files[0]);});

function handleFileSelect(file) {
  $('selectedFileName').textContent=file.name;
  audioFileInput._file=file;
  if(!$('uploadTitle').value) $('uploadTitle').value=file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ');
}

$('uploadSongBtn').addEventListener('click', async()=>{
  const file=audioFileInput._file||audioFileInput.files[0];
  const title=$('uploadTitle').value.trim();
  const artist=$('uploadArtist').value.trim();
  const album=$('uploadAlbum').value.trim();
  if (!file)          { toast('Please select an audio file','error'); return; }
  if (!title||!artist){ toast('Title and artist are required','error'); return; }

  const duration=await getAudioDuration(file);
  const formData=new FormData();
  formData.append('audio',file);
  formData.append('title',title);
  formData.append('artist',artist);
  formData.append('album',album);
  formData.append('duration',duration);

  $('uploadProgress').style.display='flex';
  $('progressFill').style.width='0%';

  const xhr=new XMLHttpRequest();
  xhr.upload.onprogress=e=>{
    if(e.lengthComputable){const pct=(e.loaded/e.total*100).toFixed(0);$('progressFill').style.width=pct+'%';$('progressText').textContent=`Uploading... ${pct}%`;}
  };
  xhr.onload=()=>{
    $('uploadProgress').style.display='none';
    if(xhr.status===201){
      const song=JSON.parse(xhr.responseText);
      state.songs.push(song);
      toast('🎵 Song uploaded!','success');
      closeModal('uploadModal');
      resetUploadForm();
      loadHome();
    } else {
      const err=JSON.parse(xhr.responseText);
      if(err.limitReached) {
        closeModal('uploadModal');
        showUpgradePrompt('Upload Limit Reached!', err.error);
      } else {
        toast(err.error||'Upload failed','error');
      }
    }
  };
  xhr.onerror=()=>{ toast('Upload failed','error'); $('uploadProgress').style.display='none'; };
  xhr.open('POST','/api/songs');
  xhr.setRequestHeader('Authorization',state.token);
  xhr.send(formData);
});

function getAudioDuration(file) {
  return new Promise(resolve=>{
    const url=URL.createObjectURL(file);
    const a=new Audio(url);
    a.onloadedmetadata=()=>{URL.revokeObjectURL(url);resolve(a.duration||0);};
    a.onerror=()=>resolve(0);
  });
}

function resetUploadForm() {
  $('uploadTitle').value='';$('uploadArtist').value='';$('uploadAlbum').value='';
  $('selectedFileName').textContent='';audioFileInput.value='';audioFileInput._file=null;
  $('uploadProgress').style.display='none';
}

async function deleteSong(id) {
  const res=await api.delete(`/api/songs/${id}`);
  if(res.error){toast(res.error,'error');return;}
  state.songs=state.songs.filter(s=>s.id!==id);
  state.likedIds.delete(id);
  toast('Song deleted');
  loadHome();
  if($('view-profile').classList.contains('active')) loadProfile();
}

/* ═══════════════════════════════════════════════════════════════
   PLAYLISTS
═══════════════════════════════════════════════════════════════ */
$('createPlaylistBtn').addEventListener('click', ()=>openModal('createPlaylistModal'));
$('closePlaylistModal').addEventListener('click', ()=>closeModal('createPlaylistModal'));
$('createPlaylistSubmit').addEventListener('click', async()=>{
  const name=$('playlistName').value.trim();
  if(!name){toast('Playlist name required','error');return;}
  const p=await api.post('/api/playlists',{name,description:$('playlistDesc').value.trim()});
  if(p.error){
    if(p.limitReached){closeModal('createPlaylistModal');showUpgradePrompt('Playlist Limit Reached!',p.error);}
    else toast(p.error,'error');
    return;
  }
  state.playlists.push(p);
  renderSidebarPlaylists();
  toast(`✅ Playlist "${name}" created`,'success');
  closeModal('createPlaylistModal');
  $('playlistName').value='';$('playlistDesc').value='';
  openPlaylist(p.id);
});

function openAddToPlaylist(songId) {
  state.addToPlaylistSongId=songId;
  const list=$('playlistPickerList');
  if(!state.playlists.length){
    list.innerHTML=`<div class="empty-state"><p>No playlists yet. Create one first!</p></div>`;
  } else {
    list.innerHTML=state.playlists.map(p=>`
      <div class="playlist-picker-item" data-id="${p.id}">
        <div class="playlist-picker-icon"><i class="fas fa-music"></i></div>
        <div>${escHtml(p.name)}</div>
      </div>
    `).join('');
    list.querySelectorAll('.playlist-picker-item').forEach(item=>{
      item.addEventListener('click', async()=>{
        const res=await api.post(`/api/playlists/${item.dataset.id}/songs`,{songId:state.addToPlaylistSongId});
        if(res.error){toast(res.error,'error');return;}
        toast('Added to playlist ✅','success');
        closeModal('addToPlaylistModal');
        const updated=await api.get('/api/playlists');
        state.playlists=updated;
        renderSidebarPlaylists();
      });
    });
  }
  openModal('addToPlaylistModal');
}
$('closeAddToPlaylist').addEventListener('click', ()=>closeModal('addToPlaylistModal'));

/* ═══════════════════════════════════════════════════════════════
   QUEUE PANEL
═══════════════════════════════════════════════════════════════ */
$('queueBtn').addEventListener('click', ()=>{ $('queuePanel').classList.toggle('open'); updateQueuePanel(); });
$('closeQueue').addEventListener('click', ()=>$('queuePanel').classList.remove('open'));

function updateQueuePanel() {
  const cur=state.currentQueue[state.currentIndex];
  if(!cur){$('queueNowPlaying').innerHTML='<p style="color:var(--text-muted);font-size:0.85rem">Nothing playing</p>';$('queueNextList').innerHTML='';return;}
  $('queueNowPlaying').innerHTML=`
    <div class="queue-song active">
      ${coverHTML(cur.cover,'queue-song-cover')}
      <div class="queue-song-info"><div class="queue-song-title">${escHtml(cur.title)}</div><div class="queue-song-artist">${escHtml(cur.artist)}</div></div>
    </div>`;
  const next=state.currentQueue.slice(state.currentIndex+1,state.currentIndex+6);
  if(!next.length){$('queueNextList').innerHTML='<p style="color:var(--text-muted);font-size:0.85rem">Nothing next</p>';return;}
  $('queueNextList').innerHTML=next.map(s=>`
    <div class="queue-song" data-id="${s.id}" style="cursor:pointer">
      ${coverHTML(s.cover,'queue-song-cover')}
      <div class="queue-song-info"><div class="queue-song-title">${escHtml(s.title)}</div><div class="queue-song-artist">${escHtml(s.artist)}</div></div>
    </div>`).join('');
  $('queueNextList').querySelectorAll('.queue-song').forEach(el=>{el.addEventListener('click',()=>playSong(el.dataset.id,state.currentQueue));});
}

/* ═══════════════════════════════════════════════════════════════
   VISUALIZER
═══════════════════════════════════════════════════════════════ */
let audioCtx,analyser,vizSource;
function setupVisualizer() {
  if(audioCtx) return;
  audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  analyser=audioCtx.createAnalyser();
  analyser.fftSize=64;
  vizSource=audioCtx.createMediaElementSource(audio);
  vizSource.connect(analyser);
  analyser.connect(audioCtx.destination);
  drawVisualizer();
}
function drawVisualizer() {
  const canvas=$('visualizer'), ctx=canvas.getContext('2d');
  const bufLen=analyser.frequencyBinCount;
  const data=new Uint8Array(bufLen);
  function draw(){
    requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const barW=(canvas.width/bufLen)*2.5;
    let x=0;
    for(let i=0;i<bufLen;i++){
      const h=(data[i]/255)*canvas.height;
      ctx.fillStyle=`rgb(29,${Math.floor(29+(data[i]/255)*140)},84)`;
      ctx.fillRect(x,canvas.height-h,barW-1,h);
      x+=barW;
    }
  }
  draw();
}
audio.addEventListener('play',()=>{ try{setupVisualizer();if(audioCtx.state==='suspended')audioCtx.resume();}catch(e){} });

/* ═══════════════════════════════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════════════════════════════ */
function openModal(id)  { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click', e=>{ if(e.target===o) o.classList.remove('open'); });
});
$('closePaymentModal').addEventListener('click', ()=>closeModal('paymentModal'));

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT') return;
  if(e.code==='Space'){e.preventDefault();$('playPauseBtn').click();}
  if(e.code==='ArrowRight'&&e.shiftKey) playNext();
  else if(e.code==='ArrowRight') audio.currentTime=Math.min(audio.duration||0,audio.currentTime+10);
  if(e.code==='ArrowLeft'&&e.shiftKey) playPrev();
  else if(e.code==='ArrowLeft') audio.currentTime=Math.max(0,audio.currentTime-10);
  if(e.code==='ArrowUp'){audio.volume=Math.min(1,audio.volume+0.1);$('volumeFill').style.width=(audio.volume*100)+'%';}
  if(e.code==='ArrowDown'){audio.volume=Math.max(0,audio.volume-0.1);$('volumeFill').style.width=(audio.volume*100)+'%';}
  if(e.code==='KeyQ') $('queueBtn').click();
});