import {cp,mkdir,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const moduleRoot=dirname(fileURLToPath(import.meta.url));
const root=await realpath(resolve(moduleRoot,'..'));
const [output,mode,...extra] = process.argv.slice(2);
if (extra.length || (mode && mode!=='--auth-qa')) throw Error('Cú pháp: node package-pages.mjs <thư mục> [--auth-qa]');
if(!output) throw Error('Cần chỉ định thư mục đầu ra mới bên ngoài checkout.');
const requested=resolve(output);
const destination=resolve(await realpath(dirname(requested)),relative(dirname(requested),requested));
const inside=relative(root,destination);
if(!inside || (inside!=='..'&&!inside.startsWith('..'+sep)&&!isAbsolute(inside))) throw Error('Đặt thư mục đầu ra ngoài checkout.');
await mkdir(destination); // Fail on an existing path to avoid overwriting unrelated files.
for(const entry of mode ? ['.nojekyll'] : ['index.html','giay-moi.html','lich-cong-tac.html','HUONG_DAN.html','.nojekyll','assets']) {
 await cp(resolve(root,entry),resolve(destination,entry),{recursive:true});
}
await cp(resolve(moduleRoot,mode ? 'dist-auth-qa' : 'dist'),resolve(destination,'nhiem-vu'),{recursive:true});
console.log(destination);
