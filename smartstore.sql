SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- 1. Requests Table (Stores buyer requests, parsed quantities, and GPS coordinates)
CREATE TABLE `requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `buyer_name` varchar(100) DEFAULT 'Buyer',
  `description` text NOT NULL,
  `parsed_items` text DEFAULT NULL,
  `location` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Offers Table (Stores seller responses, unit prices converted to total, and image paths)
CREATE TABLE `offers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `seller_name` varchar(100) NOT NULL,
  `product_name` varchar(100) NOT NULL,
  `price` int(11) NOT NULL,
  `contact` varchar(50) NOT NULL,
  `is_auto` tinyint(1) DEFAULT 0,
  `image_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Orders Table (Stores completed transactions, moving map and image data over)
CREATE TABLE `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `buyer_name` varchar(100) DEFAULT 'Buyer',
  `seller_name` varchar(100) NOT NULL,
  `product_name` varchar(100) NOT NULL,
  `total_price` int(11) NOT NULL,
  `location` varchar(100) DEFAULT NULL,
  `image_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Cart Table (Menyimpan keranjang pembeli)
CREATE TABLE `cart_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cart_id` varchar(100) NOT NULL,
  `product_name` varchar(100) NOT NULL,
  `seller_name` varchar(100) NOT NULL,
  `price` int(11) NOT NULL,
  `quantity` int(11) DEFAULT 1,
  `image_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Checkouts Table (Menyimpan riwayat checkout)
CREATE TABLE `checkouts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `checkout_id` varchar(100) NOT NULL UNIQUE,
  `buyer_contact` varchar(50) NOT NULL,
  `total_amount` int(11) NOT NULL,
  `items_detail` text NOT NULL,
  `status` enum('pending', 'confirmed', 'completed') DEFAULT 'pending',
  `payment_method` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;