import {chromium} from 'playwright';import {createServer} from 'node:http';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,extname} from 'node:path';import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'test-output'),prefix='/bo-cong-cu-le-ninh-demo/';await mkdir(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.docx':'application/octet-stream'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;assert.ok(path.startsWith(prefix));const file=resolve(root,path.slice(prefix.length)||'index.html');assert.ok(file.startsWith(root+'/'));res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file))}catch{res.statusCode=404;res.end('Not found')}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),checks=[],errors=[],requests=[];page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));context.on('request',r=>{if(/^https?:/.test(r.url()))requests.push({url:r.url(),method:r.method()})});
context.setDefaultTimeout(15000);
async function check(label,fn){await fn();checks.push(label);console.log('PASS',label)}
async function openSchedule(){await page.goto(origin+prefix+'lich-cong-tac.html');await page.waitForFunction(()=>typeof LeNinh!=='undefined');}
async function download(action,name){const pending=page.waitForEvent('download',{timeout:60000});await action();const d=await pending;assert.equal(await d.failure(),null);await d.saveAs(resolve(out,name));}
try{
 await openSchedule();await page.getByRole('button',{name:'↺ Nạp dữ liệu giả lập'}).click();
 await page.fill('#start','2026-11-16');await page.locator('#start').dispatchEvent('change');await page.getByRole('button',{name:'↺ Nạp dữ liệu giả lập'}).click();
 await check('preview header uses the required weights and has no font picker',async()=>{
  const weights=await page.locator('.mast').evaluate(mast=>[
   mast.querySelector('.agency'),mast.firstElementChild,mast.querySelector('#stampAnchor'),mast.lastElementChild
  ].map(el=>getComputedStyle(el).fontWeight));
  assert.deepEqual(weights,['400','700','700','700']);
  assert.equal(await page.locator('#timesFontSettings, input[accept=".ttf,.otf"]').count(),0);
 });
 const clickPdf=()=>page.getByRole('button',{name:'↓ Xuất PDF',exact:true}).click();
 await check('PDF uses bundled Liberation Serif with and without the original seal',async()=>{await page.getByRole('button',{name:'↺ Nạp dữ liệu giả lập'}).click();await page.evaluate(()=>{state.items[0].content='Tiếng Việt đầy đủ: Đảng ủy xã Lệ Ninh; kiểm tra dấu và ghi chú cuối lịch.'.normalize('NFD');changed()});await download(clickPdf,'schedule-liberation.pdf');assert.deepEqual(requests.filter(r=>r.url.includes('/assets/fonts/')).map(r=>r.url.split('/').at(-1)).sort(),['Bold','BoldItalic','Italic','Regular'].map(style=>`LiberationSerif-${style}.ttf`));await page.check('#includeStamp');await download(()=>page.getByRole('button',{name:'↓ Xuất PDF',exact:true}).click(),'schedule-liberation-stamped.pdf');assert.equal(await page.locator('#includeStamp').isChecked(),false);await download(()=>page.evaluate(async()=>{const d={start:'2026-11-16',items:Array.from({length:24},(_,i)=>({id:'long_'+i,day:0,end_day:0,session:'Sáng',people:['Đ/c BT'],content:`Hoạt động ${i+1}: `+'Nội dung tiếng Việt kiểm tra xuống dòng và ngắt trang. '.repeat(15)}))};LeNinh.save(await LeNinh.schedulePDF(d,{includeStamp:true}),'long.pdf')}),'schedule-liberation-long.pdf')});
 await check('all invitation templates keep the same recipient block and signature',async()=>{
  await page.goto(origin+prefix+'giay-moi.html');
  for(const kind of ['btv','tt','other']){
   await page.selectOption('#meeting',kind);
   await page.locator('[onclick="selectAll()"]').click();
   assert.deepEqual(await page.locator('.recText').innerText().then(text=>text.split('\n')),
    ['- Như thành phần mời;','- Lưu: VPĐU.']);
   assert.match(await page.locator('#docSign').innerText(),/Đặng Thái Vũ Hiệp/);
   await download(()=>page.click('#exportBtn'),`invitation-${kind}.docx`);
   await download(()=>page.click('#exportPdfBtn'),`invitation-${kind}.pdf`);
  }
  await openSchedule();
 });
 await check('activity entry, preview editing, save/reload and backup/restore remain functional',async()=>{
  await page.getByRole('button',{name:'↺ Nạp dữ liệu giả lập'}).click();
  const composer=page.locator('.sessionComposer').first();
  await composer.locator('textarea').fill('Hoạt động nhập từ biểu mẫu.');
  await composer.locator('[data-person-role]').first().check();
  await composer.getByRole('button',{name:'＋ Thêm vào lịch'}).click();
  assert.match(await page.locator('#previewRows').innerText(),/Hoạt động nhập từ biểu mẫu/);
  await page.locator('[data-id="demo_am"][data-field="content"]').first().fill('Lịch đã chỉnh sửa tiếng Việt.');await page.locator('[data-id="demo_am"][data-field="content"]').first().blur();await page.evaluate(()=>saveWeek());const before=await page.evaluate(()=>JSON.stringify(state));await page.reload();await page.waitForFunction(()=>state.items.length>0);assert.equal(await page.evaluate(()=>JSON.stringify(state)),before);await download(()=>page.getByRole('button',{name:'↓ Xuất Word',exact:true}).click(),'schedule-word.docx');await download(clickPdf,'schedule-liberation-reloaded.pdf');await download(()=>page.getByRole('button',{name:'↓ Sao lưu dữ liệu',exact:true}).click(),'schedule-backup.json');await page.evaluate(()=>clearWeek());await page.locator('#restoreFile').setInputFiles(resolve(out,'schedule-backup.json'));await page.waitForFunction(()=>state.items.length>0);assert.equal(await page.evaluate(()=>JSON.stringify(state)),before);const backup=await readFile(resolve(out,'schedule-backup.json'),'utf8');assert.ok(!backup.includes('faces'));assert.ok(!backup.includes('postscriptName'));});
 await check('schedule and original logo work at desktop/mobile widths',async()=>{for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.locator('.suiteLogo').evaluate(i=>i.complete&&i.naturalWidth===1254));if(width===390)await page.screenshot({path:resolve(out,'mobile-schedule.png'),fullPage:true})}});
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'&&r.url.startsWith(origin+'/')),'No upload or external font request');
 await check('task portal layout and direct fallback work at desktop, tablet and phone widths',async()=>{
  const portal=await browser.newContext();
  try {
   const tab=await portal.newPage();
   for(const width of [1440,768,390,320]) {
    await tab.setViewportSize({width,height:844});
    await tab.goto(origin+prefix);
    assert.deepEqual(await tab.locator('.cards a').evaluateAll(cards=>cards.map(card=>card.getAttribute('href'))),
     ['./giay-moi.html','./lich-cong-tac.html','./theo-doi-nhiem-vu.html']);
    assert.ok(await tab.locator('header img').evaluate(img=>img.complete&&img.naturalWidth===1254));
    assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth),width);
    await portal.route('https://script.google.com/**',route=>route.abort('blockedbyclient'));
    await tab.getByRole('link',{name:/Quản lý, theo dõi nhiệm vụ/}).click();
    const frame=tab.locator('iframe'),direct=tab.getByRole('link',{name:'Mở Web App trực tiếp'});
    assert.match(await frame.getAttribute('src'),/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/);
    assert.equal(await frame.getAttribute('src'),await direct.getAttribute('href'));
    assert.equal(await tab.evaluate(()=>document.documentElement.scrollHeight),844);
    assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth),width);
    await portal.unrouteAll();
    await portal.route('https://script.google.com/**',route=>route.fulfill({contentType:'text/plain',body:'Web App mock'}));
    const opened=tab.waitForEvent('popup');
    await direct.click();
    const popup=await opened;
    await popup.waitForLoadState();
    assert.equal(popup.url(),await direct.getAttribute('href'));
    assert.equal(await popup.evaluate(()=>window.opener),null);
    await popup.close();
    await tab.getByRole('link',{name:'Về trang chủ Bộ công cụ'}).click();
    assert.equal(tab.url(),origin+prefix);
    await portal.unrouteAll();
   }
  } finally {await portal.close();}
 });
 await writeFile(resolve(out,'exports-browser-results.json'),JSON.stringify({checks,errors,requests},null,2));console.log(checks.length,'browser checks passed');
}finally{await browser.close();server.close()}
