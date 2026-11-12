CREATE TABLE IF NOT EXISTS documents (
  collection VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  doc_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload LONGTEXT NOT NULL,
  expires_at BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (collection, doc_id),
  KEY idx_expiry (collection, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS auth_users (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (token_hash),
  KEY idx_user (user_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
