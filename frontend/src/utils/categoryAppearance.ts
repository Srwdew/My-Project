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
  return { icon: 'more', color: '#979797', background: '#eeeeee' };
}
