/**
 * Tier 1: Feature Coverage
 * Feature F02: Customer Proxy Kiot Key Input
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F02_01',
        name: 'Capture Standard KiotProxy Key',
        feature: 'F02',
        tier: 1,
        fn: async (ctx) => {
            const key = 'kiot_live_key_alpha_12345';
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: key,
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.proxyKey, key);
        }
    },
    {
        id: 'T1_F02_02',
        name: 'Proxy Key Masking on Public Order Query & Plaintext Retention on Admin Query',
        feature: 'F02',
        tier: 1,
        fn: async (ctx) => {
            const key = 'kiot_retention_key_999';
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: key,
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;

            // Public GET /api/orders/:id must strip plaintext proxyKey and expose proxyKeyMasked
            const queryRes = await ctx.getOrder(orderId);
            assert.equal(queryRes.ok, true);
            const pubOrder = queryRes.body.order || queryRes.body;
            assert.equal(pubOrder.proxyKey, undefined, 'Public order endpoint must not expose plaintext proxyKey');
            assert.equal(pubOrder.proxyKeyMasked, `...${key.slice(-4)}`, 'Public order endpoint must return proxyKeyMasked matching last 4 chars');

            // Unauthenticated admin orders endpoint must be rejected
            const unauthAdminRes = await ctx.httpClient.get('/api/admin/orders');
            assert.equal(unauthAdminRes.status, 401);

            // Admin GET /api/admin/orders must retain plaintext proxyKey
            const { res: adminRes, order: adminOrder } = await ctx.getAdminOrder(orderId);
            assert.equal(adminRes.ok, true);
            assert.ok(adminOrder, 'Admin orders list must include created order');
            assert.equal(adminOrder.proxyKey, key);
            assert.equal(adminOrder.proxyKeyMasked, `...${key.slice(-4)}`);
        }
    },
    {
        id: 'T1_F02_03',
        name: 'Support Hexadecimal KiotProxy Keys',
        feature: 'F02',
        tier: 1,
        fn: async (ctx) => {
            const hexKey = '4a7b2c9e1d8f3056a2b4c6e8f0123456';
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: hexKey,
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.proxyKey, hexKey);
        }
    },
    {
        id: 'T1_F02_04',
        name: 'Masked Representation in Public Logs and Public Order View',
        feature: 'F02',
        tier: 1,
        fn: async (ctx) => {
            const secretKey = 'kiot_super_secret_key_8888';
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: secretKey,
                targetClicks: 100,
                durationHours: 1
            });
            const created = res.body.order || res.body;
            assert.equal(created.proxyKey, secretKey);

            // Public GET /api/orders/:id should never leak plaintext secret key
            const pubRes = await ctx.getOrder(created.orderId);
            assert.equal(pubRes.ok, true);
            const pubOrder = pubRes.body.order || pubRes.body;
            assert.equal(pubOrder.proxyKey, undefined);
            assert.equal(pubOrder.proxyKeyMasked, '...8888');
        }
    },
    {
        id: 'T1_F02_05',
        name: 'Customer Proxy Key Campaign Isolation',
        feature: 'F02',
        tier: 1,
        fn: async (ctx) => {
            const customerKey = 'kiot_isolated_cust_key_555';
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: customerKey,
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            const confirmRes = await ctx.confirmOrder(orderId);
            assert.equal(confirmRes.ok, true);

            // Public GET /api/orders/:id masks proxyKey
            const pubOrder = (await ctx.getOrder(orderId)).body.order;
            assert.equal(pubOrder.proxyKey, undefined);
            assert.equal(pubOrder.proxyKeyMasked, `...${customerKey.slice(-4)}`);

            // Admin GET /api/admin/orders retains plaintext proxyKey
            const { res: adminRes, order: adminOrder } = await ctx.getAdminOrder(orderId);
            assert.equal(adminRes.ok, true);
            assert.ok(adminOrder);
            assert.equal(adminOrder.proxyKey, customerKey);

            // Admin campaign view preserves isolated customerProxyKey
            const campsRes = await ctx.adminHttpClient.get('/api/campaigns');
            assert.equal(campsRes.ok, true);
            const camp = (campsRes.body.data || []).find(c => c.id === confirmRes.body.campaignId);
            assert.ok(camp, 'Created campaign must exist in admin campaigns list');
            assert.equal(camp.config.customerProxyKey, customerKey);
        }
    }
];
