// ============================================
// 店舗一覧ページ用 JavaScript v3
// 市区町村絞り込み・Googleマップ表示対応
// ============================================

// 現在の絞り込み結果を保持（地図タブ切替時に再利用）
let currentShops = [];
let mapInitialized = false;
let currentView = 'list';

// ============================================
// ページ読み込み
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  const params = new URLSearchParams(window.location.search);
  if (params.get('pref')) {
    document.getElementById('filter-pref').value = params.get('pref');
    await onPrefChange(); // 市区町村も復元
    if (params.get('city')) document.getElementById('filter-city').value = params.get('city');
  }
  await loadShops();
});

// ============================================
// 認証チェック
// ============================================
async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const navAuth = document.getElementById('nav-auth');
  const navRegister = document.getElementById('nav-register');
  const navRequest = document.getElementById('nav-request');

  const navProfile = document.getElementById('nav-profile');

  if (session) {
    navAuth.textContent = 'ログアウト';
    navAuth.href = '#';
    navAuth.onclick = async (e) => {
      e.preventDefault();
      await supabaseClient.auth.signOut();
      location.reload();
    };
    navRegister.style.display = 'none';
    if (navRequest) navRequest.style.display = 'inline-block';
    if (navProfile) navProfile.style.display = 'inline-block';
  }
}

// ============================================
// スコア計算（ベイズ平均）
// ============================================
function calculateShopScore(reviews) {
  if (!reviews || reviews.length === 0) return null;
  const scores = reviews.map(r => r.overall_score);
  const n = scores.length;
  if (n === 1) return scores[0];
  const sorted = [...scores].sort((a, b) => a - b);
  const trimCount = Math.floor(n * 0.1);
  const trimmed = trimCount > 0 && n >= 5 ? sorted.slice(trimCount, n - trimCount) : sorted;
  const trimmedAvg = trimmed.reduce((sum, s) => sum + s, 0) / trimmed.length;
  const globalAvg = 50;
  const confidence = 3;
  const bayesianScore = (confidence * globalAvg + n * trimmedAvg) / (confidence + n);
  return Math.round(bayesianScore);
}

// ============================================
// 都道府県変更 → 市区町村を動的取得
// ============================================
async function onPrefChange() {
  const pref = document.getElementById('filter-pref').value;
  const citySelect = document.getElementById('filter-city');

  citySelect.innerHTML = '<option value="">読み込み中...</option>';
  citySelect.disabled = true;

  if (!pref) {
    citySelect.innerHTML = '<option value="">都道府県を先に選択</option>';
    return;
  }

  try {
    // 選択した都道府県に存在するcityを重複なしで取得
    const { data, error } = await supabaseClient
      .from('shops')
      .select('city')
      .eq('prefecture', pref)
      .not('city', 'is', null)
      .order('city', { ascending: true });

    if (error) throw error;

    // 重複除去
    const cities = [...new Set((data || []).map(r => r.city).filter(Boolean))].sort();

    if (cities.length === 0) {
      citySelect.innerHTML = '<option value="">（市区町村データなし）</option>';
    } else {
      citySelect.innerHTML = '<option value="">すべての市・区・町</option>'
        + cities.map(c => `<option value="${c}">${c}</option>`).join('');
      citySelect.disabled = false;
    }
  } catch (err) {
    citySelect.innerHTML = '<option value="">取得失敗</option>';
  }
}

// ============================================
// 店舗一覧をSupabaseから取得
// ============================================
async function loadShops() {
  const grid = document.getElementById('shops-grid');
  const countEl = document.getElementById('result-count');
  const pref = document.getElementById('filter-pref').value;
  const city = document.getElementById('filter-city').value;
  const cooking = document.getElementById('filter-cooking').value;

  let query = supabaseClient
    .from('shops')
    .select(`*, reviews (overall_score)`)
    .order('created_at', { ascending: false });

  if (pref)    query = query.eq('prefecture', pref);
  if (city)    query = query.eq('city', city);
  if (cooking) query = query.eq('cooking_style', cooking);

  const { data: shops, error } = await query;

  if (error) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">😢</div><p>データの読み込みに失敗しました</p></div>';
    return;
  }

  currentShops = shops.map(shop => ({
    ...shop,
    avgScore: calculateShopScore(shop.reviews),
    reviewCount: (shop.reviews || []).length
  }));

  countEl.textContent = `${currentShops.length} 件の店舗が見つかりました`;

  if (currentShops.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>条件に合う店舗が見つかりませんでした</p></div>';
  } else {
    grid.innerHTML = currentShops.map(shop => createShopCard(shop)).join('');
  }

  // 地図が開いていれば更新
  if (currentView === 'map') {
    renderMap(currentShops);
  }
}

// ============================================
// 店舗カード生成
// ============================================
function createShopCard(shop) {
  const scoreClass = shop.avgScore >= 75 ? 'score-high'
    : shop.avgScore >= 50 ? 'score-mid'
    : shop.avgScore ? 'score-low'
    : 'score-none';
  const scoreText = shop.avgScore ? shop.avgScore : '-';

  return `
    <div class="shop-card" onclick="location.href='shop-detail.html?id=${shop.id}'">
      <div class="shop-card-image">
        ${shop.image_url ? `<img src="${shop.image_url}" alt="${shop.name}">` : '🥞'}
      </div>
      <div class="shop-card-body">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="shop-card-name">${shop.name}</div>
          <div class="score-badge ${scoreClass}">${scoreText}</div>
        </div>
        <div class="shop-card-info">📍 ${shop.prefecture} ${shop.city}</div>
        <div class="shop-card-info">🕐 ${shop.business_hours || '情報なし'}</div>
        <div class="shop-card-info">📝 レビュー ${shop.reviewCount}件</div>
        <div class="shop-card-tags">
          <span class="tag tag-style">${shop.style}</span>
          <span class="tag tag-cooking">${shop.cooking_style}</span>
          ${shop.takeout_available ? '<span class="tag tag-takeout">持ち帰り可</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

// ============================================
// 絞り込みボタン
// ============================================
function applyFilter() {
  mapInitialized = false; // フィルタ変更時はマップをリセット
  loadShops();
}

function resetFilter() {
  document.getElementById('filter-pref').value = '';
  document.getElementById('filter-city').innerHTML = '<option value="">都道府県を先に選択</option>';
  document.getElementById('filter-city').disabled = true;
  document.getElementById('filter-cooking').value = '';
  mapInitialized = false;
  loadShops();
}

// ============================================
// リスト / 地図 タブ切替
// ============================================
function switchView(view) {
  currentView = view;
  const listEl = document.getElementById('view-list');
  const mapEl  = document.getElementById('view-map');
  const tabList = document.getElementById('tab-list');
  const tabMap  = document.getElementById('tab-map');

  if (view === 'list') {
    listEl.style.display = 'block';
    mapEl.style.display  = 'none';
    tabList.classList.add('shops-tab-active');
    tabMap.classList.remove('shops-tab-active');
  } else {
    listEl.style.display = 'none';
    mapEl.style.display  = 'block';
    tabList.classList.remove('shops-tab-active');
    tabMap.classList.add('shops-tab-active');
    renderMap(currentShops);
  }
}

// ============================================
// Googleマップ描画（Maps JavaScript API不要・静的埋め込み不使用）
// Leaflet.js（OpenStreetMap）を動的ロードしてピン表示
// ============================================
let leafletMap = null;
let leafletMarkers = [];

function loadLeaflet(callback) {
  if (window.L) { callback(); return; }

  // Leaflet CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);

  // Leaflet JS
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.onload = callback;
  document.head.appendChild(script);
}

function renderMap(shops) {
  loadLeaflet(() => {
    const mapEl = document.getElementById('shops-map');
    const noLocEl = document.getElementById('map-no-location');

    // 位置情報のある店舗のみ
    const located = shops.filter(s => s.latitude && s.longitude);
    const noLocCount = shops.length - located.length;

    if (noLocCount > 0) {
      noLocEl.style.display = 'block';
      noLocEl.textContent = `※ 位置情報がない店舗が ${noLocCount} 件あり、地図に表示されていません。`;
    } else {
      noLocEl.style.display = 'none';
    }

    // 地図がなければ初期化
    if (!leafletMap) {
      // 中心座標（広島をデフォルト、店舗があれば平均座標）
      let centerLat = 34.3853, centerLng = 132.4553;
      if (located.length > 0) {
        centerLat = located.reduce((s, x) => s + x.latitude, 0) / located.length;
        centerLng = located.reduce((s, x) => s + x.longitude, 0) / located.length;
      }
      leafletMap = window.L.map('shops-map').setView([centerLat, centerLng], located.length > 0 ? 12 : 6);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(leafletMap);
    } else {
      // 既存マーカーをクリア
      leafletMarkers.forEach(m => leafletMap.removeLayer(m));
      leafletMarkers = [];
    }

    if (located.length === 0) return;

    // ピンを追加
    located.forEach(shop => {
      const scoreText = shop.avgScore ? `${shop.avgScore}点` : '未評価';
      const popup = `
        <div class="map-popup">
          <strong><a href="shop-detail.html?id=${shop.id}">${shop.name}</a></strong><br>
          <span class="map-popup-score">${scoreText}</span><br>
          <small>${shop.address || ''}</small><br>
          <small>📝 レビュー ${shop.reviewCount}件</small>
        </div>
      `;
      const marker = window.L.marker([shop.latitude, shop.longitude])
        .addTo(leafletMap)
        .bindPopup(popup);
      leafletMarkers.push(marker);
    });

    // 全ピンが収まるようにズーム調整
    if (located.length > 1) {
      const bounds = window.L.latLngBounds(located.map(s => [s.latitude, s.longitude]));
      leafletMap.fitBounds(bounds, { padding: [40, 40] });
    } else if (located.length === 1) {
      leafletMap.setView([located[0].latitude, located[0].longitude], 14);
    }

    // サイズ変化に対応（タブ切替後にタイル再描画）
    setTimeout(() => leafletMap.invalidateSize(), 100);
  });
}
