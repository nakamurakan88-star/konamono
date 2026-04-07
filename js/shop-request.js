// ============================================
// 店舗登録申請ページ用 JavaScript
// ============================================

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    alert('店舗登録申請にはログインが必要です');
    location.href = 'login.html';
    return;
  }

  currentUser = session.user;

  const navAuth     = document.getElementById('nav-auth');
  const navRegister = document.getElementById('nav-register');
  const navRequest  = document.getElementById('nav-request');
  const navProfile  = document.getElementById('nav-profile');

  navAuth.textContent = 'ログアウト';
  navAuth.href = '#';
  navAuth.onclick = async (e) => {
    e.preventDefault();
    await supabaseClient.auth.signOut();
    location.href = 'index.html';
  };
  if (navRegister) navRegister.style.display = 'none';
  if (navRequest)  navRequest.style.display  = 'inline-block';
  if (navProfile)  navProfile.style.display  = 'inline-block';
});

function showRequestMessage(text, type) {
  const el = document.getElementById('request-message');
  el.textContent = text;
  el.className = `auth-message ${type}`;
}

async function submitRequest() {
  const name = document.getElementById('req-name').value.trim();
  const pref = document.getElementById('req-pref').value;
  const city = document.getElementById('req-city').value.trim();
  const address = document.getElementById('req-address').value.trim();
  const phone = document.getElementById('req-phone').value.trim();
  const hours = document.getElementById('req-hours').value.trim();
  const closed = document.getElementById('req-closed').value.trim();
  const style = document.getElementById('req-style').value;
  const cooking = document.getElementById('req-cooking').value;
  const iron = document.getElementById('req-iron').value === 'true';
  const takeout = document.getElementById('req-takeout').value === 'true';

  if (!name || !pref || !city || !address) {
    showRequestMessage('* のついた項目は必須です', 'error');
    return;
  }

  const btn = document.getElementById('submit-request-btn');
  btn.disabled = true;
  btn.textContent = '送信中...';

  const { error } = await supabaseClient
    .from('shop_requests')
    .insert({
      user_id: currentUser.id,
      name: name,
      prefecture: pref,
      city: city,
      address: address,
      phone: phone || null,
      business_hours: hours || null,
      closed_days: closed || null,
      style: style,
      cooking_style: cooking,
      has_iron_plate: iron,
      takeout_available: takeout
    });

  if (error) {
    showRequestMessage('申請に失敗しました: ' + error.message, 'error');
    btn.disabled = false;
    btn.textContent = '申請を送信する';
    return;
  }

  showRequestMessage('📋 店舗登録申請を受け付けました！審査後にサイトに掲載されます。', 'success');
  document.getElementById('request-form').style.display = 'none';
}
