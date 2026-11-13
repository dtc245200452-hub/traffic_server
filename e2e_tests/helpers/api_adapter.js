/**
 * API Adapter for E2E Tests
 * Bridges HTTP REST calls with contract fallbacks if endpoints are in progress.
 */
const { assert, assertPricing, assertVietQrUrl, assertNonAccentedOrderCode, assertZeroClicks } = require('./assertions');

function hasApiPayload(res) {
    return Boolean(res && res.body && typeof res.body === 'object' && 'success' in res.body);
}

async function createOrder(ctx, payload) {
    try {
        const res = await ctx.httpClient.post('/api/orders', payload);
        if (res.ok) {
            const orderId = res.body?.orderId || res.body?.order?.orderId;
            if (orderId && ctx.trackOrder) ctx.trackOrder(orderId);
        }
        if (res.status !== 404 || hasApiPayload(res)) {
            return res;
        }
    } catch {}

    // Fallback to orderService contract
    if (ctx.orderService) {
        try {
            const order = ctx.orderService.createOrder(payload);
            if (order && order.orderId && ctx.trackOrder) ctx.trackOrder(order.orderId);
            return {
                status: 201,
                ok: true,
                body: { success: true, orderId: order.orderId, orderCode: order.orderCode, order }
            };
        } catch (err) {
            return {
                status: 400,
                ok: false,
                body: { success: false, message: err.message }
            };
        }
    }

    throw new Error('Neither HTTP route /api/orders nor orderService module available');
}

async function calculateCost(ctx, payload) {
    const normPayload = {
        ...payload,
        durationHours: payload.durationHours !== undefined
            ? payload.durationHours
            : (payload.durationMinutes !== undefined ? payload.durationMinutes / 60 : undefined)
    };

    try {
        const res1 = await ctx.httpClient.post('/api/orders/calculate-cost', normPayload);
        if (res1.status !== 404 || hasApiPayload(res1)) return res1;
        const res2 = await ctx.httpClient.post('/api/orders/calculate', normPayload);
        if (res2.status !== 404 || hasApiPayload(res2)) return res2;
    } catch {}

    // Fallback to orderService contract
    if (ctx.orderService) {
        try {
            const clicks = normPayload.targetClicks ?? normPayload.clicks;
            const hours = normPayload.durationHours;
            const pricing = ctx.orderService.calculateOrderCost(clicks, hours);
            return {
                status: 200,
                ok: true,
                body: { success: true, ...pricing }
            };
        } catch (err) {
            return {
                status: 400,
                ok: false,
                body: { success: false, message: err.message }
            };
        }
    }

    throw new Error('Neither HTTP calculate route nor orderService available');
}

async function getOrder(ctx, orderId) {
    try {
        const safeId = encodeURIComponent(String(orderId));
        const res = await ctx.httpClient.get(`/api/orders/${safeId}`);
        if (res.status !== 404 || hasApiPayload(res) || ctx.serverUrl) return res;
    } catch {}

    if (ctx.orderService) {
        const order = ctx.orderService.getOrder(orderId);
        if (order) {
            return { status: 200, ok: true, body: { success: true, order } };
        }
        return { status: 404, ok: false, body: { success: false, message: 'Order not found' } };
    }

    throw new Error('Neither HTTP get order route nor orderService available');
}

async function confirmOrder(ctx, orderId, options = {}) {
    const client = options.anonymous
        ? ctx.httpClient
        : (ctx.adminHttpClient || ctx.httpClient);

    try {
        const safeId = encodeURIComponent(String(orderId));
        const reqOpts = {};
        if (options.headers) reqOpts.headers = options.headers;
        if (options.anonymous) reqOpts.anonymous = true;
        const res = await client.post(`/api/orders/${safeId}/confirm`, options.body, reqOpts);
        if (res.ok && res.body?.campaignId && ctx.trackCampaign) {
            ctx.trackCampaign(res.body.campaignId);
        }
        if (res.status !== 404 || hasApiPayload(res) || ctx.serverUrl) {
            return res;
        }
    } catch {}

    if (ctx.orderService) {
        try {
            const order = ctx.orderService.confirmOrderPayment(orderId, { campaignId: 'cmp_mock_1' });
            return {
                status: 200,
                ok: true,
                body: { success: true, status: 'paid', campaignId: order.campaignId, order }
            };
        } catch (err) {
            return { status: 404, ok: false, body: { success: false, message: err.message } };
        }
    }

    throw new Error('Neither HTTP confirm route nor orderService available');
}

async function getAdminOrders(ctx) {
    const client = ctx.adminHttpClient || ctx.httpClient;
    return client.get('/api/admin/orders');
}

async function getAdminOrder(ctx, orderId) {
    const res = await getAdminOrders(ctx);
    const orders = (res.body && Array.isArray(res.body.orders)) ? res.body.orders : [];
    const order = orders.find(o => o.orderId === orderId) || null;
    return { res, order };
}

async function getPaymentConfig(ctx) {
    const client = ctx.adminHttpClient || ctx.httpClient;
    return client.get('/api/admin/payment-config');
}

async function setPaymentConfig(ctx, config) {
    const client = ctx.adminHttpClient || ctx.httpClient;
    return client.post('/api/admin/payment-config', config);
}

async function sendPaymentWebhook(ctx, payload, secret, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (secret !== undefined && secret !== null) {
        headers['Authorization'] = `Apikey ${secret}`;
    }
    const res = await ctx.httpClient.post('/api/payment/webhook', payload, {
        ...options,
        anonymous: true,
        headers
    });
    if (res.ok && res.body?.campaignId && ctx.trackCampaign) {
        ctx.trackCampaign(res.body.campaignId);
    }
    return res;
}

module.exports = {
    createOrder,
    calculateCost,
    getOrder,
    confirmOrder,
    getAdminOrders,
    getAdminOrder,
    getPaymentConfig,
    setPaymentConfig,
    sendPaymentWebhook,
    assertions: {
        assert,
        assertPricing,
        assertVietQrUrl,
        assertNonAccentedOrderCode,
        assertZeroClicks
    }
};
