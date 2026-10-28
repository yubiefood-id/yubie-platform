import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
 testDir: "apps/admin/tests/browser", fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
 timeout: 30000, outputDir: "test-results/admin", reporter: [["line"]],
 use: { baseURL: "https://localhost:4175", ignoreHTTPSErrors: true, locale: "id-ID", timezoneId: "Asia/Jakarta", trace: "retain-on-failure" },
 projects: [{name:"admin-desktop",use:{...devices["Desktop Chrome"]}},{name:"admin-mobile",use:{...devices["Pixel 7"],browserName:"chromium"}},{name:"admin-320",use:{...devices["Desktop Chrome"],viewport:{width:320,height:740}}}],
 webServer: { command: "node apps/admin/tests/browser-server.mjs", url: "https://localhost:4175/healthz", ignoreHTTPSErrors: true, reuseExistingServer: false, timeout: 60000 },
});
