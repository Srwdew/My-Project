// Display labels only: retain category IDs and user-defined names.
const labels: Record<string, string> = {
  'อาหาร': 'อาหารและเครื่องดื่ม', 'ซื้อสินค้า': 'ช็อปปิ้ง', 'อื่น ๆ': 'อื่นๆ',
  food: 'อาหารและเครื่องดื่ม', 'food & drinks': 'อาหารและเครื่องดื่ม', 'food & drink': 'อาหารและเครื่องดื่ม',
  'food and drink': 'อาหารและเครื่องดื่ม', 'food and drinks': 'อาหารและเครื่องดื่ม',
  transport: 'การเดินทาง', transportation: 'การเดินทาง', travel: 'ท่องเที่ยว',
  shopping: 'ช็อปปิ้ง', entertainment: 'ความบันเทิง', groceries: 'ของใช้และอาหารสด',
  utilities: 'ค่าสาธารณูปโภค', bills: 'ค่าบริการ', housing: 'ที่อยู่อาศัย', rent: 'ค่าเช่า',
  health: 'สุขภาพ', healthcare: 'สุขภาพ', education: 'การศึกษา',
  salary: 'เงินเดือน', bonus: 'โบนัส', freelance: 'งานอิสระ', investment: 'การลงทุน',
  investments: 'การลงทุน', business: 'ธุรกิจ', gift: 'ของขวัญ', gifts: 'ของขวัญ',
  other: 'อื่นๆ', others: 'อื่นๆ', 'other income': 'รายรับอื่น ๆ', 'other expense': 'รายจ่ายอื่น ๆ',
};
export function transactionCategoryLabel(name: string): string {
  return labels[name.trim().toLowerCase()] ?? name;
}

const categoryOrder = ['อาหารและเครื่องดื่ม', 'การเดินทาง', 'ช็อปปิ้ง', 'ความบันเทิง', 'สุขภาพ', 'การศึกษา', 'อื่นๆ'];
export function transactionCategoryOrder(name: string): number {
  const index = categoryOrder.indexOf(transactionCategoryLabel(name));
  return index < 0 ? categoryOrder.length : index;
}
