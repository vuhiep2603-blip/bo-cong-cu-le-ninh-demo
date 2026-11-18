import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig(({command, mode}) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)));
  if (command === 'build' && (mode === 'demo' || env.VITE_USE_EMULATORS === 'true' || env.VITE_FIREBASE_PROJECT_ID === 'demo-vpdu')) {
    throw Error('Không tạo bản build khi đang dùng cấu hình Firebase Emulator.');
  }
  return {
    base: './',
    plugins: [react()],
    server: {fs: {allow: [fileURLToPath(new URL('..', import.meta.url))]}}
  };
});
