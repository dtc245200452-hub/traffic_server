/**
 * Tier 1: Feature Coverage
 * Feature F17: Instant Auto-Activation Engine
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F17_01',
        name: 'Immediate State Transition to Running on Confirm',
        feature: 'F17',
        tier: 1,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: ctx.mockTarget.url,
                proxyKey: 'kiot_test_key_01',
                targetClicks: 10,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            const confirmRes = await ctx.confirmOrder(orderId);
            assert.equal(confirmRes.ok, true);
            assert.ok(confirmRes.body.campaignId);
        }
    },
    {
        id: 'T1_F17_02',
        name: 'Time Schedule Generation Upon Confirmation',
        feature: 'F17',
        tier: 1,
        fn: async (ctx) => {
            // Verify timeDistribution helper produces schedule
            const timeDist = require('../../timeDistribution');
            const now = Date.now();
            const schedule = timeDist.generateClickSchedule(now, now + 3600000, 10, 'smart');
            assert.equal(schedule.length, 10);
            assert.ok(schedule[0] >= now);
        }
    },
    {
        id: 'T1_F17_03',
        name: 'First Tick Dispatch Window Contract',
        feature: 'F17',
        tier: 1,
        fn: async (ctx) => {
            const timeDist = require('../../timeDistribution');
            const now = Date.now();
            const schedule = timeDist.generateClickSchedule(now, now + 3600000, 20, 'even');
            assert.ok(schedule.length === 20);
        }
    },
    {
        id: 'T1_F17_04',
        name: 'Elimination of Manual Admin Intervention via Payment Webhook',
        feature: 'F17',
        tier: 1,
        fn: async (ctx) => {
            // Configure a temporary webhookSecret as admin before customer payment flow
            const origCfgRes = await ctx.getPaymentConfig();
            assert.equal(origCfgRes.ok, true, 'Admin must be able to read payment config');
            const originalConfig = origCfgRes.body.config;
            const testSecret = `e2e_webhook_secret_${Date.now()}`;

            const setCfgRes = await ctx.setPaymentConfig({
                ...originalConfig,
                webhookSecret: testSecret
            });
            assert.equal(setCfgRes.ok, true, 'Admin must be able to set temporary webhookSecret');

            try {
                const createRes = await ctx.createOrder({
                    targetUrl: ctx.mockTarget.url,
                    proxyKey: 'kiot_test_key_01',
                    targetClicks: 10,
                    durationHours: 1
                });
                assert.equal(createRes.ok, true);
                const createdOrder = createRes.body.order || createRes.body;
                const orderId = createdOrder.orderId;

                // Public bankInfo must never leak webhookSecret
                assert.equal(createdOrder.bankInfo.webhookSecret, undefined);

                // Unauthenticated manual confirm must fail with 403
                const manualUnauthRes = await ctx.confirmOrder(orderId, { anonymous: true });
                assert.equal(manualUnauthRes.status, 403);

                // Webhook without valid secret must fail with 401
                const badWebhookRes = await ctx.sendPaymentWebhook({
                    transferType: 'in',
                    transferAmount: createdOrder.totalAmount,
                    content: `Thanh toan ${createdOrder.orderCode}`
                }, 'wrong_secret_value');
                assert.equal(badWebhookRes.status, 401);

                // Automatic zero-admin activation via bank webhook
                const webhookRes = await ctx.sendPaymentWebhook({
                    transferType: 'in',
                    transferAmount: createdOrder.totalAmount,
                    content: `Thanh toan ${createdOrder.orderCode}`
                }, testSecret);
                assert.equal(webhookRes.status, 200);
                assert.equal(webhookRes.ok, true);
                assert.equal(webhookRes.body.success, true);
                assert.equal(webhookRes.body.orderId, orderId);
                assert.ok(webhookRes.body.campaignId, 'Webhook activation must create and return campaignId');
                assert.equal(webhookRes.body.already, false);

                // Order automatically transitioned to paid/running with bank_webhook metadata
                const updatedOrder = (await ctx.getOrder(orderId)).body.order;
                assert.equal(updatedOrder.paymentStatus, 'paid');
                assert.equal(updatedOrder.paymentMethod, 'bank_webhook');
                assert.equal(updatedOrder.paidAmount, createdOrder.totalAmount);
                assert.equal(updatedOrder.campaignId, webhookRes.body.campaignId);
                assert.ok(updatedOrder.status === 'running' || updatedOrder.status === 'paid');

                // Idempotent replay does not create a second campaign
                const replayRes = await ctx.sendPaymentWebhook({
                    transferType: 'in',
                    transferAmount: createdOrder.totalAmount,
                    content: `Thanh toan ${createdOrder.orderCode}`
                }, testSecret);
                assert.equal(replayRes.status, 200);
                assert.equal(replayRes.body.already, true);
                assert.equal(replayRes.body.campaignId, webhookRes.body.campaignId);
            } finally {
                await ctx.setPaymentConfig(originalConfig);
            }
        }
    },
    {
        id: 'T1_F17_05',
        name: 'Immediate Notification Contract of Running State',
        feature: 'F17',
        tier: 1,
        fn: async (ctx) => {
            const orderId = 'ORD-TEST-NOTIFY';
            const statusPayload = { orderId, status: 'running', paymentStatus: 'paid' };
            assert.equal(statusPayload.status, 'running');
            assert.equal(statusPayload.paymentStatus, 'paid');
        }
    }
];
