<?php
/**
 * ElektroMarket — auth_system.php
 * Single-file authentication: session, DB, login, register, logout, redirect.
 */

// ── 1. SESSION SECURITY ──────────────────────────────────────
ini_set('session.use_strict_mode', 1);
ini_set('session.cookie_httponly', 1);
ini_set('session.cookie_samesite', 'Strict');
if (session_status() === PHP_SESSION_NONE) session_start();

// ── 2. CONFIG ─────────────────────────────────────────────────
define('DB_HOST', 'sql100.infinityfree.com');
define('DB_USER', 'if0_41758166');
define('DB_PASS', 'Presuniv2026');
define('DB_NAME', 'if0_41758166_akchatbot');

// Role → required email domain
const ROLE_DOMAINS = ['buyer' => '@buyer.com', 'seller' => '@seller.com'];

// ── 3. DATABASE (singleton) ───────────────────────────────────
function db(): mysqli {
    static $c = null;
    if ($c === null) {
        $c = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
        if ($c->connect_error) die('Database connection failed.');
        $c->set_charset('utf8mb4');
    }
    return $c;
}

// ── 4. HELPERS ────────────────────────────────────────────────
function e(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

function valid_email_role(string $email, string $role): bool {
    return array_key_exists($role, ROLE_DOMAINS)
        && str_ends_with(strtolower($email), ROLE_DOMAINS[$role]);
}

// Set JS-readable cookies (non-httponly so JS can read role)
function set_role_cookies(string $role, string $username): void {
    $opts = ['expires' => time() + 86400, 'path' => '/', 'samesite' => 'Lax'];
    setcookie('em_role', $role,     $opts);
    setcookie('em_user', $username, $opts);
}

function clear_role_cookies(): void {
    setcookie('em_role', '', time() - 42000, '/');
    setcookie('em_user', '', time() - 42000, '/');
}

// ── 5. ACTION HANDLERS ────────────────────────────────────────
$error   = '';
$success = '';
$action  = $_POST['action'] ?? '';

// ── LOGOUT ────────────────────────────────────────────────────
if ($action === 'logout' || isset($_GET['logout'])) {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    clear_role_cookies();
    header('Location: auth_system.php');
    exit;
}

// ── ALREADY LOGGED IN → go to dashboard ───────────────────────
if (!empty($_SESSION['user_id'])) {
    set_role_cookies($_SESSION['role'], $_SESSION['username']); // refresh cookies
    header('Location: index.html');
    exit;
}

// ── REGISTER ──────────────────────────────────────────────────
if ($action === 'register') {
    $username = trim($_POST['username'] ?? '');
    $email    = strtolower(trim($_POST['email'] ?? ''));
    $password = $_POST['password'] ?? '';
    $confirm  = $_POST['confirm']  ?? '';
    $role     = strtolower(trim($_POST['role'] ?? ''));

    if (strlen($username) < 3) {
        $error = 'Username must be at least 3 characters.';
    } elseif (!array_key_exists($role, ROLE_DOMAINS)) {
        $error = 'Unknown role selected.';
    } elseif (!valid_email_role($email, $role)) {
        $error = ucfirst($role) . ' email must end with <b>' . ROLE_DOMAINS[$role] . '</b>.';
    } elseif (strlen($password) < 8) {
        $error = 'Password must be at least 8 characters.';
    } elseif ($password !== $confirm) {
        $error = 'Passwords do not match.';
    } else {
        $chk = db()->prepare('SELECT id FROM users WHERE email = ?');
        $chk->bind_param('s', $email);
        $chk->execute();
        $chk->store_result();

        if ($chk->num_rows > 0) {
            $error = 'Email is already registered.';
        } else {
            $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
            $ins  = db()->prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)');
            $ins->bind_param('ssss', $username, $email, $hash, $role);
            if ($ins->execute()) {
                $success = 'Account created! Please log in.';
                $action  = ''; // switch to login tab
            } else {
                $error = 'Could not save your account. Please try again.';
            }
        }
    }
}

// ── LOGIN ─────────────────────────────────────────────────────
if ($action === 'login') {
    $email    = strtolower(trim($_POST['email'] ?? ''));
    $password = $_POST['password'] ?? '';
    $role     = strtolower(trim($_POST['role'] ?? ''));

    if (!array_key_exists($role, ROLE_DOMAINS)) {
        $error = 'Unknown role selected.';
    } elseif (!valid_email_role($email, $role)) {
        $error = ucfirst($role) . ' email must end with <b>' . ROLE_DOMAINS[$role] . '</b>.';
    } else {
        $stmt = db()->prepare('SELECT id, username, email, password, role FROM users WHERE email = ? AND role = ?');
        $stmt->bind_param('ss', $email, $role);
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();

        if (!$user || !password_verify($password, $user['password'])) {
            $error = 'Email, password, or role is incorrect.';
        } else {
            session_regenerate_id(true);
            $_SESSION['user_id']  = $user['id'];
            $_SESSION['username'] = $user['username'];
            $_SESSION['email']    = $user['email'];
            $_SESSION['role']     = $user['role'];

            // Set JS-readable cookies so index.html knows the role
            set_role_cookies($user['role'], $user['username']);

            header('Location: index.html');
            exit;
        }
    }
}

// Which tab to show after a failed submit
$show_register = ($action === 'register' && $error);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>ElektroMarket — Sign In / Sign Up</title>
<meta name="description" content="Log in or register as a Buyer or Seller on ElektroMarket."/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --brand:#4f46e5;--brand-lt:#eef2ff;--brand-dark:#3730a3;
  --danger:#ef4444;--success:#10b981;
  --bg:#f1f5f9;--surface:#fff;--border:#e2e8f0;
  --text:#0f172a;--muted:#64748b;--light:#94a3b8;
  --r-sm:8px;--r-md:14px;--r-xl:28px;
}
body{
  font-family:'Plus Jakarta Sans',sans-serif;background:var(--bg);
  color:var(--text);min-height:100vh;display:flex;
  align-items:center;justify-content:center;padding:20px;
  background-image:
    radial-gradient(ellipse at 20% 50%,rgba(99,102,241,.12) 0%,transparent 60%),
    radial-gradient(ellipse at 80% 20%,rgba(124,58,237,.10) 0%,transparent 55%);
}
.wrap{width:100%;max-width:440px;animation:up .45s ease both}
@keyframes up{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
.brand-hdr{text-align:center;margin-bottom:26px}
.brand-ico{
  width:58px;height:58px;border-radius:16px;display:inline-flex;
  align-items:center;justify-content:center;font-size:24px;color:#fff;
  background:linear-gradient(135deg,var(--brand),#7c3aed);
  box-shadow:0 10px 28px rgba(79,70,229,.32);margin-bottom:10px;
}
.brand-name{font-size:1.45rem;font-weight:900;letter-spacing:-.5px}
.brand-sub{font-size:.83rem;color:var(--muted);margin-top:3px;font-weight:500}
.card{background:var(--surface);border-radius:var(--r-xl);box-shadow:0 20px 60px -10px rgba(15,23,42,.12);border:1px solid var(--border);overflow:hidden}
.tabs{display:grid;grid-template-columns:1fr 1fr;background:#f8fafc;border-bottom:1px solid var(--border)}
.tab-btn{padding:15px;text-align:center;font-size:.88rem;font-weight:700;color:var(--muted);cursor:pointer;border:none;background:transparent;font-family:inherit;transition:all .2s;position:relative}
.tab-btn.on{color:var(--brand);background:var(--surface)}
.tab-btn.on::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2.5px;background:var(--brand);border-radius:2px 2px 0 0}
.panel{display:none;padding:26px}
.panel.on{display:block;animation:slide .22s ease}
@keyframes slide{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}
.srv-alert{display:flex;align-items:flex-start;gap:9px;padding:11px 14px;border-radius:var(--r-sm);font-size:.84rem;font-weight:600;margin-bottom:16px;line-height:1.5}
.srv-alert.err{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c}
.srv-alert.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}
.role-lbl{font-size:.73rem;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:9px;display:block}
.role-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
.role-card{cursor:pointer;position:relative}
.role-card input{position:absolute;opacity:0;width:0;height:0}
.role-inner{border:2px solid var(--border);border-radius:var(--r-md);padding:13px;text-align:center;transition:all .2s;background:#f8fafc}
.role-card input:checked~.role-inner{border-color:var(--brand);background:var(--brand-lt);box-shadow:0 0 0 4px rgba(79,70,229,.1)}
.ri{font-size:20px;margin-bottom:5px}
.role-card[data-r="buyer"] .ri{color:#0ea5e9}
.role-card[data-r="seller"] .ri{color:#f59e0b}
.rn{font-size:.8rem;font-weight:800;color:var(--text)}
.rh{font-size:.68rem;color:var(--muted);margin-top:1px}
.fld{margin-bottom:14px}
.flbl{display:block;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:5px}
.fw{position:relative}
.fi{width:100%;background:#f8fafc;border:1.5px solid var(--border);border-radius:var(--r-sm);padding:11px 14px 11px 38px;font-family:inherit;font-size:.9rem;font-weight:500;color:var(--text);outline:none;transition:border-color .2s,box-shadow .2s}
.fi::placeholder{color:#b0b8c9}
.fi:focus{background:#fff;border-color:var(--brand);box-shadow:0 0 0 4px rgba(79,70,229,.1)}
.fic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--light);font-size:12px;pointer-events:none}
.eye{position:absolute;right:11px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--light);font-size:12px;padding:3px}
.sbar{height:3px;background:var(--border);border-radius:2px;margin-top:6px;overflow:hidden}
.sfill{height:100%;border-radius:2px;transition:width .3s,background .3s;width:0}
.sub{width:100%;padding:13px;background:var(--brand);color:#fff;border:none;border-radius:var(--r-md);font-family:inherit;font-size:.92rem;font-weight:800;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 8px 22px rgba(79,70,229,.25);margin-top:6px}
.sub:hover{background:var(--brand-dark);transform:translateY(-2px)}
.sw{text-align:center;font-size:.78rem;color:var(--light);font-weight:600;margin-top:18px}
.sw a{color:var(--brand);text-decoration:none;font-weight:700}
.hint-txt{font-size:.72rem;color:var(--muted);margin-top:4px;display:block}
.js-err{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:var(--r-sm);padding:10px 14px;font-size:.82rem;font-weight:600;margin-bottom:14px;display:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand-hdr">
    <div class="brand-ico"><i class="fa-solid fa-bolt-lightning"></i></div>
    <div class="brand-name">ElektroMarket</div>
    <div class="brand-sub">Your trusted electronics marketplace</div>
  </div>

  <div class="card">
    <div class="tabs" role="tablist">
      <button type="button" class="tab-btn <?= !$show_register ? 'on' : '' ?>" id="t-login" onclick="show('login')" role="tab">
        <i class="fa-solid fa-right-to-bracket" style="margin-right:5px"></i>Sign In
      </button>
      <button type="button" class="tab-btn <?= $show_register ? 'on' : '' ?>" id="t-reg" onclick="show('register')" role="tab">
        <i class="fa-solid fa-user-plus" style="margin-right:5px"></i>Sign Up
      </button>
    </div>

    <!-- LOGIN PANEL -->
    <div id="p-login" class="panel <?= !$show_register ? 'on' : '' ?>">
      <?php if (!$show_register && $error): ?>
        <div class="srv-alert err"><i class="fa-solid fa-circle-exclamation"></i><span><?= $error ?></span></div>
      <?php endif; ?>
      <?php if ($success): ?>
        <div class="srv-alert ok"><i class="fa-solid fa-circle-check"></i><span><?= e($success) ?></span></div>
      <?php endif; ?>

      <form method="POST" action="auth_system.php" onsubmit="return vlLogin()" novalidate>
        <input type="hidden" name="action" value="login"/>
        <div id="je-login" class="js-err"></div>

        <span class="role-lbl">Sign in as</span>
        <div class="role-grid">
          <?php foreach (ROLE_DOMAINS as $r => $d): ?>
          <label class="role-card" data-r="<?= $r ?>">
            <input type="radio" name="role" value="<?= $r ?>"
              <?= ((!$show_register ? ($_POST['role'] ?? 'buyer') : 'buyer') === $r) ? 'checked' : '' ?>/>
            <div class="role-inner">
              <div class="ri"><i class="fa-solid <?= $r === 'buyer' ? 'fa-bag-shopping' : 'fa-store' ?>"></i></div>
              <div class="rn"><?= ucfirst($r) ?></div>
              <div class="rh"><?= $d ?></div>
            </div>
          </label>
          <?php endforeach; ?>
        </div>

        <div class="fld">
          <label class="flbl" for="l-email">Email</label>
          <div class="fw"><i class="fa-solid fa-envelope fic"></i>
            <input class="fi" type="email" id="l-email" name="email"
              value="<?= e(!$show_register ? ($_POST['email'] ?? '') : '') ?>"
              placeholder="name@buyer.com" autocomplete="email"/>
          </div>
        </div>
        <div class="fld">
          <label class="flbl" for="l-pass">Password</label>
          <div class="fw"><i class="fa-solid fa-lock fic"></i>
            <input class="fi" type="password" id="l-pass" name="password"
              placeholder="••••••••" autocomplete="current-password" style="padding-right:38px"/>
            <button type="button" class="eye" onclick="toggleEye('l-pass',this)"><i class="fa-solid fa-eye"></i></button>
          </div>
        </div>
        <button type="submit" class="sub"><i class="fa-solid fa-right-to-bracket"></i> Sign In</button>
      </form>
      <div class="sw">No account yet? <a href="#" onclick="show('register');return false">Sign up now</a></div>
    </div>

    <!-- REGISTER PANEL -->
    <div id="p-register" class="panel <?= $show_register ? 'on' : '' ?>">
      <?php if ($show_register && $error): ?>
        <div class="srv-alert err"><i class="fa-solid fa-circle-exclamation"></i><span><?= $error ?></span></div>
      <?php endif; ?>

      <form method="POST" action="auth_system.php" onsubmit="return vlReg()" novalidate>
        <input type="hidden" name="action" value="register"/>
        <div id="je-reg" class="js-err"></div>

        <span class="role-lbl">Register as</span>
        <div class="role-grid">
          <?php foreach (ROLE_DOMAINS as $r => $d): ?>
          <label class="role-card" data-r="<?= $r ?>">
            <input type="radio" name="role" value="<?= $r ?>" id="rr-<?= $r ?>" onchange="updateHint()"
              <?= (($show_register ? ($_POST['role'] ?? 'buyer') : 'buyer') === $r) ? 'checked' : '' ?>/>
            <div class="role-inner">
              <div class="ri"><i class="fa-solid <?= $r === 'buyer' ? 'fa-bag-shopping' : 'fa-store' ?>"></i></div>
              <div class="rn"><?= ucfirst($r) ?></div>
              <div class="rh"><?= $d ?></div>
            </div>
          </label>
          <?php endforeach; ?>
        </div>

        <div class="fld">
          <label class="flbl" for="r-user">Username</label>
          <div class="fw"><i class="fa-solid fa-user fic"></i>
            <input class="fi" type="text" id="r-user" name="username"
              value="<?= e($show_register ? ($_POST['username'] ?? '') : '') ?>"
              placeholder="At least 3 characters" autocomplete="username"/>
          </div>
        </div>
        <div class="fld">
          <label class="flbl" for="r-email">Email</label>
          <div class="fw"><i class="fa-solid fa-envelope fic"></i>
            <input class="fi" type="email" id="r-email" name="email"
              value="<?= e($show_register ? ($_POST['email'] ?? '') : '') ?>"
              placeholder="name@buyer.com" autocomplete="email"/>
          </div>
          <span class="hint-txt" id="email-hint">Use an email ending with <b>@buyer.com</b></span>
        </div>
        <div class="fld">
          <label class="flbl" for="r-pass">Password</label>
          <div class="fw"><i class="fa-solid fa-lock fic"></i>
            <input class="fi" type="password" id="r-pass" name="password"
              placeholder="At least 8 characters" autocomplete="new-password"
              oninput="strengthBar(this.value)" style="padding-right:38px"/>
            <button type="button" class="eye" onclick="toggleEye('r-pass',this)"><i class="fa-solid fa-eye"></i></button>
          </div>
          <div class="sbar"><div class="sfill" id="sfill"></div></div>
        </div>
        <div class="fld">
          <label class="flbl" for="r-confirm">Confirm Password</label>
          <div class="fw"><i class="fa-solid fa-shield-halved fic"></i>
            <input class="fi" type="password" id="r-confirm" name="confirm"
              placeholder="Repeat password" autocomplete="new-password" style="padding-right:38px"/>
            <button type="button" class="eye" onclick="toggleEye('r-confirm',this)"><i class="fa-solid fa-eye"></i></button>
          </div>
        </div>
        <button type="submit" class="sub"><i class="fa-solid fa-user-plus"></i> Create Account</button>
      </form>
      <div class="sw">Already have an account? <a href="#" onclick="show('login');return false">Sign in</a></div>
    </div>
  </div>
</div>

<script>
function show(t){['login','register'].forEach(p=>{document.getElementById('p-'+p).classList.toggle('on',p===t);document.getElementById('t-'+p).classList.toggle('on',p===t);})}
function toggleEye(id,btn){const i=document.getElementById(id);i.type=i.type==='password'?'text':'password';btn.querySelector('i').className='fa-solid fa-eye'+(i.type==='text'?'-slash':'');}
function updateHint(){const r=document.querySelector('input[name="role"]:checked')?.value||'buyer';const d=r==='seller'?'@seller.com':'@buyer.com';document.getElementById('email-hint').innerHTML='Use an email ending with <b>'+d+'</b>';document.getElementById('r-email').placeholder='name'+d;}
function strengthBar(pw){let s=0;if(pw.length>=8)s++;if(/[A-Z]/.test(pw))s++;if(/[0-9]/.test(pw))s++;if(/[^A-Za-z0-9]/.test(pw))s++;const f=document.getElementById('sfill');f.style.width=['0%','25%','50%','75%','100%'][s];f.style.background=['','#ef4444','#f59e0b','#10b981','#4f46e5'][s]||'';}
function showErr(id,msg){const b=document.getElementById(id);b.innerHTML=msg;b.style.display='block';}
function vlLogin(){const e=document.getElementById('l-email').value.trim(),p=document.getElementById('l-pass').value,r=document.querySelector('input[name="role"]:checked')?.value||'buyer',d=r==='seller'?'@seller.com':'@buyer.com';if(!e||!e.toLowerCase().endsWith(d)){showErr('je-login','Email for <b>'+r+'</b> must end with <b>'+d+'</b>.');return false;}if(!p){showErr('je-login','Password is required.');return false;}return true;}
function vlReg(){const u=document.getElementById('r-user').value.trim(),e=document.getElementById('r-email').value.trim(),p=document.getElementById('r-pass').value,c=document.getElementById('r-confirm').value,r=document.querySelector('#p-register input[name="role"]:checked')?.value||'buyer',d=r==='seller'?'@seller.com':'@buyer.com';if(u.length<3){showErr('je-reg','Username must be at least 3 characters.');return false;}if(!e.toLowerCase().endsWith(d)){showErr('je-reg','Email for <b>'+r+'</b> must end with <b>'+d+'</b>.');return false;}if(p.length<8){showErr('je-reg','Password must be at least 8 characters.');return false;}if(p!==c){showErr('je-reg','Passwords do not match.');return false;}return true;}
document.querySelectorAll('input[name="role"]').forEach(r=>r.addEventListener('change',updateHint));
document.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const a=document.querySelector('.panel.on')?.id;if(a==='p-login')vlLogin();if(a==='p-register')vlReg();});
</script>
</body>
</html>
