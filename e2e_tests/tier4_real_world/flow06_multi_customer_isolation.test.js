/**
 * Tier 4: Real-World Customer Workloads
 * Flow 6: Multi-Customer Independent Isolation Workflow
 */
const { assert, assertZeroClicks } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_06',
        name: 'Multi-Customer Isolation: Strict Isolation of Proxy Keys and Payment Gating',
        feature: ['F01', 'F02', 'F13', 'F14', 'F16', 'F18'],
        tier: 4,
        fn: async (ctx) => {
            // Customer A configures order
            const resA = await ctx.createOrder({
                name: 'Customer A Campaign',
                targetUrl: `${ctx.mockTarget.url}/client-a`,
                proxyKey: 'kiot_key_customer_a',
                targetClicks: 50,
                durationHours: 1
            });
            const orderA = resA.body.order || resA.body;

            // Customer B configures order
            const resB = await ctx.createOrder({
                name: 'Customer B Campaign',
                targetUrl: `${ctx.mockTarget.url}/client-b`,
                proxyKey: 'kiot_key_customer_b',
                targetClicks: 100,
                durationHours: 2
            });
            const orderB = resB.body.order || resB.body;

            // Confirm Customer A only
            const confA = await ctx.confirmOrder(orderA.orderId);
            assert.equal(confA.ok, true);

            // Verify Customer A is paid / running
            const queryA = (await ctx.getOrder(orderA.orderId)).body.order;
            assert.equal(queryA.paymentStatus, 'paid');

            // Verify Customer B remains unpaid and strictly gated (0 clicks)
            const queryB = (await ctx.getOrder(orderB.orderId)).body.order;
            assert.equal(queryB.paymentStatus, 'pending_payment');
            assertZeroClicks(queryB);

            // Confirm Customer B
            const confB = await ctx.confirmOrder(orderB.orderId);
            assert.equal(confB.ok, true);
            const queryBPaid = (await ctx.getOrder(orderB.orderId)).body.order;
            assert.equal(queryBPaid.paymentStatus, 'paid');

            // Public GET /api/orders/:id masks proxyKey while preserving last 4 chars
            assert.equal(queryA.proxyKey, undefined);
            assert.equal(queryA.proxyKeyMasked, '...er_a');
            assert.equal(queryBPaid.proxyKey, undefined);
            assert.equal(queryBPaid.proxyKeyMasked, '...er_b');

            // Admin GET /api/admin/orders retains isolated plaintext customer keys
            const { res: adminResA, order: adminA } = await ctx.getAdminOrder(orderA.orderId);
            const { order: adminB } = await ctx.getAdminOrder(orderB.orderId);
            assert.equal(adminResA.ok, true);
            assert.equal(adminA.proxyKey, 'kiot_key_customer_a');
            assert.equal(adminB.proxyKey, 'kiot_key_customer_b');

            // Campaigns store isolated customerProxyKey per campaign
            const campsRes = await ctx.adminHttpClient.get('/api/campaigns');
            assert.equal(campsRes.ok, true);
            const campA = (campsRes.body.data || []).find(c => c.id === confA.body.campaignId);
            const campB = (campsRes.body.data || []).find(c => c.id === confB.body.campaignId);
            assert.ok(campA && campB);
            assert.equal(campA.config.customerProxyKey, 'kiot_key_customer_a');
            assert.equal(campB.config.customerProxyKey, 'kiot_key_customer_b');
        }
    }
];
