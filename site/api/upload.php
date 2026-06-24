<?php
// Upload af billede/video til en opgave (multipart/form-data).
require __DIR__ . '/db.php';

$tid = (int)($_POST['task_id'] ?? 0);
$u   = in_array($_POST['user'] ?? '', USERS, true) ? $_POST['user'] : '';
$cap = trim($_POST['caption'] ?? '');

if (!$tid || empty($_FILES['file'])) {
    json_out(['error' => 'mangler data (filen er måske for stor for serveren)']);
}
$f = $_FILES['file'];
if ($f['error'] !== UPLOAD_ERR_OK) json_out(['error' => 'upload-fejl ' . $f['error']]);

$fi = new finfo(FILEINFO_MIME_TYPE);
$mime = $fi->file($f['tmp_name']);
$img = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'image/heic' => 'heic'];
$vid = ['video/mp4' => 'mp4', 'video/quicktime' => 'mov', 'video/webm' => 'webm', 'video/3gpp' => '3gp'];
if (isset($img[$mime]))      { $kind = 'image'; $ext = $img[$mime]; }
elseif (isset($vid[$mime]))  { $kind = 'video'; $ext = $vid[$mime]; }
else json_out(['error' => 'kun billeder/video (' . $mime . ')']);

$dir = __DIR__ . '/../uploads';
if (!is_dir($dir)) @mkdir($dir, 0775, true);
$name = $tid . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
$dest = $dir . '/' . $name;
if (!move_uploaded_file($f['tmp_name'], $dest)) json_out(['error' => 'kunne ikke gemme filen']);

if ($kind === 'image' && function_exists('imagecreatefromstring')) downscale($dest, $mime, 1600);

$st = db()->prepare('INSERT INTO attachments(task_id,kind,file,caption,created_by,created_at) VALUES(?,?,?,?,?,?)');
$st->execute([$tid, $kind, $name, $cap, $u, time()]);
json_out(['ok' => true, 'file' => $name, 'kind' => $kind]);

function downscale(string $path, string $mime, int $max): void {
    try {
        $im = @imagecreatefromstring(file_get_contents($path));
        if (!$im) return;
        $w = imagesx($im); $h = imagesy($im);
        if (max($w, $h) <= $max) { imagedestroy($im); return; }
        $r = $max / max($w, $h); $nw = (int)($w * $r); $nh = (int)($h * $r);
        $n = imagecreatetruecolor($nw, $nh);
        if ($mime === 'image/png') { imagealphablending($n, false); imagesavealpha($n, true); }
        imagecopyresampled($n, $im, 0, 0, 0, 0, $nw, $nh, $w, $h);
        if ($mime === 'image/png')                                   imagepng($n, $path, 6);
        elseif ($mime === 'image/webp' && function_exists('imagewebp')) imagewebp($n, $path, 82);
        else                                                          imagejpeg($n, $path, 82);
        imagedestroy($im); imagedestroy($n);
    } catch (\Throwable $e) { /* behold original ved fejl */ }
}
