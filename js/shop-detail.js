// ============================================
// 店舗詳細ページ用 JavaScript v2
// ============================================

let currentShopId = null;
let currentUser = null;
let selectedFiles = [];

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  currentShopId = params.get('id');

  if (!currentShopId) {
    document.getElementById('shop-info').innerHTML =
      '<div class="empty-state"><div class="icon">❓</div><p>店舗が指定されていません</p></div>';
    return;
  }

  await checkAuth();
  await loadShopDetail();
  await loadReviews();
});

async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const navAuth = document.getElementById('nav-auth');
  const navRegister = document.getElementById('nav-register');
  const navRequest = document.getElementById('nav-request');
  const navProfile = document.getElementById('nav-profile');

  if (session) {
    currentUser = session.user;
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

    // レビュー投稿可否チェック
    await checkReviewEligibility();
  }
}

// --- 半年以内の再投稿チェック ---
async function checkReviewEligibility() {
  const formSection = document.getElementById('review-form-section');
  const formContent = document.getElementById('review-form-content');
  formSection.style.display = 'block';

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data: recentReview } = await supabaseClient
    .from('reviews')
    .select('created_at')
    .eq('user_id', currentUser.id)
    .eq('shop_id', parseInt(currentShopId))
    .gte('created_at', sixMonthsAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (recentReview && recentReview.length > 0) {
    const lastDate = new Date(recentReview[0].created_at);
    const nextDate = new Date(lastDate);
    nextDate.setMonth(nextDate.getMonth() + 6);
    const nextDateStr = nextDate.toLocaleDateString('ja-JP');

    formContent.innerHTML = `
      <div class="review-cooldown">
        <p>⏳ この店舗には最近レビューを投稿済みです</p>
        <p>次回投稿可能日: ${nextDateStr}</p>
      </div>
    `;
  } else {
    formContent.innerHTML = createReviewForm();
    setupStarRatings();
    setupImageUpload();
  }
}

function createReviewForm() {
  return `
    <div class="review-form">
      <!-- 総合スコア自動表示 -->
      <div class="overall-score-display">
        <div class="overall-score-label">現在のスコア</div>
        <div class="overall-score-value" id="overall-score-display">0</div>
        <div class="overall-score-unit">点</div>
      </div>

      <!-- 評価項目セクション -->
      <div class="score-section-title">📊 評価項目（各1〜5点）</div>

      <div class="form-group score-input-row">
        <label>麺（そば/うどん）<br><span class="label-sub">パリパリ度・食感</span></label>
        <div class="star-rating" data-target="noodle-score">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
          <span class="star-value" id="noodle-value">0</span>
        </div>
        <input type="hidden" id="noodle-score" value="0">
      </div>

      <div class="form-group score-input-row">
        <label>キャベツ<br><span class="label-sub">蒸し具合・甘み</span></label>
        <div class="star-rating" data-target="cabbage-score">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
          <span class="star-value" id="cabbage-value">0</span>
        </div>
        <input type="hidden" id="cabbage-score" value="0">
      </div>

      <div class="form-group score-input-row">
        <label>玉子<br><span class="label-sub">半熟具合・焼き加減</span></label>
        <div class="star-rating" data-target="egg-score">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
          <span class="star-value" id="egg-value">0</span>
        </div>
        <input type="hidden" id="egg-score" value="0">
      </div>

      <div class="form-group score-input-row">
        <label>ソース<br><span class="label-sub">味のバランス・量</span></label>
        <div class="star-rating" data-target="sauce-score">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
          <span class="star-value" id="sauce-value">0</span>
        </div>
        <input type="hidden" id="sauce-score" value="0">
      </div>

      <div class="form-group score-input-row">
        <label>全体のバランス<br><span class="label-sub">層の一体感</span></label>
        <div class="star-rating" data-target="balance-score">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
          <span class="star-value" id="balance-value">0</span>
        </div>
        <input type="hidden" id="balance-score" value="0">
      </div>

      <div class="form-group score-input-row">
        <label>鉄板体験<br><span class="label-sub">熱々提供・ヘラ食べ</span></label>
        <div class="star-rating" data-target="teppan-score">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
          <span class="star-value" id="teppan-value">0</span>
        </div>
        <input type="hidden" id="teppan-score" value="0">
      </div>

      <!-- 注文内容セクション -->
      <div class="score-section-title" style="margin-top:30px;">🍽️ 注文内容</div>

      <div class="form-group">
        <label>注文メニュー</label>
        <select id="order-menu">
          <option value="">選択してください</option>
          <option value="肉玉そば">肉玉そば</option>
          <option value="肉玉うどん">肉玉うどん</option>
          <option value="肉玉そばダブル">肉玉そばダブル</option>
          <option value="肉玉うどんダブル">肉玉うどんダブル</option>
          <option value="スペシャル">スペシャル</option>
          <option value="その他">その他</option>
        </select>
      </div>

      <div class="form-group">
        <label>トッピング（複数選択可）</label>
        <div class="toppings-grid">
          <label class="topping-item"><input type="checkbox" name="topping" value="ねぎ"> ねぎ</label>
          <label class="topping-item"><input type="checkbox" name="topping" value="大葉"> 大葉</label>
          <label class="topping-item"><input type="checkbox" name="topping" value="イカ天"> イカ天</label>
          <label class="topping-item"><input type="checkbox" name="topping" value="もち"> もち</label>
          <label class="topping-item"><input type="checkbox" name="topping" value="チーズ"> チーズ</label>
          <label class="topping-item"><input type="checkbox" name="topping" value="キムチ"> キムチ</label>
          <label class="topping-item"><input type="checkbox" name="topping" value="追加そば"> 追加そば</label>
          <label class="topping-item"><input type="checkbox" name="topping" value="えび"> えび</label>
          <label class="topping-item"><input type="checkbox" name="topping" value="牡蠣"> 牡蠣</label>
          <label class="topping-item"><input type="checkbox" name="topping" value="その他"> その他</label>
        </div>
      </div>

      <div class="form-group">
        <label>食べ方</label>
        <select id="eating-style">
          <option value="">選択してください</option>
          <option value="鉄板でヘラ食べ">鉄板でヘラ食べ</option>
          <option value="鉄板で箸食べ">鉄板で箸食べ</option>
          <option value="皿で食べた">皿で食べた</option>
          <option value="テイクアウト">テイクアウト</option>
        </select>
      </div>

      <div class="form-group">
        <label>訪問日</label>
        <input type="date" id="visited-at">
      </div>

      <div class="form-group">
        <label>コメント</label>
        <textarea id="comment" placeholder="お好み焼きの感想を書いてください..."></textarea>
      </div>

      <div class="form-group">
        <label>写真（最大3枚）</label>
        <input type="file" id="image-input" accept="image/*" multiple>
        <div class="image-preview-container" id="image-preview"></div>
      </div>

      <button class="btn btn-primary" id="submit-btn" onclick="submitReview()">レビューを投稿する</button>
    </div>
  `;
}

// --- 画像アップロード設定 ---
function setupImageUpload() {
  const input = document.getElementById('image-input');
  if (!input) return;

  input.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (selectedFiles.length + files.length > 3) {
      alert('写真は最大3枚までです');
      return;
    }
    selectedFiles = [...selectedFiles, ...files].slice(0, 3);
    renderImagePreviews();
  });
}

function renderImagePreviews() {
  const container = document.getElementById('image-preview');
  if (!container) return;

  container.innerHTML = selectedFiles.map((file, i) => {
    const url = URL.createObjectURL(file);
    return `
      <div class="image-preview-item">
        <img src="${url}" alt="プレビュー">
        <button class="remove-btn" onclick="removeImage(${i})">×</button>
      </div>
    `;
  }).join('');
}

function removeImage(index) {
  selectedFiles.splice(index, 1);
  renderImagePreviews();
}

// --- 画像をSupabase Storageにアップロード ---
async function uploadImages() {
  const urls = [];
  for (const file of selectedFiles) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUser.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

    const { error } = await supabaseClient.storage
      .from('review-images')
      .upload(fileName, file);

    if (!error) {
      const { data } = supabaseClient.storage
        .from('review-images')
        .getPublicUrl(fileName);
      urls.push(data.publicUrl);
    }
  }
  return urls;
}

// --- 店舗詳細＋Googleマップ ---
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
  return Math.round((confidence * globalAvg + n * trimmedAvg) / (confidence + n));
}

async function loadShopDetail() {
  const container = document.getElementById('shop-info');
  const statsContainer = document.getElementById('shop-stats');

  const { data: shop, error } = await supabaseClient
    .from('shops')
    .select(`*, reviews (overall_score)`)
    .eq('id', currentShopId)
    .single();

  if (error || !shop) {
    container.innerHTML = '<div class="empty-state"><div class="icon">😢</div><p>店舗が見つかりませんでした</p></div>';
    return;
  }

  const reviews = shop.reviews || [];
  const avgScore = calculateShopScore(reviews);
  const reviewCount = reviews.length;
  const scoreDisplay = avgScore !== null ? avgScore.toFixed(1) : '-';

  document.title = `${shop.name} - お好み焼きDB`;

  // ---- 店舗情報ブロック（画像 + テーブル） ----
  const imageHtml = shop.image_url
    ? `<img src="${shop.image_url}" alt="${shop.name}">`
    : '🥞';

  const addressText = shop.address || '情報なし';

  container.innerHTML = `
    <div class="shop-detail-layout">
      <div class="shop-detail-upper">
        <div class="shop-detail-img-wrap">
          ${imageHtml}
        </div>
        <div class="shop-detail-table-wrap">
          <h1 class="shop-detail-title">${shop.name}</h1>
          <table class="shop-info-table">
            <tbody>
              <tr>
                <th>住所</th>
                <td>${addressText}</td>
              </tr>
              <tr>
                <th>電話</th>
                <td>${shop.phone || '情報なし'}</td>
              </tr>
              <tr>
                <th>営業時間</th>
                <td>${shop.business_hours || '情報なし'}</td>
              </tr>
              <tr>
                <th>定休日</th>
                <td>${shop.closed_days || '情報なし'}</td>
              </tr>
              <tr>
                <th>スタイル</th>
                <td>${shop.style ? `<span class="tag tag-style">${shop.style}</span>` : '情報なし'}</td>
              </tr>
              <tr>
                <th>焼き方</th>
                <td>${shop.cooking_style ? `<span class="tag tag-cooking">${shop.cooking_style}</span>` : '情報なし'}</td>
              </tr>
              <tr>
                <th>鉄板</th>
                <td>${shop.has_iron_plate ? '<span class="tag tag-cooking">鉄板あり</span>' : 'なし'}</td>
              </tr>
              <tr>
                <th>テイクアウト</th>
                <td>${shop.takeout_available ? '<span class="tag tag-takeout">持ち帰り可</span>' : '不可'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // ---- 統計ブロック ----
  statsContainer.style.display = 'block';
  statsContainer.innerHTML = `
    <div class="shop-stats-block">
      <div class="shop-stats-score-main">
        <div class="shop-stats-score-num">${scoreDisplay}</div>
        <div class="shop-stats-score-label">総合スコア</div>
      </div>
      <div class="shop-stats-divider"></div>
      <div class="shop-stats-sub">
        <div class="shop-stats-item">
          <div class="shop-stats-item-num">${reviewCount}</div>
          <div class="shop-stats-item-label">レビュー件数</div>
        </div>
        <div class="shop-stats-item">
          <div class="shop-stats-item-num">${scoreDisplay !== '-' ? scoreDisplay + '点' : '-'}</div>
          <div class="shop-stats-item-label">平均点</div>
        </div>
      </div>
    </div>
  `;

  // Google Map表示（住所から埋め込み）
  if (shop.address) {
    const mapContainer = document.getElementById('shop-map-container');
    const mapFrame = document.getElementById('shop-map');
    const encoded = encodeURIComponent(shop.address);
    mapFrame.src = `https://maps.google.com/maps?q=${encoded}&output=embed&hl=ja`;
    mapContainer.style.display = 'block';
  }
}

// --- レビュー一覧（画像対応） ---
async function loadReviews() {
  const container = document.getElementById('reviews-list');

  const { data: reviews, error } = await supabaseClient
    .from('reviews')
    .select(`*, profiles (id, username)`)
    .eq('shop_id', currentShopId)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = '<div class="empty-state"><div class="icon">😢</div><p>レビューの読み込みに失敗しました</p></div>';
    return;
  }

  if (!reviews || reviews.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>まだレビューがありません。最初のレビューを投稿しませんか？</p></div>';
    return;
  }

  // 店舗全体の平均スコア計算（統計セクション用）
  calculateAndDisplayShopStats(reviews);

  const createBarGraph = (label, score) => {
    if (!score || score === 0) return '';
    const percentage = (score / 5) * 100;
    return `
      <div class="score-bar-row">
        <div class="score-bar-label">${label}</div>
        <div class="score-bar-container">
          <div class="score-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="score-bar-value">${score}</div>
      </div>
    `;
  };

  container.innerHTML = reviews.map(review => {
    const dateStr = review.created_at
      ? new Date(review.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    const visitStr = review.visited_at
      ? '訪問日: ' + new Date(review.visited_at).toLocaleDateString('ja-JP')
      : '';

    const imageUrls = review.image_urls || [];
    const imagesHtml = imageUrls.length > 0
      ? `<div class="review-card-v2-images">${imageUrls.map(url => `<img src="${url}" alt="レビュー写真" onclick="window.open('${url}','_blank')">`).join('')}</div>`
      : '';

    const username  = review.profiles?.username || '匿名ユーザー';
    const userId    = review.profiles?.id || review.user_id;
    const userLink  = userId
      ? `<a href="user-profile.html?id=${userId}" class="review-user-link">👤 ${username}</a>`
      : `<span>👤 ${username}</span>`;

    // 広島風スコア表示（旧カラムがある場合は星表示、なければ横棒グラフ）
    const hasOldFormat = review.dough_score || review.ingredients_score;
    let scoreHtml = '';
    
    if (hasOldFormat) {
      // 旧形式：星表示
      const stars = (score) => {
        if (!score) return '<span style="color:#ccc">未評価</span>';
        return '<span style="color:#ff8f00">' + '★'.repeat(score) + '</span><span style="color:#ddd">' + '★'.repeat(5 - score) + '</span>';
      };
      scoreHtml = `
        <div class="review-card-v2-stars">
          <span>生地: ${stars(review.dough_score)}</span>
          <span>具材: ${stars(review.ingredients_score)}</span>
          <span>ソース: ${stars(review.sauce_score)}</span>
          ${visitStr ? `<span style="color:#9e9e9e; font-size:12px;">${visitStr}</span>` : ''}
        </div>
      `;
    } else {
      // 新形式：横棒グラフ
      scoreHtml = `
        <div class="review-score-bars">
          ${createBarGraph('麺', review.noodle_score)}
          ${createBarGraph('キャベツ', review.cabbage_score)}
          ${createBarGraph('玉子', review.egg_score)}
          ${createBarGraph('ソース', review.sauce_score)}
          ${createBarGraph('バランス', review.balance_score)}
          ${createBarGraph('鉄板', review.teppan_score)}
        </div>
        ${visitStr ? `<div class="review-visit-date">${visitStr}</div>` : ''}
      `;
    }

    // 注文情報バッジ
    let orderBadgesHtml = '';
    if (review.order_menu || review.eating_style || (review.toppings && review.toppings.length > 0)) {
      const badges = [];
      if (review.order_menu) badges.push(`<span class="badge badge-menu">${review.order_menu}</span>`);
      if (review.eating_style) badges.push(`<span class="badge badge-style">${review.eating_style}</span>`);
      if (review.toppings && review.toppings.length > 0) {
        review.toppings.forEach(topping => {
          badges.push(`<span class="badge badge-topping">${topping}</span>`);
        });
      }
      orderBadgesHtml = `<div class="review-badges">${badges.join('')}</div>`;
    }

    return `
      <div class="review-card-v3">
        <div class="review-card-v3-header">
          <div class="review-card-v3-user">${userLink}</div>
          <div class="review-card-v3-score">
            <span class="review-card-v3-score-value">${review.overall_score}</span>
            <span class="review-card-v3-score-unit">点</span>
          </div>
        </div>
        <div class="review-card-v3-date">${dateStr}</div>
        ${scoreHtml}
        ${orderBadgesHtml}
        ${review.comment ? `<div class="review-card-v3-comment">${review.comment}</div>` : ''}
        ${imagesHtml}
      </div>
    `;
  }).join('');
}

// 店舗全体の平均スコアを計算して表示
function calculateAndDisplayShopStats(reviews) {
  const statsContainer = document.getElementById('shop-average-stats');
  if (!statsContainer) return;

  // 新形式のレビューのみを抽出（noodle_scoreがあるもの）
  const newFormatReviews = reviews.filter(r => r.noodle_score);
  
  if (newFormatReviews.length === 0) {
    statsContainer.style.display = 'none';
    return;
  }

  const avgNoodle = (newFormatReviews.reduce((sum, r) => sum + (r.noodle_score || 0), 0) / newFormatReviews.length).toFixed(1);
  const avgCabbage = (newFormatReviews.reduce((sum, r) => sum + (r.cabbage_score || 0), 0) / newFormatReviews.length).toFixed(1);
  const avgEgg = (newFormatReviews.reduce((sum, r) => sum + (r.egg_score || 0), 0) / newFormatReviews.length).toFixed(1);
  const avgSauce = (newFormatReviews.reduce((sum, r) => sum + (r.sauce_score || 0), 0) / newFormatReviews.length).toFixed(1);
  const avgBalance = (newFormatReviews.reduce((sum, r) => sum + (r.balance_score || 0), 0) / newFormatReviews.length).toFixed(1);
  const avgTeppan = (newFormatReviews.reduce((sum, r) => sum + (r.teppan_score || 0), 0) / newFormatReviews.length).toFixed(1);

  const createAvgBar = (label, score) => {
    const percentage = (score / 5) * 100;
    return `
      <div class="avg-score-row">
        <div class="avg-score-label">${label}</div>
        <div class="avg-score-bar-container">
          <div class="avg-score-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="avg-score-value">${score}</div>
      </div>
    `;
  };

  statsContainer.style.display = 'block';
  statsContainer.innerHTML = `
    <h3 class="stats-title">📊 平均評価（${newFormatReviews.length}件のレビュー）</h3>
    <div class="avg-score-grid">
      ${createAvgBar('麺', avgNoodle)}
      ${createAvgBar('キャベツ', avgCabbage)}
      ${createAvgBar('玉子', avgEgg)}
      ${createAvgBar('ソース', avgSauce)}
      ${createAvgBar('バランス', avgBalance)}
      ${createAvgBar('鉄板', avgTeppan)}
    </div>
  `;
}

// --- 星評価 + 総合スコア自動計算 ---
function setupStarRatings() {
  document.querySelectorAll('.star-rating').forEach(rating => {
    const targetId = rating.dataset.target;
    const stars = rating.querySelectorAll('.star');
    const valueDisplay = rating.querySelector('.star-value');

    stars.forEach(star => {
      star.addEventListener('click', () => {
        const value = parseInt(star.dataset.value);
        document.getElementById(targetId).value = value;
        stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.value) <= value));
        if (valueDisplay) valueDisplay.textContent = value;
        updateOverallScore();
      });
      star.addEventListener('mouseenter', () => {
        const value = parseInt(star.dataset.value);
        stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.value) <= value));
      });
    });

    rating.addEventListener('mouseleave', () => {
      const currentValue = parseInt(document.getElementById(targetId).value);
      stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.value) <= currentValue));
    });
  });
}

function updateOverallScore() {
  const noodle = parseInt(document.getElementById('noodle-score')?.value) || 0;
  const cabbage = parseInt(document.getElementById('cabbage-score')?.value) || 0;
  const egg = parseInt(document.getElementById('egg-score')?.value) || 0;
  const sauce = parseInt(document.getElementById('sauce-score')?.value) || 0;
  const balance = parseInt(document.getElementById('balance-score')?.value) || 0;
  const teppan = parseInt(document.getElementById('teppan-score')?.value) || 0;
  
  const total = noodle + cabbage + egg + sauce + balance + teppan;
  const overallScore = Math.round((total / 30) * 1000) / 10;
  
  const display = document.getElementById('overall-score-display');
  if (display) {
    display.textContent = overallScore.toFixed(1);
  }
}

// --- レビュー投稿 ---
async function submitReview() {
  if (!currentUser) {
    alert('レビューを投稿するにはログインが必要です');
    location.href = 'login.html';
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = '投稿中...';

  // 広島風専用スコア取得
  const noodleScore = parseInt(document.getElementById('noodle-score').value) || null;
  const cabbageScore = parseInt(document.getElementById('cabbage-score').value) || null;
  const eggScore = parseInt(document.getElementById('egg-score').value) || null;
  const sauceScore = parseInt(document.getElementById('sauce-score').value) || null;
  const balanceScore = parseInt(document.getElementById('balance-score').value) || null;
  const teppanScore = parseInt(document.getElementById('teppan-score').value) || null;

  // 総合スコア自動計算
  const total = (noodleScore || 0) + (cabbageScore || 0) + (eggScore || 0) + (sauceScore || 0) + (balanceScore || 0) + (teppanScore || 0);
  const overallScore = Math.round((total / 30) * 1000) / 10;

  // 注文情報取得
  const orderMenu = document.getElementById('order-menu').value || null;
  const eatingStyle = document.getElementById('eating-style').value || null;
  
  // トッピング配列取得
  const toppingCheckboxes = document.querySelectorAll('input[name="topping"]:checked');
  const toppings = Array.from(toppingCheckboxes).map(cb => cb.value);

  const visitedAt = document.getElementById('visited-at').value || null;
  const comment = document.getElementById('comment').value;

  // 画像アップロード
  let imageUrls = [];
  if (selectedFiles.length > 0) {
    imageUrls = await uploadImages();
  }

  const { error } = await supabaseClient
    .from('reviews')
    .insert({
      user_id: currentUser.id,
      shop_id: parseInt(currentShopId),
      overall_score: overallScore,
      noodle_score: noodleScore,
      cabbage_score: cabbageScore,
      egg_score: eggScore,
      sauce_score: sauceScore,
      balance_score: balanceScore,
      teppan_score: teppanScore,
      order_menu: orderMenu,
      toppings: toppings.length > 0 ? toppings : null,
      eating_style: eatingStyle,
      visited_at: visitedAt,
      comment: comment,
      image_urls: imageUrls
    });

  if (error) {
    alert('投稿に失敗しました: ' + error.message);
    btn.disabled = false;
    btn.textContent = 'レビューを投稿する';
    return;
  }

  alert('レビューを投稿しました！');
  location.reload();
}
