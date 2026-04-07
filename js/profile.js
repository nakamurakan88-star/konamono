// ============================================
// マイページ（プロフィール）用 JavaScript
// ラーメンDB参考：レビュー一覧・高評価店・よく行く店・都道府県別分布
// ============================================

const REVIEWS_PER_PAGE = 20;
let allReviews = [];       // ユーザーの全レビュー
let displayedCount = 0;    // 現在表示済み件数

document.addEventListener('DOMContentLoaded', async () => {
  await initPage();
});

// ============================================
// ページ初期化・認証チェック
// ============================================
async function initPage() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  const navAuth     = document.getElementById('nav-auth');
  const navRegister = document.getElementById('nav-register');
  const navRequest  = document.getElementById('nav-request');
  const navProfile  = document.getElementById('nav-profile');

  if (!session) {
    document.getElementById('login-required').style.display = 'block';
    document.getElementById('profile-body').style.display   = 'none';
    return;
  }

  // ログイン済み：ナビ更新
  navAuth.textContent = 'ログアウト';
  navAuth.href = '#';
  navAuth.onclick = async (e) => {
    e.preventDefault();
    await supabaseClient.auth.signOut();
    location.href = 'index.html';
  };
  navRegister.style.display = 'none';
  if (navRequest) navRequest.style.display = 'inline-block';
  if (navProfile) navProfile.style.display = 'inline-block';

  document.getElementById('profile-body').style.display = 'block';

  // 並列でデータ取得
  await loadProfileData(session.user);
}

// ============================================
// プロフィール・レビューデータを一括取得して各セクションへ
// ============================================
async function loadProfileData(user) {
  // --- プロフィール情報 ---
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', user.id)
    .single();

  const username = profile?.username || user.email?.split('@')[0] || 'ユーザー';
  document.getElementById('prof-username').textContent = username;
  document.getElementById('prof-email').textContent    = user.email || '';
  if (profile?.avatar_url) {
    document.getElementById('prof-avatar').innerHTML =
      `<img src="${profile.avatar_url}" alt="${username}" class="prof-avatar-img">`;
  }

  // --- 全レビューを取得（店名・都道府県を join） ---
  const { data: reviews, error } = await supabaseClient
    .from('reviews')
    .select(`
      id, overall_score, comment, visited_at, created_at, image_url, image_urls,
      shops ( id, name, prefecture, city, image_url )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !reviews) {
    document.getElementById('review-list-area').innerHTML =
      '<div class="empty-state"><div class="icon">😢</div><p>データの読み込みに失敗しました</p></div>';
    return;
  }

  allReviews = reviews;

  // --- 統計 ---
  renderStats(reviews);

  // --- 高評価の店 ---
  renderTopRated(reviews);

  // --- よく行く店 ---
  renderFrequent(reviews);

  // --- 都道府県別分布 ---
  renderPrefChart(reviews);

  // --- レビュー一覧（初回分） ---
  displayedCount = 0;
  document.getElementById('review-list-area').innerHTML = '';
  loadMoreReviews();
}

// ============================================
// 統計バッジを描画
// ============================================
function renderStats(reviews) {
  const reviewCount = reviews.length;
  // 訪問店舗数（shop_id のユニーク数）
  const shopIds    = new Set(reviews.map(r => r.shops?.id).filter(Boolean));
  const shopCount  = shopIds.size;
  // 平均点
  const scores     = reviews.map(r => r.overall_score).filter(s => s != null);
  const avgScore   = scores.length > 0
    ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    : '—';
  // 最終レビュー日
  const lastDate   = reviews.length > 0
    ? new Date(reviews[0].created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  document.getElementById('stat-review-count').textContent = reviewCount;
  document.getElementById('stat-shop-count').textContent   = shopCount;
  document.getElementById('stat-avg-score').textContent    = avgScore === '—' ? '—' : avgScore + '点';
  document.getElementById('stat-last-review').textContent  = lastDate;
}

// ============================================
// 高評価の店（overall_score 上位10件、ユニーク店舗）
// ============================================
function renderTopRated(reviews) {
  const container = document.getElementById('top-rated-shops');

  // 店舗ごとに最高スコアのレビューを抽出
  const bestByShop = new Map();
  reviews.forEach(r => {
    const sid = r.shops?.id;
    if (!sid) return;
    if (!bestByShop.has(sid) || r.overall_score > bestByShop.get(sid).overall_score) {
      bestByShop.set(sid, r);
    }
  });

  const top10 = [...bestByShop.values()]
    .filter(r => r.overall_score != null)
    .sort((a, b) => b.overall_score - a.overall_score)
    .slice(0, 10);

  if (top10.length === 0) {
    container.innerHTML = '<p class="prof-empty">まだレビューがありません</p>';
    return;
  }

  container.innerHTML = top10.map(r => profShopCard(r, r.overall_score + '点')).join('');
}

// ============================================
// よく行く店（同一店舗のレビュー回数が多い順 上位10件）
// ============================================
function renderFrequent(reviews) {
  const container = document.getElementById('frequent-shops');

  // 店舗ごとのレビュー回数をカウント
  const countMap = new Map(); // shopId -> { count, latestReview }
  reviews.forEach(r => {
    const sid = r.shops?.id;
    if (!sid) return;
    if (!countMap.has(sid)) {
      countMap.set(sid, { count: 0, review: r });
    }
    countMap.get(sid).count++;
  });

  const top10 = [...countMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([, v]) => ({ ...v.review, visitCount: v.count }));

  if (top10.length === 0) {
    container.innerHTML = '<p class="prof-empty">まだレビューがありません</p>';
    return;
  }

  container.innerHTML = top10.map(r => profShopCard(r, r.visitCount + '回')).join('');
}

// ============================================
// 都道府県別分布バーチャート
// ============================================
function renderPrefChart(reviews) {
  const container = document.getElementById('pref-chart');

  // 都道府県ごとのユニーク店舗数をカウント
  const prefShops = new Map(); // pref -> Set<shopId>
  reviews.forEach(r => {
    const pref = r.shops?.prefecture;
    const sid  = r.shops?.id;
    if (!pref || !sid) return;
    if (!prefShops.has(pref)) prefShops.set(pref, new Set());
    prefShops.get(pref).add(sid);
  });

  if (prefShops.size === 0) {
    container.innerHTML = '<p class="prof-empty">データがありません</p>';
    return;
  }

  // 件数でソート
  const sorted = [...prefShops.entries()]
    .map(([pref, shops]) => ({ pref, count: shops.size }))
    .sort((a, b) => b.count - a.count);

  const maxCount = sorted[0].count;

  container.innerHTML = sorted.map(({ pref, count }) => {
    const pct = Math.round((count / maxCount) * 100);
    return `
      <div class="prof-pref-row">
        <div class="prof-pref-name">${pref}</div>
        <div class="prof-pref-bar-wrap">
          <div class="prof-pref-bar" style="width:${pct}%"></div>
        </div>
        <div class="prof-pref-count">${count}店舗</div>
      </div>
    `;
  }).join('');
}

// ============================================
// 店舗カード（高評価・よく行く店 共通）
// ============================================
function profShopCard(review, badge) {
  const shop    = review.shops || {};
  const imgHtml = shop.image_url
    ? `<img src="${shop.image_url}" alt="${shop.name}" class="prof-shop-img">`
    : '<div class="prof-shop-img-placeholder">🥞</div>';

  return `
    <a href="shop-detail.html?id=${shop.id}" class="prof-shop-card">
      <div class="prof-shop-img-wrap">${imgHtml}</div>
      <div class="prof-shop-badge">${badge}</div>
      <div class="prof-shop-name">${shop.name || '—'}</div>
      <div class="prof-shop-loc">${shop.prefecture || ''}${shop.city || ''}</div>
    </a>
  `;
}

// ============================================
// レビュー一覧（20件ずつ追記表示）
// ============================================
function loadMoreReviews() {
  const container = document.getElementById('review-list-area');
  const moreWrap  = document.getElementById('review-list-more');

  const slice = allReviews.slice(displayedCount, displayedCount + REVIEWS_PER_PAGE);
  displayedCount += slice.length;

  if (slice.length === 0 && displayedCount === 0) {
    container.innerHTML = '<p class="prof-empty">まだレビューを投稿していません。</p>';
    return;
  }

  slice.forEach(r => {
    const el = document.createElement('div');
    el.className = 'prof-review-card';
    el.innerHTML = buildReviewCard(r);
    container.appendChild(el);
  });

  // 「もっと読む」ボタン表示制御
  moreWrap.style.display = (displayedCount < allReviews.length) ? 'block' : 'none';
}

function buildReviewCard(r) {
  const shop    = r.shops || {};
  const score   = r.overall_score ?? '—';
  const scoreClass = r.overall_score >= 75 ? 'score-high'
    : r.overall_score >= 50 ? 'score-mid'
    : r.overall_score ? 'score-low' : 'score-none';

  const comment = r.comment
    ? (r.comment.length > 80 ? r.comment.slice(0, 80) + '…' : r.comment)
    : 'コメントなし';

  const date = r.visited_at
    ? new Date(r.visited_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
    : r.created_at
      ? new Date(r.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
      : '';

  const imgUrls = (r.image_urls && r.image_urls.length > 0) ? r.image_urls
    : (r.image_url ? [r.image_url] : []);
  const imgHtml = imgUrls.length > 0
    ? imgUrls.map(u => `<img src="${u}" alt="レビュー写真" class="prof-review-photo" onclick="window.open('${u}','_blank')">`).join('')
    : '';

  return `
    <div class="prof-review-top">
      <a href="shop-detail.html?id=${shop.id}" class="prof-review-shop">${shop.name || '—'}</a>
      <span class="prof-review-loc">${shop.prefecture || ''}${shop.city || ''}</span>
      <span class="score-badge ${scoreClass} prof-review-score">${score}</span>
    </div>
    <div class="prof-review-comment">${comment}</div>
    ${imgHtml}
    <div class="prof-review-date">${date}</div>
  `;
}
