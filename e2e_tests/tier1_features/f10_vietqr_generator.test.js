/**
 * Tier 1: Feature Coverage
 * Feature F10: Dynamic VietQR Generator
 */
const { assert, assertVietQrUrl } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F10_01',
        name: 'VietQR Image URL Host & Protocol',
        feature: 'F10',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 500,
                durationHours: 1.5
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.ok(order.vietQrUrl, 'Order must contain vietQrUrl');
            assert.ok(order.vietQrUrl.startsWith('https://img.vietqr.io/image/'));
        }
    },
    {
        id: 'T1_F10_02',
        name: 'Correct Bank BIN / Path Encoding',
        feature: 'F10',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assertVietQrUrl(order.vietQrUrl, {
                bankId: order.bankInfo.bankId,
                accountNumber: order.bankInfo.accountNumber
            });
        }
    },
    {
        id: 'T1_F10_03',
        name: 'Exact Amount Query Parameter',
        feature: 'F10',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 1000,
                durationHours: 2
            });
            const order = res.body.order || res.body;
            // 1000*40 + 2*2000 = 44000
            assert.equal(order.totalAmount, 44000);
            assertVietQrUrl(order.vietQrUrl, { amount: 44000 });
        }
    },
    {
        id: 'T1_F10_04',
        name: 'Order Memo Query Parameter (addInfo)',
        feature: 'F10',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assertVietQrUrl(order.vietQrUrl, { orderCode: order.orderCode });
        }
    },
    {
        id: 'T1_F10_05',
        name: 'URL-Encoded Account Name Parameter',
        feature: 'F10',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assertVietQrUrl(order.vietQrUrl, { accountName: order.bankInfo.accountName });
        }
    }
];
