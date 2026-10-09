-- Run manually ONCE with MySQL 8 admin account; do not commit any passwords.
CREATE DATABASE IF NOT EXISTS ai_photo_editor CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- Create user with MySQL Workbench or replace placeholder with your own secret:
-- CREATE USER IF NOT EXISTS 'ai_editor'@'localhost' IDENTIFIED BY '<YOUR_PASSWORD>';
-- GRANT ALL PRIVILEGES ON ai_photo_editor.* TO 'ai_editor'@'localhost';
