// ============================================
// Supabase 接続設定
// ============================================

const SUPABASE_URL = 'https://jpffbxzxrwfdlfmxopgb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwZmZieHp4cndmZGxmbXhvcGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMDM2NzUsImV4cCI6MjA4OTU3OTY3NX0.RqDXOmzleWdia5LIsH4koOo-hx1dC5ak4RwuUDejC6U';

// Supabaseクライアントの初期化（変数名を変更して衝突を回避）
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
