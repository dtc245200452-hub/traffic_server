/**
 * Tier 1: Feature Coverage
 * Feature F12: Bank Configuration Management
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F12_01',
        name: 'Bank Info Retrieval via Public API',
        feature: 'F12',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.ok(order.bankInfo, 'bankInfo must be present in order response');
            assert.ok(order.bankInfo.bankId);
            assert.ok(order.bankInfo.accountNumber);
        }
    },
    {
        id: 'T1_F12_02',
        name: 'Default Bank Account Resolution',
        feature: 'F12',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.equal(order.bankInfo.bankId, 'MB');
            assert.equal(order.bankInfo.accountNumber, '0987654321');
        }
    },
    {
        id: 'T1_F12_03',
        name: 'Bank Info Object Structure',
        feature: 'F12',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            const b = order.bankInfo;
            assert.ok(typeof b.bankId === 'string');
            assert.ok(typeof b.accountNumber === 'string');
            assert.ok(typeof b.accountName === 'string');
        }
    },
    {
        id: 'T1_F12_04',
        name: 'Valid Bank Identification Code (BIN/ID)',
        feature: 'F12',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.ok(['MB', 'VCB', 'ACB', 'VPB', 'TCB', 'BIDV', 'ICB'].includes(order.bankInfo.bankId));
        }
    },
    {
        id: 'T1_F12_05',
        name: 'Bank Account Name Capitalization',
        feature: 'F12',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.equal(order.bankInfo.accountName, order.bankInfo.accountName.toUpperCase());
        }
    }
];
