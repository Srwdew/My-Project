import DatePicker from 'react-datepicker';
import { th } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import './DatePill.css';

// ISO day keys <-> local Date for the picker; keys stay the source of truth.
const toDate=(s:string)=>new Date(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8));
const toKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const shown=(s:string)=>s?`${s.slice(8)}/${s.slice(5,7)}/${s.slice(0,4)}`:'เลือกวันที่';

// Pill button + styled calendar popup; replaces <input type="date"> in filter bars.
export default function DatePill({label,value,min,max,allow,onChange}:{label:string;value:string;min?:string;max?:string;allow?:(key:string)=>boolean;onChange:(v:string)=>void}){
  return <DatePicker selected={value?toDate(value):null} onChange={(d:Date|null)=>d&&onChange(toKey(d))} minDate={min?toDate(min):undefined} maxDate={max?toDate(max):undefined} filterDate={allow?(d:Date)=>allow(toKey(d)):undefined} locale={th} calendarStartDay={1} popperClassName="date-pill-popper" portalId="date-pill-portal" popperPlacement="bottom-start" showPopperArrow={false}
    customInput={<button type="button" className="date-pill" aria-label={label+' '+shown(value)}><svg aria-hidden="true" viewBox="0 0 24 24" className="date-pill-icon"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg><span>{shown(value)}</span></button>}/>;
}
