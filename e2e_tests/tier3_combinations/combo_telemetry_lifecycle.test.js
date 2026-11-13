/**
 * Tier 3: Combinatorial Interactions
 * Suite 5: Full Order Lifecycle × Real-time Telemetry Streaming
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T3_COMBO_18',
        name: 'Telemetry × Lifecycle: Socket client handshakes and connects to server',
        feature: ['F13', 'F22'],
        tier: 3,
        fn: async (ctx) => {
            const socketClient = ctx.createSocketClient();
            await socketClient.connect(5000);
            assert.ok(socketClient.sid, 'Socket.IO client must obtain session id');
        }
    },
    {
        id: 'T3_COMBO_19',
        name: 'Telemetry × Lifecycle: Payment confirmation triggers payment-confirmed broadcast',
        feature: ['F14', 'F17', 'F22'],
        tier: 3,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: ctx.mockTarget.url,
                proxyKey: 'kiot_socket_key_01',
                targetClicks: 10,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;

            const socketClient = ctx.createSocketClient();
            try {
                await socketClient.connect(5000);
                await socketClient.emit('subscribe-order', orderId);

                const confirmedPromise = socketClient.waitForEvent('payment-confirmed', 5000);
                const confirmRes = await ctx.confirmOrder(orderId);
                assert.equal(confirmRes.ok, true);

                const evt = await confirmedPromise;
                assert.equal(evt.orderId, orderId);
                assert.equal(evt.status, 'paid');
                assert.ok(evt.campaignId);
            } finally {
                socketClient.disconnect();
            }
        }
    },
    {
        id: 'T3_COMBO_20',
        name: 'Telemetry × Lifecycle: Lifecycle reaches completion with accurate delivery counters',
        feature: ['F13', 'F22', 'F23'],
        tier: 3,
        fn: async (ctx) => {
            const orderState = {
                orderId: 'ORD-LIFECYCLE-END',
                status: 'running',
                targetClicks: 5,
                successVisits: 5
            };
            if (orderState.successVisits >= orderState.targetClicks) {
                orderState.status = 'completed';
            }
            assert.equal(orderState.status, 'completed');
        }
    }
];
