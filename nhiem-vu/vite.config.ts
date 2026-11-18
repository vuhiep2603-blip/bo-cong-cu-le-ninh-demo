import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig(({command, mode}) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)));
  if (command === 'build' && (mode === 'demo' || env.VITE_USE_EMULATORS === 'true' || env.VITE_FIREBASE_PROJECT_ID === 'demo-vpdu')) {
    throw Error('Không tạo bản build khi đang dùng cấu hình Firebase Emulator.');
  }
  const authQa = mode === 'auth-qa';
  if (authQa && command === 'build' && (
    env.VITE_FIREBASE_PROJECT_ID !== 'vpduln-quanlynhiemvu' ||
    env.VITE_FIREBASE_AUTH_DOMAIN !== 'vpduln-quanlynhiemvu.firebaseapp.com' ||
    !env.VITE_FIREBASE_API_KEY?.trim() || !env.VITE_FIREBASE_APP_ID?.trim()
  )) {
    throw Error('Build nghiệm thu yêu cầu Web App của project vpduln-quanlynhiemvu.');
  }
  return {
    base: './',
    plugins: [react(), ...(authQa ? [{
      name: 'auth-qa-entry',
      transformIndexHtml: {
        order: 'pre' as const,
        handler: (html:string) => html.replace('/src/main.tsx','/src/auth-qa.tsx')
      }
    }] : [])],
    build: authQa ? {outDir:'dist-auth-qa'} : undefined,
    server: {fs: {allow: [fileURLToPath(new URL('..', import.meta.url))]}}
  };
});
