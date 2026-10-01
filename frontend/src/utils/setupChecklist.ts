export const FINANCIAL_INTENTIONS = ['เงินสำรองฉุกเฉิน','ออมเงินซื้อของ','ลดหนี้','ลงทุน'] as const;
export type SetupSettings = {
 setupCompletedAt?:string|null; userId:string; displayName:string|null; income:string|null; paydayDay:number|null;
 budgetMonth:string; budgetAmount:string|null; primaryGoalId:string|null; legacyGoal:string|null;
 notifications:{notifyNearLimit:boolean;notifyExceeded:boolean;notifyAnomaly?:boolean};
};
export type SetupDraft={displayName:string;income:string;paydayDay:string;budgetAmount:string;intention:string};
export const setupDraft=(s:SetupSettings):SetupDraft=>({displayName:s.displayName??'',income:s.income??'',paydayDay:s.paydayDay===null?'':String(s.paydayDay),budgetAmount:s.budgetAmount??'',intention:s.legacyGoal??''});
export function setupPayload(initial:SetupSettings,latest:SetupSettings,draft:SetupDraft){
 if(initial.userId!==latest.userId)throw Error('บัญชีเปลี่ยนแล้ว กรุณาเข้าสู่ระบบใหม่');
 if(initial.budgetMonth!==latest.budgetMonth)throw Error('เดือนเปลี่ยนแล้ว กรุณาโหลดค่าล่าสุดก่อนบันทึก');
 const displayName=latest.displayName??draft.displayName.trim();
 if(!displayName||displayName.length>80)throw Error('กรุณาระบุชื่อไม่เกิน 80 ตัวอักษร');
 const original=setupDraft(initial);
 function money(key:'income'|'budgetAmount'){
  const value=draft[key].trim();
  if(draft[key]===original[key]||!value)return latest[key];
  if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)||(key==='budgetAmount'&&!/[1-9]/.test(value)))throw Error(key==='income'?'รายได้ต้องเป็นจำนวนไม่ติดลบ และมีทศนิยมไม่เกิน 2 ตำแหน่ง':'งบต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง');
  return value;
 }
 if(draft.paydayDay!==''&&!/^(?:[1-9]|[12]\d|3[01])$/.test(draft.paydayDay))throw Error('เลือกวันรับรายได้ 1–31 หรือไม่แน่นอน');
 const changedIntention=draft.intention!==original.intention;
 if(changedIntention&&!(FINANCIAL_INTENTIONS as readonly string[]).includes(draft.intention))throw Error('กรุณาเลือกความตั้งใจทางการเงินที่รองรับ');
 return {completeSetup:true as const,displayName,income:money('income'),paydayDay:draft.paydayDay===original.paydayDay?latest.paydayDay:draft.paydayDay===''?null:Number(draft.paydayDay),
 budgetMonth:latest.budgetMonth,budgetAmount:money('budgetAmount'),primaryGoalId:latest.primaryGoalId,
 notifyNearLimit:latest.notifications.notifyNearLimit,notifyExceeded:latest.notifications.notifyExceeded,
 ...(changedIntention?{financialIntention:draft.intention}:{})};
}
