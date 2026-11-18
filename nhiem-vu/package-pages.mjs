import {cp,mkdir,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const moduleRoot=dirname(fileURLToPath(import.meta.url));
const root=await realpath(resolve(moduleRoot,'..'));
if(!process.argv[2]) throw Error('Cần chỉ định thư mục đầu ra mới bên ngoài checkout.');
const requested=resolve(process.argv[2]);
const destination=resolve(await realpath(dirname(requested)),relative(dirname(requested),requested));
const inside=relative(root,destination);
if(!inside || (inside!=='..'&&!inside.startsWith('..'+sep)&&!isAbsolute(inside))) throw Error('Đặt thư mục đầu ra ngoài checkout.');
await mkdir(destination); // Fail on an existing path to avoid overwriting unrelated files.
for(const entry of ['index.html','giay-moi.html','lich-cong-tac.html','HUONG_DAN.html','.nojekyll','assets']) {
 await cp(resolve(root,entry),resolve(destination,entry),{recursive:true});
}
await cp(resolve(moduleRoot,'dist'),resolve(destination,'nhiem-vu'),{recursive:true});
console.log(destination);
