import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    workers: 1,
    timeout: 45000,
    use: {
        baseURL: 'http://127.0.0.1:3100',
        channel: 'chrome',
        headless: true,
        viewport: { width: 1440, height: 1000 },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    webServer: {
        command: 'node server/server.js',
        url: 'http://127.0.0.1:3100',
        env: { PORT: '3100' },
        reuseExistingServer: false
    }
});
