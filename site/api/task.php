<?php
// Alle skrive-operationer via ét endpoint (POST JSON med "action").
require __DIR__ . '/db.php';
$d = body();
$pdo = db();
$action = $d['action'] ?? '';

switch ($action) {

    case 'add': {
        $u = who($d);
        $title = trim($d['title'] ?? '');
        if ($title === '' || !$u) json_out(['error' => 'mangler titel/bruger']);
        $cat   = in_array($d['category'] ?? '', ['hus', 'have', 'andet'], true) ? $d['category'] : 'andet';
        $prio  = max(0, min(5, (int)($d['priority'] ?? 0)));
        $est   = isset($d['estimate']) ? (float)$d['estimate'] : null;
        $pa = $u === 'Allan' ? $prio : null;  $pj = $u === 'Jette' ? $prio : null;
        $ea = $u === 'Allan' ? $est  : null;  $ej = $u === 'Jette' ? $est  : null;
        $st = $pdo->prepare('INSERT INTO tasks(title,note,category,created_by,created_at,prio_allan,prio_jette,est_allan,est_jette)
                             VALUES(?,?,?,?,?,?,?,?,?)');
        $st->execute([$title, trim($d['note'] ?? ''), $cat, $u, time(), $pa, $pj, $ea, $ej]);
        json_out(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
    }

    case 'rate': {                 // den anden (eller en selv) tilføjer prioritet + estimat
        $u = who($d); $id = (int)($d['id'] ?? 0);
        if (!$u || !$id) json_out(['error' => 'mangler']);
        $prio = max(0, min(5, (int)($d['priority'] ?? 0)));   // 0 = ikke en fælles opgave
        $est  = (float)($d['estimate'] ?? 0);
        $cp = $u === 'Allan' ? 'prio_allan' : 'prio_jette';
        $ce = $u === 'Allan' ? 'est_allan'  : 'est_jette';
        $pdo->prepare("UPDATE tasks SET $cp=?, $ce=? WHERE id=?")->execute([$prio, $est, $id]);
        break;
    }

    case 'unrate': {                // fjern en brugers vurdering igen
        $u = who($d); $id = (int)($d['id'] ?? 0);
        if (!$u || !$id) json_out(['error' => 'mangler']);
        $cp = $u === 'Allan' ? 'prio_allan' : 'prio_jette';
        $ce = $u === 'Allan' ? 'est_allan'  : 'est_jette';
        $pdo->prepare("UPDATE tasks SET $cp=NULL, $ce=NULL WHERE id=?")->execute([$id]);
        break;
    }

    case 'edit': {
        $id = (int)($d['id'] ?? 0);
        $cat = in_array($d['category'] ?? '', ['hus', 'have', 'andet'], true) ? $d['category'] : 'andet';
        $pdo->prepare('UPDATE tasks SET title=?, note=?, category=? WHERE id=?')
            ->execute([trim($d['title'] ?? ''), trim($d['note'] ?? ''), $cat, $id]);
        // valgfrit: redigér begge personers vurdering (man sidder sammen)
        foreach (['prio_allan', 'prio_jette'] as $c) if (array_key_exists($c, $d)) {
            $v = $d[$c]; $v = ($v === null || $v === '') ? null : max(0, min(5, (int)$v));
            $pdo->prepare("UPDATE tasks SET $c=? WHERE id=?")->execute([$v, $id]);
        }
        foreach (['est_allan', 'est_jette'] as $c) if (array_key_exists($c, $d)) {
            $v = $d[$c]; $v = ($v === null || $v === '') ? null : (float)$v;
            $pdo->prepare("UPDATE tasks SET $c=? WHERE id=?")->execute([$v, $id]);
        }
        break;
    }

    case 'done': {
        $u = who($d); $id = (int)($d['id'] ?? 0);
        $done = !empty($d['done']);
        $pdo->prepare('UPDATE tasks SET status=?, done_at=?, done_by=? WHERE id=?')
            ->execute([$done ? 'done' : 'open', $done ? time() : null, $done ? $u : null, $id]);
        break;
    }

    case 'park': {
        $id = (int)($d['id'] ?? 0);
        $pdo->prepare('UPDATE tasks SET parked=? WHERE id=?')->execute([!empty($d['parked']) ? 1 : 0, $id]);
        break;
    }

    case 'assign': {               // {assignments: {id: 'Allan'|'Jette'|''}}
        $a = $d['assignments'] ?? [];
        $st = $pdo->prepare('UPDATE tasks SET assigned_to=?, assigned_at=? WHERE id=?');
        foreach ($a as $id => $w) {
            $v = in_array($w, USERS, true) ? $w : null;
            $st->execute([$v, $v ? time() : null, (int)$id]);
        }
        break;
    }

    case 'delattach': {
        $id = (int)($d['id'] ?? 0);
        $st = $pdo->prepare('SELECT file FROM attachments WHERE id=?'); $st->execute([$id]);
        if ($file = $st->fetchColumn()) @unlink(__DIR__ . '/../uploads/' . basename($file));
        $pdo->prepare('DELETE FROM attachments WHERE id=?')->execute([$id]);
        break;
    }

    case 'delete': {
        $id = (int)($d['id'] ?? 0);
        $st = $pdo->prepare('SELECT file FROM attachments WHERE task_id=?'); $st->execute([$id]);
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $file) @unlink(__DIR__ . '/../uploads/' . basename($file));
        $pdo->prepare('DELETE FROM attachments WHERE task_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM tasks WHERE id=?')->execute([$id]);
        break;
    }

    default:
        json_out(['error' => 'ukendt action']);
}

json_out(['ok' => true]);
