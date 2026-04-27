/* ============================================================
   ElektroMarket — Seller Dashboard
   seller.js  |  All seller-only logic, zero buyer/cart code.
   ============================================================ */

// ── CONFIG ────────────────────────────────────────────────────
const API_URL = 'api.php';    // ← Change this before deployment

// ── STATE ─────────────────────────────────────────────────────
let sellerInterval   = null;       // polling timer
let map              = null;       // Leaflet map instance
let mapMarker        = null;       // single active marker on detail map
let renderedIds      = new Set();  // IDs already in the sidebar list
let allRequests      = [];         // full request array for filtering
let activeRequestId  = null;       // currently selected request ID

// ── BOOT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    startPolling();

    // Make upload-area clickable
    document.getElementById('upload-area')
        .addEventListener('click', (e) => {
            if (e.target.closest('#upload-preview')) return;
            document.getElementById('file-input').click();
        });
});

// ── POLLING ───────────────────────────────────────────────────
function startPolling() {
    loadRequests();
    sellerInterval = setInterval(loadRequests, 3000);
}

function stopPolling() {
    if (sellerInterval) clearInterval(sellerInterval);
}

// ── FETCH & RENDER REQUESTS ───────────────────────────────────
async function loadRequests() {
    try {
        const res      = await fetch(`${API_URL}?action=get_requests`);
        const requests = await res.json();

        allRequests = requests;
        updateLiveBadge(true, requests.length);
        syncRequestList(requests);
    } catch (err) {
        updateLiveBadge(false, 0);
    }
}

/**
 * Syncs the sidebar list without full re-render:
 *  - Removes cards whose IDs are no longer in the server response.
 *  - Prepends new cards for newly arrived requests.
 */
function syncRequestList(requests) {
    const list      = document.getElementById('request-list');
    const emptyEl   = document.getElementById('empty-state');
    const serverIds = new Set(requests.map(r => parseInt(r.id)));

    // Remove stale cards
    renderedIds.forEach(id => {
        if (!serverIds.has(id)) {
            document.getElementById(`req-card-${id}`)?.remove();
            renderedIds.delete(id);

            // If this was the active request, reset to idle
            if (activeRequestId === id) showIdlePanel();
        }
    });

    // Add new cards (newest first)
    [...requests].reverse().forEach(req => {
        const reqId = parseInt(req.id);
        if (renderedIds.has(reqId)) return;

        const card = buildRequestCard(req);
        // Insert before empty-state if it exists, otherwise prepend
        list.insertBefore(card, emptyEl.nextSibling);
        renderedIds.add(reqId);

        // Notify if not first load
        if (renderedIds.size > 1) showToast('Permintaan baru masuk!');
    });

    // Show / hide empty state
    const hasItems = renderedIds.size > 0;
    emptyEl.classList.toggle('hidden', hasItems);

    // Update count badge
    const badge = document.getElementById('req-count-badge');
    badge.textContent = renderedIds.size;
    badge.classList.toggle('hidden', renderedIds.size === 0);

    // Stat chip in idle panel
    document.getElementById('stat-pending').textContent =
        `${renderedIds.size} Permintaan Aktif`;

    // Apply current search filter
    const q = document.getElementById('search-input').value;
    if (q) filterRequests(q);
}

/** Builds a sidebar request card element. */
function buildRequestCard(req) {
    const card = document.createElement('div');
    card.id = `req-card-${req.id}`;
    card.className = 'req-card';
    card.setAttribute('data-desc', req.description.toLowerCase());
    card.onclick = () => selectRequest(req.id);

    // Parse quantity info
    let qtyInfo = '';
    let totalQty = 1;
    if (req.parsed_items) {
        try {
            const items = JSON.parse(req.parsed_items);
            totalQty = items.reduce((s, i) => s + i.qty, 0);
            qtyInfo = `<span class="req-qty"><i class="fas fa-cubes mr-1"></i>${totalQty} unit</span>`;
        } catch (_) {}
    }

    // Relative time
    const timeAgo = relativeTime(req.created_at);
    const hasLoc  = !!req.location;

    card.innerHTML = `
        <div class="req-card-inner">
            <div class="req-avatar">
                <i class="fas fa-user"></i>
            </div>
            <div class="req-info">
                <div class="req-top">
                    <span class="req-name">Buyer</span>
                    <span class="req-time">${timeAgo}</span>
                </div>
                <div class="req-desc">${escapeHTML(req.description)}</div>
                <div class="req-tags">
                    ${qtyInfo}
                    ${hasLoc ? `<span class="req-loc"><i class="fas fa-map-marker-alt mr-1"></i>Lokasi Tersedia</span>` : ''}
                </div>
            </div>
        </div>
    `;

    // Store full data on element for quick access
    card._data = req;
    return card;
}

// ── SELECT REQUEST → POPULATE DETAIL PANEL ───────────────────
function selectRequest(reqId) {
    activeRequestId = reqId;

    // Highlight active card
    document.querySelectorAll('.req-card').forEach(c => c.classList.remove('active'));
    const card = document.getElementById(`req-card-${reqId}`);
    if (card) card.classList.add('active');

    const req = allRequests.find(r => parseInt(r.id) === parseInt(reqId));
    if (!req) return;

    showActivePanel(req);
}

function showActivePanel(req) {
    document.getElementById('idle-panel').classList.add('hidden');
    document.getElementById('active-panel').classList.remove('hidden');
    // Mobile: slide detail panel into view
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
    // Mobile: slide detail panel out
    document.querySelector('.detail-panel').classList.remove('panel-open');
}

/** Fills the detail header bar with request metadata. */
function populateDetailHeader(req) {
    let totalQty = 1;
    let qtyBadges = '';

    if (req.parsed_items) {
        try {
            const items = JSON.parse(req.parsed_items);
            totalQty = items.reduce((s, i) => s + i.qty, 0);
            qtyBadges = items.map(i =>
                `<span class="hdr-badge"><i class="fas fa-cube mr-1 text-indigo-400"></i>${i.item} × ${i.qty}</span>`
            ).join('');
        } catch (_) {}
    }

    const mapLink = req.location
        ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(req.location)}" target="_blank" class="hdr-map-btn"><i class="fas fa-map-marked-alt"></i> Buka Maps</a>`
        : '';

    document.getElementById('detail-header').innerHTML = `
        <div class="hdr-left">
            <button class="hdr-back-btn" onclick="showIdlePanel()">
                <i class="fas fa-arrow-left"></i>
            </button>
            <div>
                <div class="hdr-desc">"${escapeHTML(req.description)}"</div>
                <div class="hdr-badges">
                    ${qtyBadges || `<span class="hdr-badge"><i class="fas fa-cube mr-1 text-indigo-400"></i>Qty: ${totalQty}</span>`}
                    <span class="hdr-badge text-slate-500"><i class="fas fa-clock mr-1"></i>${relativeTime(req.created_at)}</span>
                </div>
            </div>
        </div>
        <div class="hdr-right">${mapLink}</div>
    `;
}

/** Sets the hidden form fields for the selected request. */
function prefillForm(req) {
    let totalQty = 1;
    if (req.parsed_items) {
        try {
            const items = JSON.parse(req.parsed_items);
            totalQty = items.reduce((s, i) => s + i.qty, 0);
        } catch (_) {}
    }

    document.getElementById('form-request-id').value = req.id;
    document.getElementById('form-total-qty').value  = totalQty;

    // Store item name for smart pricing
    let firstName = req.description;
    if (req.parsed_items) {
        try { firstName = JSON.parse(req.parsed_items)[0]?.item || firstName; } catch (_) {}
    }
    document.getElementById('offer-form').dataset.itemName = firstName;
}

// ── LEAFLET MAP (DETAIL PANEL) ────────────────────────────────
function initDetailMap(req) {
    const defaultCoords = [-6.285, 107.17];
    let coords = defaultCoords;

    if (req.location) {
        const parts = req.location.split(',');
        if (parts.length === 2) coords = [parseFloat(parts[0]), parseFloat(parts[1])];
    }

    if (!map) {
        map = L.map('detail-map', { zoomControl: false }).setView(coords, 14);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '© CartoDB'
        }).addTo(map);
        L.control.zoom({ position: 'bottomleft' }).addTo(map);
    } else {
        map.setView(coords, 14);
    }

    // Remove old marker
    if (mapMarker) map.removeLayer(mapMarker);

    if (req.location) {
        const icon = L.divIcon({
            className: '',
            html: `<div class="map-pin-dot"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
        });
        mapMarker = L.marker(coords, { icon })
            .addTo(map)
            .bindPopup(`<b style="font-family:'Plus Jakarta Sans'">${escapeHTML(req.description)}</b>`)
            .openPopup();

        document.getElementById('map-badge').style.display = 'flex';
    } else {
        document.getElementById('map-badge').style.display = 'none';
    }

    // Force re-render after CSS animation settles
    setTimeout(() => map.invalidateSize(), 350);
}

// ── OFFER FORM — SUBMIT ───────────────────────────────────────
async function submitOffer(e) {
    e.preventDefault();

    const form   = document.getElementById('offer-form');
    const btn    = document.getElementById('submit-btn');
    const label  = document.getElementById('submit-label');
    const reqId  = parseInt(document.getElementById('form-request-id').value);
    const qty    = parseInt(document.getElementById('form-total-qty').value) || 1;

    if (!reqId) return;

    // Loading state
    btn.disabled = true;
    btn.querySelector('i').className = 'fas fa-spinner fa-spin';
    label.textContent = 'Memproses…';

    const fd = new FormData(form);
    const unitPrice  = parseInt(fd.get('unit_price')) || 0;
    const totalPrice = unitPrice * qty;

    // Compress image if provided
    const fileInput = document.getElementById('file-input');
    if (fileInput.files.length > 0) {
        const compressed = await compressImage(fileInput.files[0]);
        fd.set('product_image', compressed);
    }

    fd.set('action', 'add_offer');
    fd.set('request_id', reqId);
    fd.set('seller_name', fd.get('seller'));
    fd.set('product_name', fd.get('product'));
    fd.set('price', totalPrice);
    fd.delete('unit_price');
    fd.delete('total_qty');

    try {
        const res  = await fetch(API_URL, { method: 'POST', body: fd });
        const data = await res.json();

        if (data.status === 'success') {
            showSuccessFlash();
            resetFormFields();
        } else {
            alert('Gagal mengirim: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        alert('Network error. Periksa koneksi dan coba lagi.');
    } finally {
        btn.disabled = false;
        btn.querySelector('i').className = 'fas fa-paper-plane';
        label.textContent = 'Kirim Penawaran';
    }
}

// ── SMART PRICING ─────────────────────────────────────────────
async function getSmartPrice() {
    const form      = document.getElementById('offer-form');
    const itemName  = form.dataset.itemName || '';
    const keyword   = itemName.trim().split(' ')[0];
    const box       = document.getElementById('price-suggestion');
    const icon      = document.getElementById('smart-price-icon');

    if (!keyword) return;

    icon.className = 'fas fa-spinner fa-spin';

    try {
        const res  = await fetch(`${API_URL}?action=suggest_price&item=${encodeURIComponent(keyword)}`);
        const data = await res.json();

        box.classList.remove('hidden');

        if (data.price) {
            box.innerHTML = `
                <i class="fas fa-chart-line mr-1.5"></i>
                Harga Pasar: <strong>Rp ${parseInt(data.price).toLocaleString()}</strong>
                <button type="button"
                    onclick="document.getElementById('inp-price').value = ${data.price}; document.getElementById('price-suggestion').classList.add('hidden')"
                    class="use-price-btn">Pakai ini</button>`;
        } else {
            box.innerHTML = `<i class="fas fa-info-circle mr-1.5"></i> Belum ada data pasar untuk "<strong>${escapeHTML(keyword)}</strong>".`;
            setTimeout(() => box.classList.add('hidden'), 3500);
        }
    } catch (_) {
        box.classList.add('hidden');
    } finally {
        icon.className = 'fas fa-magic';
    }
}

// ── IMAGE UPLOAD ──────────────────────────────────────────────
function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
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

/** Compresses image to max 800px / JPEG 0.82 before upload. */
function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (ev) => {
            const img = new Image();
            img.src = ev.target.result;
            img.onload = () => {
                const MAX = 800;
                let w = img.width, h = img.height;
                if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                else if (h > MAX)     { w = Math.round(w * MAX / h); h = MAX; }

                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(
                    (blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })),
                    'image/jpeg', 0.82
                );
            };
        };
    });
}

// ── UI HELPERS ────────────────────────────────────────────────

/** Filters sidebar cards by search query. */
function filterRequests(q) {
    const lq = q.toLowerCase();
    document.querySelectorAll('.req-card').forEach(card => {
        const match = card.getAttribute('data-desc')?.includes(lq) ?? true;
        card.classList.toggle('hidden', !match);
    });
}

/** Shows the green "Penawaran terkirim!" flash below the form. */
function showSuccessFlash() {
    const flash = document.getElementById('success-flash');
    flash.classList.remove('hidden', 'fade-out');
    flash.classList.add('flash-in');
    setTimeout(() => { flash.classList.add('fade-out'); }, 2800);
    setTimeout(() => { flash.classList.add('hidden'); flash.classList.remove('flash-in', 'fade-out'); }, 3300);
}

/** Clears all user-entered form fields (keeps hidden fields intact). */
function resetFormFields() {
    document.getElementById('inp-seller').value  = '';
    document.getElementById('inp-product').value = '';
    document.getElementById('inp-price').value   = '';
    document.getElementById('inp-contact').value = '';
    document.getElementById('price-suggestion').classList.add('hidden');
    clearImage();
}

/** Resets validation states on panel open. */
function resetFormUI() {
    document.getElementById('success-flash').classList.add('hidden');
    document.getElementById('price-suggestion').classList.add('hidden');
}

/** Updates the Live badge in the sidebar header. */
function updateLiveBadge(online, count) {
    const badge = document.getElementById('live-badge');
    const label = document.getElementById('live-label');
    if (online) {
        badge.classList.remove('offline');
        badge.classList.add('online');
        label.textContent = count > 0 ? `${count} Permintaan` : 'Live';
    } else {
        badge.classList.remove('online');
        badge.classList.add('offline');
        label.textContent = 'Offline';
    }
}

/** Shows a brief toast notification. */
let toastTimer = null;
function showToast(msg) {
    const toast  = document.getElementById('toast');
    const msgEl  = document.getElementById('toast-msg');
    msgEl.textContent = msg;
    toast.classList.remove('hidden', 'toast-hide');
    toast.classList.add('toast-show');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.replace('toast-show', 'toast-hide');
        setTimeout(() => toast.classList.add('hidden'), 400);
    }, 3000);
}

/** Simple HTML escape to prevent XSS in dynamic content. */
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Human-readable relative time (e.g. "2 menit lalu"). */
function relativeTime(dateStr) {
    const now  = new Date();
    const then = new Date(dateStr);
    // Backend timestamps may be in local TZ without offset — treat as-is
    const diff = Math.round((now - then) / 1000);

    if (diff < 5)   return 'baru saja';
    if (diff < 60)  return `${diff} dtk lalu`;
    if (diff < 3600) return `${Math.round(diff / 60)} mnt lalu`;
    return `${Math.round(diff / 3600)} jam lalu`;
}
