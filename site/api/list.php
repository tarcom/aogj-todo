<?php
require __DIR__ . '/db.php';
$pdo = db();
$tasks = $pdo->query('SELECT * FROM tasks ORDER BY created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
$att = $pdo->query('SELECT * FROM attachments ORDER BY created_at')->fetchAll(PDO::FETCH_ASSOC);
$byTask = [];
foreach ($att as $a) { $byTask[$a['task_id']][] = $a; }
foreach ($tasks as &$t) { $t['attachments'] = $byTask[$t['id']] ?? []; }
json_out(['tasks' => $tasks, 'now' => time()]);
