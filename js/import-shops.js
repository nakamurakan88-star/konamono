// ============================================
// 店舗データインポートツール用 JavaScript
// ホットペッパーグルメAPI → Supabase shops テーブル
// ============================================

const HP_API_KEY = 'b62667c3b7fc3547';
// ローカルプロキシ経由でホットペッパーAPIを叩く（CORSヘッダーを付与するため）
const HP_API_ENDPOINT = '/api/hotpepper';

// 検索結果を保持する配列
let fetchedShops = [];

// ============================================
// ページ読み込み時：認証チェック
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();

  const authBanner = document.getElementById('auth-status-banner');
  const searchBtn = document.getElementById('search-btn');
  const importBtn = document.getElementById('import-btn');

  if (!session) {
    // 未ログイン：警告バナーを表示し、ボタンを無効化
    authBanner.className = 'auth-banner auth-banner-warn';
    authBanner.innerHTML = '⚠️ <strong>未ログイン状態です。</strong> Supabaseへの登録にはログインが必要です。 <a href="login.html">ログインする →</a>';
    authBanner.style.display = 'block';
    if (importBtn) importBtn.disabled = true;
  } else {
    // ログイン済み：ユーザー情報を表示
    const email = session.user.email || session.user.id;
    authBanner.className = 'auth-banner auth-banner-ok';
    authBanner.innerHTML = `✅ ログイン済み: <strong>${email}</strong>`;
    authBanner.style.display = 'block';
  }
});

// ============================================
// 都道府県・市区町村を住所文字列から抽出
// ============================================
function extractPrefecture(address) {
  const match = address.match(/^(.+?[都道府県])/);
  return match ? match[1] : '';
}

function extractCity(address) {
  const pref = extractPrefecture(address);
  const rest = pref ? address.slice(pref.length) : address;
  const match = rest.match(/^(.+?[市区町村郡])/);
  return match ? match[1] : '';
}

// ============================================
// ① 検索処理（未登録N件集まるまでAPIをページング）
// ・まずSupabaseの登録済みセットを取得
// ・APIを100件ずつ取得し、未登録のみfetchedShopsに追加
// ・未登録がtotalWant件に達するか、APIの全件を消化したら停止
// ============================================
async function searchShops() {
  const keyword   = document.getElementById('search-keyword').value.trim() || 'お好み焼き';
  const area      = document.getElementById('search-area').value;
  const totalWant = parseInt(document.getElementById('search-count').value, 10);
  const BATCH = 100; // API 1リクエスト上限

  const searchBtn   = document.getElementById('search-btn');
  const progressWrap = document.getElementById('fetch-progress-wrap');
  const progressBar  = document.getElementById('fetch-progress-bar');
  const progressPct  = document.getElementById('fetch-progress-pct');
  const progressText = document.getElementById('fetch-progress-text');

  searchBtn.disabled = true;
  searchBtn.textContent = '検索中...';
  progressWrap.style.display = 'block';
  progressBar.style.width = '0%';
  progressPct.textContent = '0%';
  progressText.textContent = `登録済みデータを確認中...`;

  fetchedShops = [];

  try {
    // ── Step1: Supabase登録済みセットを先に取得 ──────────────
    const registeredSet = await fetchRegisteredSet();
    progressText.textContent = `登録済み ${registeredSet.size} 件確認済み。API検索中...`;

    // ── Step2: APIを叩いて未登録のみ収集 ────────────────────
    let start     = 1;
    let available = Infinity; // 第1回レスポンスで確定

    while (fetchedShops.length < totalWant && start <= available) {
      const params = new URLSearchParams({
        key:     HP_API_KEY,
        keyword: keyword,
        count:   BATCH,
        format:  'json',
        start:   start
      });
      if (area) params.append('large_area', area);

      const res = await fetch(`${HP_API_ENDPOINT}?${params.toString()}`);
      if (!res.ok) throw new Error('APIエラー: HTTP ' + res.status + ` (start=${start})`);

      const json    = await res.json();
      const results = json.results;
      if (!results || !results.shop) throw new Error('APIレスポンスの形式が不正です');

      // 第1回で全体件数を確定
      if (start === 1) {
        available = parseInt(results.results_available, 10) || 0;
      }

      const batch = results.shop;
      if (!batch || batch.length === 0) break;

      // 未登録のみ追加
      for (const shop of batch) {
        const key = `${shop.name}__${shop.address || ''}`;
        if (!registeredSet.has(key)) {
          fetchedShops.push(shop);
          if (fetchedShops.length >= totalWant) break;
        }
      }

      start += BATCH;

      // 進捗表示（APIの消化率 × 未登録の収集率の合算で視覚的に）
      const apiProgress  = Math.min(start / (available || 1), 1);
      const fillProgress = fetchedShops.length / totalWant;
      const pct = Math.round(Math.max(apiProgress, fillProgress) * 100);
      progressBar.style.width = Math.min(pct, 99) + '%';
      progressPct.textContent = Math.min(pct, 99) + '%';
      progressText.textContent =
        `API取得中 (確認済み ${start - 1}/${available}件 ／ 未登録 ${fetchedShops.length}/${totalWant}件)`;

      // レートリミット対策
      await new Promise(r => setTimeout(r, 200));
    }

    if (fetchedShops.length === 0) {
      showMessage(
        `${registeredSet.size > 0
          ? `登録済み ${registeredSet.size} 件を除外した結果、`
          : ''}未登録の店舗が見つかりませんでした。`,
        'warning'
      );
      return;
    }

    renderPreview(fetchedShops, new Set()); // 表示はすべて未登録なのでregisteredSetは空でOK

  } catch (err) {
    showMessage('検索に失敗しました: ' + err.message, 'error');
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = '🔍 検索';
    progressBar.style.width = '100%';
    progressPct.textContent = '100%';
    progressText.textContent = `完了 — 未登録 ${fetchedShops.length} 件を表示`;
  }
}

// ============================================
// Supabase登録済み店舗を一括取得して name+address のSetを返す
// （1000件以上ある場合はページングして全件取得）
// ============================================
async function fetchRegisteredSet() {
  const registeredSet = new Set();
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabaseClient
      .from('shops')
      .select('name, address')
      .range(from, from + PAGE - 1);

    if (error || !data || data.length === 0) break;

    data.forEach(row => {
      registeredSet.add(`${row.name}__${row.address}`);
    });

    if (data.length < PAGE) break; // 最終ページ
    from += PAGE;
  }

  return registeredSet;
}

// ============================================
// ② プレビューテーブルを描画
// ============================================
function renderPreview(shops, registeredSet = new Set()) {
  const tbody = document.getElementById('preview-tbody');
  const previewSection = document.getElementById('preview-section');
  const importSection = document.getElementById('import-section');
  const countLabel = document.getElementById('result-count-label');
  const importLog = document.getElementById('import-log');
  const importSummary = document.getElementById('import-summary');

  // 以前の結果をリセット
  importLog.style.display = 'none';
  importLog.innerHTML = '';
  importSummary.style.display = 'none';

  // 呼び出し元で登録済み除外済みなので shops はすべて未登録
  countLabel.textContent = `未登録 ${shops.length}件 を表示中（すべて新規インポート可能）`;

  const defaultStyle = document.getElementById('default-style').value;

  tbody.innerHTML = shops.map((shop, idx) => {
    const photoUrl = shop.photo?.pc?.l || '';
    const photoHtml = photoUrl
      ? `<img src="${photoUrl}" alt="${shop.name}" class="import-thumb">`
      : '<span class="import-no-photo">写真なし</span>';

    const address = shop.address || '';
    const hours = shop.open || '情報なし';

    return `
      <tr id="row-${idx}" class="import-row">
        <td class="import-td-check">
          <input type="checkbox" class="shop-check" data-idx="${idx}" data-new="1" checked>
        </td>
        <td class="import-td-photo">${photoHtml}</td>
        <td class="import-td-name">
          <div class="import-shop-name">${shop.name}</div>
          <div class="import-shop-genre">${shop.genre?.name || ''}</div>
        </td>
        <td class="import-td-address">${address}</td>
        <td class="import-td-hours">${hours}</td>
        <td class="import-td-style">
          <select class="import-style-select import-input-sm" data-idx="${idx}">
            <option value="関西風" ${defaultStyle === '関西風' ? 'selected' : ''}>関西風</option>
            <option value="広島風" ${defaultStyle === '広島風' ? 'selected' : ''}>広島風</option>
            <option value="東京風" ${defaultStyle === '東京風' ? 'selected' : ''}>東京風</option>
            <option value="その他" ${defaultStyle === 'その他' ? 'selected' : ''}>その他</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');

  previewSection.style.display = 'block';
  importSection.style.display = 'block';

  updateSelectedCount();

  // チェックボックス変化で件数更新
  document.querySelectorAll('.shop-check').forEach(cb => {
    cb.addEventListener('change', updateSelectedCount);
  });
}

// ============================================
// 選択件数の更新
// ============================================
function updateSelectedCount() {
  const checked = document.querySelectorAll('.shop-check:checked').length;
  const label = document.getElementById('selected-count-label');
  label.textContent = `${checked}件 選択中`;
}

// ============================================
// 全選択 / 全解除
// ============================================
function selectAll() {
  // 未登録のみを選択（登録済みはチェックしない）
  document.querySelectorAll('.shop-check').forEach(cb => {
    cb.checked = (cb.dataset.new === '1');
  });
  document.getElementById('check-all').checked = true;
  updateSelectedCount();
}

function deselectAll() {
  document.querySelectorAll('.shop-check').forEach(cb => { cb.checked = false; });
  document.getElementById('check-all').checked = false;
  updateSelectedCount();
}

function toggleAll(masterCb) {
  document.querySelectorAll('.shop-check').forEach(cb => { cb.checked = masterCb.checked; });
  updateSelectedCount();
}

// ============================================
// ③ Supabaseへのインポート実行
// ============================================
async function runImport() {
  const importBtn = document.getElementById('import-btn');
  const importLog = document.getElementById('import-log');
  const importSummary = document.getElementById('import-summary');

  // ---- セッション再確認 ----
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    showMessage('❌ ログインしていないため登録できません。ログインしてから再試行してください。', 'error');
    return;
  }

  // 選択された店舗インデックスを収集
  const selectedIndices = [];
  document.querySelectorAll('.shop-check:checked').forEach(cb => {
    selectedIndices.push(parseInt(cb.dataset.idx, 10));
  });

  if (selectedIndices.length === 0) {
    showMessage('登録する店舗を1件以上選択してください。', 'warning');
    return;
  }

  importBtn.disabled = true;
  importBtn.textContent = '登録中...';
  importLog.style.display = 'block';
  importLog.innerHTML = '';
  importSummary.style.display = 'none';

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const idx of selectedIndices) {
    const shop = fetchedShops[idx];
    if (!shop) continue;

    const styleSelect = document.querySelector(`.import-style-select[data-idx="${idx}"]`);
    const style = styleSelect ? styleSelect.value : '関西風';

    const name = shop.name || '';
    const address = shop.address || '';
    const prefecture = extractPrefecture(address);
    const city = extractCity(address);
    // tel が null/undefined/"" のいずれでも安全に処理
    const phone = (shop.tel && shop.tel !== '') ? shop.tel : null;
    const businessHours = shop.open || null;
    const closedDays = shop.close || null;
    const imageUrl = (shop.photo?.pc?.l) || null;
    // lat/lng は数値型で来るが念のため変換し、0 や NaN はnullに
    const latRaw = parseFloat(shop.lat);
    const lngRaw = parseFloat(shop.lng);
    const lat = (isFinite(latRaw) && latRaw !== 0) ? latRaw : null;
    const lng = (isFinite(lngRaw) && lngRaw !== 0) ? lngRaw : null;

    appendLog(`処理中: ${name} ...`);

    try {
      // 重複チェック
      const { data: existing, error: checkErr } = await supabaseClient
        .from('shops')
        .select('id')
        .eq('name', name)
        .eq('address', address)
        .limit(1);

      if (checkErr) {
        appendLog(`❌ エラー [${name}]: ${checkErr.message} (code: ${checkErr.code})`, 'error');
        errorCount++;
        continue;
      }

      if (existing && existing.length > 0) {
        appendLog(`⏭️ スキップ [${name}]: 既に登録済み`, 'skip');
        skipCount++;
        continue;
      }

      // インサート
      const { error: insertErr } = await supabaseClient
        .from('shops')
        .insert({
          name: name,
          address: address,
          prefecture: prefecture,
          city: city,
          phone: phone,
          business_hours: businessHours,
          closed_days: closedDays,
          style: style,
          cooking_style: '店焼き',
          has_iron_plate: true,
          takeout_available: false,
          image_url: imageUrl,
          latitude: lat,
          longitude: lng
        });

      if (insertErr) {
        appendLog(`❌ エラー [${name}]: ${insertErr.message} (code: ${insertErr.code})`, 'error');
        errorCount++;
      } else {
        appendLog(`✅ 登録完了 [${name}]`, 'success');
        successCount++;
      }

    } catch (err) {
      appendLog(`❌ 例外エラー [${name}]: ${err.message}`, 'error');
      errorCount++;
    }
  }

  // 結果サマリー
  importSummary.style.display = 'block';
  importSummary.innerHTML = `
    <div class="import-summary-inner">
      <div class="import-summary-item success-item">
        <div class="import-summary-num">${successCount}</div>
        <div class="import-summary-lbl">登録成功</div>
      </div>
      <div class="import-summary-item skip-item">
        <div class="import-summary-num">${skipCount}</div>
        <div class="import-summary-lbl">スキップ</div>
      </div>
      <div class="import-summary-item error-item">
        <div class="import-summary-num">${errorCount}</div>
        <div class="import-summary-lbl">エラー</div>
      </div>
    </div>
  `;

  importBtn.disabled = false;
  importBtn.textContent = '✅ 選択した店舗をSupabaseに登録';
}

// ============================================
// ログ出力ヘルパー
// ============================================
function appendLog(message, type) {
  const logEl = document.getElementById('import-log');
  const line = document.createElement('div');
  line.className = 'import-log-line' + (type ? ` log-${type}` : '');
  line.textContent = message;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ============================================
// メッセージ表示ヘルパー
// ============================================
function showMessage(msg, type) {
  const log = document.getElementById('import-log');
  log.style.display = 'block';
  log.innerHTML = `<div class="import-log-line log-${type}">${msg}</div>`;
}
