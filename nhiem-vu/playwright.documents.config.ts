import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'tests',testMatch:'documents.spec.ts',timeout:90000,workers:1,
 use:{baseURL:'http://127.0.0.1:4182',launchOptions:{executablePath:process.env.CHROMIUM_PATH||undefined}},
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4182 --strictPort',url:'http://127.0.0.1:4182'}
});
