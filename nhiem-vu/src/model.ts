export const roles = {ADMIN:'Chánh Văn phòng', DEPUTY:'Phó Chánh Văn phòng', SPECIALIST:'Chuyên viên'} as const;
export const statuses = {ASSIGNED:'Mới giao', WORKING:'Đang thực hiện', SUBMITTED:'Chờ duyệt', REVISION:'Yêu cầu sửa', COMPLETE:'Hoàn thành'} as const;
export const stages = {DRAFT:'Dự thảo', PRESENTED:'Đã trình', ISSUED:'Đã ban hành'} as const;
export type Role = keyof typeof roles;
export type Status = keyof typeof statuses;
export type Stage = keyof typeof stages;
export interface Profile {uid:string; code:string; name:string; email:string; phone:string; active:boolean; role:Role}
export interface TaskInput {title:string; detail:string; deadline:string; deliverable:string; leadUid:string; assignees:string[]}
export interface Clock {toMillis():number}
export interface Task extends TaskInput {
  id:string; status:Status; stage:Stage; progress:number; updatedAt:Clock; createdAt:Clock; createdBy:string;
  delegateUid:string; delegateUntil:Clock|null; sourceId:string; lastEvent:string; lastResult:string;
}
export type Action = 'ACCEPT'|'PROGRESS'|'SUBMIT'|'APPROVE'|'RETURN'|'ADMIN_SETTINGS';
export const actions:Record<Action,string> = {
  ACCEPT:'Tiếp nhận', PROGRESS:'Cập nhật tiến độ', SUBMIT:'Nộp kết quả',
  APPROVE:'Nghiệm thu', RETURN:'Yêu cầu sửa', ADMIN_SETTINGS:'Cập nhật thời hạn / ủy quyền'
};
export interface Event {id:string; author:string; at:Clock|null; kind:Action; text:string; stage:Stage; progress:number}
export interface Source {number:string; subject:string}
export function localDay(date = new Date()) {
  const format = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit'});
  return format.format(date).split('/').reverse().join('-');
}
export function isLate(task:Task, today=localDay()) {
  return task.status !== 'COMPLETE' && task.deadline < today;
}
