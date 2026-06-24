<?php
// Fælles DB-helper for todo-appen (SQLite via PDO — one.com har pdo_sqlite).
declare(strict_types=1);

function db(): PDO {
    $dir = __DIR__ . '/../storage';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    $pdo = new PDO('sqlite:' . $dir . '/todo.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec("CREATE TABLE IF NOT EXISTS tasks(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        note TEXT DEFAULT '',
        category TEXT DEFAULT 'andet',
        created_by TEXT,
        created_at INTEGER,
        prio_allan INTEGER, prio_jette INTEGER,
        est_allan REAL, est_jette REAL,
        assigned_to TEXT,
        status TEXT DEFAULT 'open',
        done_at INTEGER, done_by TEXT,
        parked INTEGER DEFAULT 0,
        assigned_at INTEGER
    )");
    try { $pdo->exec("ALTER TABLE tasks ADD COLUMN assigned_at INTEGER"); } catch (\Throwable $e) { /* findes allerede */ }
    try { $pdo->exec("ALTER TABLE tasks ADD COLUMN size INTEGER DEFAULT 2"); } catch (\Throwable $e) { /* findes allerede */ }
    $pdo->exec("CREATE TABLE IF NOT EXISTS attachments(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER,
        kind TEXT,
        file TEXT,
        caption TEXT DEFAULT '',
        created_by TEXT,
        created_at INTEGER
    )");
    return $pdo;
}

function json_out($x): void {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($x);
    exit;
}

function body(): array {
    $j = json_decode(file_get_contents('php://input'), true);
    return is_array($j) ? $j : $_POST;
}

const USERS = ['Allan', 'Jette'];
function who(array $d): ?string {
    $u = $d['user'] ?? '';
    return in_array($u, USERS, true) ? $u : null;
}
