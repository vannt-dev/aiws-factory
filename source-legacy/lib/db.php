<?php
// Database connection (mysqli). Credentials come from config.ini, which is not in this repository.
function db() {
    static $conn = null;
    if ($conn === null) {
        $cfg = parse_ini_file(__DIR__ . '/../config.ini');
        $conn = new mysqli($cfg['host'], $cfg['user'], $cfg['password'], $cfg['database']);
        $conn->set_charset('utf8');
    }
    return $conn;
}
