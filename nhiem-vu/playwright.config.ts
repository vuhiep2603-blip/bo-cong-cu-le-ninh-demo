import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'tests',testMatch:'browser.spec.ts',workers:1,timeout:60000,
 use:{
  baseURL:'http://127.0.0.1:4180',
  launchOptions:{executablePath:process.env.CHROMIUM_PATH||undefined}
 },
 webServer:{
  command:'npm run dev -- --host 127.0.0.1 --port 4180 --strictPort',
  url:'http://127.0.0.1:4180',
  reuseExistingServer:!process.env.CI,
  env:{
   VITE_FIREBASE_API_KEY:'demo-key',VITE_FIREBASE_AUTH_DOMAIN:'demo-vpdu.firebaseapp.com',
   VITE_FIREBASE_APP_ID:'1:100:web:demo',VITE_FIREBASE_PROJECT_ID:'demo-vpdu',VITE_USE_EMULATORS:'true'
  }
 }
});
