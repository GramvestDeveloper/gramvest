/*
 * ════════════════════════════════════════════════════════════
 *  GRAMVEST — script.js
 *  Supabase-integrated, modular, production-ready
 *
 *  Sections:
 *  [1] CONFIG & CLIENT
 *  [2] STATE
 *  [3] UTILITIES
 *  [4] AUTH
 *  [5] NAVIGATION & UI SHELL
 *  [6] DASHBOARD
 *  [7] PORTFOLIO
 *  [8] TRANSACTIONS
 *  [9] GOLD PRICES
 *  [10] PROFILE
 *  [11] MODAL TRANSAKSI
 *  [12] INIT
 * ════════════════════════════════════════════════════════════
 */

/* ─────────────────────────────────────────────────────────────
   [1] CONFIG & CLIENT
   Ganti nilai SUPABASE_URL dan SUPABASE_ANON_KEY sebelum deploy.
   ───────────────────────────────────────────────────────────── */
const SUPABASE_URL  = 'https://imlzrmbazuwdtpzqapsv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltbHpybWJhenV3ZHRwenFhcHN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTQ1NzcsImV4cCI6MjA5NjM5MDU3N30.BjoKKbrH4AffuLbuIFi6qsVcWuk1AZq75MdOcXnwXwg';

// Supabase CDN (pastikan script tag CDN ada di HTML, atau gunakan bundler)
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─────────────────────────────────────────────────────────────
   [2] STATE
   Cache data di memori agar tidak terjadi query duplikat.
   ───────────────────────────────────────────────────────────── */
const STATE = {
  user:         null,   // db.auth.User
  profile:      null,   // row dari tabel profiles
  transactions: [],     // semua transaksi user
  goldPrices:   [],     // gold_prices 7 hari terakhir
  todayPrices:  {},     // { antam: {sell_price, buyback_price}, ubs: {...}, ... }
  editingTxId:  null,   // UUID transaksi yang sedang diedit (null = mode add)
};

/* ─────────────────────────────────────────────────────────────
   [3] UTILITIES
   ───────────────────────────────────────────────────────────── */

/** Format angka ke format Rupiah: 1500000 → "Rp 1.500.000" */
function fmtRupiah(num) {
  if (num === null || num === undefined || isNaN(num)) return 'Rp —';
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

/** Format gram: 1.5 → "1,5000 gr", ringkas: 1.5 → "1,5 gr" */
function fmtGram(num, decimals = 4) {
  if (num === null || num === undefined || isNaN(num)) return '— gr';
  return parseFloat(num).toFixed(decimals).replace('.', ',') + ' gr';
}

/** Format persen: 16.98 → "+16,98%" */
function fmtPct(num) {
  if (num === null || num === undefined || isNaN(num)) return '—%';
  const sign = num >= 0 ? '+' : '';
  return sign + num.toFixed(2).replace('.', ',') + '%';
}

/** Format tanggal DATE string "2026-06-06" → "06 Jun 2026" */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format tanggal ke "Januari 2024" (untuk member since) */
function fmtMonthYear(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

/** Hitung estimasi bulan tercapai */
function estimasiTarget(sisaGram, monthlyBuy) {
  if (!monthlyBuy || monthlyBuy <= 0 || sisaGram <= 0) return 'Sudah tercapai';
  const bulan = Math.ceil(sisaGram / monthlyBuy);
  const tgl = new Date();
  tgl.setMonth(tgl.getMonth() + bulan);
  return tgl.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
}

/** Inisial nama: "Rendra Dwi Saputra" → "RD" */
function getInitials(name) {
  if (!name) return '--';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Label produk display */
const PRODUCT_LABELS = {
  antam:     'Antam',
  ubs:       'UBS',
  galeri24:  'Galeri24',
  pegadaian: 'Pegadaian',
  treasury:  'Treasury',
  emaskita:  'EmasKita',
};

/** CSS pill class per produk */
const PRODUCT_PILL = {
  antam:     'pill-a',
  ubs:       'pill-u',
  galeri24:  'pill-g',
  pegadaian: 'pill-p',
  treasury:  'pill-tr',
  emaskita:  'pill-ek',
};

/** Warna ikon per produk (sidebar recent tx) */
const PRODUCT_STROKE = {
  antam:     '#C25000',
  ubs:       '#0B3D91',
  galeri24:  '#6A0DAD',
  pegadaian: '#2E7D32',
  treasury:  '#0277BD',
  emaskita:  '#F57F17',
};

/** Set element text jika ada */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/** Tampilkan toast */
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  const msgEl = document.getElementById('toastMsg');
  msgEl.textContent = msg;
  t.style.background = isError ? '#c0392b' : '';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

/* ─────────────────────────────────────────────────────────────
   [4] AUTH
   ───────────────────────────────────────────────────────────── */

/** Tab Login / Register */
function switchAuthTab(tab) {
  const loginForm    = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin     = document.getElementById('tabLogin');
  const tabRegister  = document.getElementById('tabRegister');

  if (tab === 'login') {
    loginForm.style.display    = '';
    registerForm.style.display = 'none';
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    loginForm.style.display    = 'none';
    registerForm.style.display = '';
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
  }
}

/**
 * Login
 * db.auth.signInWithPassword({ email, password })
 */
async function doLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl  = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  errorEl.style.display = 'none';

  if (!email || !password) {
    errorEl.textContent = 'Email dan password wajib diisi.';
    errorEl.style.display = 'block';
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  btn.classList.remove('loading');
  btn.disabled = false;

  if (error) {
    errorEl.textContent = 'Login gagal: ' + (error.message || 'Periksa email dan password.');
    errorEl.style.display = 'block';
    return;
  }

  STATE.user = data.user;
  await bootApp();
}

/**
 * Register
 * db.auth.signUp({ email, password })
 * Trigger PostgreSQL otomatis membuat row di profiles
 */
async function doRegister() {
  const name            = document.getElementById('registerName').value.trim();
  const email           = document.getElementById('registerEmail').value.trim();
  const password        = document.getElementById('registerPassword').value;
  const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
  const errorEl         = document.getElementById('registerError');
  const btn             = document.getElementById('registerBtn');

  errorEl.style.display = 'none';

  if (!name || !email || !password) {
    errorEl.textContent = 'Semua field wajib diisi.';
    errorEl.style.display = 'block';
    return;
  }
  if (password.length < 8) {
    errorEl.textContent = 'Password minimal 8 karakter.';
    errorEl.style.display = 'block';
    return;
  }
  if (password !== passwordConfirm) {
    errorEl.textContent = 'Konfirmasi password tidak cocok.';
    errorEl.style.display = 'block';
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;

  const { data, error } = await db.auth.signUp({ email, password });

  if (error) {
    btn.classList.remove('loading');
    btn.disabled = false;
    errorEl.textContent = 'Registrasi gagal: ' + (error.message || 'Coba lagi.');
    errorEl.style.display = 'block';
    return;
  }

  // Update full_name ke profiles setelah trigger membuat row
  if (data.user) {
    await db
      .from('profiles')
      .update({ full_name: name })
      .eq('id', data.user.id);
  }

  btn.classList.remove('loading');
  btn.disabled = false;

  showToast('Akun berhasil dibuat! Silakan cek email untuk verifikasi.');
  switchAuthTab('login');
}

/**
 * Logout
 * db.auth.signOut()
 */
async function doLogout() {
  const logoutBtn = document.querySelector('.sb-logout');
  if (logoutBtn) {
    logoutBtn.innerHTML = '<div class="logout-spinner"></div>';
    logoutBtn.style.pointerEvents = 'none';
  }

  await new Promise(r => setTimeout(r, 900));
  await db.auth.signOut();

  STATE.user         = null;
  STATE.profile      = null;
  STATE.transactions = [];
  STATE.goldPrices   = [];
  STATE.todayPrices  = {};

  document.getElementById('loginEmail').value    = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('app').style.display       = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  switchAuthTab('login');
}
/* ─────────────────────────────────────────────────────────────
   [5] NAVIGATION & UI SHELL
   ───────────────────────────────────────────────────────────── */

const PAGE_TITLES = {
  dashboard:    'Dashboard',
  portfolio:    'Portofolio',
  transactions: 'Transaksi',
  prices:       'Harga Emas',
  profile:      'Profil',
};

function goPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('pg-' + id);
  if (page) page.classList.add('active');

  setText('tbTitle', PAGE_TITLES[id] || id);

  if (el) {
    el.classList.add('active');
  } else {
    document.querySelectorAll('.nav-item').forEach(n => {
      const oc = n.getAttribute('onclick') || '';
      if (oc.includes("'" + id + "'")) n.classList.add('active');
    });
  }

  closeSb();
}

function openSb() {
  document.getElementById('sb').classList.add('open');
  document.getElementById('sbOv').classList.add('open');
}

function closeSb() {
  document.getElementById('sb').classList.remove('open');
  document.getElementById('sbOv').classList.remove('open');
}

/** Render nama & avatar user di sidebar */
function renderSidebarUser() {
  const profile = STATE.profile;
  const user    = STATE.user;
  const name    = profile?.full_name || user?.email?.split('@')[0] || 'Pengguna';

  setText('sbUserName', name.split(' ')[0] + (name.split(' ')[1] ? ' ' + name.split(' ')[1].slice(0, 1) + '.' : ''));
  setText('sbAvatar', getInitials(name));
}

/** Render greeting & tanggal */
function renderGreeting() {
  const hour = new Date().getHours();
  const name = STATE.profile?.full_name?.split(' ')[0] || 'Investor';
  let salam = 'Selamat Pagi';
  if (hour >= 11 && hour < 15) salam = 'Selamat Siang';
  else if (hour >= 15 && hour < 18) salam = 'Selamat Sore';
  else if (hour >= 18) salam = 'Selamat Malam';

  setText('greetingText', salam + ', ' + name + ' 👋');
  setText('dateText', new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
}

/* ─────────────────────────────────────────────────────────────
   [6] DASHBOARD
   ───────────────────────────────────────────────────────────── */

/** Hitung aggregate dari STATE.transactions + STATE.todayPrices */
function computePortfolioAggregate() {
  const txs = STATE.transactions;
  const prices = STATE.todayPrices;

  let totalGram  = 0;
  let totalModal = 0;
  let nilaiKini  = 0;
  const products = new Set();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  let gramBulanIni = 0;
  let firstDate = null;

  txs.forEach(tx => {
    const gram = parseFloat(tx.gram) || 0;
    const hargaBeli = parseFloat(tx.price_per_gram) || 0;
    const hargaKini = prices[tx.product]?.sell_price || 0;

    totalGram  += gram;
    totalModal += gram * hargaBeli;
    nilaiKini  += gram * hargaKini;
    products.add(tx.product);

    const txDate = new Date(tx.date + 'T00:00:00');
    if (txDate >= monthStart) gramBulanIni += gram;

    if (!firstDate || txDate < firstDate) firstDate = txDate;
  });

  const profit = nilaiKini - totalModal;
  const roi    = totalModal > 0 ? (profit / totalModal) * 100 : 0;
  const avgCost = totalGram > 0 ? totalModal / totalGram : 0;

  return { totalGram, totalModal, nilaiKini, profit, roi, avgCost, products, gramBulanIni, firstDate };
}

function renderDashboardKPI() {
  const { totalGram, totalModal, nilaiKini, profit, roi, avgCost, products, gramBulanIni, firstDate } =
    computePortfolioAggregate();

  setText('kpiTotalGram', fmtGram(totalGram, 4).replace(' gr', ''));
  setText('kpiProductCount', products.size + ' produk emas');
  setText('kpiMonthlyGram', '+' + fmtGram(gramBulanIni, 2) + ' bulan ini');

  // Total Modal
  const modalJuta = totalModal / 1e6;
  setText('kpiTotalModal', modalJuta >= 1 ? 'Rp ' + modalJuta.toFixed(2).replace('.', ',') + ' Jt' : fmtRupiah(totalModal));
  setText('kpiDcaSince', firstDate ? 'DCA sejak ' + firstDate.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }) : 'DCA sejak —');

  // Nilai kini
  const nilaiJuta = nilaiKini / 1e6;
  setText('kpiNilaiKini', nilaiJuta >= 1 ? 'Rp ' + nilaiJuta.toFixed(2).replace('.', ',') + ' Jt' : fmtRupiah(nilaiKini));
  const changeJuta = (nilaiKini - totalModal) / 1e6;
  setText('kpiNilaiChange', (changeJuta >= 0 ? '+Rp ' : '-Rp ') + Math.abs(changeJuta).toFixed(0) + 'rb');

  // Profit
  const profitJuta = profit / 1e6;
  const kpiProfitEl = document.getElementById('kpiProfit');
  if (kpiProfitEl) {
    kpiProfitEl.textContent = profitJuta >= 1 ? 'Rp ' + profitJuta.toFixed(2).replace('.', ',') + ' Jt' : fmtRupiah(profit);
    kpiProfitEl.style.color = profit >= 0 ? 'var(--green)' : 'var(--red, #c0392b)';
  }
  setText('kpiProfitBadge', profit >= 0 ? 'Profit Sehat' : 'Rugi');

  // ROI
  setText('kpiRoi', fmtPct(roi));

  // Avg cost
  const avgJuta = avgCost / 1e6;
  setText('kpiAvgCost', avgJuta >= 1 ? avgJuta.toFixed(3).replace('.', ',') + ' Jt/gr' : fmtRupiah(avgCost) + '/gr');

  // Nav badge
  setText('navTxCount', STATE.transactions.length);

  renderInsight(roi);
}

function renderInsight(roi) {
  const titleEl = document.getElementById('insightTitle');
  const textEl  = document.getElementById('insightText');
  if (!titleEl || !textEl) return;

  if (STATE.transactions.length === 0) {
    titleEl.textContent = 'Mulai Investasi';
    textEl.textContent  = 'Tambahkan transaksi pertama Anda untuk melihat analisis portofolio.';
    return;
  }
  if (roi >= 15) {
    titleEl.textContent = 'Profit Sehat 🎯';
    textEl.textContent  = 'ROI ' + fmtPct(roi) + ' di atas rata-rata inflasi. Strategi DCA Anda berjalan optimal.';
  } else if (roi >= 5) {
    titleEl.textContent = 'Pertumbuhan Stabil';
    textEl.textContent  = 'ROI ' + fmtPct(roi) + '. Pertahankan konsistensi DCA untuk hasil lebih optimal.';
  } else if (roi >= 0) {
    titleEl.textContent = 'Baru Dimulai';
    textEl.textContent  = 'ROI ' + fmtPct(roi) + '. Akumulasi lebih banyak gram untuk mempercepat pertumbuhan.';
  } else {
    titleEl.textContent = 'Pasar Fluktuatif';
    textEl.textContent  = 'ROI ' + fmtPct(roi) + '. Tetap tenang — DCA konsisten terbukti menguntungkan jangka panjang.';
  }
}

function renderTargetBlock() {
  const profile = STATE.profile;
  if (!profile) return;

  const targetGram = parseFloat(profile.target_gram) || 25;
  const monthlyBuy = parseFloat(profile.monthly_buy)  || 1;
  const { totalGram } = computePortfolioAggregate();
  const sisaGram = Math.max(0, targetGram - totalGram);
  const pct = Math.min(100, totalGram > 0 ? (totalGram / targetGram) * 100 : 0);

  setText('targetPct', Math.round(pct) + '%');
  setText('targetGramVal',   fmtGram(targetGram, 1));
  setText('targetCurrentGram', fmtGram(totalGram, 4));
  setText('targetSisaGram',  fmtGram(sisaGram, 4));

  const pf1 = document.getElementById('pf1');
  if (pf1) setTimeout(() => { pf1.style.width = pct + '%'; }, 200);

  // Estimasi block
  setText('estTargetGram',  fmtGram(targetGram, 1));
  setText('estMonthlyBuy',  fmtGram(monthlyBuy, 1) + '/bulan');
  setText('estSisaGram',    fmtGram(sisaGram, 4));
  setText('estTercapai',    estimasiTarget(sisaGram, monthlyBuy));
}

function renderSidebarPrices() {
  const p = STATE.todayPrices;
  const products = ['antam', 'ubs', 'galeri24', 'pegadaian', 'treasury', 'emaskita'];
  const idMap = { antam: 'Antam', ubs: 'Ubs', galeri24: 'Galeri24', pegadaian: 'Pegadaian', treasury: 'Treasury', emaskita: 'Emaskita' };

  products.forEach(prod => {
    const label = idMap[prod];
    const data  = p[prod];
    setText('price' + label + 'Sell', data ? fmtRupiah(data.sell_price)    : 'Rp —');
    setText('price' + label + 'Bb',   data ? fmtRupiah(data.buyback_price) : 'Rp —');
  });
}

/**
 * Render 5 transaksi terakhir di dashboard
 * SELECT * FROM transactions ORDER BY date DESC LIMIT 5
 */
function renderRecentTransactions() {
  const container = document.getElementById('recentTxList');
  if (!container) return;

  const recent = [...STATE.transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = '<div style="color:var(--t3);font-size:13px;text-align:center;padding:16px;">Belum ada transaksi.</div>';
    return;
  }

  container.innerHTML = recent.map(tx => {
    const stroke = PRODUCT_STROKE[tx.product] || '#888';
    const pill   = PRODUCT_PILL[tx.product] || '';
    const total  = parseFloat(tx.gram) * parseFloat(tx.price_per_gram);
    return `
      <div class="tx-row">
        <div class="tx-ico ${tx.product.slice(0, 1)}">
          <svg width="16" height="16" fill="none" stroke="${stroke}" stroke-width="2">
            <circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>
          </svg>
        </div>
        <div style="flex:1">
          <div class="tx-name">${PRODUCT_LABELS[tx.product] || tx.product}</div>
          <div class="tx-date">${fmtDate(tx.date)}</div>
        </div>
        <div style="text-align:right">
          <div class="tx-gr">+${fmtGram(tx.gram, 2)}</div>
          <div class="tx-pr">${fmtRupiah(total)}</div>
        </div>
      </div>`;
  }).join('');
}

/**
 * Render SVG chart Modal vs Nilai Portofolio
 * Data: monthly aggregate dari transactions + gold_prices
 */
function renderPortfolioChart() {
  const rangeFilter = document.getElementById('chartRangeFilter');
  const months = rangeFilter ? (rangeFilter.value === 'all' ? 999 : parseInt(rangeFilter.value)) : 6;

  const txs = STATE.transactions;
  if (txs.length === 0) return;

  // Group by month
  const monthly = {};
  txs.forEach(tx => {
    const d = new Date(tx.date + 'T00:00:00');
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!monthly[key]) monthly[key] = { modal: 0, gram: {}, label: d.toLocaleDateString('id-ID', { month: 'short' }) };
    monthly[key].modal += parseFloat(tx.gram) * parseFloat(tx.price_per_gram);
    if (!monthly[key].gram[tx.product]) monthly[key].gram[tx.product] = 0;
    monthly[key].gram[tx.product] += parseFloat(tx.gram);
  });

  let keys = Object.keys(monthly).sort().slice(-months);
  if (keys.length === 0) return;

  // Hitung nilai kini per bulan (gunakan harga hari ini sebagai aproksimasi)
  const prices = STATE.todayPrices;
  const points = keys.map(k => {
    const m = monthly[k];
    let nilaiKini = 0;
    Object.entries(m.gram).forEach(([prod, gram]) => {
      nilaiKini += gram * (prices[prod]?.sell_price || 0);
    });
    return { label: m.label, modal: m.modal, nilai: nilaiKini };
  });

  const allVals = points.flatMap(p => [p.modal, p.nilai]).filter(v => v > 0);
  if (allVals.length === 0) return;

  const maxVal = Math.max(...allVals);
  const minVal = Math.min(...allVals) * 0.9;
  const W = 660, H = 175, PAD_T = 15, PAD_B = 30;
  const chartH = H - PAD_T - PAD_B;

  const scaleY = v => PAD_T + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;
  const scaleX = (i, total) => 10 + (i / Math.max(total - 1, 1)) * (W - 20);

  const modalPts  = points.map((p, i) => [scaleX(i, points.length), scaleY(p.modal)]);
  const nilaiPts  = points.map((p, i) => [scaleX(i, points.length), scaleY(p.nilai)]);

  const toPath = pts => pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const toFill = (pts, baseY) => toPath(pts) + ' L' + pts[pts.length - 1][0].toFixed(1) + ',' + baseY + ' L' + pts[0][0].toFixed(1) + ',' + baseY + 'Z';

  const baseY = PAD_T + chartH;

  const mLine = document.getElementById('chartPathModalLine');
  const mFill = document.getElementById('chartPathModalFill');
  const nLine = document.getElementById('chartPathNilaiLine');
  const nFill = document.getElementById('chartPathNilaiFill');
  const labelsG = document.getElementById('chartLabels');

  if (mLine) mLine.setAttribute('d', toPath(modalPts));
  if (mFill) mFill.setAttribute('d', toFill(modalPts, baseY));
  if (nLine) nLine.setAttribute('d', toPath(nilaiPts));
  if (nFill) nFill.setAttribute('d', toFill(nilaiPts, baseY));

  if (labelsG) {
    labelsG.innerHTML = points.map((p, i) =>
      `<text x="${scaleX(i, points.length).toFixed(1)}" y="${H}" font-family="Inter" font-size="10" fill="#999" text-anchor="middle">${p.label}</text>`
    ).join('');
  }
}

async function loadDashboard() {
  renderGreeting();
  renderDashboardKPI();
  renderTargetBlock();
  renderRecentTransactions();
  renderSidebarPrices();
  renderPortfolioChart();
}

/* ─────────────────────────────────────────────────────────────
   [7] PORTFOLIO
   ───────────────────────────────────────────────────────────── */

const DONUT_COLORS = ['#C25000', '#1565C0', '#9C27B0', '#2E7D32', '#0277BD', '#F57F17'];

function renderPortfolioSummary() {
  const { totalGram, totalModal, nilaiKini, profit, roi, avgCost, products, firstDate } =
    computePortfolioAggregate();

  // Portfolio page title dari profile
  if (STATE.profile?.portfolio_name) {
    setText('portfolioPageTitle', STATE.profile.portfolio_name);
  }

  setText('pfSumGram', fmtGram(totalGram, 4));
  setText('pfSumProductCount', products.size + ' produk berbeda');

  const modalJuta = totalModal / 1e6;
  setText('pfSumModal', modalJuta >= 1 ? 'Rp ' + modalJuta.toFixed(2).replace('.', ',') + ' Jt' : fmtRupiah(totalModal));
  setText('pfSumDcaSince', firstDate ? 'DCA sejak ' + firstDate.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }) : 'DCA sejak —');

  const profitJuta = profit / 1e6;
  const pfSumProfitEl = document.getElementById('pfSumProfit');
  if (pfSumProfitEl) {
    pfSumProfitEl.textContent = (profit >= 0 ? '+' : '') + (profitJuta >= 1 ? 'Rp ' + profitJuta.toFixed(2).replace('.', ',') + ' Jt' : fmtRupiah(Math.abs(profit)));
    pfSumProfitEl.style.color = profit >= 0 ? 'var(--green)' : 'var(--red, #c0392b)';
  }
  const nilaiJuta = nilaiKini / 1e6;
  setText('pfSumNilaiKini', 'Nilai kini ' + (nilaiJuta >= 1 ? 'Rp ' + nilaiJuta.toFixed(2).replace('.', ',') + ' Jt' : fmtRupiah(nilaiKini)));

  const pfRoiEl = document.getElementById('pfSumRoi');
  if (pfRoiEl) {
    pfRoiEl.textContent = fmtPct(roi);
    pfRoiEl.style.color = roi >= 0 ? 'var(--green)' : 'var(--red, #c0392b)';
  }
  setText('pfSumAvgCost', 'Avg. cost ' + fmtRupiah(avgCost) + '/gr');
}

function renderPortfolioBreakdown() {
  const prices = STATE.todayPrices;

  // Group by product
  const byProduct = {};
  STATE.transactions.forEach(tx => {
    const prod = tx.product;
    if (!byProduct[prod]) byProduct[prod] = { gram: 0, modal: 0 };
    byProduct[prod].gram  += parseFloat(tx.gram) || 0;
    byProduct[prod].modal += (parseFloat(tx.gram) || 0) * (parseFloat(tx.price_per_gram) || 0);
  });

  const rows = Object.entries(byProduct).map(([prod, data]) => {
    const hargaKini = prices[prod]?.sell_price || 0;
    const nilaiKini = data.gram * hargaKini;
    const profit    = nilaiKini - data.modal;
    const roi       = data.modal > 0 ? (profit / data.modal) * 100 : 0;
    return { prod, ...data, nilaiKini, profit, roi };
  }).sort((a, b) => b.gram - a.gram);

  // Tfoot totals
  const totGram  = rows.reduce((s, r) => s + r.gram, 0);
  const totModal = rows.reduce((s, r) => s + r.modal, 0);
  const totNilai = rows.reduce((s, r) => s + r.nilaiKini, 0);
  const totProfit = totNilai - totModal;
  const totRoi    = totModal > 0 ? (totProfit / totModal) * 100 : 0;

  setText('pfTotalGram',   fmtGram(totGram, 4));
  setText('pfTotalModal',  fmtRupiah(totModal));
  setText('pfTotalNilai',  fmtRupiah(totNilai));
  const pfProfitEl = document.getElementById('pfTotalProfit');
  if (pfProfitEl) {
    pfProfitEl.textContent = (totProfit >= 0 ? '+' : '') + fmtRupiah(Math.abs(totProfit));
    pfProfitEl.className = totProfit >= 0 ? 'profit-pos' : 'profit-neg';
  }
  const pfRoiEl = document.getElementById('pfTotalRoi');
  if (pfRoiEl) {
    pfRoiEl.textContent = fmtPct(totRoi);
    pfRoiEl.className = totRoi >= 0 ? 'profit-pos' : 'profit-neg';
  }

  // Desktop tbody
  const tbody = document.getElementById('pfBreakdownTbody');
  if (tbody) {
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--t3);padding:24px;">Belum ada transaksi.</td></tr>';
    } else {
      tbody.innerHTML = rows.map(r => {
        const pillClass = PRODUCT_PILL[r.prod] || '';
        const pc = r.profit >= 0 ? 'profit-pos' : 'profit-neg';
        return `<tr>
          <td><span class="type-pill ${pillClass}">${PRODUCT_LABELS[r.prod] || r.prod}</span></td>
          <td><b>${fmtGram(r.gram, 4)}</b></td>
          <td>${fmtRupiah(r.modal)}</td>
          <td>${fmtRupiah(r.nilaiKini)}</td>
          <td class="${pc}">${r.profit >= 0 ? '+' : ''}${fmtRupiah(Math.abs(r.profit))}</td>
          <td class="${pc}">${fmtPct(r.roi)}</td>
        </tr>`;
      }).join('');
    }
  }

  // Mobile cards
  const cards = document.getElementById('pfBreakdownCards');
  if (cards) {
    if (rows.length === 0) {
      cards.innerHTML = '<div style="text-align:center;color:var(--t3);padding:24px;font-size:13px;">Belum ada transaksi.</div>';
    } else {
      cards.innerHTML = rows.map(r => {
        const pillClass = PRODUCT_PILL[r.prod] || '';
        const pc = r.profit >= 0 ? 'profit-pos' : 'profit-neg';
        return `<div class="m-card-item">
          <div class="m-card-top">
            <span class="type-pill ${pillClass}">${PRODUCT_LABELS[r.prod] || r.prod}</span>
            <span class="${pc}" style="font-weight:700;">${fmtPct(r.roi)}</span>
          </div>
          <div class="m-card-body">
            <div class="m-card-field"><small>Gram</small><span>${fmtGram(r.gram, 4)}</span></div>
            <div class="m-card-field"><small>Modal</small><span>${fmtRupiah(r.modal)}</span></div>
            <div class="m-card-field"><small>Nilai Kini</small><span>${fmtRupiah(r.nilaiKini)}</span></div>
            <div class="m-card-field"><small>Profit</small><span class="${pc}">${r.profit >= 0 ? '+' : ''}${fmtRupiah(Math.abs(r.profit))}</span></div>
          </div>
        </div>`;
      }).join('');

      // Mobile total footer
      const pc = totProfit >= 0 ? 'profit-pos' : 'profit-neg';
      cards.innerHTML += `<div style="background:var(--bg);border-radius:var(--r2);padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
        <div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.6px;">Total</div><div style="font-size:16px;font-weight:800;">${fmtGram(totGram, 4)}</div></div>
        <div style="text-align:right;"><div style="font-size:11px;color:var(--t3);">Profit</div><div class="${pc}" style="font-size:15px;font-weight:700;">${totProfit >= 0 ? '+' : ''}${fmtRupiah(Math.abs(totProfit))}</div></div>
      </div>`;
    }
  }

  // Donut chart
  renderDonut(rows, totGram);
}

function renderDonut(rows, totGram) {
  const segG  = document.getElementById('donutSegments');
  const legEl = document.getElementById('donutLegend');
  const totalText = document.getElementById('donutTotalGram');

  if (totalText) totalText.textContent = totGram > 0 ? fmtGram(totGram, 1).replace(' gr', '') : '0';

  if (!segG || !legEl) return;

  if (rows.length === 0 || totGram === 0) {
    segG.innerHTML  = '';
    legEl.innerHTML = '<div style="font-size:12px;color:var(--t3);">Belum ada data</div>';
    return;
  }

  const r = 55, cx = 75, cy = 75;
  const circumference = 2 * Math.PI * r; // ≈ 345.4

  let offset = 0;
  segG.innerHTML = rows.map((row, i) => {
    const pct  = row.gram / totGram;
    const dash = pct * circumference;
    const seg  = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${DONUT_COLORS[i % DONUT_COLORS.length]}"
      stroke-width="24" stroke-dasharray="${dash.toFixed(1)} ${circumference.toFixed(1)}"
      stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += dash;
    return seg;
  }).join('');

  legEl.innerHTML = rows.map((row, i) => {
    const pct = totGram > 0 ? ((row.gram / totGram) * 100).toFixed(1) : '0';
    return `<div class="leg-row">
      <div class="leg-dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]};"></div>
      <span class="leg-lbl">${PRODUCT_LABELS[row.prod] || row.prod}</span>
      <span class="leg-val">${fmtGram(row.gram, 1)}<span class="leg-pct">${pct}%</span></span>
    </div>`;
  }).join('');
}

/* ─────────────────────────────────────────────────────────────
   [8] TRANSACTIONS
   Supabase: SELECT, INSERT, UPDATE, DELETE pada tabel transactions
   ───────────────────────────────────────────────────────────── */

/**
 * Fetch semua transaksi user dari Supabase
 * SELECT * FROM transactions WHERE user_id = auth.uid() ORDER BY date DESC
 */
async function fetchTransactions() {
  const { data, error } = await db
    .from('transactions')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.error('fetchTransactions error:', error.message);
    return;
  }
  STATE.transactions = data || [];
}

/** Render tabel & card list transaksi dengan filter aktif */
function renderTransactionsTable() {
  const filterProduct = document.getElementById('txFilterProduct')?.value || '';
  const filterFrom    = document.getElementById('txFilterFrom')?.value || '';
  const filterTo      = document.getElementById('txFilterTo')?.value || '';

  let txs = [...STATE.transactions];

  if (filterProduct) txs = txs.filter(tx => tx.product === filterProduct);
  if (filterFrom)    txs = txs.filter(tx => tx.date >= filterFrom);
  if (filterTo)      txs = txs.filter(tx => tx.date <= filterTo);

  txs.sort((a, b) => new Date(b.date) - new Date(a.date));

  setText('txTotalCount', txs.length);

  // Desktop tbody
  const tbody = document.getElementById('txTableBody');
  if (tbody) {
    if (txs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--t3);padding:24px;">Tidak ada transaksi ditemukan.</td></tr>';
    } else {
      tbody.innerHTML = txs.map(tx => {
        const pillClass = PRODUCT_PILL[tx.product] || '';
        const total = parseFloat(tx.gram) * parseFloat(tx.price_per_gram);
        return `<tr>
          <td>${fmtDate(tx.date)}</td>
          <td><span class="type-pill ${pillClass}">${PRODUCT_LABELS[tx.product] || tx.product}</span></td>
          <td><b>${fmtGram(tx.gram, 4)}</b></td>
          <td>${fmtRupiah(tx.price_per_gram)}</td>
          <td><b>${fmtRupiah(total)}</b></td>
          <td style="color:var(--t3);">${tx.notes || '—'}</td>
          <td>
            <button class="btn btn-sm btn-edit" onclick="openEditModal('${tx.id}')">
              <svg width="12" height="12"><use href="#ic-edit"/></svg>
            </button>
            <button class="btn btn-sm btn-del" onclick="deleteTransaction('${tx.id}')">
              <svg width="12" height="12"><use href="#ic-trash"/></svg>
            </button>
          </td>
        </tr>`;
      }).join('');
    }
  }

  // Mobile cards
  const cardList = document.getElementById('txCardList');
  if (cardList) {
    if (txs.length === 0) {
      cardList.innerHTML = '<div style="text-align:center;color:var(--t3);padding:24px;font-size:13px;">Tidak ada transaksi ditemukan.</div>';
    } else {
      cardList.innerHTML = txs.map(tx => {
        const pillClass = PRODUCT_PILL[tx.product] || '';
        const total = parseFloat(tx.gram) * parseFloat(tx.price_per_gram);
        return `<div class="m-card-item">
          <div class="m-card-top">
            <span class="type-pill ${pillClass}">${PRODUCT_LABELS[tx.product] || tx.product}</span>
            <span style="font-size:12px;color:var(--t3);">${fmtDate(tx.date)}</span>
          </div>
          <div class="m-card-body">
            <div class="m-card-field"><small>Gram</small><span>${fmtGram(tx.gram, 4)}</span></div>
            <div class="m-card-field"><small>Harga/gr</small><span>${fmtRupiah(tx.price_per_gram)}</span></div>
            <div class="m-card-field"><small>Total</small><span style="color:var(--c);font-weight:700;">${fmtRupiah(total)}</span></div>
            <div class="m-card-field"><small>Catatan</small><span style="color:var(--t3);">${tx.notes || '—'}</span></div>
          </div>
          <div class="m-card-actions">
            <button class="btn btn-sm btn-edit" onclick="openEditModal('${tx.id}')" style="flex:1;justify-content:center;">
              <svg width="12" height="12"><use href="#ic-edit"/></svg> Edit
            </button>
            <button class="btn btn-sm btn-del" onclick="deleteTransaction('${tx.id}')" style="flex:1;justify-content:center;">
              <svg width="12" height="12"><use href="#ic-trash"/></svg> Hapus
            </button>
          </div>
        </div>`;
      }).join('');
    }
  }
}

function applyTxFilter() {
  renderTransactionsTable();
}

/**
 * Simpan transaksi baru
 * INSERT INTO transactions (user_id, date, product, gram, price_per_gram, notes)
 */
async function saveTransaction() {
  const date          = document.getElementById('mDate').value;
  const product       = document.getElementById('mProd').value;
  const gram          = parseFloat(document.getElementById('mGram').value);
  const price_per_gram = parseInt(document.getElementById('mPrice').value, 10);
  const notes         = document.getElementById('mNotes').value.trim();

  if (!date || !product || isNaN(gram) || gram <= 0 || isNaN(price_per_gram) || price_per_gram <= 0) {
    showToast('Lengkapi semua field yang wajib diisi.', true);
    return;
  }

  const btn = document.getElementById('modalSaveBtn');
  btn.disabled = true;

  const { data, error } = await db
    .from('transactions')
    .insert([{
      user_id: STATE.user.id,
      date,
      product,
      gram,
      price_per_gram,
      notes: notes || null,
    }])
    .select()
    .single();

  btn.disabled = false;

  if (error) {
    showToast('Gagal menyimpan transaksi: ' + error.message, true);
    return;
  }

  STATE.transactions.unshift(data);
  closeModal();
  showToast('Transaksi berhasil disimpan!');
  refreshAllViews();
}

/**
 * Update transaksi
 * UPDATE transactions SET ... WHERE id = editingTxId AND user_id = auth.uid()
 */
async function updateTransaction() {
  const id            = STATE.editingTxId;
  const date          = document.getElementById('mDate').value;
  const product       = document.getElementById('mProd').value;
  const gram          = parseFloat(document.getElementById('mGram').value);
  const price_per_gram = parseInt(document.getElementById('mPrice').value, 10);
  const notes         = document.getElementById('mNotes').value.trim();

  if (!id || !date || !product || isNaN(gram) || gram <= 0 || isNaN(price_per_gram) || price_per_gram <= 0) {
    showToast('Lengkapi semua field yang wajib diisi.', true);
    return;
  }

  const btn = document.getElementById('modalSaveBtn');
  btn.disabled = true;

  const { data, error } = await db
    .from('transactions')
    .update({ date, product, gram, price_per_gram, notes: notes || null })
    .eq('id', id)
    .select()
    .single();

  btn.disabled = false;

  if (error) {
    showToast('Gagal memperbarui transaksi: ' + error.message, true);
    return;
  }

  const idx = STATE.transactions.findIndex(tx => tx.id === id);
  if (idx !== -1) STATE.transactions[idx] = data;

  closeModal();
  showToast('Transaksi berhasil diperbarui!');
  refreshAllViews();
}

/**
 * Hapus transaksi
 * DELETE FROM transactions WHERE id = ? AND user_id = auth.uid()
 */
async function deleteTransaction(id) {
  if (!confirm('Hapus transaksi ini?')) return;

  const { error } = await db
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) {
    showToast('Gagal menghapus transaksi: ' + error.message, true);
    return;
  }

  STATE.transactions = STATE.transactions.filter(tx => tx.id !== id);
  showToast('Transaksi dihapus.');
  refreshAllViews();
}

/* ─────────────────────────────────────────────────────────────
   [9] GOLD PRICES
   Supabase: SELECT * FROM gold_prices WHERE date >= CURRENT_DATE - 7
   ───────────────────────────────────────────────────────────── */

/**
 * Fetch harga emas dari Supabase
 * SELECT * FROM gold_prices WHERE date >= CURRENT_DATE - 7 ORDER BY date DESC, product
 */
async function fetchGoldPrices() {
  const { data, error } = await db
    .from('gold_prices')
    .select('*')
    .order('date', { ascending: false })
    .order('product', { ascending: true })
    .limit(50);

  if (error) {
    console.error('fetchGoldPrices error:', error.message);
    return;
  }

  STATE.goldPrices = data || [];

  // Ambil tanggal terbaru dari data (bukan dari browser)
  const latestDate = data && data.length > 0 ? data[0].date : null;

  STATE.todayPrices = {};
  if (latestDate) {
    data.forEach(row => {
      if (row.date === latestDate) {
        STATE.todayPrices[row.product] = {
          sell_price:    row.sell_price,
          buyback_price: row.buyback_price,
          updated_at:    row.updated_at,
        };
      }
    });
  }
}

  // Build todayPrices map
  STATE.todayPrices = {};
  (data || []).forEach(row => {
    if (row.date === today) {
      STATE.todayPrices[row.product] = {
        sell_price:    row.sell_price,
        buyback_price: row.buyback_price,
        updated_at:    row.updated_at,
      };
    }
  });
}

function renderPriceCards() {
  const products = ['antam', 'ubs', 'galeri24', 'pegadaian', 'treasury', 'emaskita'];
  const idMap = { antam: 'Antam', ubs: 'Ubs', galeri24: 'Galeri24', pegadaian: 'Pegadaian', treasury: 'Treasury', emaskita: 'Emaskita' };

  // Last update time
  const anyToday = Object.values(STATE.todayPrices)[0];
  if (anyToday?.updated_at) {
    const updAt = new Date(anyToday.updated_at);
    setText('priceLastUpdate', updAt.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
      + ', ' + updAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB');
  }

  // Harga kemarin untuk % change
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const yesterdayPrices = {};
  STATE.goldPrices.forEach(row => {
    if (row.date === yesterday) yesterdayPrices[row.product] = row;
  });

  products.forEach(prod => {
    const label = idMap[prod];
    const data  = STATE.todayPrices[prod];
    const prev  = yesterdayPrices[prod];

    // Product cards on price page
    const pmcSell   = document.getElementById('pmc' + label + 'Sell');
    const pmcBb     = document.getElementById('pmc' + label + 'Bb');
    const pmcChange = document.getElementById('pmc' + label + 'Change');
    const pmcSpread = document.getElementById('pmc' + label + 'Spread');

    if (!data) {
      if (pmcSell)   pmcSell.textContent   = 'Rp —';
      if (pmcBb)     pmcBb.textContent     = 'Buyback: Rp —';
      if (pmcChange) { pmcChange.textContent = '—'; pmcChange.className = 'pmc-change'; }
      if (pmcSpread) pmcSpread.textContent = 'Spread: Rp — (—%)';
      return;
    }

    if (pmcSell) pmcSell.textContent = fmtRupiah(data.sell_price);
    if (pmcBb)   pmcBb.textContent   = 'Buyback: ' + fmtRupiah(data.buyback_price);

    if (pmcChange) {
      if (prev && prev.sell_price) {
        const pct = ((data.sell_price - prev.sell_price) / prev.sell_price) * 100;
        if (pct > 0) {
          pmcChange.textContent = '▲ +' + pct.toFixed(2) + '%';
          pmcChange.className   = 'pmc-change up';
        } else if (pct < 0) {
          pmcChange.textContent = '▼ ' + pct.toFixed(2) + '%';
          pmcChange.className   = 'pmc-change dn';
        } else {
          pmcChange.textContent = '— 0.00%';
          pmcChange.className   = 'pmc-change flat';
        }
      } else {
        pmcChange.textContent = '—';
        pmcChange.className   = 'pmc-change';
      }
    }

    if (pmcSpread) {
      const spread    = data.sell_price - data.buyback_price;
      const spreadPct = data.sell_price > 0 ? ((spread / data.sell_price) * 100).toFixed(2) : '0';
      pmcSpread.textContent = 'Spread: ' + fmtRupiah(spread) + ' (' + spreadPct + '%)';
    }
  });
}

function renderPriceHistoryTable() {
  // Group by date
  const byDate = {};
  STATE.goldPrices.forEach(row => {
    if (!byDate[row.date]) byDate[row.date] = {};
    byDate[row.date][row.product] = row;
  });

  const dates = Object.keys(byDate).sort().reverse();

  const renderPct = (cur, prev) => {
    if (!cur || !prev) return '';
    const pct = ((cur - prev) / prev) * 100;
    if (pct > 0.001) return `<br><span class="chg-pos" style="font-size:11px;">▲ +${pct.toFixed(2)}%</span>`;
    if (pct < -0.001) return `<br><span class="chg-neg" style="font-size:11px;">▼ ${pct.toFixed(2)}%</span>`;
    return `<br><span class="chg-flat" style="font-size:11px;">— 0.00%</span>`;
  };

  const tbody = document.getElementById('priceHistoryTbody');
  if (tbody) {
    if (dates.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--t3);padding:24px;">Belum ada data harga.</td></tr>';
    } else {
      tbody.innerHTML = dates.map((date, di) => {
        const cur  = byDate[date];
        const prev = di < dates.length - 1 ? byDate[dates[di + 1]] : {};
        const isToday = di === 0;
        const dateLabel = fmtDate(date) + (isToday ? ' <span class="badge badge-green" style="font-size:10px;padding:1px 6px;">Hari ini</span>' : '');

        const cell = (prod, bold = false) => {
          const c = cur[prod];
          const p = prev[prod];
          if (!c) return '<td>—</td>';
          return `<td>${bold ? '<b>' : ''}${fmtRupiah(c.sell_price)}${bold ? '</b>' : ''}${renderPct(c.sell_price, p?.sell_price)}</td>`;
        };
        const bbCell = (prod) => {
          const c = cur[prod];
          return `<td>${c ? fmtRupiah(c.buyback_price) : '—'}</td>`;
        };

        return `<tr>
          <td>${dateLabel}</td>
          ${cell('antam', isToday)}${bbCell('antam')}
          ${cell('ubs', isToday)}${bbCell('ubs')}
          ${cell('galeri24', isToday)}
          ${cell('pegadaian', isToday)}
          ${cell('treasury', isToday)}
          ${cell('emaskita', isToday)}
        </tr>`;
      }).join('');
    }
  }

  // Mobile cards
  const mobileCards = document.getElementById('priceHistoryCards');
  if (mobileCards) {
    if (dates.length === 0) {
      mobileCards.innerHTML = '<div style="text-align:center;color:var(--t3);padding:24px;font-size:13px;">Belum ada data harga.</div>';
    } else {
      const products = ['antam', 'ubs', 'galeri24', 'pegadaian', 'treasury', 'emaskita'];
      mobileCards.innerHTML = dates.map((date, di) => {
        const cur  = byDate[date];
        const prev = di < dates.length - 1 ? byDate[dates[di + 1]] : {};
        const isToday = di === 0;

        const fields = products.map(prod => {
          const c = cur[prod];
          const p = prev[prod];
          if (!c) return '';
          const pct = p ? ((c.sell_price - p.sell_price) / p.sell_price) * 100 : null;
          const pctHtml = pct === null ? '' :
            pct > 0.001 ? `<span class="chg-pos" style="font-size:10px;">▲+${pct.toFixed(2)}%</span>` :
            pct < -0.001 ? `<span class="chg-neg" style="font-size:10px;">▼${pct.toFixed(2)}%</span>` :
            `<span class="chg-flat" style="font-size:10px;">—0.00%</span>`;
          return `<div class="m-card-field"><small>${PRODUCT_LABELS[prod]} Jual</small><span>${fmtRupiah(c.sell_price)} ${pctHtml}</span></div>
                  <div class="m-card-field"><small>${PRODUCT_LABELS[prod]} BB</small><span>${fmtRupiah(c.buyback_price)}</span></div>`;
        }).join('');

        return `<div class="m-card-item">
          <div class="m-card-top">
            <span style="font-size:13px;font-weight:700;">${fmtDate(date)}</span>
            ${isToday ? '<span class="badge badge-green">Hari ini</span>' : ''}
          </div>
          <div class="m-card-body" style="grid-template-columns:1fr 1fr;">${fields}</div>
        </div>`;
      }).join('');
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   [10] PROFILE
   Supabase: SELECT/UPDATE profiles, db.auth.updateUser
   ───────────────────────────────────────────────────────────── */

/**
 * Fetch profil user
 * SELECT * FROM profiles WHERE id = auth.uid()
 */
async function fetchProfile() {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', STATE.user.id)
    .single();

  if (error) {
    console.error('fetchProfile error:', error.message);
    return;
  }
  STATE.profile = data;
}

function renderProfilePage() {
  const profile = STATE.profile;
  const user    = STATE.user;
  if (!profile || !user) return;

  const name = profile.full_name || user.email?.split('@')[0] || 'Pengguna';

  // Hero
  setText('profAvatar', getInitials(name));
  setText('profName', name);
  setText('profSub', user.email + ' · Member sejak ' + fmtMonthYear(profile.created_at));

  // Stats
  setText('profTxCount',    STATE.transactions.length);
  setText('profTotalGram',  fmtGram(STATE.transactions.reduce((s, tx) => s + parseFloat(tx.gram), 0), 4));

  const { roi } = computePortfolioAggregate();
  setText('profRoi', fmtPct(roi));

  // Inputs
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };

  setVal('profInputName',          profile.full_name    || '');
  setVal('profInputEmail',         user.email           || '');
  setVal('profInputPhone',         profile.phone        || '');
  setVal('profInputPortfolioName', profile.portfolio_name || 'Portofolio Utama');
  setVal('profInputTargetGram',    profile.target_gram  ?? 25);
  setVal('profInputMonthlyBuy',    profile.monthly_buy  ?? 1);

  // Avatar sidebar
  setText('profAvatar', getInitials(name));
}

/**
 * Simpan informasi pribadi
 * UPDATE profiles SET full_name, phone WHERE id = auth.uid()
 */
async function saveProfile() {
  const full_name = document.getElementById('profInputName')?.value.trim();
  const phone     = document.getElementById('profInputPhone')?.value.trim();

  if (!full_name) {
    showToast('Nama lengkap tidak boleh kosong.', true);
    return;
  }

  const { data, error } = await db
    .from('profiles')
    .update({ full_name, phone: phone || null })
    .eq('id', STATE.user.id)
    .select()
    .single();

  if (error) {
    showToast('Gagal menyimpan profil: ' + error.message, true);
    return;
  }

  STATE.profile = data;
  renderSidebarUser();
  renderGreeting();
  showToast('Profil berhasil diperbarui!');
}

/**
 * Update target portofolio
 * UPDATE profiles SET portfolio_name, target_gram, monthly_buy WHERE id = auth.uid()
 */
async function saveProfileTarget() {
  const portfolio_name = document.getElementById('profInputPortfolioName')?.value.trim();
  const target_gram    = parseFloat(document.getElementById('profInputTargetGram')?.value);
  const monthly_buy    = parseFloat(document.getElementById('profInputMonthlyBuy')?.value);

  if (isNaN(target_gram) || target_gram <= 0) {
    showToast('Target gram harus lebih dari 0.', true);
    return;
  }
  if (isNaN(monthly_buy) || monthly_buy <= 0) {
    showToast('Estimasi beli/bulan harus lebih dari 0.', true);
    return;
  }

  const { data, error } = await db
    .from('profiles')
    .update({ portfolio_name: portfolio_name || 'Portofolio Utama', target_gram, monthly_buy })
    .eq('id', STATE.user.id)
    .select()
    .single();

  if (error) {
    showToast('Gagal memperbarui target: ' + error.message, true);
    return;
  }

  STATE.profile = data;
  renderTargetBlock();
  showToast('Target diperbarui!');
}

/**
 * Ganti password
 * db.auth.updateUser({ password: newPassword })
 */
async function changePassword() {
  const current  = document.getElementById('profCurrentPassword')?.value;
  const newPass  = document.getElementById('profNewPassword')?.value;
  const confirm  = document.getElementById('profConfirmPassword')?.value;

  if (!newPass || newPass.length < 8) {
    showToast('Password baru minimal 8 karakter.', true);
    return;
  }
  if (newPass !== confirm) {
    showToast('Konfirmasi password tidak cocok.', true);
    return;
  }

  // Supabase tidak memverifikasi password lama via client.
  // Untuk re-auth sebelum update, gunakan db.auth.signInWithPassword terlebih dahulu.
  const { error } = await db.auth.updateUser({ password: newPass });

  if (error) {
    showToast('Gagal mengganti password: ' + error.message, true);
    return;
  }

  document.getElementById('profCurrentPassword').value = '';
  document.getElementById('profNewPassword').value     = '';
  document.getElementById('profConfirmPassword').value = '';
  showToast('Password berhasil diubah!');
}

/* ─────────────────────────────────────────────────────────────
   [11] MODAL TRANSAKSI
   ───────────────────────────────────────────────────────────── */

function openModal() {
  STATE.editingTxId = null;

  setText('modalTitle',    'Tambah Transaksi');
  setText('modalSubtitle', 'Catat pembelian emas baru Anda');

  const saveBtn = document.getElementById('modalSaveBtn');
  if (saveBtn) {
    saveBtn.textContent = 'Simpan Transaksi';
    saveBtn.onclick     = saveTransaction;
  }

  // Default tanggal = hari ini
  const mDate = document.getElementById('mDate');
  if (mDate) mDate.value = new Date().toISOString().split('T')[0];

  document.getElementById('mProd').value  = 'antam';
  document.getElementById('mGram').value  = '';
  document.getElementById('mNotes').value = '';
  document.getElementById('mTxId').value  = '';

  onModalProductChange();
  document.getElementById('modalOv').classList.add('open');
}

function openEditModal(txId) {
  const tx = STATE.transactions.find(t => t.id === txId);
  if (!tx) return;

  STATE.editingTxId = txId;

  setText('modalTitle',    'Edit Transaksi');
  setText('modalSubtitle', 'Perbarui data transaksi');

  const saveBtn = document.getElementById('modalSaveBtn');
  if (saveBtn) {
    saveBtn.textContent = 'Perbarui Transaksi';
    saveBtn.onclick     = updateTransaction;
  }

  document.getElementById('mTxId').value   = tx.id;
  document.getElementById('mDate').value   = tx.date;
  document.getElementById('mProd').value   = tx.product;
  document.getElementById('mGram').value   = tx.gram;
  document.getElementById('mPrice').value  = tx.price_per_gram;
  document.getElementById('mNotes').value  = tx.notes || '';

  updateTotal();
  updateMarketPriceLabel();
  document.getElementById('modalOv').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOv').classList.remove('open');
  STATE.editingTxId = null;
}

/** Update harga/gr default dari gold_prices saat produk diganti */
function onModalProductChange() {
  const prod  = document.getElementById('mProd')?.value;
  const price = STATE.todayPrices[prod]?.sell_price;

  if (price) {
    document.getElementById('mPrice').value = price;
  } else {
    document.getElementById('mPrice').value = '';
  }

  updateTotal();
  updateMarketPriceLabel();
}

function updateTotal() {
  const g = parseFloat(document.getElementById('mGram')?.value)  || 0;
  const p = parseFloat(document.getElementById('mPrice')?.value) || 0;
  const total = g * p;
  setText('mTotal', total > 0 ? fmtRupiah(total) : 'Rp —');
}

function updateMarketPriceLabel() {
  const prod  = document.getElementById('mProd')?.value;
  const price = STATE.todayPrices[prod]?.sell_price;
  setText('mMarketPrice', price ? fmtRupiah(price) + ' / gr' : 'Rp — / gr');
}

/* ─────────────────────────────────────────────────────────────
   [12] INIT
   ───────────────────────────────────────────────────────────── */

/** Refresh semua tampilan setelah CRUD atau perubahan data */
function refreshAllViews() {
  renderDashboardKPI();
  renderTargetBlock();
  renderRecentTransactions();
  renderSidebarPrices();
  renderPortfolioChart();
  renderPortfolioSummary();
  renderPortfolioBreakdown();
  renderTransactionsTable();
  renderProfilePage();
}

/** Boot aplikasi setelah session valid */
async function bootApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('app').style.display       = 'block';

  // Fetch semua data secara paralel
  await Promise.all([
    fetchProfile(),
    fetchTransactions(),
    fetchGoldPrices(),
  ]);

  renderSidebarUser();
  renderGreeting();
  renderDashboardKPI();
  renderTargetBlock();
  renderRecentTransactions();
  renderSidebarPrices();
  renderPortfolioChart();
  renderPortfolioSummary();
  renderPortfolioBreakdown();
  renderTransactionsTable();
  renderPriceCards();
  renderPriceHistoryTable();
  renderProfilePage();

  // Set default tanggal filter transaksi
  const today = new Date().toISOString().split('T')[0];
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const filterFrom = document.getElementById('txFilterFrom');
  const filterTo   = document.getElementById('txFilterTo');
  if (filterFrom && !filterFrom.value) filterFrom.value = oneYearAgo;
  if (filterTo   && !filterTo.value)   filterTo.value   = today;
}

/** Entry point — cek session Supabase saat halaman dimuat */
async function init() {
  const { data: { session } } = await db.auth.getSession();

  if (session) {
    STATE.user = session.user;
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('app').style.display       = 'block';
    await bootApp();
  } else {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('app').style.display       = 'none';
  }

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      STATE.user = session.user;
      document.getElementById('loginPage').style.display = 'none';
      document.getElementById('app').style.display       = 'block';
      await bootApp();
    } else if (event === 'SIGNED_OUT') {
  STATE.user         = null;
  STATE.profile      = null;
  STATE.transactions = [];
  STATE.goldPrices   = [];
  STATE.todayPrices  = {};

  // Bersihkan form
  const emailEl = document.getElementById('loginEmail');
  const passEl  = document.getElementById('loginPassword');
  if (emailEl) emailEl.value = '';
  if (passEl)  passEl.value  = '';

  document.getElementById('app').style.display       = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  switchAuthTab('login');
}
  });

  const modalOv = document.getElementById('modalOv');
  if (modalOv) {
    modalOv.addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
  }
}

  // Tutup modal saat klik overlay
  const modalOv = document.getElementById('modalOv');
  if (modalOv) {
    modalOv.addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
  }
// Jalankan init setelah DOM siap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
