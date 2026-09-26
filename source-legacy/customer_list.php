<?php
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/phone.php';

$result = db()->query('SELECT id, full_name, email, phone, status FROM customers ORDER BY id');
?>
<html>
<head><meta charset="utf-8"><title>Danh sách khách hàng</title></head>
<body>
<h1>Danh sách khách hàng</h1>
<table border="1" cellpadding="4">
  <tr><th>ID</th><th>Họ tên</th><th>Email</th><th>Điện thoại</th><th>Trạng thái</th></tr>
  <?php while ($row = $result->fetch_assoc()): ?>
  <tr>
    <td><?php echo $row['id']; ?></td>
    <td><?php echo htmlspecialchars($row['full_name']); ?></td>
    <td><?php echo htmlspecialchars($row['email']); ?></td>
    <!-- empty phone is shown as a dash -->
    <td><?php echo $row['phone'] ? phone_format($row['phone']) : '—'; ?></td>
    <td><?php echo $row['status'] ? 'Đang hoạt động' : 'Ngừng hoạt động'; ?></td>
  </tr>
  <?php endwhile; ?>
</table>
</body>
</html>
