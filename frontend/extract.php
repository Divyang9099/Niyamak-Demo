<?php
if (!isset($_GET['secret']) || $_GET['secret'] !== 'varuna2026') {
    http_response_code(403); exit('Forbidden');
}
$dir     = __DIR__;
$archive = $dir . '/dist.tar.gz';
if (!file_exists($archive)) {
    echo json_encode(['error' => 'Archive not found: ' . $archive]); exit;
}
$cmd    = 'cd ' . escapeshellarg($dir) . ' && tar -xzf dist.tar.gz 2>&1';
$output = shell_exec($cmd);
@unlink($archive);
echo json_encode(['success' => true, 'extracted_to' => $dir, 'output' => $output]);
