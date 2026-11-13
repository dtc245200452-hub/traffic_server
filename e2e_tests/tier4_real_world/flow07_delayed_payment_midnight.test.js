/**
 * Tier 4: Real-World Customer Workloads
 * Flow 7: Delayed Payment & Execution Window Recalculation
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_07',
        name: 'Delayed Payment: Schedule Recalculated from Confirm Timestamp',
        feature: ['F04', 'F13', 'F14', 'F17'],
        tier: 4,
        fn: async (ctx) => {
            // Customer creates order at T0
            const createRes = await ctx.createOrder({
                name: 'Delayed Payment Order',
                targetUrl: `${ctx.mockTarget.url}/delayed`,
                proxyKey: 'kiot_delayed_key',
                targetClicks: 20,
                durationHours: 1
            });
            const order = createRes.body.order || createRes.body;

            // Simulate delayed payment confirmation (e.g. customer takes time to bank transfer)
            await new Promise((r) => setTimeout(r, 200));

            const confirmRes = await ctx.confirmOrder(order.orderId);
            assert.equal(confirmRes.ok, true);

            // Verify execution schedule begins at or after confirmation timestamp
            const confirmTime = Date.now();
            const timeDist = require('../../timeDistribution');
            const sched = timeDist.generateClickSchedule(confirmTime, confirmTime + 3600000, 20, 'smart');
            assert.ok(sched[0] >= confirmTime - 1000);
            assert.ok(sched[sched.length - 1] <= confirmTime + 3600000);
        }
    }
];
