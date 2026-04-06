// ============================================
// トップページ用 JavaScript v2
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadRanking();
  await loadNewShops();
});

async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const navAuth = document.getElementById('nav-auth');
  const navRegister = document.getElementById('nav-register');
  const navRequest = document.getElementById('nav-request');

  if (session) {
    await ensureProfile(session.user);
    navAuth.textContent = 'ログアウト';
    navAuth.href = '#';
    navAuth.onclick = async (e) => {
      e.preventDefault();
      await supabaseClient.auth.signOut();
      location.reload();
    };
    navRegister.style.display = 'none';
    if (navRequest) navRequest.style.display = 'inline-block';
  }
}

async function ensureProfile(user) {
  const { data } = await supabaseClient
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!data) {
    const username = user.user_metadata?.username || 'ユーザー' + user.id.slice(0, 6);
    await supabaseClient
      .from('profiles')
      .insert({ id: user.id, username: username });
  }
}

// --- 評価アルゴリズム改善 ---
function calculateShopScore(reviews) {
  if (!reviews || reviews.length === 0) return null;

  const scores = reviews.map(r => r.overall_score);
  const n = scores.length;

  // レビュー1件の場合はそのまま返す
  if (n === 1) return scores[0];

  // ソートして外れ値を除外（上下10%をトリム）
  const sorted = [...scores].sort((a, b) => a - b);
  const trimCount = Math.floor(n * 0.1);
  const trimmed = trimCount > 0 && n >= 5
    ? sorted.slice(trimCount, n - trimCount)
    : sorted;

  // トリム平均を計算
  const trimmedAvg = trimmed.reduce((sum, s) => sum + s, 0) / trimmed.length;

  // レビュー数による信頼度補正（ベイズ平均的アプローチ）
  // 全体平均を50と仮定、レビュー数が少ないと50に近づく
  const globalAvg = 50;
  const confidence = 3; // この数以上のレビューで信頼度が高くなる
  const bayesianScore = (confidence * globalAvg + n * trimmedAvg) / (confidence + n);

  return Math.round(bayesianScore);
}

async function loadRanking() {
  const grid = document.getElementById('ranking-grid');

  const { data: shops, error } = await supabaseClient
    .from('shops')
    .select(`*, reviews (overall_score)`)
    .limit(20);

  if (error) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">😢</div><p>データの読み込みに失敗しました</p></div>';
    return;
  }

  const shopsWithScore = shops.map(shop => ({
    ...shop,
    avgScore: calculateShopScore(shop.reviews),
    reviewCount: (shop.reviews || []).length
  }));

  shopsWithScore.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));

  const top6 = shopsWithScore.slice(0, 6);

  if (top6.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">🍳</div><p>まだ店舗が登録されていません</p></div>';
    return;
  }

  grid.innerHTML = top6.map((shop, i) => createShopCard(shop, i + 1)).join('');
}

async function loadNewShops() {
  const grid = document.getElementById('new-shops-grid');

  const { data: shops, error } = await supabaseClient
    .from('shops')
    .select(`*, reviews (overall_score)`)
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">😢</div><p>データの読み込みに失敗しました</p></div>';
    return;
  }

  const shopsWithScore = shops.map(shop => ({
    ...shop,
    avgScore: calculateShopScore(shop.reviews),
    reviewCount: (shop.reviews || []).length
  }));

  if (shopsWithScore.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">🍳</div><p>まだ店舗が登録されていません</p></div>';
    return;
  }

  grid.innerHTML = shopsWithScore.map(shop => createShopCard(shop)).join('');
}

function createShopCard(shop, rank) {
  const scoreClass = shop.avgScore >= 75 ? 'score-high'
    : shop.avgScore >= 50 ? 'score-mid'
    : shop.avgScore ? 'score-low'
    : 'score-none';
  const scoreText = shop.avgScore ? shop.avgScore : '-';
  const rankBadge = rank ? `<span style="position:absolute;top:8px;left:8px;background:#ff8f00;color:#fff;padding:2px 10px;border-radius:12px;font-size:13px;font-weight:bold;">${rank}位</span>` : '';

  return `
    <div class="shop-card" onclick="location.href='shop-detail.html?id=${shop.id}'">
      <div class="shop-card-image" style="position:relative;">
        ${shop.image_url ? `<img src="${shop.image_url}" alt="${shop.name}">` : '🥞'}
        ${rankBadge}
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

function doSearch() {
  const pref = document.getElementById('search-pref').value;
  const style = document.getElementById('search-style').value;
  const params = new URLSearchParams();
  if (pref) params.set('pref', pref);
  if (style) params.set('style', style);
  location.href = `shops.html?${params.toString()}`;
}
