export const staff = [
 ['qa-admin','VP01','Cán bộ giả lập 01','ADMIN'],
 ['qa-deputy','VP02','Cán bộ giả lập 02','DEPUTY'],
 ['qa-lead','VP03','Cán bộ giả lập 03','SPECIALIST'],
 ['qa-partner','VP04','Cán bộ giả lập 04','SPECIALIST'],
 ['qa-locked','VP05','Cán bộ giả lập 05','SPECIALIST']
].map(([uid,code,name,role])=>({uid,code,name,role,email:uid+'@example.invalid',phone:'',active:uid!=='qa-locked'}));
