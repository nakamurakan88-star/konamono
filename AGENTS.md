# AGENTS.md - お好み焼きDB プロジェクト

## プロジェクト概要
お好み焼き店に特化したレビュー・データベースサイト。
公開URL: https://konamono.netlify.app/
フロントエンドのみの静的サイト（HTML/CSS/JS）で、バックエンドは Supabase（PostgreSQL, Auth, Storage）を使用。

## 技術スタック
- **フロントエンド**: 素の HTML / CSS / JavaScript（フレームワークなし）
- **データベース / 認証 / ストレージ**: Supabase（PostgreSQL）
- **ホスティング**: Netlify（静的ホスティング、ビルド不要）
- **Supabase JS ライブラリ**: CDN 経由で読み込み（npm 不使用）
- **地図**: Google Maps API（未実装・今後追加予定）

## プロジェクト構成

okonomiyaki-db/
├── index.html # トップページ（ランキング・新着）
  ├── shops.html # 店舗一覧（検索・絞り込み） 
  ├── shop-detail.html # 店舗詳細（レビュー表示・投稿） 
  ├── login.html # ログイン・新規登録 
  ├── shop-request.html # 店舗登録申請 
  ├── css/
   │ 
   └── style.css # 全ページ共通スタイル 
   ├── js/ 
   │ 
   ├── supabase-config.js # Supabase 接続設定（★機密情報あり） 
   │ 
   ├── app.js # トップページ用ロジック 
   │ ├── shops.js # 店舗一覧ロジック
   │ ├── shop-detail.js # 店舗詳細・レビュー投稿ロジック 
   │ ├── auth.js # 認証（ログイン・新規登録）ロジック 
   │ └── shop-request.js # 店舗登録申請ロジック 
   └── images/ 
   └── icon.svg # サイトアイコン


## 重要ルール（絶対に守ること）

### 変更禁止
- `js/supabase-config.js` の `SUPABASE_URL` と `SUPABASE_ANON_KEY` の値を変更・削除しないこと
- Supabase クライアント変数名は `supabaseClient` を使用すること（`supabase` は CDN ライブラリ名と衝突するため禁止）
- 既存の HTML ファイルの `<script>` 読み込み順を変更しないこと（supabase CDN → supabase-config.js → 各ページ JS の順）
- RLS（Row Level Security）ポリシーを無効化・削除しないこと

### 機密情報
- `SUPABASE_URL` と `SUPABASE_ANON_KEY` をコミットメッセージやコメントに含めないこと
- 新しい API キー（Google Maps 等）をコードに直接ハードコードしないこと。環境変数または設定ファイルで管理すること
- `.env` ファイルを作成する場合は必ず `.gitignore` に追加すること

### データベース
- Supabase の SQL Editor でテーブルを直接 DROP/TRUNCATE しないこと
- テーブル構造を変更する場合は ALTER TABLE を使い、既存データを保持すること
- 新しいテーブルには必ず RLS を有効化し、適切なポリシーを設定すること

## データベース設計（主要テーブル）

### shops（店舗）
id, name, address, prefecture, city, phone, business_hours, closed_days, style, cooking_style, has_iron_plate, takeout_available, image_url, latitude, longitude, created_at, updated_at

### profiles（ユーザー）
id (UUID, auth.users参照), username, avatar_url, review_count, created_at

### reviews（レビュー）
id, user_id, shop_id, overall_score (1-100), dough_score (1-5), ingredients_score (1-5), sauce_score (1-5), comment, visited_at, image_url, image_urls (TEXT[]), created_at

### favorites（お気に入り）
id, user_id, shop_id, created_at, UNIQUE(user_id, shop_id)

### shop_requests（店舗登録申請）
id, user_id, name, address, prefecture, city, phone, business_hours, closed_days, style, cooking_style, has_iron_plate, takeout_available, latitude, longitude, status, created_at

## コーディング規約

### HTML
- 全ページで共通ヘッダー・フッターを使用する（既存ページのヘッダー構造を踏襲）
- Supabase JS ライブラリは CDN から読み込む: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- 新しいページを追加する場合、既存ページ（例: shops.html）をテンプレートとしてコピーする

### CSS
- 全スタイルは `css/style.css` に集約する（インラインスタイル禁止）
- 配色はお好み焼きをイメージした暖色系を維持する
- レスポンシブ対応（モバイルファースト）を維持する

### JavaScript
- Supabase クライアントは `supabaseClient` を使用する（`supabase` は禁止）
- 認証チェックは各ページの読み込み時に `supabaseClient.auth.getSession()` で行う
- DOM 操作は `document.getElementById()` / `document.querySelector()` を使用する
- `async/await` パターンを使用する（Promise チェーンではなく）
- エラーハンドリングは `try/catch` で行い、ユーザーにわかりやすいメッセージを表示する
- `console.log` はデバッグ用のみ。本番コードには残さない

### 新機能追加時のチェックリスト
1. 既存機能が壊れていないか確認する
2. ログイン状態・未ログイン状態の両方で動作確認する
3. モバイル表示で崩れないか確認する
4. Supabase RLS ポリシーが適切に設定されているか確認する

## 許可されている操作

### 承認なしで実行可能
- HTML / CSS / JS ファイルの読み取り・編集
- 新しい HTML ページの追加
- css/style.css へのスタイル追加
- js/ フォルダへの新しい JS ファイル追加
- images/ フォルダへの画像追加
- バグ修正

### 事前確認が必要
- データベーステーブルの構造変更（ALTER TABLE）
- 新しいテーブルの作成
- RLS ポリシーの追加・変更
- 外部 API・ライブラリの追加
- 既存ファイルの削除・リネーム
- supabase-config.js の変更

### 絶対に禁止
- テーブルの DROP / TRUNCATE
- RLS の無効化
- SUPABASE_URL / SUPABASE_ANON_KEY の変更・削除
- 既存のサンプルデータの削除
- ユーザーデータの削除・改ざん
- 認証バイパスの実装

## デプロイ
- ビルドプロセスは不要（静的 HTML/CSS/JS のため）
- Netlify にフォルダをドラッグ＆ドロップでデプロイ
- デプロイ前にローカルで Live Server（VS Code 拡張機能）で動作確認すること
- デプロイ後は https://konamono.netlify.app/ で動作確認すること

## 現在の開発状況

### 完了
- トップページ（人気店ランキング・新着店舗）
- 店舗一覧ページ（エリア・スタイル絞り込み）
- 店舗詳細ページ（情報表示・レビュー表示）
- ユーザー認証（新規登録・ログイン）
- レビュー投稿機能
- Netlify デプロイ

### 実装中・未着手
- 画像アップロード機能（Supabase Storage バケット作成済み）
- レビュー再投稿制限（同一店舗は半年後から）
- 評価アルゴリズムの改善
- Google Maps 連携
- 店舗登録申請機能の仕上げ
- ホットペッパーグルメ API によるデータ拡充

## トラブルシューティング

### 「読み込み中」のまま店舗が表示されない
- ブラウザ Console（F12）でエラーを確認する
- `supabaseClient` が `undefined` の場合 → CDN 読み込みまたは supabase-config.js に問題
- CORS エラーの場合 → `file://` で開いていないか確認（`http://` で開く必要がある）

### 「supabase is not defined」エラー
- 変数名が `supabase` になっていないか確認 → `supabaseClient` に修正する

### レート制限エラー（email rate limit exceeded）
- Supabase 無料プランのメール送信制限。1時間待ってから再試行する

### Netlify デプロイ後に反映されない
- ブラウザキャッシュをクリア（Ctrl+Shift+R）する
