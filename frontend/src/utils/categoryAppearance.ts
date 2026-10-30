export function categoryAppearance(name: string) {
  if (/อาหาร|เครื่องดื่ม/.test(name)) {
    return { icon: 'food', color: '#ffad08', background: '#fff6e2' };
  }
  if (/เดินทาง|รถ/.test(name)) {
    return { icon: 'car', color: '#2e7cf6', background: '#e7f0ff' };
  }
  if (/ช้อป|ช็อป/.test(name)) {
    return { icon: 'shopping', color: '#ff485b', background: '#ffe7eb' };
  }
  if (/บันเทิง/.test(name)) {
    return { icon: 'game', color: '#890bd0', background: '#f3e7ff' };
  }
  if (/สุขภาพ|รักษา/.test(name)) {
    return { icon: 'heart', color: '#20be83', background: '#ddf8ed' };
  }
  if (/ศึกษา|เรียน/.test(name)) {
    return { icon: 'study', color: '#7946ef', background: '#eee7ff' };
  }
  if (/เงินเดือน/.test(name)) {
    return { icon: 'salary', color: '#16a34a', background: '#dcfce7' };
  }
  if (/ธุรกิจ|ฟรีแลนซ์/.test(name)) {
    return { icon: 'briefcase', color: '#0284c7', background: '#e0f2fe' };
  }
  if (/โบนัส|คอมมิชชัน/.test(name)) {
    return { icon: 'star', color: '#d97706', background: '#fef3c7' };
  }
  if (/ของขวัญ|ได้รับ/.test(name)) {
    return { icon: 'gift', color: '#db2777', background: '#fce7f3' };
  }
  return { icon: 'more', color: '#979797', background: '#eeeeee' };
}
