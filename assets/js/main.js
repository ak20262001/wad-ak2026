/* assets/js/main.js */

const API_URL = 'api.php';

// Shared Utilities
function escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getContext() {
    if (document.getElementById('buyer-section')) return 'buyer';
    if (document.getElementById('seller-section')) return 'seller';
    return null;
}

let toastTimer = null;
function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    const msgEl = document.getElementById('toast-msg');
    if (msgEl) msgEl.textContent = msg;
    t.classList.remove('hidden', 'toast-hide');
    t.classList.add('toast-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        t.classList.remove('toast-show');
        t.classList.add('toast-hide');
    }, 3000);
}

// Profile & Settings (Shared/Context-Aware)
function checkProfileValidation() {
    const ctx = getContext();
    if (!ctx) return;

    const name = localStorage.getItem(ctx + 'Name');
    const phone = localStorage.getItem(ctx + 'Phone');

    if (!name || !phone) {
        const overlay = document.getElementById('disabled-overlay');
        if (overlay) overlay.classList.remove('hidden');
        openSettingsModal();
        if (ctx === 'buyer') {
            addMessage("Please complete your profile first to use the app.", "bot");
        } else {
            showToast("Please complete your store profile first.");
        }
    } else {
        const overlay = document.getElementById('disabled-overlay');
        if (overlay) overlay.classList.add('hidden');
    }
}

function updateProfileDisplay() {
    const ctx = getContext();
    if (!ctx) return;

    const name = localStorage.getItem(ctx + 'Name') || (ctx === 'buyer' ? 'Buyer' : 'Seller');
    const display = document.getElementById(ctx + '-username-display');
    if (display) display.textContent = name;
}

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    const content = document.getElementById('settings-modal-content');

    const ctx = getContext();
    if (ctx) {
        const nameInput = document.getElementById('setting-name');
        const phoneInput = document.getElementById('setting-phone');
        if (nameInput) nameInput.value = localStorage.getItem(ctx + 'Name') || '';
        if (phoneInput) phoneInput.value = localStorage.getItem(ctx + 'Phone') || '';
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        if (content) {
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        }
    }, 10);
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    const content = document.getElementById('settings-modal-content');

    if (content) {
        content.classList.remove('scale-100', 'opacity-100');
        content.classList.add('scale-95', 'opacity-0');
    }

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function saveSettings() {
    const ctx = getContext();
    if (!ctx) return;

    const nameInput = document.getElementById('setting-name');
    const phoneInput = document.getElementById('setting-phone');

    if (!nameInput || !phoneInput) return;

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (!name || !phone) {
        alert("Please fill in both Name and WhatsApp Number.");
        return;
    }

    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 11 || digitsOnly.length > 12) {
        alert("WhatsApp number must be 11-12 digits.");
        return;
    }

    localStorage.setItem(ctx + 'Name', name);
    localStorage.setItem(ctx + 'Phone', digitsOnly);

    updateProfileDisplay();
    closeSettingsModal();
    const overlay = document.getElementById('disabled-overlay');
    if (overlay) overlay.classList.add('hidden');
    showToast("Profile Updated!");
}

// ----------------------------------------------------
// BUYER SPECIFIC VARIABLES & FUNCTIONS
// ----------------------------------------------------
function getCartId() {
    let id = localStorage.getItem('em_cart_id');
    if (!id) { id = 'CRT-' + Date.now() + Math.random().toString(36).slice(2, 9); localStorage.setItem('em_cart_id', id); }
    return id;
}

const CART_ID = getCartId();
let currentView = 'buyer';
let currentRequestId = null;
let pollInterval = null;
let lastOffersJSON = '';

function switchView(view) {
    currentView = view;
    document.getElementById('buyer-view').classList.add('hidden');
    document.getElementById('history-container').classList.add('hidden');
    document.getElementById('cart-container').classList.add('hidden');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-' + view).classList.add('active');
    if (pollInterval) clearInterval(pollInterval);

    if (view === 'history') {
        document.getElementById('history-container').classList.remove('hidden');
        document.getElementById('history-container').classList.add('flex');
        loadHistory();
    } else if (view === 'cart') {
        document.getElementById('cart-container').classList.remove('hidden');
        document.getElementById('cart-container').classList.add('flex');
        loadCart();
    } else {
        document.getElementById('buyer-view').classList.remove('hidden');
        document.getElementById('buyer-view').classList.add('flex');
        if (currentRequestId) pollInterval = setInterval(fetchOffers, 2000);
    }
}

function handleFormAction() {
    if (currentRequestId) closeRequest();
    else sendRequest();
}

async function sendRequest() {
    const user = localStorage.getItem('buyerName');
    const phone = localStorage.getItem('buyerPhone');

    if (!user || !phone) {
        openSettingsModal();
        return;
    }

    const input = document.getElementById('user-input');
    const btn = document.getElementById('send-btn');
    const text = input.value.trim();
    if (!text) return;

    input.disabled = true; btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    navigator.geolocation.getCurrentPosition(async pos => {
        const coords = `${pos.coords.latitude},${pos.coords.longitude}`;
        addMessage(text, 'user');
        input.value = ''; lastOffersJSON = '';

        const fd = new FormData();
        fd.append('action', 'create_request');
        fd.append('description', text);
        fd.append('location', coords);
        fd.append('buyer_name', user);
        fd.append('buyer_phone', phone);
        try {
            const res = await fetch(API_URL, { method: 'POST', credentials: 'same-origin', body: fd });
            const text = await res.text();
            let data;
            try { 
                if (!text || text.trim() === '') {
                    throw new Error("Laporan: Server mengembalikan respon kosong atau blank (Empty Response). Kemungkinan fatal error pada backend atau masalah di sisi hosting.");
                }
                data = JSON.parse(text); 
            } catch (e) { 
                console.error("Raw response:", text);
                throw new Error("Server tidak mengembalikan format JSON yang benar. Response server: `" + text.substring(0, 200) + "`"); 
            }

            if (data.status === 'success') {
                currentRequestId = data.request_id;
                btn.disabled = false;
                btn.className = 'bg-red-500 text-white h-12 w-12 rounded-full font-bold hover:bg-red-600 active:scale-95 transition-all shadow-md flex items-center justify-center shrink-0';
                btn.innerHTML = '<i class="fas fa-times"></i>';
                addMessage('<span id="broadcast-text" class="flex items-center gap-2 text-indigo-600"><i class="fas fa-circle-notch fa-spin"></i> Broadcasting your request to nearby sellers...</span>', 'bot');
                pollInterval = setInterval(fetchOffers, 2000);
            } else {
                alert('Failed: ' + (data.error || 'Unknown error'));
                resetBuyerState('Request failed.');
            }
        } catch (err) {
            console.error("API Error:", err);
            alert(err.message || 'Network or Server Error');
            resetBuyerState('Request failed.');
        }
    }, () => { alert('Please enable GPS so sellers can calculate shipping.'); resetBuyerState('GPS access denied.'); });
}

async function closeRequest() {
    if (!currentRequestId) return;
    const btn = document.getElementById('send-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
    const fd = new FormData(); fd.append('action', 'close_request'); fd.append('request_id', currentRequestId);
    try { await fetch(API_URL, { method: 'POST', body: fd }); } catch { }
    resetBuyerState('Search cancelled.');
}

function resetBuyerState(msg) {
    if (pollInterval) clearInterval(pollInterval);
    currentRequestId = null; lastOffersJSON = '';
    const btn = document.getElementById('send-btn');
    const input = document.getElementById('user-input');
    if (btn) {
        btn.className = 'bg-indigo-600 text-white h-12 w-12 rounded-full font-bold hover:bg-indigo-700 active:scale-95 transition-all shadow-md flex items-center justify-center shrink-0 disabled:opacity-50';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>'; btn.disabled = false;
    }
    if (input) input.disabled = false;
    const bt = document.getElementById('broadcast-text');
    if (bt) bt.closest('.msg-bubble').remove();
    if (msg) addMessage(msg, 'bot');
    const old = document.getElementById('offer-container');
    if (old) old.remove();
}

async function fetchOffers() {
    if (!currentRequestId) return;
    const offers = await (await fetch(`${API_URL}?action=get_offers&request_id=${currentRequestId}`)).json();
    const j = JSON.stringify(offers);
    if (j !== lastOffersJSON) { renderAuction(offers); lastOffersJSON = j; }
}

function renderAuction(offers) {
    const area = document.getElementById('chat-area');
    const old = document.getElementById('offer-container'); if (old) old.remove();
    if (!offers.length) return;
    const bt = document.getElementById('broadcast-text');
    if (bt) bt.closest('.msg-bubble').remove();

    const wrap = document.createElement('div');
    wrap.id = 'offer-container'; wrap.className = 'w-full max-w-4xl';
    let html = `<div class="flex items-center gap-3 mb-4 pl-2"><div class="h-8 w-1 bg-indigo-500 rounded-full"></div><h3 class="font-bold text-slate-800 text-lg">Offers Received (${offers.length})</h3></div><div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;

    offers.forEach(o => {
        let qty = 1;
        try { if (o.parsed_items) { const it = JSON.parse(o.parsed_items); if (it.length) qty = it.reduce((s, i) => s + i.qty, 0); } } catch { }
        const unit = Math.round(o.price / qty);
        const img = o.image_path ? `<div class="h-32 w-full overflow-hidden rounded-t-xl"><img src="${o.image_path}" class="w-full h-full object-cover hover:scale-105 transition duration-500"></div>` : `<div class="h-20 w-full bg-slate-100 flex items-center justify-center rounded-t-xl"><i class="fas fa-box text-slate-300 text-3xl"></i></div>`;
        const sp = o.product_name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        html += `<div class="glass-card flex flex-col hover:-translate-y-1 transition-all duration-300 overflow-hidden">${img}<div class="p-5 flex-1 flex flex-col"><div class="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1"><i class="fas fa-store mr-1"></i>${o.seller_name}</div><div class="font-bold text-slate-800 text-lg mb-2 leading-tight">${o.product_name}</div><div class="mt-auto pt-4 flex flex-col gap-2 border-t border-slate-100"><div class="text-indigo-600 font-extrabold text-xl">Rp ${parseInt(o.price).toLocaleString()}</div><div class="flex gap-2"><button onclick="addToCart('${sp}','${o.seller_name}',${unit},'${o.image_path || ''}',${qty})" class="bg-indigo-100 text-indigo-700 font-bold p-2 px-3 rounded-lg hover:bg-indigo-200 transition text-sm flex-shrink-0" title="Add to Cart"><i class="fas fa-cart-plus"></i></button><button onclick="checkoutNow('${sp}',${o.price},${o.id})" class="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95 transition text-sm">Buy Now</button></div></div></div></div>`;
    });
    html += '</div>';
    wrap.innerHTML = html; area.appendChild(wrap);
    area.scrollTop = area.scrollHeight;
}

async function checkoutNow(name, price, offerId) {
    const user = localStorage.getItem('buyerName');
    const phone = localStorage.getItem('buyerPhone');
    if (!user || !phone) {
        openSettingsModal();
        return;
    }

    const fd = new FormData();
    fd.append('action', 'accept_offer');
    fd.append('offer_id', offerId);
    fd.append('buyer_name', user);
    fd.append('buyer_phone', phone);

    try {
        const data = await (await fetch(API_URL, { method: 'POST', body: fd })).json();
        if (data.status === 'success') {
            const msg = `Hello, I want to buy *${name}* for Rp ${parseInt(price).toLocaleString()} from ElektroMarket.`;
            const ph = data.contact.replace(/^0/, '62');
            window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank');
            resetBuyerState('Order confirmed! Continue on WhatsApp.');
        }
    } catch { alert('Failed to process order.'); }
}

function addMessage(text, type) {
    const area = document.getElementById('chat-area');
    if (!area) return;
    const div = document.createElement('div');
    div.className = `msg-bubble ${type === 'user' ? 'msg-user' : 'msg-bot flex gap-4'}`;
    if (type === 'bot') div.innerHTML = `<div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0"><i class="fas fa-info"></i></div><div>${text}</div>`;
    else div.innerHTML = text;
    area.appendChild(div); area.scrollTop = area.scrollHeight;
}

async function addToCart(product, seller, unitPrice, imgPath, qty = 1) {
    const fd = new FormData();
    fd.append('action', 'add_to_cart'); fd.append('cart_id', CART_ID);
    fd.append('product_name', product); fd.append('seller_name', seller);
    fd.append('price', unitPrice); fd.append('quantity', qty); fd.append('image_path', imgPath);
    await fetch(API_URL, { method: 'POST', body: fd });
    addMessage(`✅ <b>${product}</b> (${qty}x) added to cart!`, 'bot');
}

async function loadCart() {
    const items = await (await fetch(`${API_URL}?action=get_cart&cart_id=${CART_ID}`)).json();
    const list = document.getElementById('cart-list');
    const checkAll = document.getElementById('cart-check-all');
    if (checkAll) checkAll.checked = false;
    calculateCartTotal();

    if (!items.length) {
        list.innerHTML = `<div class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300"><i class="fas fa-shopping-cart text-4xl text-slate-300 mb-3"></i><p class="text-slate-500 font-medium">Your cart is empty.</p></div>`;
        return;
    }
    list.innerHTML = items.map(item => {
        const img = item.image_path ? `<img src="${item.image_path}" class="w-20 h-20 object-cover rounded-xl border border-slate-100 shrink-0 shadow-sm">` : `<div class="w-20 h-20 bg-slate-100 flex items-center justify-center rounded-xl text-slate-300"><i class="fas fa-box text-2xl"></i></div>`;
        return `<div class="glass-card p-4 flex items-center gap-4 transition-colors relative"><input type="checkbox" value="${item.id}" data-price="${item.price}" data-qty="${item.quantity}" onchange="calculateCartTotal()" class="cart-checkbox w-5 h-5 rounded text-indigo-600 cursor-pointer ml-2"/>${img}<div class="flex-1 min-w-0"><div class="font-bold text-slate-800 text-lg leading-tight truncate">${item.product_name}</div><div class="text-xs text-slate-500 mt-1"><i class="fas fa-store text-slate-400 mr-1"></i>${item.seller_name}</div><div class="text-indigo-600 font-black text-lg mt-2">Rp ${parseInt(item.price).toLocaleString()} <span class="text-xs text-slate-400 font-medium">/unit</span></div></div><div class="flex items-center bg-slate-100 rounded-lg p-1 mr-2 border border-slate-200"><button onclick="updateCartQty(${item.id},${parseInt(item.quantity) - 1})" class="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white hover:text-indigo-600 rounded-md transition font-bold"><i class="fas fa-minus text-xs"></i></button><input type="number" value="${item.quantity}" onchange="updateCartQty(${item.id},this.value)" min="0" class="w-12 text-center font-bold text-slate-800 text-sm bg-transparent border-none focus:ring-0 px-0 py-1 outline-none" style="-moz-appearance:textfield"/><button onclick="updateCartQty(${item.id},${parseInt(item.quantity) + 1})" class="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white hover:text-indigo-600 rounded-md transition font-bold"><i class="fas fa-plus text-xs"></i></button></div></div>`;
    }).join('');
}

async function updateCartQty(id, newQty) {
    const qty = parseInt(newQty); if (isNaN(qty)) return;
    const fd = new FormData(); fd.append('action', 'update_cart_qty'); fd.append('item_id', id); fd.append('quantity', qty);
    await fetch(API_URL, { method: 'POST', body: fd }); loadCart();
}

function toggleAllCartItems(el) {
    document.querySelectorAll('.cart-checkbox').forEach(cb => cb.checked = el.checked);
    calculateCartTotal();
}

function calculateCartTotal() {
    let total = 0, count = 0;
    const checked = document.querySelectorAll('.cart-checkbox:checked');
    const all = document.querySelectorAll('.cart-checkbox');
    checked.forEach(cb => { total += parseInt(cb.dataset.price) * parseInt(cb.dataset.qty); count++; });

    const totalPriceEl = document.getElementById('cart-total-price');
    const selCountEl = document.getElementById('cart-selected-count');
    const btnCheckout = document.getElementById('btn-checkout');
    const btnDel = document.getElementById('btn-delete-cart');
    const checkAll = document.getElementById('cart-check-all');

    if (totalPriceEl) totalPriceEl.innerText = `Rp ${total.toLocaleString()}`;
    if (selCountEl) selCountEl.innerText = count;
    if (btnCheckout) btnCheckout.disabled = count === 0;

    if (btnDel) {
        count > 0 ? btnDel.classList.remove('hidden') : btnDel.classList.add('hidden');
    }

    if (checkAll) {
        checkAll.checked = count > 0 && count === all.length;
        checkAll.indeterminate = count > 0 && count < all.length;
    }
}

async function deleteSelectedCartItems() {
    const ids = Array.from(document.querySelectorAll('.cart-checkbox:checked')).map(cb => cb.value);
    if (!ids.length || !confirm('Remove selected items from cart?')) return;
    const fd = new FormData(); fd.append('action', 'delete_cart_items'); fd.append('item_ids', JSON.stringify(ids));
    await fetch(API_URL, { method: 'POST', body: fd }); loadCart();
}

async function processCartCheckout() {
    const ids = Array.from(document.querySelectorAll('.cart-checkbox:checked')).map(cb => cb.value);
    if (!ids.length) return;

    const user = localStorage.getItem('buyerName');
    const phone = localStorage.getItem('buyerPhone');
    if (!user || !phone) {
        openSettingsModal();
        return;
    }

    const btn = document.getElementById('btn-checkout');
    const orig = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; btn.disabled = true;

    const fd = new FormData();
    fd.append('action', 'checkout_cart');
    fd.append('cart_id', CART_ID);
    fd.append('buyer_name', user);
    fd.append('contact', phone);
    fd.append('item_ids', JSON.stringify(ids));

    try {
        const data = await (await fetch(API_URL, { method: 'POST', body: fd })).json();
        if (data.status === 'success') {
            alert(`Order placed! Checkout ID: ${data.checkout_id}`);
            let msg = `Hello ElektroMarket, order ID: *${data.checkout_id}*\n\nItems:\n`;
            data.items.forEach((item, i) => { msg += `${i + 1}. ${item.product_name} (${item.quantity}x) - Rp ${(item.price * item.quantity).toLocaleString()}\n`; });
            msg += `\n*Total: Rp ${data.total.toLocaleString()}*`;
            window.open(`https://wa.me/6281234567890?text=${encodeURIComponent(msg)}`, '_blank');
            loadCart(); switchView('history');
        }
    } catch { alert('Checkout failed. Please try again.'); }
    finally { btn.innerHTML = orig; btn.disabled = false; }
}

async function loadHistory() {
    const phone = localStorage.getItem('buyerPhone');
    const list = document.getElementById('history-list');
    if (!list) return;

    if (!phone) {
        list.innerHTML = `<div class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300"><p class="text-slate-500 font-medium">Please set your profile to see history.</p></div>`;
        return;
    }

    const orders = await (await fetch(`${API_URL}?action=get_orders&buyer_phone=${phone}`)).json();

    if (!orders.length) {
        list.innerHTML = `<div class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300"><i class="fas fa-folder-open text-4xl text-slate-300 mb-3"></i><p class="text-slate-500 font-medium">No orders yet.</p></div>`;
        return;
    }
    list.innerHTML = orders.map(o => {
        const date = new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const img = o.image_path ? `<img src="${o.image_path}" class="w-20 h-20 object-cover rounded-xl border border-slate-100 shrink-0 shadow-sm">` : `<div class="w-20 h-20 bg-slate-100 flex items-center justify-center rounded-xl text-slate-300"><i class="fas fa-image text-2xl"></i></div>`;
        return `<div class="glass-card p-5 flex items-center gap-5 hover:border-indigo-100 transition-colors" id="order-row-${o.id}">${img}<div class="flex-1 min-w-0"><div class="flex justify-between items-start mb-2"><div><div class="font-bold text-slate-800 text-lg">${escapeHTML(o.product_name)}</div><div class="text-sm text-slate-500 mt-1 font-medium"><i class="fas fa-store text-slate-400 mr-1"></i>${escapeHTML(o.seller_name)}</div></div><div class="text-right"><div class="text-indigo-600 font-black text-xl mb-1">Rp ${parseInt(o.total_price).toLocaleString()}</div><span class="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Completed</span></div></div><div class="flex justify-between items-center border-t border-slate-100 pt-3 mt-1"><div class="text-xs text-slate-400 font-medium"><i class="far fa-calendar-alt mr-1"></i>${date}</div><div class="flex items-center gap-3">${o.location ? `<a href="https://www.google.com/maps?q=${o.location}" target="_blank" class="text-xs text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-1"><i class="fas fa-map-pin"></i> Location</a>` : ''}<button onclick="deleteOrder(${o.id},'${escapeHTML(o.seller_name).replace(/'/g, "\\'")}',' ${escapeHTML(o.product_name).replace(/'/g, "\\'")}')" class="text-xs text-red-400 hover:text-red-600 font-bold flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition" title="Delete this history item"><i class="fas fa-trash-alt"></i> Delete</button></div></div></div></div>`;
    }).join('');
}

async function deleteOrder(id, sellerName, productName) {
    if (!confirm(`Remove "${productName}" from your order history?`)) return;
    const fd = new FormData();
    fd.append('action', 'delete_order');
    fd.append('id', id);
    try {
        const data = await (await fetch(API_URL, { method: 'POST', body: fd })).json();
        if (data.status === 'success') {
            const row = document.getElementById(`order-row-${id}`);
            if (row) row.remove();
            const list = document.getElementById('history-list');
            if (!list.children.length) {
                list.innerHTML = `<div class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300"><i class="fas fa-folder-open text-4xl text-slate-300 mb-3"></i><p class="text-slate-500 font-medium">No orders yet.</p></div>`;
            }
        } else {
            alert('Failed to delete order. Please try again.');
        }
    } catch (err) {
        alert('Network error (' + err.message + '). Please try again.');
    }
}

// ----------------------------------------------------
// SELLER SPECIFIC VARIABLES & FUNCTIONS
// ----------------------------------------------------
let sellerInterval = null;
let detailMap = null;
let detailMarker = null;
let renderedIds = new Set();
let allRequests = [];
let activeRequestId = null;
let currentSellerView = 'requests';

function compressImage(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = ev => {
            const img = new Image();
            img.src = ev.target.result;
            img.onload = () => {
                const MAX = 800;
                let w = img.width, h = img.height;
                if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', 0.82);
            };
        };
    });
}

function toggleSidebar() {
    const sidebar = document.getElementById('seller-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar || !overlay) return;
    const isOpen = sidebar.classList.contains('open');
    sidebar.classList.toggle('open', !isOpen);
    overlay.classList.toggle('open', !isOpen);
    document.body.style.overflow = isOpen ? '' : 'hidden';
}

function relativeTime(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

function initSeller() {
    startPolling();

    const btnRequests = document.getElementById('selnav-requests');
    const btnHistory = document.getElementById('selnav-history');

    if (btnRequests) {
        btnRequests.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            switchSellerView('requests');
        });
    }

    if (btnHistory) {
        btnHistory.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            switchSellerView('history');
        });
    }

    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');

    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', e => {
            if (!e.target.closest('#upload-preview')) fileInput.click();
        });

        uploadArea.addEventListener('dragover', e => {
            e.preventDefault(); e.stopPropagation();
            uploadArea.classList.add('drag-active');
        });

        uploadArea.addEventListener('dragleave', e => {
            e.preventDefault(); e.stopPropagation();
            uploadArea.classList.remove('drag-active');
        });

        uploadArea.addEventListener('drop', e => {
            e.preventDefault(); e.stopPropagation();
            uploadArea.classList.remove('drag-active');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                fileInput.files = files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }
}

function switchSellerView(view) {
    currentSellerView = view;
    const reqPanel = document.getElementById('seller-requests-panel');
    const histPanel = document.getElementById('seller-history-panel');
    const btnReq = document.getElementById('selnav-requests');
    const btnHist = document.getElementById('selnav-history');

    if (!reqPanel || !histPanel) return;

    if (view === 'history') {
        reqPanel.style.display = 'none';
        histPanel.style.display = 'flex';
        btnReq.classList.remove('active');
        btnHist.classList.add('active');
        loadSellerHistory();
    } else {
        histPanel.style.display = 'none';
        reqPanel.style.display = 'flex';
        btnHist.classList.remove('active');
        btnReq.classList.add('active');
    }
}

async function loadSellerHistory() {
    const list = document.getElementById('seller-history-list');
    if (!list) return;
    const phone = localStorage.getItem('sellerPhone');

    if (!phone) {
        list.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm"><i class="fas fa-folder-open mr-2"></i>Please set your profile to see history.</div>`;
        return;
    }

    list.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm"><i class="fas fa-circle-notch fa-spin mr-2"></i>Loading history…</div>`;
    try {
        const url = `${API_URL}?action=get_seller_offers&seller_phone=${encodeURIComponent(phone)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            list.innerHTML = `<div class="p-6 text-center text-red-400 text-sm">Error: ${data.error}</div>`;
            return;
        }

        let items = [];
        if (data.items && Array.isArray(data.items)) {
            items = data.items;
        } else if (Array.isArray(data)) {
            items = data;
        }

        if (!items || items.length === 0) {
            list.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm"><i class="fas fa-folder-open mr-2"></i>No offers or orders yet.</div>`;
            return;
        }

        list.innerHTML = items.map(item => {
            const date = new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const img = item.image_path
                ? `<img src="${item.image_path}" class="w-10 h-10 object-cover rounded-lg border border-slate-100 shrink-0">`
                : `<div class="w-10 h-10 bg-slate-100 flex items-center justify-center rounded-lg text-slate-300 shrink-0"><i class="fas fa-box text-sm"></i></div>`;

            let statusBadge = '';
            let deleteBtn = '';

            if (item.status === 'completed') {
                statusBadge = `<span class="text-xs bg-emerald-50 text-emerald-600 font-bold px-2 py-1 rounded">✓ Completed</span>`;
                deleteBtn = `<button onclick="deleteSellerOrder(${item.id})" class="text-red-400 hover:text-red-600 text-xs mt-2 flex items-center gap-1 ml-auto transition" title="Delete this order"><i class="fas fa-trash-alt"></i></button>`;
            } else {
                statusBadge = `<span class="text-xs bg-amber-50 text-amber-600 font-bold px-2 py-1 rounded">⏳ Pending</span>`;
                deleteBtn = `<button onclick="deleteSellerOffer(${item.id})" class="text-red-400 hover:text-red-600 text-xs mt-2 flex items-center gap-1 ml-auto transition" title="Delete this offer"><i class="fas fa-trash-alt"></i></button>`;
            }

            const itemId = item.status === 'completed' ? `seller-order-row-${item.id}` : `seller-offer-row-${item.id}`;
            return `<div class="seller-hist-card" id="${itemId}">${img}<div class="flex-1 min-w-0"><div class="font-semibold text-slate-800 text-sm truncate">${escapeHTML(item.product_name)}</div><div class="text-xs text-slate-400 mt-0.5"><i class="fas fa-user mr-1"></i>${escapeHTML(item.buyer_name)} • Rp ${parseInt(item.price).toLocaleString()}</div><div class="text-xs text-slate-400 mt-1"><i class="fas fa-calendar mr-1"></i>${date}</div></div><div class="text-right shrink-0">${statusBadge}${deleteBtn}</div></div>`;
        }).join('');
    } catch (error) {
        list.innerHTML = `<div class="p-6 text-center text-red-400 text-sm">Error: ${error.message}</div>`;
    }
}

async function deleteSellerOffer(id) {
    if (!confirm('Remove this offer from history?')) return;
    const fd = new FormData();
    fd.append('action', 'delete_offer_from_history');
    fd.append('id', id);
    try {
        const data = await (await fetch(API_URL, { method: 'POST', body: fd })).json();
        if (data.status === 'success') {
            const row = document.getElementById(`seller-offer-row-${id}`);
            if (row) row.remove();
            const list = document.getElementById('seller-history-list');
            if (list && !list.children.length) {
                list.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm"><i class="fas fa-folder-open mr-2"></i>No offers or orders yet.</div>`;
            }
        } else {
            alert('Failed to delete offer.');
        }
    } catch (err) {
        alert('Network error (' + err.message + '). Please try again.');
    }
}

async function deleteSellerOrder(id) {
    if (!confirm('Remove this order from history?')) return;
    const fd = new FormData();
    fd.append('action', 'delete_order');
    fd.append('id', id);
    try {
        const data = await (await fetch(API_URL, { method: 'POST', body: fd })).json();
        if (data.status === 'success') {
            const row = document.getElementById(`seller-order-row-${id}`);
            if (row) row.remove();
            const list = document.getElementById('seller-history-list');
            if (list && !list.children.length) {
                list.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm"><i class="fas fa-folder-open mr-2"></i>No offers or orders yet.</div>`;
            }
        } else {
            alert('Failed to delete order.');
        }
    } catch (err) {
        alert('Network error (' + err.message + '). Please try again.');
    }
}

function updateLiveBadge(isOnline, count = 0) {
    const b1 = document.getElementById('live-badge');
    const b2 = document.getElementById('live-badge-mobile');
    const lbl = document.getElementById('live-label');
    if (!b1 || !lbl) return;
    if (isOnline) {
        b1.className = 'live-badge online'; if (b2) b2.className = 'live-badge online';
        lbl.textContent = 'Live';
    } else {
        b1.className = 'live-badge offline'; if (b2) b2.className = 'live-badge offline';
        lbl.textContent = 'Offline';
    }
}

function startPolling() { loadRequests(); sellerInterval = setInterval(loadRequests, 3000); }
function stopPolling() { if (sellerInterval) clearInterval(sellerInterval); }

async function loadRequests() {
    try {
        const reqs = await (await fetch(`${API_URL}?action=get_requests`)).json();
        allRequests = reqs;
        updateLiveBadge(true, reqs.length);
        syncRequestList(reqs);
    } catch { updateLiveBadge(false, 0); }
}

function filterRequests(q) {
    q = q.toLowerCase();
    document.querySelectorAll('.req-card').forEach(card => {
        const desc = card.getAttribute('data-desc');
        card.style.display = desc.includes(q) ? 'block' : 'none';
    });
}

function syncRequestList(requests) {
    const list = document.getElementById('request-list');
    const emptyEl = document.getElementById('empty-state');
    if (!list || !emptyEl) return;

    const serverIds = new Set(requests.map(r => parseInt(r.id)));

    renderedIds.forEach(id => {
        if (!serverIds.has(id)) {
            document.getElementById(`req-card-${id}`)?.remove();
            renderedIds.delete(id);
            if (activeRequestId === id) showIdlePanel();
        }
    });

    [...requests].reverse().forEach(req => {
        const id = parseInt(req.id);
        if (renderedIds.has(id)) return;
        const card = buildRequestCard(req);
        list.insertBefore(card, emptyEl.nextSibling);
        renderedIds.add(id);
        if (renderedIds.size > 1) showToast('New request received!');
    });

    const has = renderedIds.size > 0;
    emptyEl.classList.toggle('hidden', has);
    const badge = document.getElementById('req-count-badge');
    if (badge) {
        badge.textContent = renderedIds.size;
        badge.classList.toggle('hidden', renderedIds.size === 0);
    }
    const statPending = document.getElementById('stat-pending');
    if (statPending) statPending.textContent = `${renderedIds.size} Active Requests`;

    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.value) filterRequests(searchInput.value);
}

function buildRequestCard(req) {
    const card = document.createElement('div');
    card.id = `req-card-${req.id}`;
    card.className = 'req-card';
    card.setAttribute('data-desc', req.description.toLowerCase());
    card.onclick = () => selectRequest(req.id);

    let qtyInfo = '', totalQty = 1;
    if (req.parsed_items) {
        try {
            const items = JSON.parse(req.parsed_items);
            totalQty = items.reduce((s, i) => s + i.qty, 0);
            qtyInfo = `<span class="req-qty"><i class="fas fa-cubes mr-1"></i>${totalQty} unit</span>`;
        } catch { }
    }
    const buyerLabel = escapeHTML(req.buyer_name || 'Buyer');
    const buyerPhone = escapeHTML(req.buyer_phone || '');
    const phoneHtml = buyerPhone ? `<div class="text-[10px] text-slate-400 mt-0.5"><i class="fas fa-phone mr-1"></i>${buyerPhone}</div>` : '';
    card.innerHTML = `<div class="req-card-inner"><div class="req-avatar"><i class="fas fa-user"></i></div><div class="req-info"><div class="req-top"><span class="req-name">${buyerLabel}</span><span class="req-time">${relativeTime(req.created_at)}</span></div>${phoneHtml}<div class="req-desc mt-1">${escapeHTML(req.description)}</div><div class="req-tags">${qtyInfo}${req.location ? '<span class="req-loc"><i class="fas fa-map-marker-alt mr-1"></i>Location Available</span>' : ''}</div></div></div>`;
    card._data = req;
    return card;
}

function selectRequest(reqId) {
    activeRequestId = reqId;
    document.querySelectorAll('.req-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`req-card-${reqId}`)?.classList.add('active');
    const req = allRequests.find(r => parseInt(r.id) === parseInt(reqId));
    if (req) showActivePanel(req);
    const sidebar = document.getElementById('seller-sidebar');
    if (sidebar && sidebar.classList.contains('open')) toggleSidebar();
}

function showActivePanel(req) {
    document.getElementById('idle-panel').classList.add('hidden');
    document.getElementById('active-panel').classList.remove('hidden');
    document.querySelector('.detail-panel').classList.add('panel-open');
    populateDetailHeader(req);
    initDetailMap(req);
    prefillForm(req);
    resetFormUI();
}

function showIdlePanel() {
    activeRequestId = null;
    const activePanel = document.getElementById('active-panel');
    const idlePanel = document.getElementById('idle-panel');
    if (activePanel) activePanel.classList.add('hidden');
    if (idlePanel) idlePanel.classList.remove('hidden');
    document.querySelectorAll('.req-card').forEach(c => c.classList.remove('active'));
    const detailPanel = document.querySelector('.detail-panel');
    if (detailPanel) detailPanel.classList.remove('panel-open');
}

function populateDetailHeader(req) {
    let totalQty = 1, qtyBadges = '';
    if (req.parsed_items) {
        try {
            const items = JSON.parse(req.parsed_items);
            totalQty = items.reduce((s, i) => s + i.qty, 0);
            qtyBadges = items.map(i => `<span class="hdr-badge"><i class="fas fa-cube mr-1 text-indigo-400"></i>${i.item} × ${i.qty}</span>`).join('');
        } catch { }
    }
    const mapLink = req.location ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(req.location)}" target="_blank" class="hdr-map-btn"><i class="fas fa-map-marked-alt"></i> Open Maps</a>` : '';
    document.getElementById('detail-header').innerHTML = `<div class="hdr-left"><button class="hdr-back-btn" onclick="showIdlePanel()"><i class="fas fa-arrow-left"></i></button><div><div class="hdr-desc">"${escapeHTML(req.description)}"</div><div class="hdr-badges">${qtyBadges || `<span class="hdr-badge"><i class="fas fa-cube mr-1 text-indigo-400"></i>Qty: ${totalQty}</span>`}<span class="hdr-badge text-slate-500"><i class="fas fa-clock mr-1"></i>${relativeTime(req.created_at)}</span></div></div></div><div class="hdr-right">${mapLink}</div>`;
}

function prefillForm(req) {
    let totalQty = 1, firstName = req.description;
    if (req.parsed_items) {
        try { const items = JSON.parse(req.parsed_items); totalQty = items.reduce((s, i) => s + i.qty, 0); firstName = items[0]?.item || firstName; } catch { }
    }
    document.getElementById('form-request-id').value = req.id;
    document.getElementById('form-total-qty').value = totalQty;
    document.getElementById('offer-form').dataset.itemName = firstName;

    // Auto-fill seller name if available
    const name = localStorage.getItem('sellerName');
    if (name) {
        const inpSeller = document.getElementById('inp-seller');
        if (inpSeller) inpSeller.value = name;
    }

    // Auto-fill seller phone if available
    const phone = localStorage.getItem('sellerPhone');
    if (phone) {
        const inpPhone = document.getElementById('inp-seller-phone');
        if (inpPhone) inpPhone.value = phone;
    }
}

function initDetailMap(req) {
    let coords = [-6.285, 107.17];
    if (req.location) { const p = req.location.split(','); if (p.length === 2) coords = [parseFloat(p[0]), parseFloat(p[1])]; }
    if (!detailMap) {
        detailMap = L.map('detail-map', { zoomControl: false }).setView(coords, 14);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }).addTo(detailMap);
        L.control.zoom({ position: 'bottomleft' }).addTo(detailMap);
    } else { detailMap.setView(coords, 14); }
    if (detailMarker) detailMap.removeLayer(detailMarker);
    if (req.location) {
        const icon = L.divIcon({ className: '', html: `<div class="map-pin-dot"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
        detailMarker = L.marker(coords, { icon }).addTo(detailMap).bindPopup(`<b style="font-family:'Plus Jakarta Sans'">${escapeHTML(req.description)}</b>`).openPopup();
        document.getElementById('map-badge').style.display = 'flex';
    } else { document.getElementById('map-badge').style.display = 'none'; }
    setTimeout(() => detailMap.invalidateSize(), 350);
}

function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('❌ Please select an image file (JPG, PNG, etc.)');
        document.getElementById('file-input').value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById('preview-img').src = e.target.result;
        document.getElementById('preview-name').textContent = file.name;
        document.getElementById('upload-placeholder').classList.add('hidden');
        document.getElementById('upload-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function clearImage() {
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
    const uploadPreview = document.getElementById('upload-preview');
    if (uploadPreview) uploadPreview.classList.add('hidden');
    const uploadPlaceholder = document.getElementById('upload-placeholder');
    if (uploadPlaceholder) uploadPlaceholder.classList.remove('hidden');
}

function resetFormUI() {
    const inpProduct = document.getElementById('inp-product');
    const inpPrice = document.getElementById('inp-price');
    if (inpProduct) inpProduct.value = '';
    if (inpPrice) inpPrice.value = '';
    clearImage();
    const flash = document.getElementById('success-flash');
    if (flash) {
        flash.classList.add('hidden');
        flash.classList.remove('flash-in', 'fade-out');
    }
}

function showSuccessFlash() {
    const flash = document.getElementById('success-flash');
    if (!flash) return;
    flash.classList.remove('hidden', 'fade-out'); flash.classList.add('flash-in');
    setTimeout(() => { flash.classList.add('fade-out'); setTimeout(() => flash.classList.add('hidden'), 500); }, 3000);
}

async function submitOffer(e) {
    e.preventDefault();

    const user = localStorage.getItem('sellerName');
    const phone = localStorage.getItem('sellerPhone');
    if (!user || !phone) {
        openSettingsModal();
        return;
    }

    const form = document.getElementById('offer-form');
    const btn = document.getElementById('submit-btn');
    const label = document.getElementById('submit-label');
    const reqId = parseInt(document.getElementById('form-request-id').value);
    const qty = parseInt(document.getElementById('form-total-qty').value) || 1;
    if (!reqId) return;

    btn.disabled = true; btn.querySelector('i').className = 'fas fa-spinner fa-spin'; label.textContent = 'Sending…';
    const fd = new FormData(form);
    const totalPrice = (parseInt(fd.get('price')) || 0) * qty;
    const fileInput = document.getElementById('file-input');
    if (fileInput.files.length) fd.set('product_image', await compressImage(fileInput.files[0]));

    fd.set('action', 'add_offer');
    fd.set('request_id', reqId);
    fd.set('seller_name', user);
    fd.set('seller_phone', phone);
    fd.set('contact', phone);
    fd.set('price', totalPrice);

    try {
        const data = await (await fetch(API_URL, { method: 'POST', body: fd })).json();
        if (data.status === 'success') { showSuccessFlash(); resetFormUI(); }
        else alert('Failed to send: ' + (data.error || 'Unknown error'));
    } catch (err) { alert('Network error in sendOffer (' + err.message + '). Please try again!'); }
    finally { btn.disabled = false; btn.querySelector('i').className = 'fas fa-paper-plane'; label.textContent = 'Send Offer'; }
}

async function getSmartPrice() {
    const form = document.getElementById('offer-form');
    const keyword = (form.dataset.itemName || '').trim().split(' ')[0];
    const box = document.getElementById('price-suggestion');
    const icon = document.getElementById('smart-price-icon');
    if (!keyword) return;
    icon.className = 'fas fa-spinner fa-spin';
    try {
        const data = await (await fetch(`${API_URL}?action=suggest_price&item=${encodeURIComponent(keyword)}`)).json();
        box.classList.remove('hidden');
        if (data.price) {
            box.innerHTML = `<i class="fas fa-chart-line mr-1.5"></i>Market Price: <strong>Rp ${parseInt(data.price).toLocaleString()}</strong><button type="button" onclick="document.getElementById('inp-price').value=${data.price};document.getElementById('price-suggestion').classList.add('hidden')" class="use-price-btn">Use this</button>`;
        } else {
            box.innerHTML = `<i class="fas fa-info-circle mr-1.5"></i>No market data for "<strong>${escapeHTML(keyword)}</strong>".`;
            setTimeout(() => box.classList.add('hidden'), 3500);
        }
    } catch { box.classList.add('hidden'); }
    finally { icon.className = 'fas fa-magic'; }
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
function initBuyer() {
    switchView(currentView);
}

document.addEventListener('DOMContentLoaded', () => {
    updateProfileDisplay();
    checkProfileValidation();

    const ctx = getContext();
    if (ctx === 'buyer') {
        initBuyer();
    } else if (ctx === 'seller') {
        initSeller();
    }
});
