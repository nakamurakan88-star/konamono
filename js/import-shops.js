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
// ① 検索処理（ローカルプロキシ経由でfetch・ページング対応）
// Hot Pepper APIの1リクエスト上限は100件なので、
// 100件ずつ複数回リクエストして最大1000件まで取得する。
// ============================================
async function searchShops() {
  const keyword = document.getElementById('search-keyword').value.trim() || 'お好み焼き';
  const area = document.getElementById('search-area').value;
  const totalWant = parseInt(document.getElementById('search-count').value, 10);
  const BATCH = 100; // APIの1リクエスト上限

  const searchBtn = document.getElementById('search-btn');
  const progressWrap = document.getElementById('fetch-progress-wrap');
  const progressBar  = document.getElementById('fetch-progress-bar');
  const progressPct  = document.getElementById('fetch-progress-pct');
  const progressText = document.getElementById('fetch-progress-text');

  searchBtn.disabled = true;
  searchBtn.textContent = '検索中...';

  // 複数回リクエストするときだけプログレスバーを表示
  const useProgress = (totalWant > BATCH);
  if (useProgress) {
    progressWrap.style.display = 'block';
    progressBar.style.width = '0%';
    progressPct.textContent = '0%';
    progressText.textContent = `取得中 (0 / ${totalWant}件)`;
  }

  fetchedShops = [];

  try {
    // 第1回リクエスト: 件数上限と全体の利用可能件数を確認
    const firstCount = Math.min(totalWant, BATCH);
    const firstParams = new URLSearchParams({
      key: HP_API_KEY,
      keyword: keyword,
      count: firstCount,
      format: 'json',
      start: 1
    });
    if (area) firstParams.append('large_area', area);

    const firstRes = await fetch(`${HP_API_ENDPOINT}?${firstParams.toString()}`);
    if (!firstRes.ok) throw new Error('APIエラー: HTTP ' + firstRes.status);

    const firstJson = await firstRes.json();
    const firstResults = firstJson.results;
    if (!firstResults || !firstResults.shop) throw new Error('APIレスポンスの形式が不正です');

    // APIが返した全体の利用可能件数
    const available = parseInt(firstResults.results_available, 10) || 0;
    // 実際に取得する上限 = ユーザー希望 vs API利用可能件数 の小さい方
    const actualMax = Math.min(totalWant, available);

    fetchedShops = fetchedShops.concat(firstResults.shop);

    if (useProgress) {
      const pct = Math.round((fetchedShops.length / actualMax) * 100);
      progressBar.style.width = pct + '%';
      progressPct.textContent = pct + '%';
      progressText.textContent = `取得中 (${fetchedShops.length} / ${actualMax}件)`;
    }

    // 2回目以降: まだ不足していて、かつAPIに残りがある場合
    let start = firstCount + 1;
    while (fetchedShops.length < actualMax && start <= available) {
      const remaining = actualMax - fetchedShops.length;
      const batchCount = Math.min(remaining, BATCH);

      const params = new URLSearchParams({
        key: HP_API_KEY,
        keyword: keyword,
        count: batchCount,
        format: 'json',
        start: start
      });
      if (area) params.append('large_area', area);

      const res = await fetch(`${HP_API_ENDPOINT}?${params.toString()}`);
      if (!res.ok) throw new Error('APIエラー: HTTP ' + res.status + ` (start=${start})`);

      const json = await res.json();
      const batch = json.results?.shop;
      if (!batch || batch.length === 0) break; // これ以上結果なし

      fetchedShops = fetchedShops.concat(batch);
      start += batchCount;

      if (useProgress) {
        const pct = Math.min(100, Math.round((fetchedShops.length / actualMax) * 100));
        progressBar.style.width = pct + '%';
        progressPct.textContent = pct + '%';
        progressText.textContent = `取得中 (${fetchedShops.length} / ${actualMax}件)`;
      }

      // レートリミット対策: 連続リクエスト間に少し待機
      await new Promise(r => setTimeout(r, 200));
    }

    if (fetchedShops.length === 0) {
      showMessage('検索結果が0件でした。キーワードやエリアを変更してお試しください。', 'warning');
      return;
    }

    // Supabaseに登録済みの店舗を一括チェック（name+addressのセット）
    const registeredSet = await fetchRegisteredSet();
    renderPreview(fetchedShops, registeredSet);

  } catch (err) {
    showMessage('検索に失敗しました: ' + err.message, 'error');
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = '🔍 検索';
    if (useProgress) {
      progressBar.style.width = '100%';
      progressPct.textContent = '100%';
      progressText.textContent = `取得完了 (${fetchedShops.length}件)`;
    }
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

  const newCount = shops.filter(s => !registeredSet.has(`${s.name}__${s.address || ''}`)).length;
  countLabel.textContent = `${shops.length}件 取得 ／ 未登録 ${newCount}件 ／ 登録済み ${shops.length - newCount}件`;

  const defaultStyle = document.getElementById('default-style').value;

  tbody.innerHTML = shops.map((shop, idx) => {
    const photoUrl = shop.photo?.pc?.l || '';
    const photoHtml = photoUrl
      ? `<img src="${photoUrl}" alt="${shop.name}" class="import-thumb">`
      : '<span class="import-no-photo">写真なし</span>';

    const address = shop.address || '';
    const hours = shop.open || '情報なし';
    const alreadyRegistered = registeredSet.has(`${shop.name}__${address}`);

    return `
      <tr id="row-${idx}" class="import-row${alreadyRegistered ? ' import-row-registered' : ''}">
        <td class="import-td-check">
          <input type="checkbox" class="shop-check" data-idx="${idx}" data-new="${alreadyRegistered ? '0' : '1'}" ${alreadyRegistered ? '' : 'checked'}>
        </td>
        <td class="import-td-photo">${photoHtml}</td>
        <td class="import-td-name">
          <div class="import-shop-name">${shop.name}${alreadyRegistered ? ' <span class="import-registered-badge">登録済み</span>' : ''}</div>
          <div class="import-shop-genre">${shop.genre?.name || ''}</div>
        </td>
        <td class="import-td-address">${address}</td>
        <td class="import-td-hours">${hours}</td>
        <td class="import-td-style">
          ${alreadyRegistered
            ? '<span class="import-registered-text">―</span>'
            : `<select class="import-style-select import-input-sm" data-idx="${idx}">
            <option value="関西風" ${defaultStyle === '関西風' ? 'selected' : ''}>関西風</option>
            <option value="広島風" ${defaultStyle === '広島風' ? 'selected' : ''}>広島風</option>
            <option value="東京風" ${defaultStyle === '東京風' ? 'selected' : ''}>東京風</option>
            <option value="その他" ${defaultStyle === 'その他' ? 'selected' : ''}>その他</option>
          </select>`
          }
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
