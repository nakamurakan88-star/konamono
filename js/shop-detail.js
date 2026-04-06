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
      <div class="form-group">
        <label>総合評価（1〜100点）</label>
        <input type="range" id="overall-score" min="1" max="100" value="50"
               oninput="document.getElementById('score-display').textContent=this.value">
        <div style="text-align:center; font-size:24px; font-weight:bold; color:#ff8f00; margin-top:4px;">
          <span id="score-display">50</span>点
        </div>
      </div>

      <div class="form-group">
        <label>生地 ★</label>
        <div class="star-rating" data-target="dough-score">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
        </div>
        <input type="hidden" id="dough-score" value="0">
      </div>

      <div class="form-group">
        <label>具材 ★</label>
        <div class="star-rating" data-target="ingredients-score">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
        </div>
        <input type="hidden" id="ingredients-score" value="0">
      </div>

      <div class="form-group">
        <label>ソース ★</label>
        <div class="star-rating" data-target="sauce-score">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
        </div>
        <input type="hidden" id="sauce-score" value="0">
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

  const scoreClass = avgScore >= 75 ? 'score-high'
    : avgScore >= 50 ? 'score-mid'
    : avgScore ? 'score-low'
    : 'score-none';

  document.title = `${shop.name} - お好み焼きDB`;

  container.innerHTML = `
    <div class="shop-detail-header">
      <div class="shop-detail-top">
        <div class="shop-detail-image">
          ${shop.image_url ? `<img src="${shop.image_url}" alt="${shop.name}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : '🥞'}
        </div>
        <div class="shop-detail-info">
          <div style="display:flex; align-items:center; gap:16px; margin-bottom:12px;">
            <h1 class="shop-detail-name" style="margin:0;">${shop.name}</h1>
            <div class="score-badge ${scoreClass}" style="width:56px;height:56px;font-size:20px;">
              ${avgScore || '-'}
            </div>
          </div>
          <div class="shop-detail-meta">
            <span>📍 ${shop.address}</span>
            <span>📞 ${shop.phone || '情報なし'}</span>
            <span>🕐 ${shop.business_hours || '情報なし'}</span>
            <span>📅 定休日: ${shop.closed_days || '情報なし'}</span>
            <span>📝 レビュー ${reviews.length}件</span>
          </div>
          <div class="shop-card-tags" style="margin-top:12px;">
            <span class="tag tag-style">${shop.style}</span>
            <span class="tag tag-cooking">${shop.cooking_style}</span>
            ${shop.has_iron_plate ? '<span class="tag tag-cooking">鉄板あり</span>' : ''}
            ${shop.takeout_available ? '<span class="tag tag-takeout">持ち帰り可</span>' : ''}
          </div>
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
    .select(`*, profiles (username)`)
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

  container.innerHTML = '<div class="review-list">' + reviews.map(review => {
    const stars = (score) => {
      if (!score) return '<span style="color:#ccc">未評価</span>';
      return '<span class="stars">' + '★'.repeat(score) + '</span><span style="color:#ddd">' + '★'.repeat(5 - score) + '</span>';
    };

    const date = review.visited_at ? new Date(review.visited_at).toLocaleDateString('ja-JP') : '';

    const imageUrls = review.image_urls || [];
    const imagesHtml = imageUrls.length > 0
      ? `<div class="review-images">${imageUrls.map(url => `<img src="${url}" alt="レビュー写真" onclick="window.open('${url}','_blank')">`).join('')}</div>`
      : '';

    return `
      <div class="review-card">
        <div class="review-header">
          <div class="review-user">
            👤 ${review.profiles?.username || '匿名ユーザー'}
            <span class="score-badge ${review.overall_score >= 75 ? 'score-high' : review.overall_score >= 50 ? 'score-mid' : 'score-low'}"
                  style="width:36px;height:36px;font-size:13px;margin-left:8px;">
              ${review.overall_score}
            </span>
          </div>
          <div class="review-date">${date ? `訪問日: ${date}` : ''}</div>
        </div>
        <div class="review-scores">
          <div class="review-score-item">生地: ${stars(review.dough_score)}</div>
          <div class="review-score-item">具材: ${stars(review.ingredients_score)}</div>
          <div class="review-score-item">ソース: ${stars(review.sauce_score)}</div>
        </div>
        ${review.comment ? `<div class="review-comment">${review.comment}</div>` : ''}
        ${imagesHtml}
      </div>
    `;
  }).join('') + '</div>';
}

// --- 星評価 ---
function setupStarRatings() {
  document.querySelectorAll('.star-rating').forEach(rating => {
    const targetId = rating.dataset.target;
    const stars = rating.querySelectorAll('.star');

    stars.forEach(star => {
      star.addEventListener('click', () => {
        const value = parseInt(star.dataset.value);
        document.getElementById(targetId).value = value;
        stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.value) <= value));
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

  const overallScore = parseInt(document.getElementById('overall-score').value);
  const doughScore = parseInt(document.getElementById('dough-score').value) || null;
  const ingredientsScore = parseInt(document.getElementById('ingredients-score').value) || null;
  const sauceScore = parseInt(document.getElementById('sauce-score').value) || null;
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
      dough_score: doughScore,
      ingredients_score: ingredientsScore,
      sauce_score: sauceScore,
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
