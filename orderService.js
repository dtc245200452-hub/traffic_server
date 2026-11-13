const fs = require('fs');
const path = require('path');

const ORDERS_DIR = path.join(__dirname, 'orders');
const PAYMENT_CONFIG_PATH = path.join(__dirname, 'payment_config.json');

if (!fs.existsSync(ORDERS_DIR)) {
    fs.mkdirSync(ORDERS_DIR, { recursive: true });
}

const DEFAULT_PAYMENT_CONFIG = {
    bankId: 'MB',
    bankName: 'MBBank',
    accountNumber: '0987654321',
    accountName: 'TRAFFIC SERVICE',
    template: 'compact2'
};

const CLICK_RATE = 40;
const HOURLY_RATE = 2000;
const DEFAULT_TEMPLATE = 'compact2';

function getPaymentConfig() {
    try {
        if (fs.existsSync(PAYMENT_CONFIG_PATH)) {
            const data = fs.readFileSync(PAYMENT_CONFIG_PATH, 'utf-8');
            return { ...DEFAULT_PAYMENT_CONFIG, ...JSON.parse(data) };
        }
    } catch (e) {
        console.error('[orderService] Failed to read payment_config.json, using defaults:', e.message);
    }
    return { ...DEFAULT_PAYMENT_CONFIG };
}

function getPublicBankInfo(config = getPaymentConfig()) {
    const { webhookSecret, ...publicBank } = config || {};
    return publicBank;
}

function setPaymentConfig(config) {
    const current = getPaymentConfig();
    const merged = {
        ...current,
        bankId: String(config.bankId || current.bankId || DEFAULT_PAYMENT_CONFIG.bankId).trim().toUpperCase(),
        bankName: String(config.bankName || current.bankName || DEFAULT_PAYMENT_CONFIG.bankName).trim(),
        accountNumber: String(config.accountNumber || current.accountNumber || DEFAULT_PAYMENT_CONFIG.accountNumber).trim(),
        accountName: String(config.accountName || current.accountName || DEFAULT_PAYMENT_CONFIG.accountName).trim().toUpperCase(),
        template: String(config.template || current.template || DEFAULT_TEMPLATE).trim(),
        webhookSecret: config.webhookSecret !== undefined ? String(config.webhookSecret).trim() : (current.webhookSecret || '')
    };
    fs.writeFileSync(PAYMENT_CONFIG_PATH, JSON.stringify(merged, null, 4), 'utf-8');
    return getPaymentConfig();
}

function maskProxyKey(key) {
    if (!key || typeof key !== 'string') return '';
    const trimmed = key.trim();
    return trimmed.length > 4 ? `...${trimmed.slice(-4)}` : '****';
}

function validateOrderParams(params) {
    const errors = [];
    if (!params || typeof params !== 'object') {
        return { isValid: false, valid: false, errors: ['Request body must be an object'], sanitized: null };
    }

    // targetUrl
    const targetUrl = typeof params.targetUrl === 'string' ? params.targetUrl.trim() : '';
    if (!targetUrl) {
        errors.push('targetUrl is required');
    } else {
        try {
            const parsed = new URL(targetUrl);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                errors.push('targetUrl must use http:// or https:// protocol');
            }
        } catch {
            errors.push('targetUrl is not a valid URL');
        }
    }

    // proxyKey
    const proxyKey = typeof params.proxyKey === 'string' ? params.proxyKey.trim() : '';
    if (!proxyKey) {
        errors.push('proxyKey is required and cannot be empty');
    }

    // targetClicks
    const clicksVal = params.targetClicks;
    if (typeof clicksVal !== 'number' && (typeof clicksVal !== 'string' || clicksVal.trim() === '')) {
        errors.push('targetClicks must be a positive integer greater than or equal to 1');
    } else {
        const rawClicks = Number(clicksVal);
        if (!Number.isInteger(rawClicks) || rawClicks < 1) {
            errors.push('targetClicks must be a positive integer greater than or equal to 1');
        }
    }

    // durationHours
    const durationVal = params.durationHours;
    if (typeof durationVal !== 'number' && (typeof durationVal !== 'string' || durationVal.trim() === '')) {
        errors.push('durationHours must be a positive number greater than 0');
    } else {
        const rawDuration = Number(durationVal);
        if (isNaN(rawDuration) || !Number.isFinite(rawDuration) || rawDuration <= 0) {
            errors.push('durationHours must be a positive number greater than 0');
        }
    }

    const name = typeof params.name === 'string' && params.name.trim()
        ? params.name.trim()
        : `Order_${Date.now()}`;

    const scheduleMode = params.scheduleMode === 'even'
        ? 'even'
        : (params.scheduleMode === 'custom' ? 'custom' : 'smart');
    const ALLOWED_LEVELS = new Set(['low', 'medium', 'high']);
    let customBlocks = null;
    if (scheduleMode === 'custom' && params.customBlocks && typeof params.customBlocks === 'object') {
        const b = params.customBlocks;
        customBlocks = {
            night: ALLOWED_LEVELS.has(b.night) ? b.night : 'low',
            early_morning: ALLOWED_LEVELS.has(b.early_morning) ? b.early_morning : 'medium',
            morning: ALLOWED_LEVELS.has(b.morning) ? b.morning : 'high',
            noon: ALLOWED_LEVELS.has(b.noon) ? b.noon : 'medium',
            afternoon: ALLOWED_LEVELS.has(b.afternoon) ? b.afternoon : 'high',
            evening: ALLOWED_LEVELS.has(b.evening) ? b.evening : 'high',
            late_night: ALLOWED_LEVELS.has(b.late_night) ? b.late_night : 'medium'
        };
    }
    const dedupIp = params.dedupIp !== false && params.dedupIp !== 'false';
    const randomLinks = params.randomLinks !== false && params.randomLinks !== 'false';

    const isValid = errors.length === 0;
    return {
        isValid,
        valid: isValid,
        errors,
        sanitized: isValid ? {
            targetUrl,
            proxyKey,
            targetClicks: Number(params.targetClicks),
            durationHours: Number(params.durationHours),
            name,
            scheduleMode,
            customBlocks,
            dedupIp,
            randomLinks
        } : null
    };
}

function calculateOrderCost(clicks, durationHours) {
    const targetClicks = Number(clicks);
    if (!Number.isInteger(targetClicks) || targetClicks <= 0) {
        throw new Error('targetClicks must be a positive integer greater than or equal to 1');
    }

    const rawDuration = Number(durationHours);
    if (isNaN(rawDuration) || !Number.isFinite(rawDuration) || rawDuration <= 0) {
        throw new Error('durationHours must be a positive number greater than 0');
    }

    const roundedHours = Math.ceil(rawDuration);
    const clickFee = targetClicks * CLICK_RATE;
    const durationFee = roundedHours * HOURLY_RATE;
    const totalAmount = clickFee + durationFee;

    return {
        targetClicks,
        durationHours: rawDuration,
        roundedHours,
        clickRate: CLICK_RATE,
        hourlyRate: HOURLY_RATE,
        clickFee,
        durationFee,
        totalAmount
    };
}

function generateOrderCode() {
    let maxId = 1000;
    try {
        if (fs.existsSync(ORDERS_DIR)) {
            const files = fs.readdirSync(ORDERS_DIR);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                try {
                    const content = JSON.parse(fs.readFileSync(path.join(ORDERS_DIR, file), 'utf-8'));
                    if (content.orderCode && typeof content.orderCode === 'string') {
                        const match = content.orderCode.match(/^TF(\d+)$/i);
                        if (match) {
                            const val = parseInt(match[1], 10);
                            if (val > maxId) maxId = val;
                        }
                    }
                } catch {}
            }
        }
    } catch {}
    return `TF${maxId + 1}`;
}

function generateVietQrUrl(bankInfo, amount, memo) {
    if (!bankInfo || typeof bankInfo !== 'object' || !bankInfo.bankId || !bankInfo.accountNumber) {
        throw new Error('Invalid bank configuration: bankId and accountNumber are required');
    }

    const safeAmount = Number(amount);
    if (!Number.isInteger(safeAmount) || safeAmount <= 0) {
        throw new Error('amount must be a positive integer');
    }

    if (!memo || typeof memo !== 'string' || !/^[A-Za-z0-9]+$/.test(memo.trim())) {
        throw new Error('memo must be a non-empty alphanumeric string without accents or special characters');
    }

    const bankId = encodeURIComponent(String(bankInfo.bankId).trim());
    const accountNo = encodeURIComponent(String(bankInfo.accountNumber).trim());
    const template = encodeURIComponent(String(bankInfo.template || DEFAULT_TEMPLATE).trim());
    const cleanMemo = encodeURIComponent(memo.trim());
    const cleanAccountName = encodeURIComponent(String(bankInfo.accountName || '').trim().toUpperCase());

    return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${safeAmount}&addInfo=${cleanMemo}&accountName=${cleanAccountName}`;
}

function sanitizeOrderId(orderId) {
    if (!orderId || typeof orderId !== 'string') return null;
    const trimmed = orderId.trim();
    if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) return null;
    const clean = path.basename(trimmed);
    if (clean !== trimmed || clean === '.' || clean === '..') return null;
    return clean;
}

function getOrder(orderId) {
    const cleanId = sanitizeOrderId(orderId);
    if (!cleanId) return null;
    const filePath = path.join(ORDERS_DIR, `${cleanId}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.error(`[orderService] Error reading order ${cleanId}:`, e.message);
        return null;
    }
}

function listOrders() {
    if (!fs.existsSync(ORDERS_DIR)) return [];
    const files = fs.readdirSync(ORDERS_DIR).filter(f => f.endsWith('.json'));
    const list = [];
    for (const f of files) {
        try {
            list.push(JSON.parse(fs.readFileSync(path.join(ORDERS_DIR, f), 'utf-8')));
        } catch {}
    }
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function createOrder(data) {
    const validation = validateOrderParams(data);
    if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    }

    const { sanitized } = validation;
    const pricing = calculateOrderCost(sanitized.targetClicks, sanitized.durationHours);
    const bankInfo = getPublicBankInfo();
    const orderId = `ORD-${Date.now()}-${require('crypto').randomBytes(8).toString('hex')}`; // unguessable: it is the customer's access token
    const orderCode = generateOrderCode();
    const vietQrUrl = generateVietQrUrl(bankInfo, pricing.totalAmount, orderCode);

    const order = {
        orderId,
        orderCode,
        name: sanitized.name,
        targetUrl: sanitized.targetUrl,
        proxyKey: sanitized.proxyKey,
        targetClicks: sanitized.targetClicks,
        durationHours: sanitized.durationHours,
        roundedHours: pricing.roundedHours,
        clickFee: pricing.clickFee,
        durationFee: pricing.durationFee,
        totalAmount: pricing.totalAmount,
        currency: 'VND',
        browserMode: 'request',
        scheduleMode: sanitized.scheduleMode || 'smart',
        customBlocks: sanitized.customBlocks || null,
        dedupIp: sanitized.dedupIp !== false,
        randomLinks: sanitized.randomLinks !== false,
        vietQrUrl,
        bankInfo,
        status: 'pending_payment',
        paymentStatus: 'pending_payment',
        campaignId: null,
        createdAt: Date.now(),
        paidAt: null,
        updatedAt: Date.now()
    };

    const filePath = path.join(ORDERS_DIR, `${orderId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(order, null, 4), 'utf-8');
    return order;
}

function confirmOrderPayment(orderId, extraFields = {}) {
    const order = getOrder(orderId);
    if (!order) {
        throw new Error(`Order not found: ${orderId}`);
    }

    order.status = 'paid';
    order.paymentStatus = 'paid';
    order.paidAt = order.paidAt || Date.now();
    order.updatedAt = Date.now();
    if (extraFields.campaignId) {
        order.campaignId = extraFields.campaignId;
    }
    if (extraFields.paymentMethod) order.paymentMethod = extraFields.paymentMethod;
    if (extraFields.paidAmount) order.paidAmount = extraFields.paidAmount;

    const filePath = path.join(ORDERS_DIR, `${order.orderId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(order, null, 4), 'utf-8');
    return order;
}

function updateOrderStatus(orderId, status, extraFields = {}) {
    const order = getOrder(orderId);
    if (!order) {
        throw new Error(`Order not found: ${orderId}`);
    }

    const terminalStates = ['completed', 'expired', 'stopped'];
    if (terminalStates.includes(order.status) && status === 'pending_payment') {
        return order;
    }

    order.status = status;
    order.updatedAt = Date.now();
    Object.assign(order, extraFields);

    const filePath = path.join(ORDERS_DIR, `${order.orderId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(order, null, 4), 'utf-8');
    return order;
}

function deleteOrder(orderId) {
    const cleanId = sanitizeOrderId(orderId);
    if (!cleanId) return false;
    const filePath = path.join(ORDERS_DIR, `${cleanId}.json`);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
}

module.exports = {
    validateOrderParams,
    calculateOrderCost,
    generateOrderCode,
    generateVietQrUrl,
    createOrder,
    getOrder,
    confirmOrderPayment,
    updateOrderStatus,
    deleteOrder,
    getPaymentConfig,
    getPublicBankInfo,
    setPaymentConfig,
    maskProxyKey,
    listOrders,
    CONSTANTS: {
        CLICK_RATE,
        HOURLY_RATE,
        DEFAULT_TEMPLATE
    }
};
