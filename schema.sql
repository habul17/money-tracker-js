CREATE DATABASE IF NOT EXISTS money_tracker;

USE money_tracker;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash CHAR(60) NOT NULL,          -- bcrypt hash, never the password itself
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debts (
    user_id INT NOT NULL,
    id VARCHAR(36) NOT NULL,                  -- made by the browser
    name VARCHAR(60) NOT NULL,
    original_amount BIGINT NOT NULL,          -- paise
    position INT NOT NULL,                    -- priority order, 0 = pay first
    archived_at DATETIME(3) NULL,             -- UTC
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
    user_id INT NOT NULL,
    id VARCHAR(36) NOT NULL,                  -- made by the browser
    kind VARCHAR(10) NOT NULL,                -- opening, income, expense, payment, adjustment
    amount BIGINT NOT NULL,                   -- paise (only an adjustment can be negative)
    tx_date DATE NOT NULL,
    created_at DATETIME(3) NOT NULL,          -- UTC
    note VARCHAR(80) NULL,
    debt_id VARCHAR(36) NULL,                 -- only for payment and adjustment
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id, debt_id) REFERENCES debts(user_id, id)
);
