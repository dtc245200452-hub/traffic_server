/**
 * Tier 3: Combinatorial Interactions
 * Suite 6: Multi-Parameter Stress & Concurrency Matrix
 */
const { assert, assertPricing, assertVietQrUrl } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T3_COMBO_21',
        name: 'Stress Matrix: Concurrent Creation of 5 Distinct Customer Orders',
        feature: ['F01', 'F02', 'F03', 'F04', 'F08', 'F10'],
        tier: 3,
        fn: async (ctx) => {
            const configs = [
                { targetClicks: 50, durationHours: 0.5, key: 'cust_key_1', url: 'https://site1.com' },
                { targetClicks: 100, durationHours: 1.0, key: 'cust_key_2', url: 'https://site2.com' },
                { targetClicks: 200, durationHours: 1.5, key: 'cust_key_3', url: 'https://site3.com' },
                { targetClicks: 500, durationHours: 2.0, key: 'cust_key_4', url: 'https://site4.com' },
                { targetClicks: 1000, durationHours: 3.2, key: 'cust_key_5', url: 'https://site5.com' }
            ];

            const orders = await Promise.all(configs.map(cfg => ctx.createOrder({
                targetUrl: cfg.url,
                proxyKey: cfg.key,
                targetClicks: cfg.targetClicks,
                durationHours: cfg.durationHours
            })));

            for (let i = 0; i < orders.length; i++) {
                assert.equal(orders[i].ok, true);
                const o = orders[i].body.order || orders[i].body;
                assertPricing(o, configs[i].targetClicks, configs[i].durationHours);
                assertVietQrUrl(o.vietQrUrl, { amount: o.totalAmount, orderCode: o.orderCode });
            }
        }
    },
    {
        id: 'T3_COMBO_22',
        name: 'Stress Matrix: Multiple Orders Receive Distinct Unique Order Codes',
        feature: ['F10', 'F11'],
        tier: 3,
        fn: async (ctx) => {
            const promises = Array.from({ length: 4 }).map((_, idx) => ctx.createOrder({
                targetUrl: `https://site${idx}.vn`,
                proxyKey: `kiot_matrix_key_${idx}`,
                targetClicks: 100,
                durationHours: 1
            }));
            const responses = await Promise.all(promises);
            const codes = responses.map(r => (r.body.order || r.body).orderCode);
            const uniqueCodes = new Set(codes);
            assert.equal(uniqueCodes.size, 4, 'All generated order codes must be unique');
        }
    },
    {
        id: 'T3_COMBO_23',
        name: 'Stress Matrix: High Click Quota (25,000 clicks, 12h = 1,024,000 VNĐ)',
        feature: ['F06', 'F07', 'F08', 'F10'],
        tier: 3,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://big-client.com',
                proxyKey: 'kiot_heavy_key_99',
                targetClicks: 25000,
                durationHours: 12
            });
            const o = res.body.order || res.body;
            // 25000*40 + 12*2000 = 1,000,000 + 24,000 = 1,024,000
            assert.equal(o.totalAmount, 1024000);
            assertVietQrUrl(o.vietQrUrl, { amount: 1024000 });
        }
    },
    {
        id: 'T3_COMBO_24',
        name: 'Stress Matrix: Rapid Preview Calculations Handled Concurrently',
        feature: ['F08', 'F09'],
        tier: 3,
        fn: async (ctx) => {
            const promises = Array.from({ length: 10 }).map((_, i) => ctx.calculateCost({
                targetClicks: 100 * (i + 1),
                durationHours: 1 + i * 0.5
            }));
            const results = await Promise.all(promises);
            assert.equal(results.every(r => r.ok), true);
        }
    },
    {
        id: 'T3_COMBO_25',
        name: 'Stress Matrix: Sequential Confirmation of Multi-Order Queue',
        feature: ['F13', 'F14', 'F17'],
        tier: 3,
        fn: async (ctx) => {
            const resA = await ctx.createOrder({ targetUrl: 'https://a.com', proxyKey: 'key_a', targetClicks: 10, durationHours: 1 });
            const resB = await ctx.createOrder({ targetUrl: 'https://b.com', proxyKey: 'key_b', targetClicks: 10, durationHours: 1 });
            const orderIdA = (resA.body.order || resA.body).orderId;
            const orderIdB = (resB.body.order || resB.body).orderId;

            const confA = await ctx.confirmOrder(orderIdA);
            const confB = await ctx.confirmOrder(orderIdB);
            assert.equal(confA.ok, true);
            assert.equal(confB.ok, true);
        }
    },
    {
        id: 'T3_COMBO_26',
        name: 'Stress Matrix: Interleaved Unpaid and Paid Campaign Isolation',
        feature: ['F16', 'F17', 'F18'],
        tier: 3,
        fn: async (ctx) => {
            const unpaid = await ctx.createOrder({ targetUrl: 'https://unpaid.com', proxyKey: 'key_unpaid', targetClicks: 50, durationHours: 1 });
            const paid = await ctx.createOrder({ targetUrl: 'https://paid.com', proxyKey: 'key_paid', targetClicks: 50, durationHours: 1 });
            const paidId = (paid.body.order || paid.body).orderId;
            await ctx.confirmOrder(paidId);

            const unpaidOrder = (await ctx.getOrder((unpaid.body.order || unpaid.body).orderId)).body.order;
            const paidOrder = (await ctx.getOrder(paidId)).body.order;
            assert.equal(unpaidOrder.paymentStatus, 'pending_payment');
            assert.equal(paidOrder.paymentStatus, 'paid');
        }
    }
];
