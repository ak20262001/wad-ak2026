/* ElektroMarket — app.js (merged: buyer + seller) */

// ════════════════════════════════════════════════
// SHARED CONFIG & UTILITIES
// ════════════════════════════════════════════════
const API_URL = 'api.php';

// Read cookie value by name
function getCookie(name) {
    const v = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return v ? decodeURIComponent(v.pop()) : '';
}

const USER_ROLE = getCookie('em_role'); // 'buyer' | 'seller'
const USERNAME  = getCookie('em_user') || 'User';

// Session cart ID (persisted in localStorage)
function getCartId() {
    let id = localStorage.getItem('em_cart_id');
    if (!id) { id = 'CRT-' + Date.now() + Math.random().toString(36).slice(2,9); localStorage.setItem('em_cart_id', id); }
    return id;
}
const CART_ID = getCartId();

// Escape HTML to prevent XSS
function escapeHTML(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// Compress image to max 800px JPEG before upload
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
                if (w > h && w > MAX) { h = Math.round(h*MAX/w); w = MAX; }
                else if (h > MAX) { w = Math.round(w*MAX/h); h = MAX; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => resolve(new File([blob], file.name, {type:'image/jpeg'})), 'image/jpeg', 0.82);
            };
        };
    });
}

// Sign out — clears session via auth_system.php
function logout() { window.location.href = 'auth_system.php?logout=1'; }

// Toggle seller sidebar on mobile (slide in / out)
function toggleSidebar() {
    const sidebar  = document.getElementById('seller-sidebar');
    const overlay  = document.getElementById('sidebar-overlay');
    const isOpen   = sidebar.classList.contains('open');
    sidebar.classList.toggle('open', !isOpen);
    overlay.classList.toggle('open', !isOpen);
    // Prevent body scroll when sidebar is open
    document.body.style.overflow = isOpen ? '' : 'hidden';
}

// ════════════════════════════════════════════════
// BOOT — show correct section based on role
// ════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    if (!USER_ROLE) { window.location.href = 'auth_system.php'; return; }

    if (USER_ROLE === 'buyer') {
        document.getElementById('buyer-section').style.display = '';
        document.getElementById('buyer-username-display').textContent = USERNAME + ' (Buyer)';
        initBuyer();
    } else if (USER_ROLE === 'seller') {
        document.getElementById('seller-section').style.display = '';
        document.getElementById('seller-username-display').textContent = USERNAME;
        initSeller();
    }
});

// ════════════════════════════════════════════════
// BUYER MODULE
// ════════════════════════════════════════════════
let currentView = 'buyer';
let currentRequestId = null;
let pollInterval = null;
let lastOffersJSON = '';

function initBuyer() { /* starts idle, waits for user input */ }

// Switch between buyer views: find/history/cart
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

// Toggle between send and cancel based on state
function handleFormAction() {
    if (currentRequestId) closeRequest();
    else sendRequest();
}

// Send a new item request (requires GPS)
async function sendRequest() {
    const input = document.getElementById('user-input');
    const btn   = document.getElementById('send-btn');
    const text  = input.value.trim();
    if (!text) return;

    input.disabled = true; btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    navigator.geolocation.getCurrentPosition(async pos => {
        const coords = `${pos.coords.latitude},${pos.coords.longitude}`;
        addMessage(text, 'user');
        input.value = ''; lastOffersJSON = '';

        const fd = new FormData();
        // Include the real buyer username so sellers see the correct name
        fd.append('action','create_request'); fd.append('description',text); fd.append('location',coords);
        fd.append('buyer_name', USERNAME);
        try {
            const data = await (await fetch(API_URL, {method:'POST',body:fd})).json();
            if (data.status === 'success') {
                currentRequestId = data.request_id;
                btn.disabled = false;
                btn.className = 'bg-red-500 text-white h-12 w-12 rounded-full font-bold hover:bg-red-600 active:scale-95 transition-all shadow-md flex items-center justify-center';
                btn.innerHTML = '<i class="fas fa-times"></i>';
                addMessage('<span id="broadcast-text" class="flex items-center gap-2 text-indigo-600"><i class="fas fa-circle-notch fa-spin"></i> Broadcasting your request to nearby sellers...</span>', 'bot');
                pollInterval = setInterval(fetchOffers, 2000);
            }
        } catch { alert('Network error. Please try again.'); resetBuyerState('Request failed.'); }
    }, () => { alert('Please enable GPS so sellers can calculate shipping.'); resetBuyerState('GPS access denied.'); });
}

// Cancel the active request
async function closeRequest() {
    if (!currentRequestId) return;
    const btn = document.getElementById('send-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
    const fd = new FormData(); fd.append('action','close_request'); fd.append('request_id',currentRequestId);
    try { await fetch(API_URL, {method:'POST',body:fd}); } catch {}
    resetBuyerState('Search cancelled.');
}

// Reset buyer to idle state
function resetBuyerState(msg) {
    if (pollInterval) clearInterval(pollInterval);
    currentRequestId = null; lastOffersJSON = '';
    const btn   = document.getElementById('send-btn');
    const input = document.getElementById('user-input');
    if (btn) {
        btn.className = 'bg-indigo-600 text-white h-12 w-12 rounded-full font-bold hover:bg-indigo-700 active:scale-95 transition-all shadow-md flex items-center justify-center disabled:opacity-50';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>'; btn.disabled = false;
    }
    if (input) input.disabled = false;
    const bt = document.getElementById('broadcast-text');
    if (bt) bt.closest('.msg-bubble').remove();
    if (msg) addMessage(msg, 'bot');
    const old = document.getElementById('offer-container');
    if (old) old.remove();
}

// Poll for new offers on active request
async function fetchOffers() {
    if (!currentRequestId) return;
    const offers = await (await fetch(`${API_URL}?action=get_offers&request_id=${currentRequestId}`)).json();
    const j = JSON.stringify(offers);
    if (j !== lastOffersJSON) { renderAuction(offers); lastOffersJSON = j; }
}

// Render offer cards in chat area
function renderAuction(offers) {
    const area = document.getElementById('chat-area');
    const old  = document.getElementById('offer-container'); if (old) old.remove();
    if (!offers.length) return;
    const bt = document.getElementById('broadcast-text');
    if (bt) bt.closest('.msg-bubble').remove();

    const wrap = document.createElement('div');
    wrap.id = 'offer-container'; wrap.className = 'w-full max-w-4xl';
    let html = `<div class="flex items-center gap-3 mb-4 pl-2"><div class="h-8 w-1 bg-indigo-500 rounded-full"></div><h3 class="font-bold text-slate-800 text-lg">Offers Received (${offers.length})</h3></div><div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;

    offers.forEach(o => {
        let qty = 1;
        try { if(o.parsed_items){ const it=JSON.parse(o.parsed_items); if(it.length) qty=it.reduce((s,i)=>s+i.qty,0); } } catch {}
        const unit = Math.round(o.price / qty);
        const img  = o.image_path ? `<div class="h-32 w-full overflow-hidden rounded-t-xl"><img src="${o.image_path}" class="w-full h-full object-cover hover:scale-105 transition duration-500"></div>` : `<div class="h-20 w-full bg-slate-100 flex items-center justify-center rounded-t-xl"><i class="fas fa-box text-slate-300 text-3xl"></i></div>`;
        const sp   = o.product_name.replace(/'/g,"\\'").replace(/"/g,'&quot;');
        html += `<div class="glass-card flex flex-col hover:-translate-y-1 transition-all duration-300 overflow-hidden">${img}<div class="p-5 flex-1 flex flex-col"><div class="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1"><i class="fas fa-store mr-1"></i>${o.seller_name}</div><div class="font-bold text-slate-800 text-lg mb-2 leading-tight">${o.product_name}</div><div class="mt-auto pt-4 flex flex-col gap-2 border-t border-slate-100"><div class="text-indigo-600 font-extrabold text-xl">Rp ${parseInt(o.price).toLocaleString()}</div><div class="flex gap-2"><button onclick="addToCart('${sp}','${o.seller_name}',${unit},'${o.image_path||''}',${qty})" class="bg-indigo-100 text-indigo-700 font-bold p-2 px-3 rounded-lg hover:bg-indigo-200 transition text-sm flex-shrink-0" title="Add to Cart"><i class="fas fa-cart-plus"></i></button><button onclick="checkoutNow('${sp}',${o.price},${o.id})" class="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95 transition text-sm">Buy Now</button></div></div></div></div>`;
    });
    html += '</div>';
    wrap.innerHTML = html; area.appendChild(wrap);
    area.scrollTop = area.scrollHeight;
}

// Direct checkout (single offer)
async function checkoutNow(name, price, offerId) {
    const fd = new FormData(); fd.append('action','accept_offer'); fd.append('offer_id',offerId);
    try {
        const data = await (await fetch(API_URL,{method:'POST',body:fd})).json();
        if (data.status === 'success') {
            const msg = `Hello, I want to buy *${name}* for Rp ${parseInt(price).toLocaleString()} from ElektroMarket.`;
            const ph  = data.contact.replace(/^0/,'62');
            window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank');
            resetBuyerState('Order confirmed! Continue on WhatsApp.');
        }
    } catch { alert('Failed to process order.'); }
}

// Add a message bubble to chat
function addMessage(text, type) {
    const area = document.getElementById('chat-area');
    const div  = document.createElement('div');
    div.className = `msg-bubble ${type==='user' ? 'msg-user' : 'msg-bot flex gap-4'}`;
    if (type === 'bot') div.innerHTML = `<div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0"><i class="fas fa-info"></i></div><div>${text}</div>`;
    else div.innerHTML = text;
    area.appendChild(div); area.scrollTop = area.scrollHeight;
}

// Add product to cart
async function addToCart(product, seller, unitPrice, imgPath, qty=1) {
    const fd = new FormData();
    fd.append('action','add_to_cart'); fd.append('cart_id',CART_ID);
    fd.append('product_name',product); fd.append('seller_name',seller);
    fd.append('price',unitPrice); fd.append('quantity',qty); fd.append('image_path',imgPath);
    await fetch(API_URL, {method:'POST',body:fd});
    addMessage(`✅ <b>${product}</b> (${qty}x) added to cart!`, 'bot');
}

// Load and render cart items
async function loadCart() {
    const items = await (await fetch(`${API_URL}?action=get_cart&cart_id=${CART_ID}`)).json();
    const list  = document.getElementById('cart-list');
    document.getElementById('cart-check-all').checked = false;
    calculateCartTotal();

    if (!items.length) {
        list.innerHTML = `<div class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300"><i class="fas fa-shopping-cart text-4xl text-slate-300 mb-3"></i><p class="text-slate-500 font-medium">Your cart is empty.</p></div>`;
        return;
    }
    list.innerHTML = items.map(item => {
        const img = item.image_path ? `<img src="${item.image_path}" class="w-20 h-20 object-cover rounded-xl border border-slate-100 shrink-0 shadow-sm">` : `<div class="w-20 h-20 bg-slate-100 flex items-center justify-center rounded-xl text-slate-300"><i class="fas fa-box text-2xl"></i></div>`;
        return `<div class="glass-card p-4 flex items-center gap-4 transition-colors relative"><input type="checkbox" value="${item.id}" data-price="${item.price}" data-qty="${item.quantity}" onchange="calculateCartTotal()" class="cart-checkbox w-5 h-5 rounded text-indigo-600 cursor-pointer ml-2"/>${img}<div class="flex-1 min-w-0"><div class="font-bold text-slate-800 text-lg leading-tight truncate">${item.product_name}</div><div class="text-xs text-slate-500 mt-1"><i class="fas fa-store text-slate-400 mr-1"></i>${item.seller_name}</div><div class="text-indigo-600 font-black text-lg mt-2">Rp ${parseInt(item.price).toLocaleString()} <span class="text-xs text-slate-400 font-medium">/unit</span></div></div><div class="flex items-center bg-slate-100 rounded-lg p-1 mr-2 border border-slate-200"><button onclick="updateCartQty(${item.id},${parseInt(item.quantity)-1})" class="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white hover:text-indigo-600 rounded-md transition font-bold"><i class="fas fa-minus text-xs"></i></button><input type="number" value="${item.quantity}" onchange="updateCartQty(${item.id},this.value)" min="0" class="w-12 text-center font-bold text-slate-800 text-sm bg-transparent border-none focus:ring-0 px-0 py-1 outline-none" style="-moz-appearance:textfield"/><button onclick="updateCartQty(${item.id},${parseInt(item.quantity)+1})" class="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white hover:text-indigo-600 rounded-md transition font-bold"><i class="fas fa-plus text-xs"></i></button></div></div>`;
    }).join('');
}

// Update quantity for a cart item
async function updateCartQty(id, newQty) {
    const qty = parseInt(newQty); if (isNaN(qty)) return;
    const fd = new FormData(); fd.append('action','update_cart_qty'); fd.append('item_id',id); fd.append('quantity',qty);
    await fetch(API_URL, {method:'POST',body:fd}); loadCart();
}

// Select/deselect all cart items
function toggleAllCartItems(el) {
    document.querySelectorAll('.cart-checkbox').forEach(cb => cb.checked = el.checked);
    calculateCartTotal();
}

// Recalculate cart total based on checked items
function calculateCartTotal() {
    let total=0, count=0;
    const checked = document.querySelectorAll('.cart-checkbox:checked');
    const all     = document.querySelectorAll('.cart-checkbox');
    checked.forEach(cb => { total += parseInt(cb.dataset.price)*parseInt(cb.dataset.qty); count++; });
    document.getElementById('cart-total-price').innerText = `Rp ${total.toLocaleString()}`;
    document.getElementById('cart-selected-count').innerText = count;
    document.getElementById('btn-checkout').disabled = count === 0;
    const del = document.getElementById('btn-delete-cart');
    count > 0 ? del.classList.remove('hidden') : del.classList.add('hidden');
    const ca = document.getElementById('cart-check-all');
    ca.checked = count > 0 && count === all.length;
    ca.indeterminate = count > 0 && count < all.length;
}

// Delete selected cart items
async function deleteSelectedCartItems() {
    const ids = Array.from(document.querySelectorAll('.cart-checkbox:checked')).map(cb=>cb.value);
    if (!ids.length || !confirm('Remove selected items from cart?')) return;
    const fd = new FormData(); fd.append('action','delete_cart_items'); fd.append('item_ids',JSON.stringify(ids));
    await fetch(API_URL, {method:'POST',body:fd}); loadCart();
}

// Checkout selected cart items
async function processCartCheckout() {
    const ids = Array.from(document.querySelectorAll('.cart-checkbox:checked')).map(cb=>cb.value);
    if (!ids.length) return;
    const contact = prompt('Enter your WhatsApp number to continue:');
    if (!contact) return;
    const btn = document.getElementById('btn-checkout');
    const orig = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; btn.disabled = true;
    const fd = new FormData(); fd.append('action','checkout_cart'); fd.append('cart_id',CART_ID); fd.append('contact',contact); fd.append('item_ids',JSON.stringify(ids));
    try {
        const data = await (await fetch(API_URL,{method:'POST',body:fd})).json();
        if (data.status === 'success') {
            alert(`Order placed! Checkout ID: ${data.checkout_id}`);
            let msg = `Hello ElektroMarket, order ID: *${data.checkout_id}*\n\nItems:\n`;
            data.items.forEach((item,i) => { msg+=`${i+1}. ${item.product_name} (${item.quantity}x) - Rp ${(item.price*item.quantity).toLocaleString()}\n`; });
            msg += `\n*Total: Rp ${data.total.toLocaleString()}*`;
            window.open(`https://wa.me/6281234567890?text=${encodeURIComponent(msg)}`, '_blank');
            loadCart(); switchView('history');
        }
    } catch { alert('Checkout failed. Please try again.'); }
    finally { btn.innerHTML = orig; btn.disabled = false; }
}

// Load and render order history (buyer)
async function loadHistory() {
    const orders = await (await fetch(`${API_URL}?action=get_orders`)).json();
    const list   = document.getElementById('history-list');
    if (!orders.length) {
        list.innerHTML = `<div class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300"><i class="fas fa-folder-open text-4xl text-slate-300 mb-3"></i><p class="text-slate-500 font-medium">No orders yet.</p></div>`;
        return;
    }
    list.innerHTML = orders.map(o => {
        const date = new Date(o.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
        const img  = o.image_path ? `<img src="${o.image_path}" class="w-20 h-20 object-cover rounded-xl border border-slate-100 shrink-0 shadow-sm">` : `<div class="w-20 h-20 bg-slate-100 flex items-center justify-center rounded-xl text-slate-300"><i class="fas fa-image text-2xl"></i></div>`;
        return `<div class="glass-card p-5 flex items-center gap-5 hover:border-indigo-100 transition-colors" id="order-row-${o.id}">${img}<div class="flex-1 min-w-0"><div class="flex justify-between items-start mb-2"><div><div class="font-bold text-slate-800 text-lg">${escapeHTML(o.product_name)}</div><div class="text-sm text-slate-500 mt-1 font-medium"><i class="fas fa-store text-slate-400 mr-1"></i>${escapeHTML(o.seller_name)}</div></div><div class="text-right"><div class="text-indigo-600 font-black text-xl mb-1">Rp ${parseInt(o.total_price).toLocaleString()}</div><span class="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Completed</span></div></div><div class="flex justify-between items-center border-t border-slate-100 pt-3 mt-1"><div class="text-xs text-slate-400 font-medium"><i class="far fa-calendar-alt mr-1"></i>${date}</div><div class="flex items-center gap-3">${o.location?`<a href="https://www.google.com/maps?q=${o.location}" target="_blank" class="text-xs text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-1"><i class="fas fa-map-pin"></i> Location</a>`:''}<button onclick="deleteOrder(${o.id},'${escapeHTML(o.seller_name).replace(/'/g,"\\'")}',' ${escapeHTML(o.product_name).replace(/'/g,"\\'")}')" class="text-xs text-red-400 hover:text-red-600 font-bold flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition" title="Delete this history item"><i class="fas fa-trash-alt"></i> Delete</button></div></div></div></div>`;
    }).join('');
}

// Delete a single order from buyer history
async function deleteOrder(id, sellerName, productName) {
    if (!confirm(`Remove "${productName}" from your order history?`)) return;
    const fd = new FormData();
    fd.append('action', 'delete_order');
    fd.append('id', id);
    try {
        const data = await (await fetch(API_URL, {method:'POST', body:fd})).json();
        if (data.status === 'success') {
            // Remove the card from DOM immediately without a full reload
            const row = document.getElementById(`order-row-${id}`);
            if (row) row.remove();
            // Show empty state if no orders remain
            const list = document.getElementById('history-list');
            if (!list.children.length) {
                list.innerHTML = `<div class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300"><i class="fas fa-folder-open text-4xl text-slate-300 mb-3"></i><p class="text-slate-500 font-medium">No orders yet.</p></div>`;
            }
        } else {
            alert('Failed to delete order. Please try again.');
        }
    } catch {
        alert('Network error. Please try again.');
    }
}


// ════════════════════════════════════════════════
// SELLER MODULE
// ════════════════════════════════════════════════
let sellerInterval  = null;
let detailMap       = null;
let detailMarker    = null;
let renderedIds     = new Set();
let allRequests     = [];
let activeRequestId = null;
let toastTimer      = null;
let currentSellerView = 'requests'; // 'requests' | 'history'

function initSeller() {
    startPolling();
    
    // Add click event listeners to Requests and History buttons
    const btnRequests = document.getElementById('selnav-requests');
    const btnHistory = document.getElementById('selnav-history');
    
    if (btnRequests) {
        btnRequests.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchSellerView('requests');
        });
    }
    
    if (btnHistory) {
        btnHistory.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchSellerView('history');
        });
    }
    
    // Upload area - click and drag-drop functionality
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    
    // Click to upload
    uploadArea.addEventListener('click', e => {
        if (!e.target.closest('#upload-preview')) fileInput.click();
    });
    
    // Drag-drop
    uploadArea.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('drag-active');
    });
    
    uploadArea.addEventListener('dragleave', e => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('drag-active');
    });
    
    uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('drag-active');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            // Trigger change event
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
}

// Switch seller sidebar between 'requests' and 'history' views
function switchSellerView(view) {
    currentSellerView = view;
    const reqPanel  = document.getElementById('seller-requests-panel');
    const histPanel = document.getElementById('seller-history-panel');
    const btnReq    = document.getElementById('selnav-requests');
    const btnHist   = document.getElementById('selnav-history');

    if (view === 'history') {
        // Hide requests panel, show history panel
        reqPanel.style.display  = 'none';
        histPanel.style.display = 'flex';
        btnReq.classList.remove('active');
        btnHist.classList.add('active');
        loadSellerHistory();
    } else {
        // Show requests panel, hide history panel
        histPanel.style.display = 'none';
        reqPanel.style.display  = 'flex';
        btnHist.classList.remove('active');
        btnReq.classList.add('active');
    }
}

// Load and render seller's history of offers and orders
async function loadSellerHistory() {
    const list = document.getElementById('seller-history-list');
    list.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm"><i class="fas fa-circle-notch fa-spin mr-2"></i>Loading history…</div>`;
    try {
        const url = `${API_URL}?action=get_seller_offers&seller_username=${encodeURIComponent(USERNAME)}`;
        console.log('=== HISTORY LOAD START ===');
        console.log('URL:', url);
        console.log('USERNAME:', USERNAME);
        console.log('API_URL:', API_URL);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('=== API RESPONSE ===');
        console.log('Full Response:', data);
        console.log('Debug Info:', data.debug);
        console.log('Offers Count:', data.offers_count);
        console.log('Orders Count:', data.orders_count);
        console.log('Total Items:', data.count);
        
        // Handle error response
        if (data.error) {
            console.error('API Error:', data.error);
            list.innerHTML = `<div class="p-6 text-center text-red-400 text-sm">Error: ${data.error}</div>`;
            return;
        }
        
        // Handle new response format with 'items' key
        let items = [];
        if (data.items && Array.isArray(data.items)) {
            items = data.items;
        } else if (Array.isArray(data)) {
            items = data;
        }
        
        console.log('Processing items:', items);
        
        if (!items || items.length === 0) {
            console.warn('No items found for user:', USERNAME);
            list.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm"><i class="fas fa-folder-open mr-2"></i>No offers or orders yet.</div>`;
            return;
        }
        
        list.innerHTML = items.map(item => {
            const date = new Date(item.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
            const img  = item.image_path
                ? `<img src="${item.image_path}" class="w-10 h-10 object-cover rounded-lg border border-slate-100 shrink-0">`
                : `<div class="w-10 h-10 bg-slate-100 flex items-center justify-center rounded-lg text-slate-300 shrink-0"><i class="fas fa-box text-sm"></i></div>`;
            
            // Show different badge based on status
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
        
        console.log('=== HISTORY LOAD COMPLETE ===');
    } catch (error) {
        console.error('Error loading history:', error);
        list.innerHTML = `<div class="p-6 text-center text-red-400 text-sm">Error: ${error.message}</div>`;
    }
}

// Delete a single offer from seller history
async function deleteSellerOffer(id) {
    if (!confirm('Remove this offer from history?')) return;
    const fd = new FormData();
    fd.append('action', 'delete_offer_from_history');
    fd.append('id', id);
    try {
        const data = await (await fetch(API_URL, {method:'POST', body:fd})).json();
        if (data.status === 'success') {
            const row = document.getElementById(`seller-offer-row-${id}`);
            if (row) row.remove();
            const list = document.getElementById('seller-history-list');
            if (!list.children.length) {
                list.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm"><i class="fas fa-folder-open mr-2"></i>No offers or orders yet.</div>`;
            }
        } else {
            alert('Failed to delete offer.');
        }
    } catch {
        alert('Network error. Please try again.');
    }
}

// Delete a single order from seller history
async function deleteSellerOrder(id) {
    if (!confirm('Remove this order from history?')) return;
    const fd = new FormData();
    fd.append('action', 'delete_order');
    fd.append('id', id);
    try {
        const data = await (await fetch(API_URL, {method:'POST', body:fd})).json();
        if (data.status === 'success') {
            const row = document.getElementById(`seller-order-row-${id}`);
            if (row) row.remove();
            const list = document.getElementById('seller-history-list');
            if (!list.children.length) {
                list.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm"><i class="fas fa-folder-open mr-2"></i>No offers or orders yet.</div>`;
            }
        } else {
            alert('Failed to delete order.');
        }
    } catch {
        alert('Network error. Please try again.');
    }
}

function startPolling() { loadRequests(); sellerInterval = setInterval(loadRequests, 3000); }
function stopPolling()  { if (sellerInterval) clearInterval(sellerInterval); }

async function loadRequests() {
    try {
        const reqs = await (await fetch(`${API_URL}?action=get_requests`)).json();
        allRequests = reqs;
        updateLiveBadge(true, reqs.length);
        syncRequestList(reqs);
    } catch { updateLiveBadge(false, 0); }
}

function syncRequestList(requests) {
    const list      = document.getElementById('request-list');
    const emptyEl   = document.getElementById('empty-state');
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
    badge.textContent = renderedIds.size;
    badge.classList.toggle('hidden', renderedIds.size === 0);
    document.getElementById('stat-pending').textContent = `${renderedIds.size} Active Requests`;
    const q = document.getElementById('search-input').value;
    if (q) filterRequests(q);
}

function buildRequestCard(req) {
    const card = document.createElement('div');
    card.id = `req-card-${req.id}`;
    card.className = 'req-card';
    card.setAttribute('data-desc', req.description.toLowerCase());
    card.onclick = () => selectRequest(req.id);

    let qtyInfo='', totalQty=1;
    if (req.parsed_items) {
        try {
            const items = JSON.parse(req.parsed_items);
            totalQty = items.reduce((s,i) => s+i.qty, 0);
            qtyInfo = `<span class="req-qty"><i class="fas fa-cubes mr-1"></i>${totalQty} unit</span>`;
        } catch {}
    }
    // Display the real buyer username; fall back to 'Buyer' if the field is empty
    const buyerLabel = escapeHTML(req.buyer_name || 'Buyer');
    card.innerHTML = `<div class="req-card-inner"><div class="req-avatar"><i class="fas fa-user"></i></div><div class="req-info"><div class="req-top"><span class="req-name">${buyerLabel}</span><span class="req-time">${relativeTime(req.created_at)}</span></div><div class="req-desc">${escapeHTML(req.description)}</div><div class="req-tags">${qtyInfo}${req.location?'<span class="req-loc"><i class="fas fa-map-marker-alt mr-1"></i>Location Available</span>':''}</div></div></div>`;
    card._data = req;
    return card;
}

function selectRequest(reqId) {
    activeRequestId = reqId;
    document.querySelectorAll('.req-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`req-card-${reqId}`)?.classList.add('active');
    const req = allRequests.find(r => parseInt(r.id) === parseInt(reqId));
    if (req) showActivePanel(req);
    // On mobile: close sidebar after selecting a request
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
    document.getElementById('active-panel').classList.add('hidden');
    document.getElementById('idle-panel').classList.remove('hidden');
    document.querySelectorAll('.req-card').forEach(c => c.classList.remove('active'));
    document.querySelector('.detail-panel').classList.remove('panel-open');
}

function populateDetailHeader(req) {
    let totalQty=1, qtyBadges='';
    if (req.parsed_items) {
        try {
            const items = JSON.parse(req.parsed_items);
            totalQty = items.reduce((s,i) => s+i.qty, 0);
            qtyBadges = items.map(i => `<span class="hdr-badge"><i class="fas fa-cube mr-1 text-indigo-400"></i>${i.item} × ${i.qty}</span>`).join('');
        } catch {}
    }
    const mapLink = req.location ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(req.location)}" target="_blank" class="hdr-map-btn"><i class="fas fa-map-marked-alt"></i> Open Maps</a>` : '';
    document.getElementById('detail-header').innerHTML = `<div class="hdr-left"><button class="hdr-back-btn" onclick="showIdlePanel()"><i class="fas fa-arrow-left"></i></button><div><div class="hdr-desc">"${escapeHTML(req.description)}"</div><div class="hdr-badges">${qtyBadges||`<span class="hdr-badge"><i class="fas fa-cube mr-1 text-indigo-400"></i>Qty: ${totalQty}</span>`}<span class="hdr-badge text-slate-500"><i class="fas fa-clock mr-1"></i>${relativeTime(req.created_at)}</span></div></div></div><div class="hdr-right">${mapLink}</div>`;
}

function prefillForm(req) {
    let totalQty=1, firstName=req.description;
    if (req.parsed_items) {
        try { const items=JSON.parse(req.parsed_items); totalQty=items.reduce((s,i)=>s+i.qty,0); firstName=items[0]?.item||firstName; } catch {}
    }
    document.getElementById('form-request-id').value = req.id;
    document.getElementById('form-total-qty').value  = totalQty;
    document.getElementById('offer-form').dataset.itemName = firstName;
}

function initDetailMap(req) {
    let coords = [-6.285, 107.17];
    if (req.location) { const p=req.location.split(','); if(p.length===2) coords=[parseFloat(p[0]),parseFloat(p[1])]; }
    if (!detailMap) {
        detailMap = L.map('detail-map', {zoomControl:false}).setView(coords, 14);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{attribution:'© CartoDB'}).addTo(detailMap);
        L.control.zoom({position:'bottomleft'}).addTo(detailMap);
    } else { detailMap.setView(coords, 14); }
    if (detailMarker) detailMap.removeLayer(detailMarker);
    if (req.location) {
        const icon = L.divIcon({className:'',html:`<div class="map-pin-dot"></div>`,iconSize:[18,18],iconAnchor:[9,9]});
        detailMarker = L.marker(coords,{icon}).addTo(detailMap).bindPopup(`<b style="font-family:'Plus Jakarta Sans'">${escapeHTML(req.description)}</b>`).openPopup();
        document.getElementById('map-badge').style.display = 'flex';
    } else { document.getElementById('map-badge').style.display = 'none'; }
    setTimeout(() => detailMap.invalidateSize(), 350);
}

async function submitOffer(e) {
    e.preventDefault();
    const form  = document.getElementById('offer-form');
    const btn   = document.getElementById('submit-btn');
    const label = document.getElementById('submit-label');
    const reqId = parseInt(document.getElementById('form-request-id').value);
    const qty   = parseInt(document.getElementById('form-total-qty').value) || 1;
    if (!reqId) return;
    
    // Validate WhatsApp number
    const contact = document.getElementById('inp-contact').value.trim();
    if (!contact || contact.length === 0) {
        alert('❌ WhatsApp number is required to send an offer');
        document.getElementById('inp-contact').focus();
        return;
    }
    
    // Extract only digits from WhatsApp number
    const digitsOnly = contact.replace(/\D/g, '');
    
    // Validate WhatsApp number must have 11-12 digits
    if (digitsOnly.length < 11 || digitsOnly.length > 12) {
        alert('❌ WhatsApp number must be 11-12 digits (you entered ' + digitsOnly.length + ' digits)');
        document.getElementById('inp-contact').focus();
        return;
    }

    btn.disabled = true; btn.querySelector('i').className='fas fa-spinner fa-spin'; label.textContent='Sending…';
    const fd = new FormData(form);
    const totalPrice = (parseInt(fd.get('unit_price'))||0) * qty;
    const fileInput  = document.getElementById('file-input');
    if (fileInput.files.length) fd.set('product_image', await compressImage(fileInput.files[0]));
    
    // Auto-set seller_name to USERNAME if not provided (for tracking)
    let sellerName = fd.get('seller') || USERNAME;
    
    fd.set('action','add_offer'); 
    fd.set('request_id',reqId);
    fd.set('seller_name', sellerName); 
    fd.set('product_name',fd.get('product'));
    fd.set('price',totalPrice); 
    fd.set('contact', contact);  // Use validated contact
    fd.set('seller_username', USERNAME);  // Add USERNAME for tracking
    fd.delete('unit_price'); 
    fd.delete('total_qty');
    try {
        const data = await (await fetch(API_URL,{method:'POST',body:fd})).json();
        if (data.status==='success') { showSuccessFlash(); resetFormFields(); }
        else alert('Failed to send: ' + (data.error||'Unknown error'));
    } catch { alert('Network error. Please try again.'); }
    finally { btn.disabled=false; btn.querySelector('i').className='fas fa-paper-plane'; label.textContent='Send Offer'; }
}

async function getSmartPrice() {
    const form    = document.getElementById('offer-form');
    const keyword = (form.dataset.itemName||'').trim().split(' ')[0];
    const box     = document.getElementById('price-suggestion');
    const icon    = document.getElementById('smart-price-icon');
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
    finally { icon.className='fas fa-magic'; }
}

function previewImage(event) {
    const file = event.target.files[0]; 
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('❌ Please select an image file (JPG, PNG, etc.)');
        document.getElementById('file-input').value = '';
        return;
    }
    
    // Validate file size (max 5 MB)
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
        alert('❌ File size exceeds 5 MB limit. Please choose a smaller image.');
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
    document.getElementById('file-input').value = '';
    document.getElementById('preview-img').src = '';
    document.getElementById('upload-preview').classList.add('hidden');
    document.getElementById('upload-placeholder').classList.remove('hidden');
}

function filterRequests(q) {
    const lq = q.toLowerCase();
    document.querySelectorAll('.req-card').forEach(card => {
        card.classList.toggle('hidden', !(card.getAttribute('data-desc')?.includes(lq) ?? true));
    });
}

function showSuccessFlash() {
    const flash = document.getElementById('success-flash');
    flash.classList.remove('hidden','fade-out'); flash.classList.add('flash-in');
    setTimeout(() => flash.classList.add('fade-out'), 2800);
    setTimeout(() => { flash.classList.add('hidden'); flash.classList.remove('flash-in','fade-out'); }, 3300);
}

function resetFormFields() {
    ['inp-seller','inp-product','inp-price','inp-contact'].forEach(id => { document.getElementById(id).value=''; });
    document.getElementById('price-suggestion').classList.add('hidden');
    clearImage();
}

function resetFormUI() {
    document.getElementById('success-flash').classList.add('hidden');
    document.getElementById('price-suggestion').classList.add('hidden');
}

function updateLiveBadge(online, count) {
    // Update both desktop sidebar badge and mobile topbar badge
    ['live-badge', 'live-badge-mobile'].forEach(id => {
        const badge = document.getElementById(id);
        const label = badge?.querySelector('span:last-child');
        if (!badge) return;
        badge.classList.toggle('online', online);
        badge.classList.toggle('offline', !online);
        if (label) label.textContent = online ? (count > 0 ? `${count} Requests` : 'Live') : 'Offline';
    });
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = msg;
    toast.classList.remove('hidden','toast-hide'); toast.classList.add('toast-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.replace('toast-show','toast-hide');
        setTimeout(() => toast.classList.add('hidden'), 400);
    }, 3000);
}

function relativeTime(dateStr) {
    const diff = Math.round((new Date() - new Date(dateStr)) / 1000);
    if (diff < 5)    return 'just now';
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.round(diff/60)}m ago`;
    return `${Math.round(diff/3600)}h ago`;
}