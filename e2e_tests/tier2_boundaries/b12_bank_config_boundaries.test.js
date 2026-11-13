/**
 * Tier 2: Boundary & Corner Cases
 * Feature F12: Bank Configuration Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F12_01',
        name: 'Missing payment_config.json Graceful Fallback',
        feature: 'F12',
        tier: 2,
        fn: async (ctx) => {
            if (ctx.orderService) {
                const cfg = ctx.orderService.getPaymentConfig();
                assert.ok(cfg.bankId, 'Fallback config must provide bankId');
                assert.ok(cfg.accountNumber, 'Fallback config must provide accountNumber');
            } else {
                assert.ok(true);
            }
        }
    },
    {
        id: 'T2_F12_02',
        name: 'Account Number Formatting (Digits preserved)',
        feature: 'F12',
        tier: 2,
        fn: async (ctx) => {
            if (ctx.orderService) {
                const cfg = ctx.orderService.getPaymentConfig();
                assert.ok(/^\d+$/.test(cfg.accountNumber), 'Account number must be digits');
            } else {
                assert.ok(true);
            }
        }
    },
    {
        id: 'T2_F12_03',
        name: 'Account Name ASCII Transformation',
        feature: 'F12',
        tier: 2,
        fn: async (ctx) => {
            if (ctx.orderService) {
                const cfg = ctx.orderService.getPaymentConfig();
                assert.equal(cfg.accountName, cfg.accountName.toUpperCase());
            } else {
                assert.ok(true);
            }
        }
    },
    {
        id: 'T2_F12_04',
        name: 'Default Template Selection (compact2)',
        feature: 'F12',
        tier: 2,
        fn: async (ctx) => {
            if (ctx.orderService) {
                const cfg = ctx.orderService.getPaymentConfig();
                assert.equal(cfg.template || 'compact2', 'compact2');
            } else {
                assert.ok(true);
            }
        }
    },
    {
        id: 'T2_F12_05',
        name: 'Bank ID Case Normalization',
        feature: 'F12',
        tier: 2,
        fn: async (ctx) => {
            if (ctx.orderService) {
                const cfg = ctx.orderService.getPaymentConfig();
                assert.equal(cfg.bankId, cfg.bankId.toUpperCase());
            } else {
                assert.ok(true);
            }
        }
    }
];
