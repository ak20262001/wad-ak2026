<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");

$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        putenv(trim($name) . '=' . trim($value));
    }
}

// --- KONFIGURASI SUPABASE SESSION POOLER ---
$host = getenv('DB_HOST'); 
$port = getenv('DB_PORT'); 
$dbname = getenv('DB_NAME');
$user = getenv('DB_USER'); 
$password = getenv('DB_PASS'); 

try {
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname";
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    die(json_encode(["error" => "Database connection failed", "details" => $e->getMessage()]));
}

// CRUD start
$action = $_REQUEST['action'] ?? '';

// Auto-clean old data (PostgreSQL syntax)
$pdo->exec("DELETE FROM requests WHERE created_at < NOW() - INTERVAL '12 hours'");

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
    
    // PostgreSQL returning ID
    $stmt = $pdo->prepare("INSERT INTO requests (buyer_name, description, parsed_items, location) VALUES (?, ?, ?, ?) RETURNING id");
    $stmt->execute([$buyer, $desc, $parsed_json, $loc]);
    $new_id = $stmt->fetchColumn();
    
    echo json_encode(['status' => 'success', 'request_id' => $new_id]);
    exit;
}

if ($action === 'close_request') {
    $id = (int)($_POST['request_id'] ?? 0);
    $stmt = $pdo->prepare("DELETE FROM requests WHERE id = ?");
    $stmt->execute([$id]);
    $stmt2 = $pdo->prepare("DELETE FROM offers WHERE request_id = ?");
    $stmt2->execute([$id]);
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

    $stmt = $pdo->prepare("INSERT INTO offers (request_id, seller_name, product_name, price, contact, image_path) VALUES (?, ?, ?, ?, ?, ?)");
    
    if ($stmt->execute([$req_id, $seller, $product, $price, $contact, $image_path])) {
        echo json_encode(['status' => 'success', 'upload_error' => $upload_error]);
    } else {
        echo json_encode(['error' => 'Execute Error']);
    }
    exit;
}

if ($action === 'get_offers') {
    $id = (int)($_GET['request_id'] ?? 0);
    $stmt = $pdo->prepare("SELECT o.*, r.parsed_items FROM offers o JOIN requests r ON o.request_id = r.id WHERE o.request_id = ?");
    $stmt->execute([$id]);
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($action === 'accept_offer') {
    $offer_id = (int)($_POST['offer_id'] ?? 0);
    $stmt = $pdo->prepare("SELECT o.*, r.parsed_items, r.location FROM offers o JOIN requests r ON o.request_id = r.id WHERE o.id = ?");
    $stmt->execute([$offer_id]);
    $offer = $stmt->fetch();

    if ($offer) {
        $stmt_insert = $pdo->prepare("INSERT INTO orders (buyer_name, seller_name, product_name, total_price, location, image_path) VALUES ('Buyer', ?, ?, ?, ?, ?)");
        $stmt_insert->execute([$offer['seller_name'], $offer['product_name'], $offer['price'], $offer['location'], $offer['image_path']]);
        
        $req_id = $offer['request_id'];
        $stmt_del1 = $pdo->prepare("DELETE FROM requests WHERE id = ?");
        $stmt_del1->execute([$req_id]);
        $stmt_del2 = $pdo->prepare("DELETE FROM offers WHERE request_id = ?");
        $stmt_del2->execute([$req_id]);
        
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
    $stmt = $pdo->query("SELECT * FROM orders ORDER BY created_at DESC");
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($action === 'get_requests') {
    $stmt = $pdo->query("SELECT * FROM requests ORDER BY created_at DESC");
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($action === 'suggest_price') {
    $item = $_GET['item'] ?? '';
    if (empty($item)) { echo json_encode(['price' => null]); exit; }
    
    $stmt = $pdo->prepare("SELECT AVG(total_price) as avg_price FROM orders WHERE product_name ILIKE ?");
    $stmt->execute(['%' . $item . '%']);
    $row = $stmt->fetch();
    echo json_encode(['price' => $row['avg_price'] ? round($row['avg_price']) : null]);
    exit;
}

// --- CART & CHECKOUT LOGIC ---
if ($action === 'add_to_cart') {
    $cart_id = $_POST['cart_id'];
    $seller = $_POST['seller_name'];
    $product = $_POST['product_name'];
    $price = (int)$_POST['price']; 
    $qty = (int)($_POST['quantity'] ?? 1); 
    $image_path = $_POST['image_path'] ?? '';

    $stmt_check = $pdo->prepare("SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_name = ? AND seller_name = ?");
    $stmt_check->execute([$cart_id, $product, $seller]);
    $row = $stmt_check->fetch();

    if ($row) {
        $new_qty = $row['quantity'] + $qty; 
        $stmt_update = $pdo->prepare("UPDATE cart_items SET quantity = ? WHERE id = ?");
        $stmt_update->execute([$new_qty, $row['id']]);
    } else {
        $stmt_insert = $pdo->prepare("INSERT INTO cart_items (cart_id, product_name, seller_name, price, quantity, image_path) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt_insert->execute([$cart_id, $product, $seller, $price, $qty, $image_path]);
    }
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action === 'get_cart') {
    $cart_id = $_GET['cart_id'] ?? '';
    $stmt = $pdo->prepare("SELECT * FROM cart_items WHERE cart_id = ? ORDER BY created_at DESC");
    $stmt->execute([$cart_id]);
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($action === 'update_cart_qty') {
    $item_id = (int)$_POST['item_id'];
    $qty = (int)$_POST['quantity'];
    
    if ($qty <= 0) {
        $stmt = $pdo->prepare("DELETE FROM cart_items WHERE id = ?");
        $stmt->execute([$item_id]);
    } else {
        $stmt = $pdo->prepare("UPDATE cart_items SET quantity = ? WHERE id = ?");
        $stmt->execute([$qty, $item_id]);
    }
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action === 'delete_cart_items') {
    $ids = json_decode($_POST['item_ids'], true);
    if (!empty($ids) && is_array($ids)) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("DELETE FROM cart_items WHERE id IN ($placeholders)");
        $stmt->execute($ids);
    }
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action === 'checkout_cart') {
    $cart_id = $_POST['cart_id'];
    $contact = $_POST['contact'];
    $item_ids = json_decode($_POST['item_ids'], true);
    
    if (empty($item_ids)) {
        echo json_encode(['error' => 'No items selected']); exit;
    }

    $placeholders = implode(',', array_fill(0, count($item_ids), '?'));
    $params = $item_ids;
    $params[] = $cart_id; // append cart_id for the AND condition

    $stmt = $pdo->prepare("SELECT * FROM cart_items WHERE id IN ($placeholders) AND cart_id = ?");
    $stmt->execute($params);
    
    $items = [];
    $total_amount = 0;
    while($row = $stmt->fetch()) {
        $items[] = $row;
        $total_amount += ($row['price'] * $row['quantity']);
    }

    $items_json = json_encode($items);
    $checkout_id = 'CHK-' . strtoupper(uniqid());

    $stmt_checkout = $pdo->prepare("INSERT INTO checkouts (checkout_id, buyer_contact, total_amount, items_detail) VALUES (?, ?, ?, ?)");
    $stmt_checkout->execute([$checkout_id, $contact, $total_amount, $items_json]);

    $stmt_ord = $pdo->prepare("INSERT INTO orders (buyer_name, seller_name, product_name, total_price, image_path) VALUES ('Buyer', ?, ?, ?, ?)");
    foreach($items as $item) {
        $total_price_item = $item['price'] * $item['quantity'];
        $stmt_ord->execute([$item['seller_name'], $item['product_name'], $total_price_item, $item['image_path']]);
    }

    $stmt_del = $pdo->prepare("DELETE FROM cart_items WHERE id IN ($placeholders)");
    $stmt_del->execute($item_ids);

    echo json_encode(['status' => 'success', 'checkout_id' => $checkout_id, 'total' => $total_amount, 'items' => $items]);
    exit;
}
?>