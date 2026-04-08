// ============================================
// ユーザープロフィール閲覧ページ用 JavaScript
// ?id=USER_ID で他ユーザーのプロフィールを表示
// ============================================

const REVIEWS_PER_PAGE = 20;
let allReviews   = [];
let displayedCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
  await initPage();
});

// ============================================
// ページ初期化
// ============================================
async function initPage() {
  // --- ナビ：自分のログイン状態を反映 ---
  const { data: { session } } = await supabaseClient.auth.getSession();
  const navAuth     = document.getElementById('nav-auth');
  const navRegister = document.getElementById('nav-register');
  const navRequest  = document.getElementById('nav-request');
  const navProfile  = document.getElementById('nav-profile');

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

  // --- URLからユーザーIDを取得 ---
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('id');

  if (!userId) {
    showNotFound();
    return;
  }

  // --- 自分のページなら profile.html にリダイレクト ---
  if (session && session.user.id === userId) {
    location.href = 'profile.html';
    return;
  }

  await loadUserProfile(userId);
}

function showNotFound() {
  document.getElementById('user-not-found').style.display = 'block';
  document.getElementById('profile-body').style.display   = 'none';
}

// ============================================
// 対象ユーザーのデータを取得して描画
// ============================================
async function loadUserProfile(userId) {
  // --- プロフィール情報 ---
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    showNotFound();
    return;
  }

  // タイトルとアバター・ユーザー名を設定
  const username = profile.username || 'ユーザー';
  document.title = `${username} さんのプロフィール - お好み焼きDB`;
  document.getElementById('prof-username').textContent = username;
  if (profile.avatar_url) {
    document.getElementById('prof-avatar').innerHTML =
      `<img src="${profile.avatar_url}" alt="${username}" class="prof-avatar-img">`;
  }

  // --- 全レビューを取得 ---
  const { data: reviews, error: reviewError } = await supabaseClient
    .from('reviews')
    .select(`
      id, overall_score, comment, visited_at, created_at, image_url, image_urls,
      shops ( id, name, prefecture, city, image_url )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (reviewError || !reviews) {
    document.getElementById('review-list-area').innerHTML =
      '<div class="empty-state"><div class="icon">😢</div><p>データの読み込みに失敗しました</p></div>';
    document.getElementById('profile-body').style.display = 'block';
    return;
  }

  allReviews = reviews;

  // --- 各セクション描画 ---
  renderStats(reviews);
  renderTopRated(reviews);
  renderFrequent(reviews);
  renderPrefChart(reviews);

  displayedCount = 0;
  document.getElementById('review-list-area').innerHTML = '';
  loadMoreReviews();

  document.getElementById('profile-body').style.display = 'block';
}

// ============================================
// 統計バッジ
// ============================================
function renderStats(reviews) {
  const reviewCount = reviews.length;
  const shopIds     = new Set(reviews.map(r => r.shops?.id).filter(Boolean));
  const shopCount   = shopIds.size;
  const scores      = reviews.map(r => r.overall_score).filter(s => s != null);
  const avgScore    = scores.length > 0
    ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    : '—';
  const lastDate    = reviews.length > 0
    ? new Date(reviews[0].created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  document.getElementById('stat-review-count').textContent = reviewCount;
  document.getElementById('stat-shop-count').textContent   = shopCount;
  document.getElementById('stat-avg-score').textContent    = avgScore === '—' ? '—' : avgScore + '点';
  document.getElementById('stat-last-review').textContent  = lastDate;
}

// ============================================
// 高評価の店（上位10件）
// ============================================
function renderTopRated(reviews) {
  const container  = document.getElementById('top-rated-shops');
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
// よく行く店（上位10件）
// ============================================
function renderFrequent(reviews) {
  const container = document.getElementById('frequent-shops');
  const countMap  = new Map();

  reviews.forEach(r => {
    const sid = r.shops?.id;
    if (!sid) return;
    if (!countMap.has(sid)) countMap.set(sid, { count: 0, review: r });
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
  const prefShops = new Map();

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
  const slice     = allReviews.slice(displayedCount, displayedCount + REVIEWS_PER_PAGE);
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

  moreWrap.style.display = (displayedCount < allReviews.length) ? 'block' : 'none';
}

function buildReviewCard(r) {
  const shop       = r.shops || {};
  const score      = r.overall_score ?? '—';
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
