<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");

$conn = new mysqli("localhost", "root", "", "project-wad");
if ($conn->connect_error) { die(json_encode(["error" => "Connection failed"])); }

$action = $_REQUEST['action'] ?? '';

// Auto-clean old data
$conn->query("DELETE FROM requests WHERE created_at < NOW() - INTERVAL 12 HOUR");

if ($action === 'create_request') {
    $buyer = 'Buyer'; 
    $desc = $_POST['description'] ?? '';
    $loc = $_POST['location'] ?? null;
    
    $parsed = [];
    $desc_clean = trim(strtolower($desc));
    $desc_clean = preg_replace('/^(saya\s+)?(mau|ingin|beli|pesan|cari|mencari|i want\s+(to\s+)?buy|i want|buy|tolong\s+)\s+/i', '', $desc_clean);
    
    if (preg_match('/(\d+)\s*(?:unit|pcs|buah|biji)\b/i', $desc_clean, $matches)) {
        $qty = (int)$matches[1];
        $item_name = trim(preg_replace('/(\d+)\s*(?:unit|pcs|buah|biji)\b/i', '', $desc_clean));
        $parsed[] = ['item' => $item_name, 'qty' => $qty];
    } elseif (preg_match('/^(\d+)\s+(.+)$/i', $desc_clean, $matches)) {
        $parsed[] = ['item' => trim($matches[2]), 'qty' => (int)$matches[1]];
    } else {
        $parsed[] = ['item' => $desc_clean ?: trim($desc), 'qty' => 1];
    }
    
    $parsed_json = json_encode($parsed);
    $stmt = $conn->prepare("INSERT INTO requests (buyer_name, description, parsed_items, location) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("ssss", $buyer, $desc, $parsed_json, $loc);
    $stmt->execute();
    
    echo json_encode(['status' => 'success', 'request_id' => $stmt->insert_id]);
    exit;
}

if ($action === 'close_request') {
    $id = (int)($_POST['request_id'] ?? 0);
    $conn->query("DELETE FROM requests WHERE id = $id");
    $conn->query("DELETE FROM offers WHERE request_id = $id");
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action === 'add_offer') {
    $image_path = null;
    $upload_error = null;
    
    if (isset($_FILES['product_image']) && $_FILES['product_image']['error'] === UPLOAD_ERR_OK) {
        $ext = pathinfo($_FILES['product_image']['name'], PATHINFO_EXTENSION);
        $filename = uniqid() . "." . $ext;
        if (!is_dir('uploads')) { mkdir('uploads', 0777, true); }
        if (move_uploaded_file($_FILES['product_image']['tmp_name'], 'uploads/' . $filename)) {
            $image_path = 'uploads/' . $filename;
        } else {
            $upload_error = "Failed to move file to uploads folder.";
        }
    }

    $req_id  = (int)($_POST['request_id'] ?? 0);
    $seller  = $_POST['seller_name'] ?? 'Unknown';
    $product = $_POST['product_name'] ?? 'Unknown';
    $price   = (int)($_POST['price'] ?? 0);
    $contact = $_POST['contact'] ?? '';

    $stmt = $conn->prepare("INSERT INTO offers (request_id, seller_name, product_name, price, contact, image_path) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("ississ", $req_id, $seller, $product, $price, $contact, $image_path);
    
    if ($stmt->execute()) {
        echo json_encode(['status' => 'success', 'upload_error' => $upload_error]);
    } else {
        echo json_encode(['error' => 'Execute Error: ' . $stmt->error]);
    }
    exit;
}

if ($action === 'get_offers') {
    $id = (int)($_GET['request_id'] ?? 0);
    // JOIN dengan requests untuk mendapatkan parsed_items (yang berisi kuantitas awal)
    $res = $conn->query("SELECT o.*, r.parsed_items FROM offers o JOIN requests r ON o.request_id = r.id WHERE o.request_id = $id");
    echo json_encode($res->fetch_all(MYSQLI_ASSOC));
    exit;
}

if ($action === 'accept_offer') {
    $offer_id = (int)($_POST['offer_id'] ?? 0);
    $res = $conn->query("SELECT o.*, r.parsed_items, r.location FROM offers o JOIN requests r ON o.request_id = r.id WHERE o.id = $offer_id");
    $offer = $res->fetch_assoc();

    if ($offer) {
        $stmt = $conn->prepare("INSERT INTO orders (buyer_name, seller_name, product_name, total_price, location, image_path) VALUES ('Buyer', ?, ?, ?, ?, ?)");
        $stmt->bind_param("ssiss", $offer['seller_name'], $offer['product_name'], $offer['price'], $offer['location'], $offer['image_path']);
        $stmt->execute();
        
        $req_id = $offer['request_id'];
        $conn->query("DELETE FROM requests WHERE id = $req_id");
        $conn->query("DELETE FROM offers WHERE request_id = $req_id");
        
        echo json_encode([
            'status' => 'success', 
            'contact' => $offer['contact'], 
            'product' => $offer['product_name'], 
            'price' => $offer['price'], 
            'details' => $offer['parsed_items']
        ]);
    }
    exit;
}

if ($action === 'get_orders') {
    $res = $conn->query("SELECT * FROM orders ORDER BY created_at DESC");
    echo json_encode($res->fetch_all(MYSQLI_ASSOC));
    exit;
}

if ($action === 'get_requests') {
    $res = $conn->query("SELECT * FROM requests ORDER BY created_at DESC");
    echo json_encode($res->fetch_all(MYSQLI_ASSOC));
    exit;
}

if ($action === 'suggest_price') {
    $item = $conn->real_escape_string($_GET['item'] ?? '');
    if (empty($item)) { echo json_encode(['price' => null]); exit; }
    $res = $conn->query("SELECT AVG(total_price) as avg_price FROM orders WHERE product_name LIKE '%$item%'");
    $row = $res->fetch_assoc();
    echo json_encode(['price' => $row['avg_price'] ? round($row['avg_price']) : null]);
    exit;
}

// --- CART & CHECKOUT LOGIC ---
if ($action === 'add_to_cart') {
    $cart_id = $conn->real_escape_string($_POST['cart_id']);
    $seller = $conn->real_escape_string($_POST['seller_name']);
    $product = $conn->real_escape_string($_POST['product_name']);
    $price = (int)$_POST['price']; // Sekarang ini akan menerima HARGA SATUAN (Unit Price)
    $qty = (int)($_POST['quantity'] ?? 1); // Terima kuantitas awal dari frontend
    $image_path = $conn->real_escape_string($_POST['image_path'] ?? '');

    $check = $conn->query("SELECT id, quantity FROM cart_items WHERE cart_id = '$cart_id' AND product_name = '$product' AND seller_name = '$seller'");
    if ($check->num_rows > 0) {
        $row = $check->fetch_assoc();
        $new_qty = $row['quantity'] + $qty; // Tambahkan dengan qty baru
        $conn->query("UPDATE cart_items SET quantity = $new_qty WHERE id = {$row['id']}");
    } else {
        $stmt = $conn->prepare("INSERT INTO cart_items (cart_id, product_name, seller_name, price, quantity, image_path) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("sssiss", $cart_id, $product, $seller, $price, $qty, $image_path);
        $stmt->execute();
    }
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action === 'get_cart') {
    $cart_id = $conn->real_escape_string($_GET['cart_id'] ?? '');
    $res = $conn->query("SELECT * FROM cart_items WHERE cart_id = '$cart_id' ORDER BY created_at DESC");
    echo json_encode($res->fetch_all(MYSQLI_ASSOC));
    exit;
}

if ($action === 'update_cart_qty') {
    $item_id = (int)$_POST['item_id'];
    $qty = (int)$_POST['quantity'];
    
    if ($qty <= 0) {
        $conn->query("DELETE FROM cart_items WHERE id = $item_id");
    } else {
        $conn->query("UPDATE cart_items SET quantity = $qty WHERE id = $item_id");
    }
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action === 'delete_cart_items') {
    $ids = json_decode($_POST['item_ids'], true);
    if (!empty($ids) && is_array($ids)) {
        // Sanitasi dan batch delete untuk O(1) query network roundtrip
        $safe_ids = implode(',', array_map('intval', $ids));
        $conn->query("DELETE FROM cart_items WHERE id IN ($safe_ids)");
    }
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action === 'checkout_cart') {
    $cart_id = $conn->real_escape_string($_POST['cart_id']);
    $contact = $conn->real_escape_string($_POST['contact']);
    $item_ids = json_decode($_POST['item_ids'], true);
    
    if (empty($item_ids)) {
        echo json_encode(['error' => 'No items selected']); exit;
    }

    $safe_ids = implode(',', array_map('intval', $item_ids));
    $res = $conn->query("SELECT * FROM cart_items WHERE id IN ($safe_ids) AND cart_id = '$cart_id'");
    
    $items = [];
    $total_amount = 0;
    while($row = $res->fetch_assoc()) {
        $items[] = $row;
        $total_amount += ($row['price'] * $row['quantity']);
    }

    $items_json = json_encode($items);
    $checkout_id = 'CHK-' . strtoupper(uniqid());

    // Insert ke Checkouts
    $stmt = $conn->prepare("INSERT INTO checkouts (checkout_id, buyer_contact, total_amount, items_detail) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("ssis", $checkout_id, $contact, $total_amount, $items_json);
    $stmt->execute();

    // Migrasi data ke Orders untuk konsistensi riwayat pesanan global (Denormalisasi terukur)
    foreach($items as $item) {
        $total_price_item = $item['price'] * $item['quantity'];
        $stmt_ord = $conn->prepare("INSERT INTO orders (buyer_name, seller_name, product_name, total_price, image_path) VALUES ('Buyer', ?, ?, ?, ?)");
        $stmt_ord->bind_param("ssis", $item['seller_name'], $item['product_name'], $total_price_item, $item['image_path']);
        $stmt_ord->execute();
    }

    // Bersihkan cart_items yang sudah di-checkout
    $conn->query("DELETE FROM cart_items WHERE id IN ($safe_ids)");

    echo json_encode(['status' => 'success', 'checkout_id' => $checkout_id, 'total' => $total_amount, 'items' => $items]);
    exit;
}
?>