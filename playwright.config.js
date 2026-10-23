import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: './tests/browser',
    workers: 2,
    use: {
        baseURL: 'http://127.0.0.1:8010',
        launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    },
    webServer: {
        command: 'python3 -m http.server 8010 --bind 127.0.0.1',
        url: 'http://127.0.0.1:8010',
        reuseExistingServer: false,
        stdout: 'ignore', stderr: 'ignore',
    },
});
