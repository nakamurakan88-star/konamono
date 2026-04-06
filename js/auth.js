// ============================================
// 認証（ログイン・登録）用 JavaScript
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    location.href = 'index.html';
  }
});

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('auth-message').className = 'auth-message';
  document.getElementById('auth-message').textContent = '';

  if (tab === 'login') {
    document.querySelectorAll('.auth-tab')[0].classList.add('active');
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
  } else {
    document.querySelectorAll('.auth-tab')[1].classList.add('active');
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
  }
}

function showMessage(text, type) {
  const el = document.getElementById('auth-message');
  el.textContent = text;
  el.className = `auth-message ${type}`;
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showMessage('メールアドレスとパスワードを入力してください', 'error');
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password
  });

  if (error) {
    if (error.message.includes('Email not confirmed')) {
      showMessage('メールアドレスの確認が完了していません。受信トレイの確認メールをクリックしてください。', 'error');
    } else {
      showMessage('ログインに失敗しました: ' + error.message, 'error');
    }
    return;
  }

  showMessage('ログイン成功！リダイレクトします...', 'success');
  setTimeout(() => { location.href = 'index.html'; }, 1000);
}

async function doRegister() {
  const username = document.getElementById('register-username').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;

  if (!username || !email || !password) {
    showMessage('すべての項目を入力してください', 'error');
    return;
  }

  if (password.length < 6) {
    showMessage('パスワードは6文字以上にしてください', 'error');
    return;
  }

  // ボタンを無効化して二重送信を防止
  const btn = document.querySelector('#register-form .btn-primary');
  btn.disabled = true;
  btn.textContent = '登録中...';

  // 1. Supabase Authでユーザー作成（usernameをメタデータに保存）
  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        username: username
      }
    }
  });

  // ボタンを復元
  btn.disabled = false;
  btn.textContent = 'アカウント作成';

  if (error) {
    if (error.message.includes('rate limit')) {
      showMessage('リクエストが集中しています。1分ほど待ってから再度お試しください。', 'error');
    } else {
      showMessage('登録に失敗しました: ' + error.message, 'error');
    }
    return;
  }

  // 2. 登録成功 → 確認メール送信済みメッセージを表示
  if (data.user) {
    showMessage(
      '📧 確認メールを ' + email + ' に送信しました！メール内のリンクをクリックして登録を完了してください。届かない場合は迷惑メールフォルダもご確認ください。',
      'success'
    );

    // フォームをクリア
    document.getElementById('register-username').value = '';
    document.getElementById('register-email').value = '';
    document.getElementById('register-password').value = '';
  }
}
