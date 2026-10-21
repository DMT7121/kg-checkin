-- ============================================================================
-- King's Grill Staff OS (kg-checkin) — Cloudflare D1 Edge Database Schema
-- Purpose:
--   1. Zero-latency schedule registration persistence & concurrency shield
--   2. Real-time check-in/out log buffer & overlay
--   3. Stale-While-Revalidate (SWR) & failover read cache for Google Sheets
--   4. Background write-through sync queue to Google Apps Script
-- ============================================================================

CREATE TABLE IF NOT EXISTS edge_schedules (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  fullname TEXT NOT NULL,
  month_sheet TEXT NOT NULL,
  week_label TEXT NOT NULL,
  shifts_json TEXT NOT NULL,
  off_reason TEXT DEFAULT '',
  status TEXT DEFAULT 'Chờ duyệt',
  sheet_synced INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edge_schedules_week
  ON edge_schedules(month_sheet, week_label);

CREATE INDEX IF NOT EXISTS idx_edge_schedules_user
  ON edge_schedules(username, month_sheet, week_label);

CREATE TABLE IF NOT EXISTS edge_checkin_logs (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  fullname TEXT NOT NULL,
  check_type TEXT NOT NULL,
  shift_name TEXT DEFAULT '',
  time_str TEXT NOT NULL,
  status TEXT DEFAULT '',
  distance REAL DEFAULT 0,
  lat REAL,
  lng REAL,
  note TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  sheet_synced INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edge_checkin_logs_created
  ON edge_checkin_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_edge_checkin_logs_user
  ON edge_checkin_logs(username, created_at DESC);

CREATE TABLE IF NOT EXISTS edge_kv_cache (
  cache_key TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edge_kv_cache_action
  ON edge_kv_cache(action, expires_at);

CREATE TABLE IF NOT EXISTS edge_sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key TEXT UNIQUE,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edge_sync_queue_status
  ON edge_sync_queue(status, updated_at);
