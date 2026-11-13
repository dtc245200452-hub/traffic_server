/**
 * Tier 4: Real-World Customer Workloads
 * Flow 11: Zero-Click Pre-Payment Gating Security Penetration Audit
 */
const { assert, assertZeroClicks } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_11',
        name: 'Gating Security Audit: Adversarial Bypass Attempts Yield Strictly 0 Requests',
        feature: ['F13', 'F16'],
        tier: 4,
        fn: async (ctx) => {
            ctx.mockTarget.reset();
            const attackPath = `/attack-target-${Date.now()}`;

            // 1. Create an unpaid order
            const createRes = await ctx.createOrder({
                name: 'Adversarial Unpaid Order',
                targetUrl: `${ctx.mockTarget.url}${attackPath}`,
                proxyKey: 'kiot_attacker_key',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(createRes.ok, true);
            const orderId = createRes.body.orderId || createRes.body.order.orderId;

            // 2. Attempt unauthorized execution triggers
            const unauthConfirmRes = await ctx.httpClient.post(`/api/orders/${encodeURIComponent(orderId)}/confirm`, {});
            assert.equal(unauthConfirmRes.status, 403, 'Unauthenticated /confirm attempt must be rejected with 403');
            await ctx.httpClient.post(`/api/campaigns/${orderId}/start`, {}).catch(() => {});
            const resetRes = await ctx.httpClient.post(`/api/campaigns/${orderId}/reset-stats`, {});
            assert.equal(resetRes.status, 401, 'Unauthenticated /api/campaigns/*/reset-stats must be rejected with 401');

            // 3. Wait for multiple scheduler intervals
            await new Promise((r) => setTimeout(r, 600));

            // 4. Audit mock target server: Must have received EXACTLY 0 requests for this unpaid order target!
            // Filter by attackPath because earlier tests may have left paid campaigns running on the shared server.
            const attackRequests = ctx.mockTarget.getRequests().filter(r => r.path === attackPath);
            assert.equal(attackRequests.length, 0, 'Zero requests must reach target URL for unpaid orders');

            // 5. Verify order state still reports unpaid and 0 visits
            const order = (await ctx.getOrder(orderId)).body.order;
            assert.equal(order.status, 'pending_payment');
            assert.equal(order.paymentStatus, 'pending_payment');
            assert.equal(order.campaignId, null);
            assertZeroClicks(order);
        }
    }
];
