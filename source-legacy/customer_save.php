<?php
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/phone.php';

// POST: id (optional, update when present), full_name, email, phone (optional)
$id    = isset($_POST['id']) ? (int) $_POST['id'] : 0;
$name  = trim($_POST['full_name']);
$email = trim($_POST['email']);
$phone = isset($_POST['phone']) ? trim($_POST['phone']) : '';

$errors = array();
if ($name === '' || strlen($name) > 100) {
    $errors['full_name'] = 'Họ tên bắt buộc, tối đa 100 ký tự';
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Email không hợp lệ';
}

// Phone is optional. When given it must be valid, and no other ACTIVE customer may use it.
// Inactive customers do not block the number (BR-09: numbers are recycled by carriers).
$normalized = null;
if ($phone !== '') {
    $normalized = phone_normalize($phone);
    if (!phone_is_valid($normalized)) {
        $errors['phone'] = 'Số điện thoại không hợp lệ';
    } else {
        $stmt = db()->prepare('SELECT id FROM customers WHERE phone = ? AND status = 1 AND id <> ?');
        $stmt->bind_param('si', $normalized, $id);
        $stmt->execute();
        if ($stmt->get_result()->num_rows > 0) {
            $errors['phone'] = 'Số điện thoại đã được khách hàng khác sử dụng';
        }
    }
}

if ($errors) {
    header('Content-Type: application/json', true, 400);
    echo json_encode(array('errors' => $errors));
    exit;
}

if ($id > 0) {
    $stmt = db()->prepare('UPDATE customers SET full_name = ?, email = ?, phone = ? WHERE id = ?');
    $stmt->bind_param('sssi', $name, $email, $normalized, $id);
} else {
    $stmt = db()->prepare('INSERT INTO customers (full_name, email, phone, status, created_at) VALUES (?, ?, ?, 1, NOW())');
    $stmt->bind_param('sss', $name, $email, $normalized);
}
$stmt->execute();
header('Location: customer_list.php');
