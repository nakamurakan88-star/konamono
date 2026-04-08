-- ======================================================
-- 広島風お好み焼き専用レビューテーブルスキーマ変更
-- ======================================================
-- 実行方法: Supabase の SQL Editor に手動で貼り付けて実行
-- 注意: このファイルは自動実行されません（リポジトリに保存するのみ）
-- ======================================================

-- ========================================
-- 1. 旧カラムの削除
-- ========================================
-- お好み焼き一般向けの評価項目を削除
ALTER TABLE reviews DROP COLUMN IF EXISTS dough_score;
ALTER TABLE reviews DROP COLUMN IF EXISTS ingredients_score;

-- ========================================
-- 2. 広島風専用スコアカラムの追加（各1〜5点）
-- ========================================
-- 麺のスコア（食感・焼き加減）
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS noodle_score SMALLINT CHECK (noodle_score BETWEEN 1 AND 5);

-- キャベツのスコア（甘み・シャキシャキ感）
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS cabbage_score SMALLINT CHECK (cabbage_score BETWEEN 1 AND 5);

-- 玉子のスコア（焼き加減・ふわふわ感）
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS egg_score SMALLINT CHECK (egg_score BETWEEN 1 AND 5);

-- ソースのスコア（風味・濃さ）
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sauce_score SMALLINT CHECK (sauce_score BETWEEN 1 AND 5);

-- 全体バランスのスコア（調和・まとまり）
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS balance_score SMALLINT CHECK (balance_score BETWEEN 1 AND 5);

-- 鉄板体験のスコア（雰囲気・演出）
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS teppan_score SMALLINT CHECK (teppan_score BETWEEN 1 AND 5);

-- ========================================
-- 3. 注文内容記録カラムの追加
-- ========================================
-- 注文したメニュー名（プルダウン選択用）
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_menu VARCHAR(50);

-- トッピング（複数選択可能な配列）
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS toppings TEXT[];

-- 食べ方スタイル（プルダウン選択用）
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS eating_style VARCHAR(30);

-- ========================================
-- 注意事項
-- ========================================
-- overall_score は既存カラムとして残します（1-100）
-- フロントエンド側で以下の計算式で自動算出してから保存します:
--   overall_score = ROUND((noodle_score + cabbage_score + egg_score + 
--                          sauce_score + balance_score + teppan_score) / 30 * 100, 1)
--
-- つまり: (6項目合計 / 30) × 100 で0〜100点に正規化
-- ========================================
