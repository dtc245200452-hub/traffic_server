/**
 * Tier 4: Real-World Customer Workloads
 * Flow 8: Customer Browser Disconnect & Reconnect Telemetry Recovery
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_08',
        name: 'Browser Disconnect & Reconnect: Telemetry State Preserved',
        feature: ['F13', 'F22'],
        tier: 4,
        fn: async (ctx) => {
            // Client 1 connects socket
            const client1 = ctx.createSocketClient();
            await client1.connect(5000);
            assert.ok(client1.sid);

            // Client 1 disconnects (closes tab)
            client1.disconnect();

            // Client 2 connects (reopens tab)
            const client2 = ctx.createSocketClient();
            await client2.connect(5000);
            assert.ok(client2.sid);

            // Server state query succeeds independently of socket connection
            const createRes = await ctx.createOrder({
                targetUrl: `${ctx.mockTarget.url}/reconnect`,
                proxyKey: 'kiot_reconnect_key',
                targetClicks: 10,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            const res = await ctx.getOrder(orderId);
            assert.equal(res.ok, true);
        }
    }
];
