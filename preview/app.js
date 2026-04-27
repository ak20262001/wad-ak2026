const API_URL = 'api.php';
let currentView = 'buyer'; 
let currentRequestId = null;
let pollInterval = null;
let sellerInterval = null;
let renderedRequestIds = new Set();
let map;
let markers = {};
let lastOffersJSON = ""; 
const getSessionCartId = () => {
    let cid = localStorage.getItem('elektro_cart_id');
    if (!cid) { cid = 'CRT-' + Date.now() + Math.random().toString(36).substr(2, 9); localStorage.setItem('elektro_cart_id', cid); }
    return cid;
};
const CART_ID = getSessionCartId();

function switchView(view) {
    currentView = view;
    document.getElementById('buyer-view').classList.add('hidden');
    document.getElementById('seller-container').classList.add('hidden');
    document.getElementById('history-container').classList.add('hidden');
    document.getElementById('cart-container').classList.add('hidden'); // Tambahan
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${view}`).classList.add('active');

    stopSellerPolling();
    if(pollInterval) clearInterval(pollInterval);

    if (view === 'seller') {
        document.getElementById('seller-container').classList.remove('hidden');
        document.getElementById('seller-container').classList.add('flex');
        setTimeout(initMap, 200);
        startSellerPolling();
    } else if (view === 'history') {
        document.getElementById('history-container').classList.remove('hidden');
        document.getElementById('history-container').classList.add('flex');
        loadHistory();
    } else if (view === 'cart') { // Tambahan Flow
        document.getElementById('cart-container').classList.remove('hidden');
        document.getElementById('cart-container').classList.add('flex');
        loadCart();
    } else {
        document.getElementById('buyer-view').classList.remove('hidden');
        document.getElementById('buyer-view').classList.add('flex');
        if (currentRequestId) pollInterval = setInterval(fetchOffers, 2000);
    }
}

// --- 🗺️ MAP LOGIC ---
function initMap() {
    if (!map) {
        map = L.map('seller-map', { zoomControl: false }).setView([-6.285, 107.17], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
        L.control.zoom({ position: 'bottomleft' }).addTo(map);
    }
    map.invalidateSize();
}

// --- 🛒 BUYER LOGIC ---
async function sendRequest() {
    const input = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const text = input.value.trim();
    if (!text) return;

    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const coords = `${pos.coords.latitude},${pos.coords.longitude}`;
        addMessage(text, 'user');
        input.value = '';
        lastOffersJSON = ""; 

        const fd = new FormData();
        fd.append('action', 'create_request');
        fd.append('description', text);
        fd.append('location', coords);
        
        try {
            const res = await fetch(API_URL, { method: 'POST', body: fd });
            const data = await res.json();
            
            if (data.status === 'success') {
                currentRequestId = data.request_id;
                document.getElementById('finish-btn-container').classList.remove('hidden'); 
                addMessage('<span id="broadcast-text" class="flex items-center gap-2 text-indigo-600"><i class="fas fa-radar fa-spin"></i> Sedang menyebarkan permintaan ke penjual terdekat...</span>', 'bot');
                pollInterval = setInterval(fetchOffers, 2000);
            }
        } catch (error) { alert("Network error. Please try again."); } 
        finally {
            input.disabled = false; sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>'; input.focus();
        }
    }, () => { 
        alert("Mohon aktifkan GPS agar penjual bisa menghitung ongkir."); 
        input.disabled = false; sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    });
}

async function closeRequest() {
    if (!currentRequestId) return;
    const cancelBtn = document.querySelector('#finish-btn-container button');
    const originalText = cancelBtn.innerHTML;
    cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Membatalkan...';
    cancelBtn.disabled = true;

    const fd = new FormData(); fd.append('action', 'close_request'); fd.append('request_id', currentRequestId);
    try { await fetch(API_URL, { method: 'POST', body: fd }); } catch (e) {}

    cancelBtn.innerHTML = originalText; cancelBtn.disabled = false;
    resetBuyerState("🚫 Pencarian dibatalkan.");
}

async function fetchOffers() {
    if (!currentRequestId) return;
    const res = await fetch(`${API_URL}?action=get_offers&request_id=${currentRequestId}`);
    const offers = await res.json();
    
    const newJSON = JSON.stringify(offers);
    if (newJSON !== lastOffersJSON) { renderAuction(offers); lastOffersJSON = newJSON; }
}

function renderAuction(offers) {
    const chatArea = document.getElementById('chat-area');
    const old = document.getElementById('offer-container'); if(old) old.remove();
    if (offers.length === 0) return;

    const broadcastTxt = document.getElementById('broadcast-text');
    if (broadcastTxt) broadcastTxt.closest('.msg-bubble').remove();

    const container = document.createElement('div');
    container.id = 'offer-container';
    container.className = 'w-full max-w-4xl animate-fade-in';
    
    let html = `<div class="flex items-center gap-3 mb-4 pl-2"><div class="h-8 w-1 bg-indigo-500 rounded-full"></div><h3 class="font-bold text-slate-800 text-lg">Penawaran Masuk (${offers.length})</h3></div><div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;
    
    offers.forEach(o => {
        // EKSTRAKSI KUANTITAS DARI REQUEST
        let requestedQty = 1;
        try {
            if (o.parsed_items) {
                const items = JSON.parse(o.parsed_items);
                // Jumlahkan total qty jika pembeli mencari banyak barang sekaligus
                if (items.length > 0) requestedQty = items.reduce((sum, item) => sum + item.qty, 0);
            }
        } catch(e) {}
        
        // KALKULASI HARGA SATUAN (Karena o.price dari seller adalah harga total)
        const unitPrice = Math.round(o.price / requestedQty);

        const imgTag = o.image_path 
            ? `<div class="h-32 w-full overflow-hidden rounded-t-xl"><img src="${o.image_path}" class="w-full h-full object-cover hover:scale-105 transition duration-500"></div>` 
            : `<div class="h-20 w-full bg-slate-100 flex items-center justify-center rounded-t-xl"><i class="fas fa-box text-slate-300 text-3xl"></i></div>`;
        
        const safeProductName = o.product_name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        html += `
        <div class="glass-card flex flex-col hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            ${imgTag}
            <div class="p-5 flex-1 flex flex-col">
                <div class="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1"><i class="fas fa-store mr-1"></i> ${o.seller_name}</div>
                <div class="font-bold text-slate-800 text-lg mb-2 leading-tight">${o.product_name}</div>
                <div class="mt-auto pt-4 flex flex-col gap-2 border-t border-slate-100">
                    <div class="text-indigo-600 font-extrabold text-xl">Rp ${parseInt(o.price).toLocaleString()}</div>
                    <div class="flex gap-2">
                        <!-- Panggil addToCart dengan Unit Price dan Requested Qty -->
                        <button onclick="addToCart('${safeProductName}', '${o.seller_name}', ${unitPrice}, '${o.image_path || ''}', ${requestedQty})" class="bg-indigo-100 text-indigo-700 font-bold p-2 px-3 rounded-lg hover:bg-indigo-200 transition text-sm flex-shrink-0" title="Masukkan Keranjang">
                            <i class="fas fa-cart-plus"></i>
                        </button>
                        <button onclick="checkoutNow('${safeProductName}', ${o.price}, ${o.id})" class="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95 transition text-sm">
                            Beli Langsung
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html; chatArea.appendChild(container);
    chatArea.scrollTop = chatArea.scrollHeight;
}

async function checkoutNow(productName, price, offerId) {
    const fd = new FormData();
    fd.append('action', 'accept_offer');
    fd.append('offer_id', offerId);

    try {
        const res = await fetch(API_URL, { method: 'POST', body: fd });
        const data = await res.json();
        
        if (data.status === 'success') {
            const waMsg = `Halo, saya ingin membeli *${productName}* seharga Rp ${parseInt(price).toLocaleString()} dari aplikasi ElektroMarket.`;
            const phone = data.contact.replace(/^0/, '62'); 
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`, '_blank');
            resetBuyerState("✅ Pesanan Diterima! Silakan lanjutkan percakapan di WhatsApp.");
        }
    } catch(e) {
        alert("Gagal memproses pesanan.");
    }
}

function resetBuyerState(msg) {
    if(pollInterval) clearInterval(pollInterval);
    currentRequestId = null; lastOffersJSON = ""; 
    document.getElementById('finish-btn-container').classList.add('hidden');
    const broadcastTxt = document.getElementById('broadcast-text');
    if (broadcastTxt) broadcastTxt.closest('.msg-bubble').remove();
    addMessage(msg, 'bot');
    const old = document.getElementById('offer-container'); if(old) old.remove();
}

function addMessage(text, type) {
    const chatArea = document.getElementById('chat-area');
    const div = document.createElement('div');
    div.className = `msg-bubble ${type === 'user' ? 'msg-user' : 'msg-bot flex gap-4'}`;
    
    if(type === 'bot') {
        div.innerHTML = `<div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0"><i class="fas fa-info"></i></div><div>${text}</div>`;
    } else { div.innerHTML = text; }
    
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
}

// --- 🏪 SELLER LOGIC ---
function startSellerPolling() { loadSellerRequests(); sellerInterval = setInterval(loadSellerRequests, 2000); }
function stopSellerPolling() { if(sellerInterval) clearInterval(sellerInterval); }

async function loadSellerRequests() {
    try {
        const res = await fetch(`${API_URL}?action=get_requests`);
        const requests = await res.json();
        const list = document.getElementById('seller-requests');
        const serverIds = new Set(requests.map(r => parseInt(r.id)));

        renderedRequestIds.forEach(id => {
            if (!serverIds.has(id)) {
                document.getElementById(`request-${id}`)?.remove();
                if (markers[id]) { map.removeLayer(markers[id]); delete markers[id]; }
                renderedRequestIds.delete(id);
            }
        });

        requests.forEach(req => {
            if (renderedRequestIds.has(parseInt(req.id))) return;
            
            if (req.location) {
                const [lat, lng] = req.location.split(',');
                const customIcon = L.divIcon({ className: 'custom-div-icon', html: "<div style='background-color:#4f46e5;width:15px;height:15px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(0,0,0,0.3);'></div>", iconSize: [15, 15] });
                const marker = L.marker([lat, lng], {icon: customIcon}).addTo(map).bindPopup(`<b style="font-family:'Plus Jakarta Sans'">${req.description}</b>`);
                markers[req.id] = marker;
            }

            let parsedHTML = ''; let totalQty = 0; let firstItemName = req.description;
            if (req.parsed_items) {
                const items = JSON.parse(req.parsed_items);
                if (items.length > 0) firstItemName = items[0].item;
                items.forEach(i => {
                    parsedHTML += `<span class="bg-indigo-50 text-indigo-700 text-xs px-3 py-1.5 rounded-lg font-bold border border-indigo-100">Qty: ${i.qty}</span>`;
                    totalQty += i.qty;
                });
                parsedHTML = `<div class="mt-3 flex flex-wrap gap-2">${parsedHTML}</div>`;
            }
            
            const safeItemName = firstItemName.replace(/'/g, "\\'").replace(/"/g, '"');
            const mapLink = req.location ? `https://www.google.com/maps?q=${req.location}` : "#";

            const card = document.createElement('div');
            card.id = `request-${req.id}`; 
            card.className = "glass-card p-6 flex flex-col xl:flex-row gap-6 relative overflow-hidden group";
            card.innerHTML = `
                <div class="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                <div class="flex-1 xl:border-r border-slate-100 xl:pr-6">
                    <div class="flex justify-between items-start">
                        <h3 class="text-xl font-extrabold text-slate-800 leading-tight">"${req.description}"</h3>
                        ${req.location ? `<a href="${mapLink}" target="_blank" class="bg-slate-100 text-slate-500 hover:text-indigo-600 w-8 h-8 flex items-center justify-center rounded-full transition"><i class="fas fa-location-arrow"></i></a>` : ''}
                    </div>
                    ${parsedHTML}
                </div>
                
                <form onsubmit="submitOffer(event, ${req.id}, ${totalQty})" class="flex-1 space-y-4" enctype="multipart/form-data">
                    <div class="grid grid-cols-2 gap-4">
                        <input name="seller" placeholder="Nama Toko" required class="modern-input">
                        <input name="product" placeholder="Tipe Spesifik (Ex: S23 Ultra)" required class="modern-input">
                        
                        <div class="relative col-span-2 sm:col-span-1">
                            <input id="price-input-${req.id}" name="unit_price" type="number" placeholder="Harga (Rp)" required class="modern-input pr-10">
                            <button type="button" onclick="getSmartPrice('${safeItemName}', ${req.id})" class="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-600 transition p-1 bg-white rounded-md shadow-sm" title="Cek Harga Pasar">
                                <i class="fas fa-magic"></i>
                            </button>
                        </div>
                        <input name="contact" placeholder="No. WA (628...)" required class="modern-input col-span-2 sm:col-span-1">
                    </div>
                    
                    <div id="price-suggestion-${req.id}" class="text-xs text-indigo-600 font-bold hidden bg-indigo-50 p-2 rounded-lg border border-indigo-100"></div>
                    
                    <div class="flex items-center gap-4 mt-2">
                        <div class="relative flex-1">
                            <input type="file" name="product_image" id="file-${req.id}" accept="image/*" onchange="previewImage(event, ${req.id})" class="hidden">
                            <label for="file-${req.id}" class="flex items-center justify-center gap-2 w-full border-2 border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50 py-3 rounded-xl cursor-pointer transition font-semibold text-sm">
                                <i class="fas fa-cloud-upload-alt"></i> Foto Barang
                            </label>
                        </div>
                        
                        <div id="image-preview-container-${req.id}" class="hidden relative shrink-0">
                            <img id="image-preview-${req.id}" src="" class="w-12 h-12 object-cover rounded-lg border border-slate-200 shadow-sm">
                            <button type="button" onclick="clearImage(${req.id})" class="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] hover:bg-red-600 shadow-md"><i class="fas fa-times"></i></button>
                        </div>
                    </div>

                    <button type="submit" class="btn-primary w-full py-3.5 mt-2 shadow-lg shadow-slate-900/10">Kirim Penawaran</button>
                </form>`;
            list.prepend(card);
            renderedRequestIds.add(parseInt(req.id));
        });
    } catch(e) {}
}

// --- 📸 IMAGE & SUBMIT LOGIC ---
function previewImage(event, reqId) {
    const file = event.target.files[0];
    const container = document.getElementById(`image-preview-container-${reqId}`);
    const img = document.getElementById(`image-preview-${reqId}`);
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) { img.src = e.target.result; container.classList.remove('hidden'); }
        reader.readAsDataURL(file);
    } else { clearImage(reqId); }
}

function clearImage(reqId) {
    const fileInput = document.querySelector(`#file-${reqId}`);
    if(fileInput) fileInput.value = "";
    document.getElementById(`image-preview-${reqId}`).src = "";
    document.getElementById(`image-preview-container-${reqId}`).classList.add('hidden');
}

function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image(); img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width; let height = img.height; const MAX_SIZE = 800; 
                if (width > height && width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } 
                else if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => { resolve(new File([blob], file.name, { type: 'image/jpeg' })); }, 'image/jpeg', 0.8);
            };
        };
    });
}

async function submitOffer(e, reqId, qty) {
    e.preventDefault();
    const form = e.target; const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...'; btn.disabled = true;

    const fd = new FormData(form);
    const unitPrice = parseInt(fd.get('unit_price'));
    const totalPrice = unitPrice * qty;

    const fileInput = form.querySelector('input[type="file"]');
    if (fileInput && fileInput.files.length > 0) {
        const compressedFile = await compressImage(fileInput.files[0]);
        fd.set('product_image', compressedFile);
    }

    fd.append('action', 'add_offer'); fd.append('request_id', reqId);
    fd.append('seller_name', fd.get('seller')); fd.append('product_name', fd.get('product')); 
    fd.set('price', totalPrice); 

    try {
        const res = await fetch(API_URL, { method: 'POST', body: fd });
        const text = await res.text(); 
        try {
            const data = JSON.parse(text); 
            if (data.error) alert("Database Error: " + data.error); 
            
            clearImage(reqId);
            const savedSeller = fd.get('seller'); const savedContact = fd.get('contact');
            form.reset(); 
            form.querySelector('input[name="seller"]').value = savedSeller;
            form.querySelector('input[name="contact"]').value = savedContact;

            btn.innerHTML = `<i class="fas fa-check text-emerald-400"></i> Terkirim!`;
            setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
        } catch (jsonErr) {
            btn.innerHTML = originalText; btn.disabled = false; alert("Error server. Cek console.");
        }
    } catch(err) {
        btn.innerHTML = originalText; btn.disabled = false; alert("Gagal koneksi server.");
    }
}

// --- 🧾 HISTORY LOGIC ---
async function loadHistory() {
    const list = document.getElementById('history-list');
    const res = await fetch(`${API_URL}?action=get_orders`);
    const orders = await res.json();
    
    list.innerHTML = orders.map(order => {
        const date = new Date(order.created_at).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute:'2-digit'});
        const historyMapLink = order.location ? `https://www.google.com/maps?q=${order.location}` : "#";
        const imgTag = order.image_path ? `<img src="${order.image_path}" class="w-20 h-20 object-cover rounded-xl border border-slate-100 shrink-0 shadow-sm">` : `<div class="w-20 h-20 bg-slate-100 flex items-center justify-center rounded-xl text-slate-300"><i class="fas fa-image text-2xl"></i></div>`;
        
        return `
        <div class="glass-card p-5 flex items-center gap-5 hover:border-indigo-100 transition-colors">
            ${imgTag}
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <div class="font-bold text-slate-800 text-lg">${order.product_name}</div>
                        <div class="text-sm text-slate-500 mt-1 font-medium"><i class="fas fa-store text-slate-400 mr-1"></i> ${order.seller_name}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-indigo-600 font-black text-xl mb-1">Rp ${parseInt(order.total_price).toLocaleString()}</div>
                        <span class="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Selesai</span>
                    </div>
                </div>
                <div class="flex justify-between items-center border-t border-slate-100 pt-3 mt-1">
                    <div class="text-xs text-slate-400 font-medium"><i class="far fa-calendar-alt mr-1"></i> ${date}</div>
                    ${order.location ? `<a href="${historyMapLink}" target="_blank" class="text-xs text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-1"><i class="fas fa-map-pin"></i> Lokasi</a>` : ''}
                </div>
            </div>
        </div>`;
    }).join('') || `<div class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300"><i class="fas fa-folder-open text-4xl text-slate-300 mb-3"></i><p class="text-slate-500 font-medium">Belum ada riwayat pesanan.</p></div>`;
}

// --- 🛒 KERANJANG LOGIC ---
async function addToCart(product, seller, unitPrice, imgPath, qty = 1) {
    const fd = new FormData();
    fd.append('action', 'add_to_cart');
    fd.append('cart_id', CART_ID);
    fd.append('product_name', product);
    fd.append('seller_name', seller);
    fd.append('price', unitPrice); // Kirim harga satuan
    fd.append('quantity', qty);    // Kirim kuantitas bawaan
    fd.append('image_path', imgPath);

    await fetch(API_URL, { method: 'POST', body: fd });
    addMessage(`✅ <b>${product}</b> (${qty}x) berhasil ditambahkan ke keranjang!`, 'bot');
}

async function loadCart() {
    const res = await fetch(`${API_URL}?action=get_cart&cart_id=${CART_ID}`);
    const items = await res.json();
    const list = document.getElementById('cart-list');
    
    document.getElementById('cart-check-all').checked = false;
    calculateCartTotal();

    if (items.length === 0) {
        list.innerHTML = `<div class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300"><i class="fas fa-shopping-cart text-4xl text-slate-300 mb-3"></i><p class="text-slate-500 font-medium">Keranjang masih kosong.</p></div>`;
        return;
    }

    list.innerHTML = items.map(item => {
        const imgTag = item.image_path ? `<img src="${item.image_path}" class="w-20 h-20 object-cover rounded-xl border border-slate-100 shrink-0 shadow-sm">` : `<div class="w-20 h-20 bg-slate-100 flex items-center justify-center rounded-xl text-slate-300"><i class="fas fa-box text-2xl"></i></div>`;
        
        // PENTING: parseInt(item.quantity) wajib di sini agar operasi +1/-1 berfungsi sebagai matematika
        return `
        <div class="glass-card p-4 flex items-center gap-4 transition-colors relative">
            <input type="checkbox" value="${item.id}" data-price="${item.price}" data-qty="${item.quantity}" onchange="calculateCartTotal()" class="cart-checkbox w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer ml-2">
            ${imgTag}
            <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-800 text-lg leading-tight truncate">${item.product_name}</div>
                <div class="text-xs text-slate-500 mt-1"><i class="fas fa-store text-slate-400 mr-1"></i> ${item.seller_name}</div>
                <div class="text-indigo-600 font-black text-lg mt-2">Rp ${parseInt(item.price).toLocaleString()} <span class="text-xs text-slate-400 font-medium line-through">/unit</span></div>
            </div>
            <div class="flex items-center bg-slate-100 rounded-lg p-1 mr-2 border border-slate-200">
                <button onclick="updateCartQty(${item.id}, parseInt(${item.quantity}) - 1)" class="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white hover:text-indigo-600 rounded-md transition font-bold"><i class="fas fa-minus text-xs"></i></button>
                
                <!-- Field Input Langsung -->
                <input type="number" value="${item.quantity}" onchange="updateCartQty(${item.id}, this.value)" min="0" class="w-12 text-center font-bold text-slate-800 text-sm bg-transparent border-none focus:ring-0 px-0 py-1 outline-none m-0 appearance-none" style="-moz-appearance: textfield;">
                
                <button onclick="updateCartQty(${item.id}, parseInt(${item.quantity}) + 1)" class="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white hover:text-indigo-600 rounded-md transition font-bold"><i class="fas fa-plus text-xs"></i></button>
            </div>
        </div>`;
    }).join('');
}

async function updateCartQty(id, newQty) {
    // Memaksa type casting ke Integer agar "1" + 1 tidak menjadi "11"
    const qty = parseInt(newQty);
    if (isNaN(qty)) return; // Abaikan jika user mengetik huruf/kosong

    const fd = new FormData(); 
    fd.append('action', 'update_cart_qty');
    fd.append('item_id', id); 
    fd.append('quantity', qty);
    
    await fetch(API_URL, { method: 'POST', body: fd });
    loadCart(); // Reload UI
}

function toggleAllCartItems(el) {
    document.querySelectorAll('.cart-checkbox').forEach(cb => cb.checked = el.checked);
    calculateCartTotal();
}

function calculateCartTotal() {
    let total = 0; let count = 0;
    const checkboxes = document.querySelectorAll('.cart-checkbox:checked');
    const allCheckboxes = document.querySelectorAll('.cart-checkbox');
    
    checkboxes.forEach(cb => {
        total += parseInt(cb.dataset.price) * parseInt(cb.dataset.qty);
        count++;
    });

    document.getElementById('cart-total-price').innerText = `Rp ${total.toLocaleString()}`;
    document.getElementById('cart-selected-count').innerText = count;
    document.getElementById('btn-checkout').disabled = count === 0;
    
    const delBtn = document.getElementById('btn-delete-cart');
    count > 0 ? delBtn.classList.remove('hidden') : delBtn.classList.add('hidden');

    // Handle partial check state for 'Check All' box
    const checkAll = document.getElementById('cart-check-all');
    checkAll.checked = count > 0 && count === allCheckboxes.length;
    checkAll.indeterminate = count > 0 && count < allCheckboxes.length;
}

async function deleteSelectedCartItems() {
    const ids = Array.from(document.querySelectorAll('.cart-checkbox:checked')).map(cb => cb.value);
    if(ids.length === 0 || !confirm("Hapus barang terpilih dari keranjang?")) return;

    const fd = new FormData(); fd.append('action', 'delete_cart_items');
    fd.append('item_ids', JSON.stringify(ids));
    await fetch(API_URL, { method: 'POST', body: fd });
    loadCart();
}

async function processCartCheckout() {
    const ids = Array.from(document.querySelectorAll('.cart-checkbox:checked')).map(cb => cb.value);
    if(ids.length === 0) return;

    // Untuk demo industri MVP, prompt cukup. Di produksi, gunakan form UI modal.
    const contactInfo = prompt("Masukkan nomor WhatsApp/Kontak Anda untuk melanjutkan:");
    if (!contactInfo) return;

    const btn = document.getElementById('btn-checkout');
    const originalText = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; btn.disabled = true;

    const fd = new FormData(); fd.append('action', 'checkout_cart');
    fd.append('cart_id', CART_ID); fd.append('contact', contactInfo);
    fd.append('item_ids', JSON.stringify(ids));

    try {
        const res = await fetch(API_URL, { method: 'POST', body: fd });
        const data = await res.json();
        
        if (data.status === 'success') {
            alert(`Pesanan Berhasil! ID Checkout Anda: ${data.checkout_id}`);
            
            // Format pesan WA agregasi
            let waMsg = `Halo Penjual ElektroMarket, saya ingin melanjutkan pesanan dengan ID: *${data.checkout_id}*\n\nDetail Pesanan:\n`;
            data.items.forEach((item, idx) => { waMsg += `${idx+1}. ${item.product_name} (${item.quantity}x) - Rp ${(item.price * item.quantity).toLocaleString()}\n`; });
            waMsg += `\n*Total Tagihan: Rp ${data.total.toLocaleString()}*`;
            
            // Redirect WA. Jika multiple seller, dalam real-world system akan pecah by seller. 
            // Disini kita mengarahkan ke CS sistem / seller general.
            window.open(`https://wa.me/6281234567890?text=${encodeURIComponent(waMsg)}`, '_blank');
            
            loadCart();
            switchView('history'); // Beralih otomatis ke histori untuk memverifikasi entri baru (Denormalisasi).
        }
    } catch (e) { alert("Terjadi kesalahan sistem saat checkout."); }
    finally { btn.innerHTML = originalText; btn.disabled = false; }
}

// --- 🧠 SMART PRICING AI ---
async function getSmartPrice(itemName, reqId) {
    const suggestionBox = document.getElementById(`price-suggestion-${reqId}`);
    const priceInput = document.getElementById(`price-input-${reqId}`);
    const icon = priceInput.nextElementSibling.querySelector('i');
    
    icon.classList.remove('fa-magic'); icon.classList.add('fa-spinner', 'fa-spin');

    try {
        const keyword = itemName.split(' ')[0]; 
        const res = await fetch(`${API_URL}?action=suggest_price&item=${encodeURIComponent(keyword)}`);
        const data = await res.json();
        
        suggestionBox.classList.remove('hidden');
        if (data.price) {
            suggestionBox.innerHTML = `<i class="fas fa-chart-line mr-1"></i> Pasar: Rp ${data.price.toLocaleString()} <button type="button" onclick="document.getElementById('price-input-${reqId}').value = ${data.price}; this.parentElement.classList.add('hidden');" class="ml-2 text-indigo-700 underline hover:text-indigo-800">Pakai ini</button>`;
        } else {
            suggestionBox.innerHTML = `<i class="fas fa-info-circle mr-1"></i> Belum ada data pasar untuk "${keyword}".`;
            setTimeout(() => suggestionBox.classList.add('hidden'), 3000);
        }
    } catch (e) {} finally {
        icon.classList.remove('fa-spinner', 'fa-spin'); icon.classList.add('fa-magic');
    }
}

// Handle form submit for buyer view: either send request or cancel based on current state
function handleFormAction() {
    if (currentRequestId) {
        closeRequest(); // Jika sedang mencari, klik tombol akan membatalkan
    } else {
        sendRequest();  // Jika idle, kirim pencarian
    }
}

async function sendRequest() {
    const input = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const text = input.value.trim();
    if (!text) return;

    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const coords = `${pos.coords.latitude},${pos.coords.longitude}`;
        addMessage(text, 'user');
        input.value = '';
        lastOffersJSON = ""; 

        const fd = new FormData();
        fd.append('action', 'create_request');
        fd.append('description', text);
        fd.append('location', coords);
        
        try {
            const res = await fetch(API_URL, { method: 'POST', body: fd });
            const data = await res.json();
            
            if (data.status === 'success') {
                currentRequestId = data.request_id;
                
                // Transisi tombol ke state "Cancel"
                sendBtn.disabled = false;
                sendBtn.className = "bg-red-500 text-white h-12 w-12 rounded-full font-bold hover:bg-red-600 active:scale-95 transition-all shadow-md flex items-center justify-center";
                sendBtn.innerHTML = '<i class="fas fa-times"></i>';
                
                addMessage('<span id="broadcast-text" class="flex items-center gap-2 text-indigo-600"><i class="fas fa-radar fa-spin"></i> Sedang menyebarkan permintaan ke penjual terdekat...</span>', 'bot');
                pollInterval = setInterval(fetchOffers, 2000);
            }
        } catch (error) { 
            alert("Network error. Please try again."); 
            resetBuyerState("Gagal mengirim permintaan.");
        } 
    }, () => { 
        alert("Mohon aktifkan GPS agar penjual bisa menghitung ongkir."); 
        resetBuyerState("Akses GPS ditolak.");
    });
}

async function closeRequest() {
    if (!currentRequestId) return;
    const sendBtn = document.getElementById('send-btn');
    
    // Set UI ke loading pembatalan
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    sendBtn.disabled = true;

    const fd = new FormData(); 
    fd.append('action', 'close_request'); 
    fd.append('request_id', currentRequestId);
    
    try { 
        await fetch(API_URL, { method: 'POST', body: fd }); 
    } catch (e) {}

    resetBuyerState("🚫 Pencarian dibatalkan.");
}

function resetBuyerState(msg) {
    if(pollInterval) clearInterval(pollInterval);
    currentRequestId = null; 
    lastOffersJSON = ""; 
    
    // Kembalikan tombol ke state "Send" awal
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('user-input');
    
    if (sendBtn) {
        sendBtn.className = "bg-indigo-600 text-white h-12 w-12 rounded-full font-bold hover:bg-indigo-700 active:scale-95 transition-all shadow-md flex items-center justify-center disabled:opacity-50";
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        sendBtn.disabled = false;
    }
    if (input) {
        input.disabled = false;
    }

    const broadcastTxt = document.getElementById('broadcast-text');
    if (broadcastTxt) broadcastTxt.closest('.msg-bubble').remove();
    
    if (msg) addMessage(msg, 'bot');
    const old = document.getElementById('offer-container'); 
    if(old) old.remove();
}