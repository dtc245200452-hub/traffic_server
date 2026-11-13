/**
 * Test Context Store and Lifecycle Coordinator
 */
const path = require('path');
const fs = require('fs');
const { TestServer, snapshotFile, restoreFile } = require('./test_server');
const { MockKiotProxyServer, MockTargetServer } = require('./mock_services');
const { HttpClient, SocketIoClient } = require('./http_client');
const assertions = require('./assertions');
const apiAdapter = require('./api_adapter');

class TestContext {
    constructor(options = {}) {
        this.options = options;
        this.projectRoot = path.resolve(__dirname, '../..');
        this.mockKiot = new MockKiotProxyServer();
        this.mockTarget = new MockTargetServer();
        this.testServer = null;
        this.serverUrl = options.serverUrl || '';
        this.httpClient = new HttpClient();
        this.adminHttpClient = new HttpClient();
        this.adminCookie = '';
        this.orderService = null;
        this.assertions = assertions;
        this.assert = assertions.assert;
        this.activeSockets = [];

        this._ordersDir = path.join(this.projectRoot, 'orders');
        this._campaignsDir = path.join(this.projectRoot, 'campaigns');
        this._paymentConfigPath = path.join(this.projectRoot, 'payment_config.json');
        this._paymentConfigSnapshot = null;
        this._initialOrderFiles = null;
        this._initialCampaignFiles = null;
        this.createdOrderIds = new Set();
        this.createdCampaignIds = new Set();
        this._teardownDone = false;

        try {
            this.orderService = require(path.join(this.projectRoot, 'orderService.js'));
        } catch {}

        // Bind adapter methods
        this.createOrder = (payload) => apiAdapter.createOrder(this, payload);
        this.calculateCost = (payload) => apiAdapter.calculateCost(this, payload);
        this.getOrder = (orderId) => apiAdapter.getOrder(this, orderId);
        this.confirmOrder = (orderId, opts) => apiAdapter.confirmOrder(this, orderId, opts);
        this.getAdminOrders = () => apiAdapter.getAdminOrders(this);
        this.getAdminOrder = (orderId) => apiAdapter.getAdminOrder(this, orderId);
        this.getPaymentConfig = () => apiAdapter.getPaymentConfig(this);
        this.setPaymentConfig = (config) => apiAdapter.setPaymentConfig(this, config);
        this.sendPaymentWebhook = (payload, secret, opts) => apiAdapter.sendPaymentWebhook(this, payload, secret, opts);
    }

    trackOrder(orderId) {
        if (orderId) this.createdOrderIds.add(String(orderId));
    }

    trackCampaign(campaignId) {
        if (campaignId !== undefined && campaignId !== null) {
            this.createdCampaignIds.add(String(campaignId));
        }
    }

    async setup() {
        this._teardownDone = false;
        this.createdOrderIds.clear();
        this.createdCampaignIds.clear();

        // Snapshot mutable config and pre-existing data files for clean teardown
        this._paymentConfigSnapshot = snapshotFile(this._paymentConfigPath);
        this._initialOrderFiles = new Set(
            fs.existsSync(this._ordersDir) ? fs.readdirSync(this._ordersDir) : []
        );
        this._initialCampaignFiles = new Set(
            fs.existsSync(this._campaignsDir) ? fs.readdirSync(this._campaignsDir) : []
        );

        // 1. Start mock target and mock kiot servers
        const [targetInfo, kiotInfo] = await Promise.all([
            this.mockTarget.start(),
            this.mockKiot.start()
        ]);

        // 2. Start test server if not external
        this.testServer = new TestServer({
            projectRoot: this.projectRoot,
            serverUrl: this.options.serverUrl,
            port: this.options.port,
            verbose: this.options.verbose,
            env: {
                KIOT_API_BASE: kiotInfo.url
            }
        });

        const srv = await this.testServer.start();
        this.serverUrl = srv.serverUrl;
        this.httpClient.setBaseUrl(this.serverUrl);
        this.adminHttpClient.setBaseUrl(this.serverUrl);
        if (srv.adminCookie) {
            this.adminCookie = srv.adminCookie;
            this.adminHttpClient.setCookie(srv.adminCookie);
        }

        return this;
    }

    createSocketClient(options = {}) {
        const socketOpts = { ...options };
        if (options.asAdmin && this.adminCookie && !socketOpts.cookie) {
            socketOpts.cookie = this.adminCookie;
        }
        const client = new SocketIoClient(this.serverUrl, socketOpts);
        this.activeSockets.push(client);
        return client;
    }

    _cleanupCreatedFiles() {
        if (this._initialOrderFiles && fs.existsSync(this._ordersDir)) {
            for (const file of fs.readdirSync(this._ordersDir)) {
                if (!/^ORD-.*\.json$/.test(file)) continue;
                const orderId = file.slice(0, -5);
                if (!this._initialOrderFiles.has(file) || this.createdOrderIds.has(orderId)) {
                    try { fs.unlinkSync(path.join(this._ordersDir, file)); } catch {}
                }
            }
        }

        if (this._initialCampaignFiles && fs.existsSync(this._campaignsDir)) {
            for (const file of fs.readdirSync(this._campaignsDir)) {
                if (!file.endsWith('.json')) continue;
                const campaignId = file.slice(0, -5);
                if (!this._initialCampaignFiles.has(file) || this.createdCampaignIds.has(campaignId)) {
                    try { fs.unlinkSync(path.join(this._campaignsDir, file)); } catch {}
                }
            }
        }
    }

    async teardown() {
        if (this._teardownDone) return;
        this._teardownDone = true;

        for (const sock of this.activeSockets) {
            try { sock.disconnect(); } catch {}
        }
        this.activeSockets = [];

        await Promise.all([
            this.testServer ? this.testServer.stop() : Promise.resolve(),
            this.mockTarget ? this.mockTarget.stop() : Promise.resolve(),
            this.mockKiot ? this.mockKiot.stop() : Promise.resolve()
        ]);

        // Restore payment_config.json and delete E2E-created orders/campaigns after server stops
        if (this._paymentConfigSnapshot) {
            restoreFile(this._paymentConfigPath, this._paymentConfigSnapshot);
            this._paymentConfigSnapshot = null;
        }
        this._cleanupCreatedFiles();
        this._initialOrderFiles = null;
        this._initialCampaignFiles = null;
        this.createdOrderIds.clear();
        this.createdCampaignIds.clear();
    }
}

module.exports = {
    TestContext
};
