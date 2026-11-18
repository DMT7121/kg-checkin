-- ============================================================================
-- King's Grill Staff OS (kg-checkin) — Migration 0002: Fast Face ID v2 Profiles
-- Stores quantized 5-angle 512-D ArcFace embeddings + centroid in Cloudflare D1
-- for <15ms Kiosk/Parallel preload, anti-duplicate guard, and server cosine verify.
-- ============================================================================

CREATE TABLE IF NOT EXISTS edge_face_profiles (
  username TEXT PRIMARY KEY,
  fullname TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  position TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  employment_status TEXT DEFAULT 'active',
  model_version TEXT NOT NULL DEFAULT 'w600k_mbf_int8_v2',
  angle_count INTEGER NOT NULL DEFAULT 5,
  vectors_b64 TEXT NOT NULL,
  centroid_b64 TEXT NOT NULL,
  quality_score REAL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 1,
  enrolled_at TEXT NOT NULL,
  enrolled_by TEXT NOT NULL,
  unlocked_by TEXT DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_face_profiles_status
  ON edge_face_profiles(employment_status, is_locked);
