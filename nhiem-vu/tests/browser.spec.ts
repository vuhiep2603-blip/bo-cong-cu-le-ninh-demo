import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {readFile} from 'node:fs/promises';
import {zipSync,strToU8} from 'fflate';
import {join} from 'node:path';
import {staff} from './fixtures.mjs';

test.beforeAll(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-vpdu',firestore:{host:'127.0.0.1',port:8080}});
 try {await env.clearFirestore();} finally {await env.cleanup();}
});
const appTitle='Quản lý nhiệm vụ tham mưu';
async function signIn(page:Page,id:string,seed:boolean) {
 await page.goto('/tests/auth.html?id='+id);
 await expect(page.locator('body')).toHaveText(/^[a-zA-Z0-9]{10,}$/);
 const uid=(await page.locator('body').innerText()).trim();
 const user=staff.find(row=>row.uid===id);
 if (seed && user) {
  const {uid:fixtureUid,...data}=user;
  const env=await initializeTestEnvironment({projectId:'demo-vpdu',firestore:{host:'127.0.0.1',port:8080}});
  try {await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'users',uid),{...data,email:fixtureUid+'@example.invalid'}));}
  finally {await env.cleanup();}
 }
 await page.goto('/');
 await expect(page.getByRole('heading',{name:appTitle})).toBeVisible();
 return uid;
}
function docx() {
 const files={
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>1. Giao Văn phòng lập báo cáo.</w:t></w:r></w:p><w:p><w:r><w:t>Sản phẩm: Báo cáo giả lập</w:t></w:r></w:p></w:body></w:document>'
 };
 return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name,data])=>[name,strToU8(data)]))));
}
function pdf() {
 const text='BT /F1 12 Tf 50 750 Td (1. Giao Van phong lap bao cao PDF.) Tj ET';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+text.length+' >>\nstream\n'+text+'\nendstream'
 ];
 let data='%PDF-1.4\n';
 const offsets=objects.map((object,i)=>{
  const offset=data.length;
  data+=(i+1)+' 0 obj\n'+object+'\nendobj\n';
  return offset;
 });
 const start=data.length;
 data+='xref\n0 6\n0000000000 65535 f \n'+offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')
     +'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
 return Buffer.from(data);
}
async function screenshot(page:Page,name:string) {
 if(process.env.VPDU_PREVIEW_DIR) await page.screenshot({path:join(process.env.VPDU_PREVIEW_DIR,name),fullPage:true});
}
test('sign-in shell, unknown and locked profiles, and sign-out',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Đăng nhập bằng Google'})).toBeEnabled();
 await screenshot(page,'vpdu-dang-nhap.png');
 await signIn(page,'qa-unknown',false);
 await expect(page.getByText(/chưa được cấp quyền/).first()).toBeVisible();
 await page.getByRole('button',{name:'Đăng xuất'}).click();
 await expect(page.getByRole('button',{name:'Đăng nhập bằng Google'})).toBeEnabled();
 await signIn(page,'qa-locked',true);
 await expect(page.getByText(/Tài khoản đang bị khóa/)).toBeVisible();
 await expect(page.getByRole('navigation')).toHaveCount(0);
});

test('Vietnamese screens, local DOCX/PDF, assignment to review and responsive table',async({browser,page})=>{
 const worker=await browser.newPage({viewport:{width:390,height:844}});
 const reviewer=await browser.newPage();
 const workerUid=await signIn(worker,'qa-lead',true);
 const partner=await browser.newPage();
 await signIn(partner,'qa-partner',true);
 await partner.close();
 await signIn(reviewer,'qa-deputy',true);
 await signIn(page,'qa-admin',true);
 await expect(page.getByRole('heading',{name:'Tổng quan',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Giao nhiệm vụ',exact:true}).click();
 const upload=page.getByLabel('Tệp DOCX hoặc PDF có lớp văn bản');
 await upload.setInputFiles({name:'nguon.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:docx()});
 await expect(page.getByRole('button',{name:'Giao Văn phòng lập báo cáo.'})).toBeVisible();
 await upload.setInputFiles({name:'nguon.pdf',mimeType:'application/pdf',buffer:pdf()});
 await page.getByRole('button',{name:'Giao Van phong lap bao cao PDF.'}).click();
 await expect(page.getByText('Đoạn văn bản nguồn')).toBeVisible();
 await page.getByLabel('Tên nhiệm vụ').fill('Báo cáo kiểm thử qua trình duyệt');
 await page.getByLabel('Sản phẩm yêu cầu').fill('Báo cáo kết quả');
 await page.getByRole('combobox',{name:'Chủ trì',exact:true}).selectOption(workerUid);
 await page.getByRole('checkbox',{name:'Cán bộ giả lập 04'}).check();
 await page.getByLabel('Thời hạn',{exact:true}).fill('2026-11-30');
 await page.getByRole('button',{name:'Duyệt và giao nhiệm vụ'}).click();
 await expect(page.getByRole('status').filter({hasText:'Đã duyệt và giao NV-VP-'})).toBeVisible();

 const taskName='Báo cáo kiểm thử qua trình duyệt';
 await worker.getByRole('button',{name:'Nhiệm vụ của tôi'}).click();
 await worker.getByRole('button',{name:taskName}).click();
 await worker.getByRole('button',{name:'Tiếp nhận'}).click();
 await worker.getByLabel('Giai đoạn').selectOption('PRESENTED');
 await worker.getByLabel('Tiến độ (%)',{exact:true}).fill('50');
 await worker.getByLabel(/Tiến độ hoặc kết quả/).fill('Đã trình bản dự thảo.');
 await worker.getByRole('button',{name:'Cập nhật tiến độ',exact:true}).click();
 await expect(worker.getByText('Đã trình bản dự thảo.')).toBeVisible();
 await worker.getByLabel('Giai đoạn').selectOption('ISSUED');
 await worker.getByLabel(/Tiến độ hoặc kết quả/).fill('Kết quả giả lập lần 1.');
 await worker.getByRole('button',{name:'Nộp kết quả',exact:true}).click();
 await expect(worker.getByText(/Chờ duyệt · Đã ban hành/)).toBeVisible();

 await reviewer.getByRole('button',{name:'Kiểm tra, nghiệm thu'}).click();
 await expect(reviewer.getByRole('button',{name:taskName})).toHaveCount(0);
 await page.getByRole('button',{name:'Kiểm tra, nghiệm thu'}).click();
 await page.getByRole('button',{name:taskName}).click();
 await page.getByText('Thời hạn và ủy quyền nghiệm thu').click();
 await page.getByRole('combobox',{name:'Người được ủy quyền'}).selectOption({label:'Cán bộ giả lập 02'});
 await page.getByLabel('Hết hạn ủy quyền (giờ Việt Nam)').fill('2099-01-01T08:00');
 await page.getByRole('button',{name:'Lưu thiết lập'}).click();

 await reviewer.getByRole('button',{name:taskName}).click();
 await reviewer.getByLabel('Ý kiến nghiệm thu').fill('Bổ sung kết quả kiểm tra.');
 await reviewer.getByRole('button',{name:'Yêu cầu sửa',exact:true}).click();
 await expect(worker.getByText('Bổ sung kết quả kiểm tra.')).toBeVisible();
 await worker.getByLabel(/Tiến độ hoặc kết quả/).fill('Kết quả giả lập đã bổ sung.');
 await worker.getByRole('button',{name:'Nộp kết quả',exact:true}).click();
 await page.getByLabel('Ý kiến nghiệm thu').fill('Sản phẩm đạt.');
 await page.getByRole('button',{name:'Nghiệm thu',exact:true}).click();
 await expect(worker.getByText(/Hoàn thành · Đã ban hành · 100%/)).toBeVisible();
 await expect(worker.getByRole('button',{name:'Giao nhiệm vụ'})).toHaveCount(0);
 expect(await worker.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await screenshot(worker,'vpdu-lich-su-mobile.png');

 await page.getByRole('button',{name:'Báo cáo',exact:true}).click();
 await expect(page.getByRole('row').filter({hasText:'Cán bộ giả lập 03'})).toContainText('1');
 await page.getByRole('button',{name:'Tổng quan'}).click();
 await expect(page.getByRole('button',{name:taskName})).toBeVisible();
 await screenshot(page,'vpdu-tong-quan.png');
 await page.getByRole('button',{name:'Quản trị cán bộ'}).click();
 await expect(page.getByRole('heading',{name:'Quản trị cán bộ'})).toBeVisible();
 await worker.close();
 await reviewer.close();
});


for (const authOnly of [false,true]) test(`deny-all leaves account unprovisioned (${authOnly?'auth QA':'full app'})`,async({page})=>{
 if (authOnly) await useAuthQaEntry(page);
 const options = {projectId:'demo-vpdu',firestore:{host:'127.0.0.1',port:8080}};
 const currentRules = await readFile('firestore.rules','utf8');
 const restricted = await initializeTestEnvironment({
  ...options,firestore:{...options.firestore,
   rules:"rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{path=**} { allow read, write: if false; } } }"
  }
 });
 try {
  const uid = await signIn(page,'qa-deny-all',false);
  await expect(page.getByText('Tài khoản chưa được cấp quyền. Liên hệ Chánh Văn phòng.',{exact:true})).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Đăng xuất'})).toBeVisible();
  await restricted.withSecurityRulesDisabled(async ctx=>{
   expect((await getDoc(doc(ctx.firestore(),'users',uid))).exists()).toBe(false);
  });
  await page.getByRole('button',{name:'Đăng xuất'}).click();
  await expect(page.getByRole('button',{name:'Đăng nhập bằng Google'})).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('button',{name:'Đăng nhập bằng Google'})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Đăng xuất'})).toHaveCount(0);
 } finally {
  await restricted.cleanup();
  const restored=await initializeTestEnvironment({...options,firestore:{...options.firestore,rules:currentRules}});
  await restored.cleanup();
 }
});

async function useAuthQaEntry(page:Page) {
 await page.route(/\/src\/main\.tsx(?:\?|$)/, route=>route.fulfill({
  contentType:'application/javascript',body:"import '/src/auth-qa.tsx';"
 }));
}
test('auth-only entry never opens a workspace, even for an authorized admin',async({page})=>{
 await useAuthQaEntry(page);
 await signIn(page,'qa-admin',true);
 await expect(page.getByText(/Bản kiểm thử chỉ hỗ trợ nghiệm thu đăng nhập và đăng xuất/)).toBeVisible();
 await expect(page.getByRole('navigation')).toHaveCount(0);
 await page.getByRole('button',{name:'Đăng xuất'}).click();
 await expect(page.getByRole('button',{name:'Đăng nhập bằng Google'})).toBeEnabled();
});
