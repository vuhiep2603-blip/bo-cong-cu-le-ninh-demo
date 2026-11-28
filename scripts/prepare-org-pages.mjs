import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const outDir = path.resolve(root, process.argv[2] || 'dist-org-pages');

const ALLOWED_ROOT_FILES = [
  '.nojekyll',
  'index.html',
  'giay-moi.html',
  'lich-cong-tac.html',
  'theo-doi-nhiem-vu.html',
  'HUONG_DAN.html',
];

const EXCLUDED_REL_PATHS = new Set([
  'assets/dau_van_phong_can_tron.png',
]);

const FORBIDDEN_EXTS = new Set(['.key', '.pem', '.p12', '.exe', '.cab']);

const SECRET_PATTERNS = [
  { name: 'ZALO_BOT_TOKEN literal', re: /ZALO_BOT_TOKEN\s*[:=]\s*['"][^'"]{8,}['"]/ },
  { name: 'ZALO_SECRET_TOKEN literal', re: /ZALO_SECRET_TOKEN\s*[:=]\s*['"][^'"]{6,}['"]/ },
  { name: 'GOOGLE_CLIENT_SECRET literal', re: /GOOGLE_CLIENT_SECRET\s*[:=]\s*['"][^'"]{8,}['"]/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Google OAuth secret', re: /GOCSPX-[0-9A-Za-z_-]{16,}/ },
  { name: 'Google OAuth access token', re: /ya29\.[0-9A-Za-z._-]{20,}/ },
  { name: 'GitHub token', re: /gh[pousr]_[0-9A-Za-z]{20,}/ },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of ALLOWED_ROOT_FILES) {
  const src = path.join(root, file);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required root file: ${file}`);
  }
  fs.copyFileSync(src, path.join(outDir, file));
}

function copyFilteredDir(srcDir, dstDir, relBase) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = `${relBase}/${entry.name}`.replace(/\\/g, '/');
    if (EXCLUDED_REL_PATHS.has(rel)) {
      console.log(`EXCLUDED (security policy): ${rel}`);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (FORBIDDEN_EXTS.has(ext)) {
      console.log(`EXCLUDED (forbidden extension): ${rel}`);
      continue;
    }
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyFilteredDir(srcPath, dstPath, rel);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

copyFilteredDir(path.join(root, 'assets'), path.join(outDir, 'assets'), 'assets');

// Write clean README for public Organization Pages repo
fs.writeFileSync(
  path.join(outDir, 'README.md'),
  [
    '# Bộ công cụ Văn phòng Đảng ủy xã Lệ Ninh, tỉnh Quảng Trị',
    '',
    'Trang GitHub Pages chính thức: **https://vpdu-leninh.github.io/**',
    '',
    '## Các công cụ tích hợp',
    '- **Tạo Giấy mời tự động** (`giay-moi.html`) — Chạy hoàn toàn trên trình duyệt, xuất Word/PDF.',
    '- **Lịch công tác tuần** (`lich-cong-tac.html`) — Soạn thảo, lưu cục bộ trên trình duyệt, xuất Word/PDF.',
    '- **Quản lý, theo dõi nhiệm vụ** (`theo-doi-nhiem-vu.html`) — Kết nối trực tiếp Web App Google Apps Script đã cấp quyền.',
    '- **Mở rộng tương lai:** Sẵn sàng bổ sung Hệ thống Tổng hợp báo cáo.',
    '',
    '## Quản trị & Bảo mật',
    '- Đồng bộ tự động 1 nguồn mã từ kho phát triển nguồn `vuhiep2603-blip/bo-cong-cu-le-ninh-demo` qua GitHub Actions miễn phí (0 đồng).',
    '- Đã loại trừ hoàn toàn ảnh con dấu, chữ ký, dữ liệu nghiệp vụ nội bộ và thông tin xác thực khỏi kho công khai.',
    '',
  ].join('\n'),
  'utf8',
);

// Automated Security & Secret Guard on the final output bundle
const leakedSeal = path.join(outDir, 'assets', 'dau_van_phong_can_tron.png');
if (fs.existsSync(leakedSeal)) {
  throw new Error('SECURITY BLOCK: assets/dau_van_phong_can_tron.png must not exist in public org bundle!');
}

const TEXT_EXTS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.md', '.txt', '.svg', '.yml', '.yaml']);
let scanned = 0;

function scanDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full);
    } else if (entry.isFile()) {
      if (entry.name.toLowerCase().includes('clasprc') || entry.name.toLowerCase().startsWith('.env')) {
        throw new Error(`SECURITY BLOCK: forbidden credential file in bundle: ${full}`);
      }
      if (TEXT_EXTS.has(path.extname(entry.name).toLowerCase())) {
        const content = fs.readFileSync(full, 'utf8');
        for (const pat of SECRET_PATTERNS) {
          if (pat.re.test(content)) {
            throw new Error(`SECURITY BLOCK: detected ${pat.name} in ${path.relative(outDir, full)}`);
          }
        }
        scanned++;
      }
    }
  }
}

scanDir(outDir);
console.log(`PASS prepare-org-pages: clean bundle ready at ${outDir} (scanned ${scanned} text files, 0 secrets, seal excluded).`);
