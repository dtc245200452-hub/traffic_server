/**
 * Tier 2: Boundary & Corner Cases
 * Feature F17: Instant Auto-Activation Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F17_01',
        name: 'Single Click Campaign Activation (1 click schedule)',
        feature: 'F17',
        tier: 2,
        fn: async (ctx) => {
            const timeDist = require('../../timeDistribution');
            const now = Date.now();
            const sched = timeDist.generateClickSchedule(now, now + 3600000, 1, 'smart');
            assert.equal(sched.length, 1);
        }
    },
    {
        id: 'T2_F17_02',
        name: 'High Click Volume Schedule Generation (10,000 clicks)',
        feature: 'F17',
        tier: 2,
        fn: async (ctx) => {
            const timeDist = require('../../timeDistribution');
            const now = Date.now();
            const sched = timeDist.generateClickSchedule(now, now + 86400000, 10000, 'even');
            assert.equal(sched.length, 10000);
        }
    },
    {
        id: 'T2_F17_03',
        name: 'Schedule Boundaries strictly within startTime and endTime',
        feature: 'F17',
        tier: 2,
        fn: async (ctx) => {
            const timeDist = require('../../timeDistribution');
            const start = Date.now();
            const end = start + 3600000;
            const sched = timeDist.generateClickSchedule(start, end, 50, 'smart');
            for (const t of sched) {
                assert.ok(t >= start, `Tick ${t} must be >= start ${start}`);
                assert.ok(t <= end, `Tick ${t} must be <= end ${end}`);
            }
        }
    },
    {
        id: 'T2_F17_04',
        name: 'Immediate Tick Firing On Current Millisecond',
        feature: 'F17',
        tier: 2,
        fn: async (ctx) => {
            const now = Date.now();
            const dueTicks = [now - 1000, now - 500, now + 5000].filter(t => t <= now);
            assert.equal(dueTicks.length, 2);
        }
    },
    {
        id: 'T2_F17_05',
        name: 'Auto-Activation Invariant: paymentStatus is strictly paid',
        feature: 'F17',
        tier: 2,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: ctx.mockTarget.url,
                proxyKey: 'kiot_test_key_01',
                targetClicks: 10,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            const confirmRes = await ctx.confirmOrder(orderId);
            const status = confirmRes.body.status || confirmRes.body.order.status;
            assert.equal(status, 'paid');
        }
    }
];
