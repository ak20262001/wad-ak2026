-- ============================================================
--  ElektroMarket — smartstore.sql  (Complete Database Schema)
--  Database : if0_41758166_akchatbot
--  Run this in phpMyAdmin → SQL tab → Go
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- ------------------------------------------------------------
-- 1. Requests Table — buyer item requests with GPS location
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `requests` (
  `id`           INT(11)      NOT NULL AUTO_INCREMENT,
  `buyer_name`   VARCHAR(100) DEFAULT 'Buyer',
  `buyer_phone`  VARCHAR(50)  NOT NULL,
  `description`  TEXT         NOT NULL,
  `parsed_items` TEXT         DEFAULT NULL,
  `location`     VARCHAR(100) DEFAULT NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 2. Offers Table — seller responses with price and image
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `offers` (
  `id`           INT(11)      NOT NULL AUTO_INCREMENT,
  `request_id`   INT(11)      NOT NULL,
  `seller_name`  VARCHAR(100) NOT NULL,
  `seller_phone` VARCHAR(50)  NOT NULL,
  `product_name` VARCHAR(100) NOT NULL,
  `price`        INT(11)      NOT NULL,
  `contact`      VARCHAR(50)  NOT NULL,
  `is_auto`      TINYINT(1)   DEFAULT 0,
  `image_path`   VARCHAR(255) DEFAULT NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 3. Orders Table — completed / accepted transactions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id`           INT(11)      NOT NULL AUTO_INCREMENT,
  `buyer_name`   VARCHAR(100) DEFAULT 'Buyer',
  `buyer_phone`  VARCHAR(50)  NOT NULL,
  `seller_name`  VARCHAR(100) NOT NULL,
  `seller_phone` VARCHAR(50)  NOT NULL,
  `product_name` VARCHAR(100) NOT NULL,
  `total_price`  INT(11)      NOT NULL,
  `location`     VARCHAR(100) DEFAULT NULL,
  `image_path`   VARCHAR(255) DEFAULT NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 4. Cart Items Table — buyer shopping cart (session-based)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cart_items` (
  `id`           INT(11)      NOT NULL AUTO_INCREMENT,
  `cart_id`      VARCHAR(100) NOT NULL,
  `product_name` VARCHAR(100) NOT NULL,
  `seller_name`  VARCHAR(100) NOT NULL,
  `price`        INT(11)      NOT NULL,
  `quantity`     INT(11)      DEFAULT 1,
  `image_path`   VARCHAR(255) DEFAULT NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 5. Checkouts Table — completed checkout records
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `checkouts` (
  `id`             INT(11)      NOT NULL AUTO_INCREMENT,
  `checkout_id`    VARCHAR(100) NOT NULL UNIQUE,
  `buyer_contact`  VARCHAR(50)  NOT NULL,
  `total_amount`   INT(11)      NOT NULL,
  `items_detail`   TEXT         NOT NULL,
  `status`         ENUM('pending','confirmed','completed') DEFAULT 'pending',
  `payment_method` VARCHAR(50)  DEFAULT NULL,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;