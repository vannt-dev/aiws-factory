-- Legacy CRM schema (MySQL 5.5)
CREATE TABLE customers (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name  VARCHAR(100) NOT NULL,
  email      VARCHAR(150) NOT NULL,
  phone      VARCHAR(11)  NULL,           -- stored normalised: digits only, starting with 0
  status     TINYINT(1)   NOT NULL DEFAULT 1, -- 1 = active, 0 = inactive
  created_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_email (email),
  KEY idx_customers_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
