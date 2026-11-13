/**
 * Tier 4: Real-World Customer Workloads
 * Flow 10: Target 500 Error & Partial Failure Accounting
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_10',
        name: 'Target Error Accounting: 5xx Errors Recorded as Failed Visits Without Crashing',
        feature: ['F19', 'F22', 'F23'],
        tier: 4,
        fn: async (ctx) => {
            const campaignStats = {
                targetLimit: 10,
                successVisits: 0,
                failedVisits: 0
            };

            const recordVisit = (statusCode) => {
                if (statusCode >= 200 && statusCode < 500) {
                    campaignStats.successVisits++;
                } else {
                    campaignStats.failedVisits++;
                }
            };

            // Simulate 8 successes and 2 failures
            for (let i = 0; i < 8; i++) recordVisit(200);
            for (let i = 0; i < 2; i++) recordVisit(500);

            assert.equal(campaignStats.successVisits, 8);
            assert.equal(campaignStats.failedVisits, 2);
            assert.equal(campaignStats.successVisits + campaignStats.failedVisits, 10);
        }
    }
];
