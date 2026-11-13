(function () {
    'use strict';

    const RECENT_ORDERS_KEY = 'boost_recent_orders_v1';
    const MAX_RECENT_ORDERS = 12;

    const state = {
        config: {
            authenticated: false,
            role: null,
            username: null,
            pricing: { clickRate: 40, hourlyRate: 2000, currency: 'VND' },
            browserMode: 'request',
            bankInfo: null
        },
        activeOrder: null,
        activeOrderId: null,
        pollTimer: null,
        countdownTimer: null,
        costDebounce: null,
        costRequestSeq: 0,
        socket: null,
        adminOrders: [],
        adminCampaigns: [],
        adminLoadingPromise: null,
        expandPreviewSlices: false,
        campaignLogs: new Map(),
        activeTab: 'customer'
    };

    const $ = (id) => document.getElementById(id);

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fmtVnd(amount) {
        const n = Number(amount || 0);
        return n.toLocaleString('vi-VN') + ' VNĐ';
    }

    function fmtTime(ts) {
        if (!ts) return '--';
        try { return new Date(ts).toLocaleString('vi-VN'); } catch (e) { return '--'; }
    }

    function showAlert(containerId, msg, kind = 'info') {
        const el = $(containerId);
        if (!el) return;
        if (!msg) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = `<div class="alert ${esc(kind)}">${esc(msg)}</div>`;
    }

    async function apiJson(url, opts = {}) {
        const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
        const res = await fetch(url, { ...opts, headers });
        let data = null;
        try { data = await res.json(); } catch (e) { data = { success: false, message: 'Invalid JSON response' }; }
        return { res, data };
    }

    // ─── Public Config & Single-Account Auth State ────────────────────────────
    async function refreshPublicConfig() {
        try {
            const { res, data } = await apiJson('/api/public-config');
            if (res.ok && data && data.success) {
                state.config = data;
            }
        } catch (e) {
            // Keep existing fallback pricing/config
        }
        renderAuthState();
    }

    function renderAuthState() {
        const { authenticated, role, username, pricing } = state.config;
        const authPill = $('auth-pill');
        const loginBtn = $('open-login-btn');
        const logoutBtn = $('logout-btn');

        if (pricing) {
            $('spec-pricing').textContent =
                `${Number(pricing.clickRate || 40).toLocaleString('vi-VN')} VNĐ/click + Math.ceil(giờ) × ${Number(pricing.hourlyRate || 2000).toLocaleString('vi-VN')} VNĐ`;
            $('c-rate').textContent = Number(pricing.clickRate || 40).toLocaleString('vi-VN');
            $('c-hrate').textContent = Number(pricing.hourlyRate || 2000).toLocaleString('vi-VN');
        }

        const isAdmin = authenticated && role === 'admin';
        if (isAdmin) {
            authPill.className = 'pill ok';
            authPill.textContent = `Admin: ${username || 'admin'} (1 tài khoản)`;
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
            $('admin-gate-box').classList.add('hidden');
            $('admin-workspace').classList.remove('hidden');
            loadAdminDashboard();
        } else if (authenticated && role === 'guest') {
            authPill.className = 'pill warn';
            authPill.textContent = `Guest: ${username || '1'} (Chỉ xem)`;
            loginBtn.classList.remove('hidden');
            loginBtn.textContent = 'Đổi sang Admin';
            logoutBtn.classList.remove('hidden');
            $('admin-gate-box').classList.remove('hidden');
            $('admin-workspace').classList.add('hidden');
            showAlert('admin-gate-msg', 'Bạn đang đăng nhập bằng tài khoản guest (1/1) chỉ đọc. Để duyệt thanh toán và cấu hình, hãy đăng nhập bằng tài khoản Admin duy nhất trong admin.json.', 'warn');
        } else {
            authPill.className = 'pill info';
            authPill.textContent = 'Khách (Không cần tài khoản)';
            loginBtn.classList.remove('hidden');
            loginBtn.textContent = 'Đăng nhập 1 Tài khoản';
            logoutBtn.classList.add('hidden');
            $('admin-gate-box').classList.remove('hidden');
            $('admin-workspace').classList.add('hidden');
            showAlert('admin-gate-msg', '');
        }

        if (state.activeOrder) {
            renderActiveOrder(state.activeOrder);
        }
    }

    function openLoginModal() {
        showAlert('login-modal-msg', '');
        $('login-modal').classList.add('open');
        setTimeout(() => $('login-user').focus(), 20);
    }

    function closeLoginModal() {
        $('login-modal').classList.remove('open');
    }

    async function handleLoginSubmit(e) {
        e.preventDefault();
        const username = $('login-user').value.trim();
        const password = $('login-pass').value;
        const rememberMe = $('login-remember').checked;
        if (!username || !password) {
            showAlert('login-modal-msg', 'Vui lòng nhập tên đăng nhập và mật khẩu.', 'err');
            return;
        }
        const btn = $('submit-login-btn');
        btn.disabled = true;
        try {
            const { res, data } = await apiJson('/api/login', {
                method: 'POST',
                body: JSON.stringify({ username, password, rememberMe })
            });
            if (!res.ok || !data.success) {
                showAlert('login-modal-msg', data.message || 'Đăng nhập thất bại.', 'err');
                return;
            }
            $('login-pass').value = '';
            closeLoginModal();
            reconnectSocket();
            await refreshPublicConfig();
        } catch (err) {
            showAlert('login-modal-msg', 'Lỗi kết nối máy chủ khi đăng nhập.', 'err');
        } finally {
            btn.disabled = false;
        }
    }

    async function handleLogout() {
        try {
            await apiJson('/api/logout', { method: 'POST', body: '{}' });
        } catch (e) {}
        state.adminOrders = [];
        state.adminCampaigns = [];
        state.adminLoadingPromise = null;
        state.campaignLogs.clear();
        const glog = $('adm-global-log');
        if (glog) glog.innerHTML = '';
        const wlog = $('ao-worker-log');
        if (wlog) wlog.innerHTML = '';
        const cbody = $('adm-campaigns-body');
        if (cbody) cbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted)">Chưa có chiến dịch nào.</td></tr>';
        const obody = $('adm-orders-body');
        if (obody) obody.innerHTML = '<tr><td colspan="8" style="color:var(--muted)">Chưa có đơn hàng nào.</td></tr>';
        if ($('adm-sum-total')) $('adm-sum-total').textContent = '0';
        if ($('adm-sum-rev')) $('adm-sum-rev').textContent = '0 VNĐ';
        if ($('adm-sum-paid')) $('adm-sum-paid').textContent = '0';
        if ($('adm-sum-pending')) $('adm-sum-pending').textContent = '0';
        ['adm-action-msg', 'adm-paycfg-msg', 'adm-proxycfg-msg', 'adm-camp-msg'].forEach(id => showAlert(id, ''));
        if ($('cfg-secret')) $('cfg-secret').value = '';
        if ($('pcfg-keys')) $('pcfg-keys').value = '';
        reconnectSocket();
        await refreshPublicConfig();
    }

    // ─── Cost & TimeDistribution Preview ──────────────────────────────────────
    function getCustomBlocksFromUI() {
        return {
            night: $('cb-night').value || 'low',
            early_morning: $('cb-early').value || 'medium',
            morning: $('cb-morn').value || 'high',
            noon: $('cb-noon').value || 'medium',
            afternoon: $('cb-after').value || 'high',
            evening: $('cb-eve').value || 'high',
            late_night: $('cb-late').value || 'medium'
        };
    }

    function setCostHint(msg) {
        const el = $('cost-hint');
        if (!el) return;
        if (!msg) {
            el.textContent = '';
            el.classList.add('hidden');
        } else {
            el.textContent = msg;
            el.classList.remove('hidden');
        }
    }

    function resetCostDisplay() {
        $('c-hours').textContent = '0';
        $('c-click-fee').textContent = '0 VNĐ';
        $('c-hour-fee').textContent = '0 VNĐ';
        $('c-total').textContent = '0 VNĐ';
    }

    async function updateCostAndDistribution() {
        const rawClicks = $('f-clicks').value.trim();
        const rawHours = $('f-hours').value.trim();
        const targetClicks = Number(rawClicks);
        const durationHours = Number(rawHours);
        const schedVal = $('f-schedule').value;
        const mode = ['even', 'custom'].includes(schedVal) ? schedVal : 'smart';
        const customBlocks = mode === 'custom' ? getCustomBlocksFromUI() : null;

        $('custom-blocks-box').classList.toggle('hidden', mode !== 'custom');

        const clicksOk = rawClicks !== '' && Number.isInteger(targetClicks) && targetClicks >= 1;
        const hoursOk = rawHours !== '' && Number.isFinite(durationHours) && durationHours > 0;

        $('c-clicks').textContent = clicksOk ? targetClicks.toLocaleString('vi-VN') : '0';

        if (!clicksOk || !hoursOk) {
            state.costRequestSeq++;
            resetCostDisplay();
            if (!clicksOk && rawClicks !== '') {
                setCostHint('Số lượt click phải là số nguyên dương (≥ 1).');
            } else if (!hoursOk && rawHours !== '') {
                setCostHint('Thời gian chạy phải lớn hơn 0 giờ.');
            } else {
                setCostHint('');
            }
            renderDistributionPreview(0, 0, mode, customBlocks);
            return;
        }

        setCostHint('');
        const reqSeq = ++state.costRequestSeq;
        try {
            const { res, data } = await apiJson('/api/orders/calculate-cost', {
                method: 'POST',
                body: JSON.stringify({ targetClicks, durationHours })
            });
            if (reqSeq !== state.costRequestSeq) return;
            if (res.ok && data.success) {
                $('c-rate').textContent = Number(data.clickRate).toLocaleString('vi-VN');
                $('c-hrate').textContent = Number(data.hourlyRate).toLocaleString('vi-VN');
                $('c-hours').textContent = data.roundedHours;
                $('c-click-fee').textContent = fmtVnd(data.clickFee);
                $('c-hour-fee').textContent = fmtVnd(data.durationFee);
                $('c-total').textContent = fmtVnd(data.totalAmount);
            } else {
                resetCostDisplay();
                setCostHint((data && data.message) || 'Thông số tính giá chưa hợp lệ.');
            }
        } catch (e) {}

        if (reqSeq !== state.costRequestSeq) return;
        renderDistributionPreview(targetClicks, durationHours, mode, customBlocks);
    }

    function scheduleCostRefresh() {
        clearTimeout(state.costDebounce);
        state.costDebounce = setTimeout(updateCostAndDistribution, 140);
    }

    const MAX_PREVIEW_HOURS = 8760;
    const COLLAPSED_PREVIEW_LIMIT = 48;

    function renderDistributionPreview(targetClicks, durationHours, mode, customBlocks) {
        const tbody = $('dist-preview-body');
        const footer = $('dist-preview-footer');
        const capAlert = $('dist-capacity-alert');
        const intervalPill = $('dist-interval-pill');
        if (footer) footer.innerHTML = '';

        if (!window.TimeDistribution || !Number.isInteger(targetClicks) || targetClicks <= 0 || !Number.isFinite(durationHours) || durationHours <= 0) {
            intervalPill.textContent = '--';
            capAlert.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">Nhập số click nguyên (≥ 1) &amp; thời gian &gt; 0 để xem trước phân bổ.</td></tr>';
            return;
        }

        if (durationHours > MAX_PREVIEW_HOURS) {
            const avgIntervalSec = Number(((durationHours * 3600) / targetClicks).toFixed(1));
            intervalPill.textContent = `TB ~${avgIntervalSec}s / click`;
            capAlert.innerHTML = `<div class="alert warn">Thời gian ${esc(durationHours)} giờ vượt quá giới hạn xem trước từng giờ (${MAX_PREVIEW_HOURS.toLocaleString('vi-VN')} giờ / 1 năm). Phí thời gian vẫn được tính chính xác.</div>`;
            tbody.innerHTML = `<tr><td class="mono">Tổng ${esc(durationHours)} giờ</td><td>${Math.round(durationHours * 60).toLocaleString('vi-VN')} phút</td><td><strong>${targetClicks.toLocaleString('vi-VN')}</strong></td><td>100.0%</td></tr>`;
            return;
        }

        const startTime = Date.now();
        const endTime = startTime + Math.round(durationHours * 3600000);
        const dist = window.TimeDistribution.buildTimeDistribution({
            startTime,
            endTime,
            targetClicks,
            mode,
            customBlocks
        });

        if (!dist.valid) {
            intervalPill.textContent = '--';
            capAlert.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">Không thể tính phân bổ với thông số này.</td></tr>';
            return;
        }

        intervalPill.textContent = `TB ~${dist.avgIntervalSec}s / click`;
        if (dist.avgIntervalSec < 15) {
            const safeMax = Math.max(1, Math.floor((durationHours * 3600) / 15));
            capAlert.innerHTML = `<div class="alert warn">Cảnh báo công suất 1 KiotProxy key: nhịp trung bình ~${esc(dist.avgIntervalSec)}s/click nhanh hơn cooldown xoay IP (~15s). 1 key chạy ổn định tối đa khoảng ~${safeMax.toLocaleString('vi-VN')} lượt trong ${esc(durationHours)} giờ (hoặc phần dư sẽ chậm hơn thời hạn).</div>`;
        } else {
            capAlert.innerHTML = `<div class="alert ok">Phù hợp công suất 1 KiotProxy key (nhịp ~${esc(dist.avgIntervalSec)}s/click ≥ 15s cooldown).</div>`;
        }

        const allRows = dist.slices && dist.slices.length > 0 ? dist.slices : dist.summaryBlocks;
        let visibleRows = allRows;
        let tailSummaryRow = '';

        if (allRows.length > COLLAPSED_PREVIEW_LIMIT && !state.expandPreviewSlices) {
            visibleRows = allRows.slice(0, COLLAPSED_PREVIEW_LIMIT);
            const rest = allRows.slice(COLLAPSED_PREVIEW_LIMIT);
            const restMinutes = rest.reduce((acc, s) => acc + Number(s.durationMinutes || 0), 0);
            const restQuota = rest.reduce((acc, s) => acc + Number(s.quota || 0), 0);
            const restPercent = dist.targetClicks > 0 ? ((restQuota / dist.targetClicks) * 100).toFixed(1) : '0.0';
            const firstRest = rest[0];
            const lastRest = rest[rest.length - 1];
            const rangeHint = (firstRest && lastRest && firstRest.startStr && lastRest.endStr)
                ? ` (${firstRest.startStr} → ${lastRest.endStr})`
                : '';
            tailSummaryRow = `<tr data-preview-rest-summary="1" style="background:rgba(56,189,248,0.06);">
                <td class="mono">+ ${rest.length} khung giờ còn lại${esc(rangeHint)}</td>
                <td>${restMinutes.toLocaleString('vi-VN')} phút</td>
                <td><strong>${restQuota.toLocaleString('vi-VN')}</strong></td>
                <td>${esc(restPercent)}%</td>
            </tr>`;
            if (footer) {
                footer.innerHTML = `<button type="button" class="btn btn-sm" data-action="toggle-preview-slices">Hiển thị đủ ${allRows.length} khung giờ (đang gộp ${rest.length} khung cuối)</button>`;
            }
        } else if (allRows.length > COLLAPSED_PREVIEW_LIMIT && footer) {
            footer.innerHTML = `<button type="button" class="btn btn-sm" data-action="toggle-preview-slices">Thu gọn về ${COLLAPSED_PREVIEW_LIMIT} khung giờ + tổng phần còn lại</button>`;
        }

        tbody.innerHTML = visibleRows.map(s => {
            const label = s.startStr && s.endStr ? `${s.startStr} → ${s.endStr}` : (s.label || '--');
            const dur = s.durationMinutes !== undefined ? `${s.durationMinutes} phút` : (s.durationFormatted || '--');
            return `<tr>
                <td class="mono">${esc(label)}</td>
                <td>${esc(dur)}</td>
                <td><strong>${Number(s.quota || 0).toLocaleString('vi-VN')}</strong></td>
                <td>${esc(s.percent)}%</td>
            </tr>`;
        }).join('') + tailSummaryRow;
    }

    // ─── Local Recent Orders (No Account Needed) ──────────────────────────────
    function getRecentOrders() {
        try {
            const raw = localStorage.getItem(RECENT_ORDERS_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function saveRecentOrder(order) {
        if (!order || !order.orderId) return;
        const list = getRecentOrders().filter(x => x && x.orderId !== order.orderId);
        list.unshift({
            orderId: order.orderId,
            orderCode: order.orderCode,
            name: order.name || order.orderCode,
            targetUrl: order.targetUrl,
            totalAmount: order.totalAmount,
            status: order.status,
            createdAt: order.createdAt || Date.now()
        });
        try {
            localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify(list.slice(0, MAX_RECENT_ORDERS)));
        } catch (e) {}
        renderRecentOrders();
    }

    function removeRecentOrder(orderId) {
        const list = getRecentOrders().filter(x => x && x.orderId !== orderId);
        try { localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify(list)); } catch (e) {}
        renderRecentOrders();
    }

    function renderRecentOrders() {
        const wrap = $('recent-orders-wrap');
        const list = getRecentOrders();
        if (!list.length) {
            wrap.innerHTML = '<div class="hint">Chưa có đơn nào được lưu trên trình duyệt này.</div>';
            return;
        }
        wrap.innerHTML = list.slice(0, 6).map(item => `
            <div class="kv">
                <div style="min-width:0; padding-right:8px;">
                    <code class="mono">${esc(item.orderId)}</code>
                    <span class="pill" style="padding:1px 6px;font-size:11px;">${esc(item.orderCode || '')}</span>
                    <div class="hint" style="margin:2px 0 0 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:300px;">
                        ${esc(item.targetUrl || '')}
                    </div>
                </div>
                <div style="display:flex; gap:4px; align-items:center; flex-shrink:0;">
                    <button type="button" class="btn btn-sm" data-action="load-recent" data-id="${esc(item.orderId)}">Mở</button>
                    <button type="button" class="btn btn-sm" data-action="del-recent" data-id="${esc(item.orderId)}">×</button>
                </div>
            </div>
        `).join('');
    }

    // ─── Order Submission & Active Order Tracking ─────────────────────────────
    async function handleOrderSubmit(e) {
        e.preventDefault();
        showAlert('order-form-msg', '');
        const schedVal = $('f-schedule').value;
        const scheduleMode = ['even', 'custom'].includes(schedVal) ? schedVal : 'smart';
        const payload = {
            name: $('f-name').value.trim() || undefined,
            targetUrl: $('f-url').value.trim(),
            proxyKey: $('f-proxy').value.trim(),
            targetClicks: Number($('f-clicks').value),
            durationHours: Number($('f-hours').value),
            scheduleMode,
            customBlocks: scheduleMode === 'custom' ? getCustomBlocksFromUI() : undefined,
            dedupIp: $('f-dedup').checked,
            randomLinks: $('f-links').checked
        };

        const btn = $('submit-order-btn');
        btn.disabled = true;
        btn.textContent = 'Đang tạo đơn & sinh VietQR...';

        try {
            const { res, data } = await apiJson('/api/orders', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (!res.ok || !data.success) {
                showAlert('order-form-msg', data.message || 'Không thể tạo đơn hàng.', 'err');
                return;
            }
            showAlert('order-form-msg', `Đã tạo đơn ${data.orderId} (${data.orderCode}). Vui lòng thanh toán để mở khóa thực thi.`, 'ok');
            saveRecentOrder(data);
            await selectOrder(data.orderId);
        } catch (err) {
            showAlert('order-form-msg', 'Lỗi kết nối máy chủ khi tạo đơn.', 'err');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Tạo đơn Boost & Lấy mã VietQR (Không cần tài khoản)';
        }
    }

    function stopOrderPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    function stopQrCountdown() {
        if (state.countdownTimer) {
            clearInterval(state.countdownTimer);
            state.countdownTimer = null;
        }
    }

    function startQrCountdown(createdAt) {
        stopQrCountdown();
        const el = $('ao-countdown');
        const expireAt = (createdAt || Date.now()) + 15 * 60 * 1000;
        const tick = () => {
            const left = Math.max(0, expireAt - Date.now());
            const m = Math.floor(left / 60000);
            const s = Math.floor((left % 60000) / 1000);
            el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            if (left <= 0) stopQrCountdown();
        };
        tick();
        state.countdownTimer = setInterval(tick, 1000);
    }

    function clearActiveOrderView() {
        stopOrderPolling();
        stopQrCountdown();
        state.activeOrderId = null;
        state.activeOrder = null;
        const wlog = $('ao-worker-log');
        if (wlog) {
            wlog.innerHTML = '';
            delete wlog.dataset.campId;
        }
        $('active-order-panel').classList.add('hidden');
        $('active-order-empty').classList.remove('hidden');
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('orderId');
            url.searchParams.delete('order');
            history.replaceState(null, '', url.toString());
        } catch (e) {}
    }

    async function selectOrder(orderId) {
        const cleanId = String(orderId || '').trim();
        if (!cleanId) {
            showAlert('lookup-order-msg', 'Vui lòng nhập mã đơn hàng cần tra cứu (ORD-...).', 'warn');
            return null;
        }
        showAlert('lookup-order-msg', '');
        showAlert('ao-notice', '');
        $('lookup-order-id').value = cleanId;

        const wlog = $('ao-worker-log');
        if (wlog && state.activeOrderId !== cleanId) {
            wlog.innerHTML = '';
            delete wlog.dataset.campId;
        }
        stopOrderPolling();
        const order = await fetchActiveOrder(cleanId);
        if (order) {
            if (state.socket && state.socket.connected) {
                state.socket.emit('subscribe-order', order.orderId);
            }
            const eff = (order.progress && order.progress.status) || order.status;
            if (!['completed', 'expired', 'stopped'].includes(eff)) {
                state.pollTimer = setInterval(() => fetchActiveOrder(), 3000);
            }
        }
        return order;
    }

    async function fetchActiveOrder(targetOrderId) {
        const lookupId = String(targetOrderId || state.activeOrderId || '').trim();
        if (!lookupId) return null;
        try {
            const { res, data } = await apiJson('/api/orders/' + encodeURIComponent(lookupId));
            if (!res.ok || !data.success || !data.order) {
                const msg = (data && data.message && res.status !== 404)
                    ? data.message
                    : `Không tìm thấy đơn hàng ${lookupId}.`;
                clearActiveOrderView();
                showAlert('lookup-order-msg', msg, 'err');
                return null;
            }
            state.activeOrderId = data.order.orderId;
            state.activeOrder = data.order;
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('orderId', data.order.orderId);
                url.searchParams.delete('order');
                history.replaceState(null, '', url.toString());
            } catch (e) {}
            saveRecentOrder(data.order);
            renderActiveOrder(data.order);
            return data.order;
        } catch (e) {
            if (!state.activeOrder || state.activeOrderId !== lookupId) {
                showAlert('lookup-order-msg', `Lỗi kết nối khi tải đơn hàng ${lookupId}.`, 'err');
            }
            return null;
        }
    }

    function renderActiveOrder(o) {
        $('active-order-empty').classList.add('hidden');
        $('active-order-panel').classList.remove('hidden');

        const prog = o.progress || {
            orderId: o.orderId,
            campaignId: o.campaignId || null,
            status: o.status,
            successVisits: o.successVisits || 0,
            failedVisits: o.failedVisits || 0,
            totalVisits: o.totalVisits || ((o.successVisits || 0) + (o.failedVisits || 0)),
            uniqueIps: o.uniqueIps || 0,
            dupIps: o.dupIps || 0,
            targetLimit: o.targetClicks || 0,
            browserMode: o.browserMode || 'request',
            scheduleMode: o.scheduleMode || 'smart'
        };

        const effectiveStatus = prog.status || o.status || 'pending_payment';
        const isPaid = o.paymentStatus === 'paid';
        const isDone = ['completed', 'expired', 'stopped'].includes(effectiveStatus);
        const isAdmin = state.config.authenticated && state.config.role === 'admin';

        $('ao-id').textContent = o.orderId || '--';
        $('ao-code').textContent = o.orderCode || '--';
        $('ao-target').textContent = `${o.name ? o.name + ' — ' : ''}${o.targetUrl || ''}`;
        $('ao-proxy').textContent = o.proxyKeyMasked || '--';
        const schedLabel = o.scheduleMode === 'even' ? 'Even' : (o.scheduleMode === 'custom' ? 'Custom' : 'Smart');
        $('ao-plan').textContent = `${Number(o.targetClicks || 0).toLocaleString('vi-VN')} clicks / ${o.durationHours}h (${schedLabel}) · Request HTTP`;
        $('ao-amount').textContent = fmtVnd(o.totalAmount);

        const pill = $('ao-status-pill');
        if (!isPaid) {
            pill.className = 'pill warn';
            pill.textContent = 'Chờ thanh toán (Khóa 0 click)';
        } else if (effectiveStatus === 'completed') {
            pill.className = 'pill ok';
            pill.textContent = 'Đã hoàn thành';
            stopOrderPolling();
            stopQrCountdown();
        } else if (effectiveStatus === 'expired') {
            pill.className = 'pill warn';
            pill.textContent = 'Hết thời gian';
            stopOrderPolling();
            stopQrCountdown();
        } else if (effectiveStatus === 'stopped') {
            pill.className = 'pill err';
            pill.textContent = 'Đã dừng';
            stopOrderPolling();
            stopQrCountdown();
        } else {
            pill.className = 'pill info';
            pill.textContent = 'Đã thanh toán · Đang chạy';
            stopQrCountdown();
        }

        const payBox = $('ao-payment-box');
        if (!isPaid) {
            payBox.classList.remove('hidden');
            const bank = o.bankInfo || state.config.bankInfo || {};
            const img = $('ao-qr-img');
            const fb = $('ao-qr-fallback');
            if (o.vietQrUrl) {
                if (img.getAttribute('src') !== o.vietQrUrl) {
                    fb.classList.add('hidden');
                    img.classList.remove('hidden');
                    img.onload = () => {
                        fb.classList.add('hidden');
                        img.classList.remove('hidden');
                    };
                    img.onerror = () => {
                        img.classList.add('hidden');
                        fb.classList.remove('hidden');
                    };
                    img.src = o.vietQrUrl;
                }
            } else {
                img.removeAttribute('src');
                img.classList.add('hidden');
                fb.classList.remove('hidden');
            }
            $('ao-bank').textContent = `${bank.bankName || bank.bankId || '--'} (${bank.bankId || '--'})`;
            $('ao-acc-num').textContent = bank.accountNumber || '--';
            $('ao-acc-name').textContent = bank.accountName || '--';
            $('ao-pay-amount').textContent = fmtVnd(o.totalAmount);
            $('ao-memo').textContent = o.orderCode || '--';
            startQrCountdown(o.createdAt);

            $('inline-admin-confirm-btn').classList.toggle('hidden', !isAdmin);
            $('guest-pay-hint').classList.toggle('hidden', isAdmin);
        } else {
            payBox.classList.add('hidden');
            $('inline-admin-confirm-btn').classList.add('hidden');
        }

        const target = Math.max(1, Number(prog.targetLimit || o.targetClicks || 1));
        const success = Number(prog.successVisits || 0);
        const failed = Number(prog.failedVisits || 0);
        const total = Number(prog.totalVisits || (success + failed));
        const pct = Math.min(100, Math.floor((success / target) * 100));
        const campId = prog.campaignId || o.campaignId || null;

        $('ao-camp-id').textContent = campId || 'Chưa kích hoạt';
        $('ao-progress-bar').style.width = pct + '%';
        $('ao-progress-text').textContent = `${success.toLocaleString('vi-VN')} / ${target.toLocaleString('vi-VN')} lượt thành công (${pct}%)`;

        if (isDone) {
            const endedAt = prog.actualEndTime || o.completedAt || prog.endTime;
            const startedAt = prog.actualStartTime || o.paidAt || prog.startTime;
            let durSuffix = '';
            if (endedAt && startedAt && endedAt >= startedAt && window.TimeDistribution && typeof window.TimeDistribution.formatDuration === 'function') {
                durSuffix = ` · Thời lượng: ${window.TimeDistribution.formatDuration(endedAt - startedAt)}`;
            }
            $('ao-time-text').textContent = endedAt ? `Kết thúc thực tế: ${fmtTime(endedAt)}${durSuffix}` : `Hoàn tất (Tạo lúc: ${fmtTime(o.createdAt)})`;
        } else {
            $('ao-time-text').textContent = prog.endTime ? `Dự kiến kết thúc: ${fmtTime(prog.endTime)}` : `Tạo lúc: ${fmtTime(o.createdAt)}`;
        }

        $('st-success').textContent = success.toLocaleString('vi-VN');
        $('st-failed').textContent = failed.toLocaleString('vi-VN');
        $('st-total').textContent = total.toLocaleString('vi-VN');
        $('st-unique').textContent = Number(prog.uniqueIps || 0).toLocaleString('vi-VN');
        $('st-dup').textContent = Number(prog.dupIps || 0).toLocaleString('vi-VN');
        $('st-mode').textContent = prog.browserMode || o.browserMode || 'request';

        $('inline-admin-stop-btn').classList.toggle('hidden', !(isAdmin && campId && !isDone));
        $('ao-admin-log-wrap').classList.toggle('hidden', !isAdmin);
        if (isAdmin && campId) {
            hydrateOrderWorkerLogs(campId);
        }
    }

    async function confirmOrderAsAdmin(orderId) {
        const isViewingOrder = state.activeOrderId === orderId;
        showAlert('adm-action-msg', '');
        if (isViewingOrder) showAlert('ao-notice', '');
        const { res, data } = await apiJson('/api/orders/' + encodeURIComponent(orderId) + '/confirm', {
            method: 'POST',
            body: '{}'
        });
        if (!res.ok || !data.success) {
            const msg = (data && data.message) || 'Không thể xác nhận đơn hàng.';
            if (isViewingOrder) showAlert('ao-notice', msg, 'err');
            showAlert('adm-action-msg', msg, 'err');
            return false;
        }
        const okMsg = `Đã xác nhận thanh toán đơn ${data.orderId} -> Campaign ${data.campaignId} đang chạy.`;
        showAlert('adm-action-msg', okMsg, 'ok');
        if (isViewingOrder) {
            showAlert('ao-notice', okMsg, 'ok');
            if (state.activeOrder && data.campaignId) {
                state.activeOrder.campaignId = data.campaignId;
                state.activeOrder.paymentStatus = 'paid';
                hydrateOrderWorkerLogs(data.campaignId);
            }
            await fetchActiveOrder(orderId);
        }
        await Promise.all([loadAdminOrders(), loadAdminCampaigns()]);
        return true;
    }

    async function stopCampaignAsAdmin(campaignId) {
        if (!campaignId) return;
        const activeCampId = state.activeOrder && ((state.activeOrder.progress && state.activeOrder.progress.campaignId) || state.activeOrder.campaignId);
        const isViewingCampaign = Boolean(activeCampId && String(activeCampId) === String(campaignId));
        const { res, data } = await apiJson('/api/campaigns/' + encodeURIComponent(campaignId) + '/stop', {
            method: 'POST',
            body: '{}'
        });
        if (!res.ok || !data.success) {
            const msg = (data && data.message) || 'Không thể dừng chiến dịch.';
            if (isViewingCampaign) showAlert('ao-notice', msg, 'err');
            showAlert('adm-action-msg', msg, 'err');
            return;
        }
        const warnMsg = `Đã gửi lệnh dừng chiến dịch ${campaignId}.`;
        showAlert('adm-action-msg', warnMsg, 'warn');
        if (isViewingCampaign) showAlert('ao-notice', warnMsg, 'warn');
        if (state.activeOrderId) await fetchActiveOrder();
        await Promise.all([loadAdminOrders(), loadAdminCampaigns()]);
    }

    function downloadActiveReport() {
        const o = state.activeOrder;
        if (!o) return;
        const p = o.progress || {};
        const lines = [
            '=== BAO CAO DON HANG TRAFFIC BOOST ===',
            `Ma don (Order ID): ${o.orderId}`,
            `Ma chuyen khoan (Order Code): ${o.orderCode}`,
            `Ten chien dich: ${o.name || ''}`,
            `URL dich: ${o.targetUrl}`,
            `Proxy Key (da che): ${o.proxyKeyMasked || '--'}`,
            `Che do thuc thi: ${p.browserMode || o.browserMode || 'request'} (Axios + KiotProxy)`,
            `Phan bo thoi gian: ${o.scheduleMode || 'smart'} | dedupIp=${o.dedupIp !== false} | randomLinks=${o.randomLinks !== false}`,
            `Trang thai thanh toan: ${o.paymentStatus}`,
            `Trang thai chien dich: ${p.status || o.status}`,
            `Campaign ID: ${p.campaignId || o.campaignId || 'Chua kich hoat'}`,
            `So tien: ${Number(o.totalAmount || 0).toLocaleString('vi-VN')} VND`,
            `Muc tieu click: ${o.targetClicks}`,
            `Luot thanh cong: ${p.successVisits ?? o.successVisits ?? 0}`,
            `Luot that bai: ${p.failedVisits ?? o.failedVisits ?? 0}`,
            `Tong thu: ${p.totalVisits ?? o.totalVisits ?? 0}`,
            `IP duy nhat: ${p.uniqueIps ?? o.uniqueIps ?? 0}`,
            `IP trung bi bo qua: ${p.dupIps ?? o.dupIps ?? 0}`,
            `Thoi gian tao: ${fmtTime(o.createdAt)}`,
            `Thoi gian thanh toan: ${fmtTime(o.paidAt)}`,
            `Ket thuc du kien/thuc te: ${fmtTime(p.actualEndTime || p.endTime || o.completedAt)}`
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `report_${o.orderCode || o.orderId}.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    // ─── Admin Workspace (Single Operator Account) ────────────────────────────
    async function loadAdminDashboard() {
        if (!(state.config.authenticated && state.config.role === 'admin')) return;
        const whEl = $('cfg-webhook-url');
        if (whEl) whEl.textContent = `${window.location.origin}/api/payment/webhook`;
        if (state.adminLoadingPromise) return state.adminLoadingPromise;
        state.adminLoadingPromise = Promise.all([
            loadAdminOrders(),
            loadAdminCampaigns(),
            loadAdminPaymentConfig(),
            loadAdminProxyConfig()
        ]).finally(() => {
            state.adminLoadingPromise = null;
        });
        return state.adminLoadingPromise;
    }

    async function loadAdminCampaigns() {
        if (!(state.config.authenticated && state.config.role === 'admin')) return;
        try {
            const { res, data } = await apiJson('/api/campaigns');
            if (!res.ok || !data.success) return;
            state.adminCampaigns = Array.isArray(data.data) ? data.data : [];
            renderAdminCampaignsTable(state.adminCampaigns);
        } catch (e) {}
    }

    function renderAdminCampaignsTable(list) {
        const tbody = $('adm-campaigns-body');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted)">Chưa có chiến dịch nào.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(c => {
            const st = c.status || 'waiting';
            const badge = st === 'completed' ? 'ok' : (st === 'stopped' ? 'err' : (st === 'running' ? 'info' : 'warn'));
            const canStop = st === 'running' || st === 'waiting';
            return `<tr>
                <td><code class="mono">${esc(c.id)}</code><div class="hint" style="margin:2px 0 0 0;">${esc(c.name || '')}</div></td>
                <td style="max-width:220px; word-break:break-all;">${esc(c.targetUrl || '')}</td>
                <td><span class="pill ${badge}">${esc(st)}</span></td>
                <td>${Number(c.successVisits || 0).toLocaleString('vi-VN')} / ${Number(c.targetLimit || 0).toLocaleString('vi-VN')}<div class="hint" style="margin:2px 0 0 0;">Err: ${Number(c.failedVisits || 0).toLocaleString('vi-VN')}</div></td>
                <td>
                    <div style="display:flex; flex-wrap:wrap; gap:4px;">
                        ${canStop ? `<button type="button" class="btn btn-sm btn-danger" data-action="camp-stop" data-id="${esc(c.id)}">Dừng</button>` : ''}
                        <button type="button" class="btn btn-sm" data-action="camp-reset" data-id="${esc(c.id)}">Reset</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    async function resetCampaignStatsAsAdmin(campaignId) {
        if (!campaignId) return;
        const { res, data } = await apiJson('/api/campaigns/' + encodeURIComponent(campaignId) + '/reset-stats', {
            method: 'POST',
            body: '{}'
        });
        if (!res.ok || !data.success) {
            showAlert('adm-camp-msg', (data && data.message) || 'Không thể reset thống kê chiến dịch.', 'err');
            return;
        }
        showAlert('adm-camp-msg', `Đã reset thống kê chiến dịch ${campaignId}.`, 'ok');
        if (state.activeOrderId) await fetchActiveOrder();
        await Promise.all([loadAdminOrders(), loadAdminCampaigns()]);
    }

    async function loadAdminOrders() {
        if (!(state.config.authenticated && state.config.role === 'admin')) return;
        try {
            const { res, data } = await apiJson('/api/admin/orders');
            if (!res.ok || !data.success) return;
            const s = data.summary || {};
            $('adm-sum-total').textContent = Number(s.totalOrders || 0).toLocaleString('vi-VN');
            $('adm-sum-rev').textContent = fmtVnd(s.totalRevenue || 0);
            $('adm-sum-paid').textContent = Number(s.paidCount || 0).toLocaleString('vi-VN');
            $('adm-sum-pending').textContent = Number(s.pendingCount || 0).toLocaleString('vi-VN');
            $('adm-sum-running').textContent = Number(s.runningCount || 0).toLocaleString('vi-VN');
            $('adm-sum-done').textContent = Number(s.completedCount || 0).toLocaleString('vi-VN');
            state.adminOrders = Array.isArray(data.orders) ? data.orders : [];
            renderAdminOrdersTable();
        } catch (e) {}
    }

    function renderAdminOrdersTable() {
        const tbody = $('adm-orders-body');
        const filter = $('adm-filter').value;
        const filtered = state.adminOrders.filter(o => {
            const st = o.effectiveStatus || o.status;
            if (filter === 'all') return true;
            if (filter === 'stopped') return st === 'stopped' || st === 'expired';
            return st === filter;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">Không có đơn hàng nào khớp bộ lọc.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(o => {
            const eff = o.effectiveStatus || o.status || 'pending_payment';
            const p = o.progress || {};
            const succ = p.successVisits ?? o.successVisits ?? 0;
            const target = p.targetLimit || o.targetClicks || 0;
            const isPaid = o.paymentStatus === 'paid';
            const canStop = Boolean(o.campaignId) && ['running', 'waiting'].includes(eff);
            const canDelete = !['running', 'waiting'].includes(eff);

            return `<tr>
                <td>
                    <code class="mono">${esc(o.orderId)}</code><br>
                    <span class="pill" style="padding:1px 6px;font-size:11px;margin-top:3px;">${esc(o.orderCode)}</span>
                </td>
                <td style="max-width:250px; word-break:break-all;">
                    <strong>${esc(o.name || o.orderCode)}</strong><br>
                    <span class="hint">${esc(o.targetUrl)}</span><br>
                    <span class="hint">Key: <code>${esc(o.proxyKeyMasked || '')}</code> · ${esc(o.scheduleMode || 'smart')}</span>
                </td>
                <td>${fmtVnd(o.totalAmount)}</td>
                <td>
                    <div>${isPaid ? '<span class="pill ok">paid</span>' : '<span class="pill warn">pending_payment</span>'}</div>
                    <div class="hint" style="margin-top:4px;">Trạng thái: <code>${esc(eff)}</code></div>
                </td>
                <td>
                    <strong>${Number(succ).toLocaleString('vi-VN')} / ${Number(target).toLocaleString('vi-VN')}</strong>
                    <div class="hint">${o.campaignId ? 'C' + esc(o.campaignId) : 'Chưa kích hoạt'}</div>
                </td>
                <td>
                    <div style="display:flex; flex-wrap:wrap; gap:4px;">
                        <button type="button" class="btn btn-sm" data-action="adm-view" data-id="${esc(o.orderId)}">Xem</button>
                        ${!isPaid ? `<button type="button" class="btn btn-sm btn-success" data-action="adm-confirm" data-id="${esc(o.orderId)}">Duyệt</button>` : ''}
                        ${canStop ? `<button type="button" class="btn btn-sm btn-danger" data-action="adm-stop" data-camp-id="${esc(o.campaignId)}">Dừng</button>` : ''}
                        ${canDelete ? `<button type="button" class="btn btn-sm" data-action="adm-delete" data-id="${esc(o.orderId)}">Xóa</button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    async function loadAdminPaymentConfig() {
        try {
            const { res, data } = await apiJson('/api/admin/payment-config');
            if (!res.ok || !data.success || !data.config) return;
            const c = data.config;
            $('cfg-bankid').value = c.bankId || '';
            $('cfg-bankname').value = c.bankName || '';
            $('cfg-accnum').value = c.accountNumber || '';
            $('cfg-accname').value = c.accountName || '';
            $('cfg-template').value = c.template || 'compact2';
            $('cfg-secret').value = c.webhookSecret || '';
        } catch (e) {}
    }

    async function handlePaymentConfigSubmit(e) {
        e.preventDefault();
        showAlert('adm-paycfg-msg', '');
        const payload = {
            bankId: $('cfg-bankid').value.trim(),
            bankName: $('cfg-bankname').value.trim(),
            accountNumber: $('cfg-accnum').value.trim(),
            accountName: $('cfg-accname').value.trim(),
            template: $('cfg-template').value,
            webhookSecret: $('cfg-secret').value.trim()
        };
        const { res, data } = await apiJson('/api/admin/payment-config', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (!res.ok || !data.success) {
            showAlert('adm-paycfg-msg', data.message || 'Lỗi lưu cấu hình VietQR.', 'err');
            return;
        }
        showAlert('adm-paycfg-msg', 'Đã lưu cấu hình VietQR & Webhook.', 'ok');
        await refreshPublicConfig();
    }

    async function loadAdminProxyConfig() {
        try {
            const { res, data } = await apiJson('/api/proxy-config');
            if (!res.ok || !data.success || !data.data) return;
            const d = data.data;
            $('pcfg-region').value = d.region || 'random';
            $('pcfg-cooldown').value = typeof d.cooldownSec === 'number' ? d.cooldownSec : 14;
            $('pcfg-keys').value = Array.isArray(d.keys) ? d.keys.join('\n') : '';
        } catch (e) {}
    }

    async function handleProxyConfigSubmit(e) {
        e.preventDefault();
        showAlert('adm-proxycfg-msg', '');
        const keys = $('pcfg-keys').value
            .split(/[\r\n,]+/)
            .map(s => s.trim())
            .filter(Boolean);
        const cooldownSec = Number($('pcfg-cooldown').value);
        const region = $('pcfg-region').value || 'random';
        const { res, data } = await apiJson('/api/proxy-config', {
            method: 'POST',
            body: JSON.stringify({ region, keys, cooldownSec: Number.isFinite(cooldownSec) ? cooldownSec : 14 })
        });
        if (!res.ok || !data.success) {
            showAlert('adm-proxycfg-msg', data.message || 'Lỗi lưu Proxy Pool.', 'err');
            return;
        }
        showAlert('adm-proxycfg-msg', data.message || 'Đã lưu Proxy Pool.', 'ok');
    }

    function appendLogLine(boxId, text, type = 'info', timeStr = null) {
        const box = $(boxId);
        if (!box) return;
        const p = document.createElement('div');
        p.className = `log-line ${type || 'info'}`;
        const time = timeStr || new Date().toLocaleTimeString('vi-VN');
        p.textContent = `[${time}] ${text}`;
        box.appendChild(p);
        while (box.children.length > 250) {
            box.removeChild(box.firstChild);
        }
        box.scrollTop = box.scrollHeight;
    }

    function recordCampaignLog(entry) {
        if (!entry || entry.campaignId == null) return null;
        const cid = String(entry.campaignId);
        let list = state.campaignLogs.get(cid);
        if (!list) {
            list = [];
            state.campaignLogs.set(cid, list);
        }
        const rec = {
            time: new Date().toLocaleTimeString('vi-VN'),
            line: `[C${cid}] ${entry.text}`,
            type: entry.type || 'info'
        };
        list.push(rec);
        if (list.length > 150) list.shift();
        if (state.campaignLogs.size > 30) {
            const firstKey = state.campaignLogs.keys().next().value;
            state.campaignLogs.delete(firstKey);
        }
        return rec;
    }

    function hydrateOrderWorkerLogs(campId) {
        const box = $('ao-worker-log');
        if (!box || !campId) return;
        const cid = String(campId);
        if (box.dataset.campId === cid) return;
        box.dataset.campId = cid;
        box.innerHTML = '';
        const list = state.campaignLogs.get(cid) || [];
        for (const item of list) {
            appendLogLine('ao-worker-log', item.line, item.type, item.time);
        }
    }

    // ─── Socket.IO Integration ────────────────────────────────────────────────
    function initSocket() {
        if (typeof window.io !== 'function') {
            $('socket-pill').className = 'pill err';
            $('socket-pill').textContent = 'Socket: Không khả dụng';
            return;
        }
        const socket = window.io();
        state.socket = socket;

        socket.on('connect', () => {
            $('socket-pill').className = 'pill ok';
            $('socket-pill').textContent = 'Socket: Đã kết nối';
            if (state.activeOrderId) {
                socket.emit('subscribe-order', state.activeOrderId);
            }
        });

        socket.on('disconnect', () => {
            $('socket-pill').className = 'pill warn';
            $('socket-pill').textContent = 'Socket: Mất kết nối';
        });

        socket.on('user-info', (info) => {
            const prevAuth = state.config.authenticated;
            const prevRole = state.config.role;
            if (info && info.role) {
                state.config.authenticated = true;
                state.config.role = info.role;
                state.config.username = info.username;
                if (!prevAuth || prevRole !== info.role) renderAuthState();
            } else {
                state.config.authenticated = false;
                state.config.role = null;
                state.config.username = null;
                if (prevAuth) renderAuthState();
            }
        });

        socket.on('payment-confirmed', (payload) => {
            if (payload && payload.orderId && payload.orderId === state.activeOrderId) {
                showAlert('ao-notice', `Thanh toán đã được xác nhận! Campaign ${payload.campaignId || ''} đang bắt đầu chạy.`, 'ok');
                if (state.activeOrder && payload.campaignId) {
                    state.activeOrder.campaignId = payload.campaignId;
                    state.activeOrder.paymentStatus = 'paid';
                    hydrateOrderWorkerLogs(payload.campaignId);
                }
                fetchActiveOrder();
            }
            if (state.config.role === 'admin') {
                loadAdminOrders();
                loadAdminCampaigns();
            }
        });

        socket.on('order-progress', (prog) => {
            if (!prog || prog.orderId !== state.activeOrderId || !state.activeOrder) return;
            state.activeOrder.progress = prog;
            if (!state.activeOrder.campaignId && prog.campaignId) {
                state.activeOrder.campaignId = prog.campaignId;
            }
            if (prog.status) {
                state.activeOrder.status = prog.status;
                if (['paid', 'running', 'completed', 'expired', 'stopped'].includes(prog.status)) {
                    state.activeOrder.paymentStatus = 'paid';
                }
            }
            renderActiveOrder(state.activeOrder);
        });

        socket.on('orders-updated', () => {
            if (state.config.role === 'admin') {
                loadAdminOrders();
                loadAdminCampaigns();
            }
        });

        socket.on('status-update', () => {
            if (state.config.role === 'admin') loadAdminCampaigns();
        });

        socket.on('campaign-deleted', () => {
            if (state.config.role === 'admin') loadAdminCampaigns();
        });

        socket.on('log', (entry) => {
            if (!entry) return;
            const rec = recordCampaignLog(entry);
            const line = rec ? rec.line : `[C${entry.campaignId}] ${entry.text}`;
            const time = rec ? rec.time : null;
            appendLogLine('adm-global-log', line, entry.type, time);
            if (state.activeOrder) {
                const activeCampId = (state.activeOrder.progress && state.activeOrder.progress.campaignId) || state.activeOrder.campaignId;
                if (activeCampId && String(entry.campaignId) === String(activeCampId)) {
                    const box = $('ao-worker-log');
                    if (box && box.dataset.campId !== String(activeCampId)) {
                        hydrateOrderWorkerLogs(activeCampId);
                    } else {
                        appendLogLine('ao-worker-log', line, entry.type, time);
                    }
                }
            }
        });

        socket.on('stats-update', (st) => {
            if (state.config.role === 'admin' && st) {
                const rowOrder = state.adminOrders.find(o => o.campaignId && String(o.campaignId) === String(st.campaignId));
                if (rowOrder) {
                    rowOrder.effectiveStatus = st.status;
                    rowOrder.progress = Object.assign({}, rowOrder.progress || {}, {
                        status: st.status,
                        successVisits: st.success,
                        failedVisits: st.failed,
                        targetLimit: st.target
                    });
                    renderAdminOrdersTable();
                }
                const rowCamp = state.adminCampaigns.find(c => String(c.id) === String(st.campaignId));
                if (rowCamp) {
                    rowCamp.status = st.status;
                    rowCamp.successVisits = st.success;
                    rowCamp.failedVisits = st.failed;
                    if (st.target !== undefined) rowCamp.targetLimit = st.target;
                    renderAdminCampaignsTable(state.adminCampaigns);
                }
            }
        });
    }

    function reconnectSocket() {
        if (!state.socket) return;
        state.socket.disconnect();
        state.socket.connect();
    }

    // ─── Event Wiring ─────────────────────────────────────────────────────────
    function switchTab(tab) {
        state.activeTab = tab === 'admin' ? 'admin' : 'customer';
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
        });
        $('tab-customer').classList.toggle('hidden', state.activeTab !== 'customer');
        $('tab-admin').classList.toggle('hidden', state.activeTab !== 'admin');
        if (state.activeTab === 'admin' && state.config.role === 'admin') {
            loadAdminDashboard();
        }
    }

    function bindEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $('f-hours').value = btn.dataset.hours;
                updateCostAndDistribution();
            });
        });

        ['f-clicks', 'f-hours'].forEach(id => {
            $(id).addEventListener('input', scheduleCostRefresh);
            $(id).addEventListener('change', updateCostAndDistribution);
        });
        $('f-schedule').addEventListener('change', updateCostAndDistribution);
        ['cb-night', 'cb-early', 'cb-morn', 'cb-noon', 'cb-after', 'cb-eve', 'cb-late'].forEach(id => {
            $(id).addEventListener('change', updateCostAndDistribution);
        });
        $('dist-preview-footer').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action="toggle-preview-slices"]');
            if (!btn) return;
            state.expandPreviewSlices = !state.expandPreviewSlices;
            const targetClicks = Number($('f-clicks').value);
            const durationHours = Number($('f-hours').value);
            const mode = $('f-schedule').value;
            renderDistributionPreview(
                Number.isInteger(targetClicks) ? targetClicks : 0,
                Number.isFinite(durationHours) ? durationHours : 0,
                mode,
                mode === 'custom' ? getCustomBlocksFromUI() : null
            );
        });

        $('boost-form').addEventListener('submit', handleOrderSubmit);

        $('lookup-order-btn').addEventListener('click', () => {
            selectOrder($('lookup-order-id').value);
        });
        $('lookup-order-id').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                selectOrder($('lookup-order-id').value);
            }
        });

        $('recent-orders-wrap').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const id = btn.dataset.id;
            if (btn.dataset.action === 'load-recent') selectOrder(id);
            if (btn.dataset.action === 'del-recent') removeRecentOrder(id);
        });

        $('recheck-order-btn').addEventListener('click', fetchActiveOrder);
        $('refresh-order-btn').addEventListener('click', fetchActiveOrder);
        $('download-report-btn').addEventListener('click', downloadActiveReport);

        $('copy-acc-btn').addEventListener('click', () => copyText($('ao-acc-num').textContent, $('copy-acc-btn')));
        $('copy-amt-btn').addEventListener('click', () => copyText(String((state.activeOrder && state.activeOrder.totalAmount) || ''), $('copy-amt-btn')));
        $('copy-memo-btn').addEventListener('click', () => copyText($('ao-memo').textContent, $('copy-memo-btn')));

        $('inline-admin-confirm-btn').addEventListener('click', () => {
            if (state.activeOrderId) confirmOrderAsAdmin(state.activeOrderId);
        });
        $('inline-admin-stop-btn').addEventListener('click', () => {
            const campId = state.activeOrder && ((state.activeOrder.progress && state.activeOrder.progress.campaignId) || state.activeOrder.campaignId);
            if (campId) stopCampaignAsAdmin(campId);
        });

        $('open-login-btn').addEventListener('click', openLoginModal);
        $('gate-open-login-btn').addEventListener('click', openLoginModal);
        $('close-login-btn').addEventListener('click', closeLoginModal);
        $('login-modal').addEventListener('click', (e) => {
            if (e.target === $('login-modal')) closeLoginModal();
        });
        $('boost-login-form').addEventListener('submit', handleLoginSubmit);
        $('logout-btn').addEventListener('click', handleLogout);

        $('adm-filter').addEventListener('change', renderAdminOrdersTable);
        $('adm-refresh-orders-btn').addEventListener('click', loadAdminOrders);
        $('adm-refresh-campaigns-btn').addEventListener('click', loadAdminCampaigns);
        $('adm-paycfg-form').addEventListener('submit', handlePaymentConfigSubmit);
        $('adm-proxycfg-form').addEventListener('submit', handleProxyConfigSubmit);
        $('clear-global-log-btn').addEventListener('click', () => { $('adm-global-log').innerHTML = ''; });

        $('adm-campaigns-body').addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === 'camp-stop' && id) {
                await stopCampaignAsAdmin(id);
            } else if (action === 'camp-reset' && id) {
                await resetCampaignStatsAsAdmin(id);
            }
        });

        $('adm-orders-body').addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            const campId = btn.dataset.campId;
            if (action === 'adm-view' && id) {
                switchTab('customer');
                await selectOrder(id);
            } else if (action === 'adm-confirm' && id) {
                await confirmOrderAsAdmin(id);
            } else if (action === 'adm-stop' && campId) {
                await stopCampaignAsAdmin(campId);
            } else if (action === 'adm-delete' && id) {
                const { res, data } = await apiJson('/api/admin/orders/' + encodeURIComponent(id), { method: 'DELETE' });
                if (!res.ok || !data.success) {
                    showAlert('adm-action-msg', data.message || 'Không thể xóa đơn.', 'err');
                } else {
                    showAlert('adm-action-msg', `Đã xóa đơn ${id}.`, 'ok');
                    removeRecentOrder(id);
                    if (state.activeOrderId === id) {
                        clearActiveOrderView();
                    }
                    await Promise.all([loadAdminOrders(), loadAdminCampaigns()]);
                }
            }
        });
    }

    function fallbackExecCopy(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch (e) {
            return false;
        }
    }

    function copyText(text, btn) {
        if (!text || text === '--') return;
        const flash = (label) => {
            if (!btn) return;
            const prev = btn.dataset.origLabel || btn.textContent;
            btn.dataset.origLabel = prev;
            btn.textContent = label;
            setTimeout(() => { btn.textContent = prev; }, 1200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => flash('Đã chép'))
                .catch(() => flash(fallbackExecCopy(text) ? 'Đã chép' : 'Lỗi chép'));
        } else {
            flash(fallbackExecCopy(text) ? 'Đã chép' : 'Lỗi chép');
        }
    }

    // ─── Boot ─────────────────────────────────────────────────────────────────
    async function boot() {
        bindEvents();
        renderRecentOrders();
        initSocket();
        await refreshPublicConfig();
        await updateCostAndDistribution();

        const params = new URLSearchParams(window.location.search);
        const initialOrderId = params.get('orderId') || params.get('order');
        if (initialOrderId) {
            await selectOrder(initialOrderId);
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
