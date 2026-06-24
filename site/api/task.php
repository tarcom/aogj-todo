<?php
// Skrive-operationer (POST JSON med "action"). Ingen login — prioritet sættes pr. person i listen.
require __DIR__ . '/db.php';
$d = body();
$pdo = db();
$action = $d['action'] ?? '';

$prio = fn($v) => ($v === null || $v === '') ? null : max(0, min(2, (int)$v));   // 0=Nej 1=Lav 2=Høj
$size = fn($v) => max(1, min(3, (int)($v ?? 2)));                                 // 1=Lille 2=Mellem 3=Stor
$cat  = fn($v) => in_array($v, ['hus', 'have', 'andet'], true) ? $v : 'andet';
$pcol = fn($w) => $w === 'Allan' ? 'prio_allan' : ($w === 'Jette' ? 'prio_jette' : null);

switch ($action) {

    case 'add': {
        $title = trim($d['title'] ?? '');
        if ($title === '') json_out(['error' => 'mangler titel']);
        $st = $pdo->prepare('INSERT INTO tasks(title,note,category,size,created_at,prio_allan,prio_jette) VALUES(?,?,?,?,?,?,?)');
        $st->execute([$title, trim($d['note'] ?? ''), $cat($d['category'] ?? ''), $size($d['size'] ?? 2), time(),
                      $prio($d['prio_allan'] ?? null), $prio($d['prio_jette'] ?? null)]);
        json_out(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
    }

    case 'prio': {                 // {id, who:'Allan'|'Jette', priority:0|1|2}
        $id = (int)($d['id'] ?? 0); $col = $pcol($d['who'] ?? '');
        if (!$id || !$col) json_out(['error' => 'mangler']);
        $pdo->prepare("UPDATE tasks SET $col=? WHERE id=?")->execute([$prio($d['priority'] ?? null), $id]);
        break;
    }

    case 'size': {
        $pdo->prepare('UPDATE tasks SET size=? WHERE id=?')->execute([$size($d['size'] ?? 2), (int)($d['id'] ?? 0)]);
        break;
    }

    case 'assign': {               // {id, to:'Allan'|'Jette'|''}
        $id = (int)($d['id'] ?? 0);
        $to = in_array($d['to'] ?? '', USERS, true) ? $d['to'] : null;
        $pdo->prepare('UPDATE tasks SET assigned_to=?, assigned_at=? WHERE id=?')->execute([$to, $to ? time() : null, $id]);
        break;
    }

    case 'done': {                 // krediterer den tildelte person
        $id = (int)($d['id'] ?? 0);
        $done = !empty($d['done']);
        $who = null;
        if ($done) {
            $q = $pdo->prepare('SELECT assigned_to FROM tasks WHERE id=?'); $q->execute([$id]);
            $who = $q->fetchColumn() ?: null;
        }
        $pdo->prepare('UPDATE tasks SET status=?, done_at=?, done_by=? WHERE id=?')
            ->execute([$done ? 'done' : 'open', $done ? time() : null, $who, $id]);
        break;
    }

    case 'edit': {
        $id = (int)($d['id'] ?? 0);
        $pdo->prepare('UPDATE tasks SET title=?, note=?, category=?, size=? WHERE id=?')
            ->execute([trim($d['title'] ?? ''), trim($d['note'] ?? ''), $cat($d['category'] ?? ''), $size($d['size'] ?? 2), $id]);
        foreach (['prio_allan', 'prio_jette'] as $c) if (array_key_exists($c, $d)) {
            $pdo->prepare("UPDATE tasks SET $c=? WHERE id=?")->execute([$prio($d[$c]), $id]);
        }
        break;
    }

    case 'rename': {
        $pdo->prepare('UPDATE tasks SET title=?, note=? WHERE id=?')
            ->execute([trim($d['title'] ?? ''), trim($d['note'] ?? ''), (int)($d['id'] ?? 0)]);
        break;
    }

    case 'cat': {
        $pdo->prepare('UPDATE tasks SET category=? WHERE id=?')->execute([$cat($d['category'] ?? ''), (int)($d['id'] ?? 0)]);
        break;
    }

    case 'delattach': {
        $id = (int)($d['id'] ?? 0);
        $q = $pdo->prepare('SELECT file FROM attachments WHERE id=?'); $q->execute([$id]);
        if ($f = $q->fetchColumn()) @unlink(__DIR__ . '/../uploads/' . basename($f));
        $pdo->prepare('DELETE FROM attachments WHERE id=?')->execute([$id]);
        break;
    }

    case 'delete': {
        $id = (int)($d['id'] ?? 0);
        $q = $pdo->prepare('SELECT file FROM attachments WHERE task_id=?'); $q->execute([$id]);
        foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $f) @unlink(__DIR__ . '/../uploads/' . basename($f));
        $pdo->prepare('DELETE FROM attachments WHERE task_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM tasks WHERE id=?')->execute([$id]);
        break;
    }

    default:
        json_out(['error' => 'ukendt action']);
}
json_out(['ok' => true]);
