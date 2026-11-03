import { useState } from 'react';
import DatePicker from 'react-datepicker';
import { th } from 'date-fns/locale';
import { thaiDate, thaiMonth } from '../utils/thaiDate';
import 'react-datepicker/dist/react-datepicker.css';
import './DatePill.css';

// ISO day keys <-> local Date for the picker; keys stay the source of truth.
const toDate=(s:string)=>new Date(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8));
const toKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
// Screens show Buddhist years; stored keys stay Gregorian.
export const thaiDayText=(d:Date)=>thaiDate(toKey(d));
const shown=(s:string)=>s?thaiDate(s):'เลือกวันที่';
const longMonth=new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric'});

type HeaderProps={date:Date;decreaseMonth:()=>void;increaseMonth:()=>void;decreaseYear:()=>void;increaseYear:()=>void;prevMonthButtonDisabled:boolean;nextMonthButtonDisabled:boolean;prevYearButtonDisabled:boolean;nextYearButtonDisabled:boolean};
const header=(text:string,prev:()=>void,next:()=>void,prevOff:boolean,nextOff:boolean)=><>
  <button type="button" className="react-datepicker__navigation react-datepicker__navigation--previous" aria-label="ก่อนหน้า" disabled={prevOff} onClick={prev}><span className="react-datepicker__navigation-icon react-datepicker__navigation-icon--previous"/></button>
  <div className="react-datepicker__current-month">{text}</div>
  <button type="button" className="react-datepicker__navigation react-datepicker__navigation--next" aria-label="ถัดไป" disabled={nextOff} onClick={next}><span className="react-datepicker__navigation-icon react-datepicker__navigation-icon--next"/></button>
</>;
// react-datepicker headers print the Gregorian year whatever the locale says.
export const thaiMonthHeader=(p:HeaderProps)=>header(longMonth.format(p.date),p.decreaseMonth,p.increaseMonth,p.prevMonthButtonDisabled,p.nextMonthButtonDisabled);
export const thaiYearHeader=(p:HeaderProps)=>header(String(p.date.getFullYear()+543),p.decreaseYear,p.increaseYear,p.prevYearButtonDisabled,p.nextYearButtonDisabled);

const icon=<svg aria-hidden="true" viewBox="0 0 24 24" className="date-pill-icon"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>;

type PillProps={label:string;value:string;min?:string;max?:string;allow?:(key:string)=>boolean;onChange:(v:string)=>void;disabled?:boolean;invalid?:boolean;clearable?:boolean;inDialog?:boolean};
// Pill button + styled calendar popup; replaces <input type="date">, which cannot show Buddhist years.
export default function DatePill({label,value,min,max,allow,onChange,disabled,invalid,clearable,inDialog}:PillProps){
  return <DatePicker selected={value?toDate(value):null} onChange={(d:Date|null)=>{if(d)onChange(toKey(d));else if(clearable)onChange('');}} minDate={min?toDate(min):undefined} maxDate={max?toDate(max):undefined} filterDate={allow?(d:Date)=>allow(toKey(d)):undefined} locale={th} calendarStartDay={1} popperClassName="date-pill-popper" portalId={inDialog?undefined:'date-pill-portal'} popperPlacement="bottom-start" showPopperArrow={false} renderCustomHeader={thaiMonthHeader} disabled={disabled} isClearable={clearable&&Boolean(value)}
    customInput={<button type="button" className="date-pill" aria-invalid={invalid||undefined} aria-label={label+' '+shown(value)}>{icon}<span>{shown(value)}</span></button>}/>;
}

// Same pill as a form field: FormData reads the Gregorian key from the hidden input. Native dialogs sit above portals, so it renders in place.
export function DateField({name,label,defaultValue='',max,disabled,clearable}:{name:string;label:string;defaultValue?:string;max?:string;disabled?:boolean;clearable?:boolean}){
  const [value,setValue]=useState(defaultValue);
  return <><DatePill label={label} value={value} max={max} disabled={disabled} clearable={clearable} inDialog onChange={setValue}/><input type="hidden" name={name} value={value}/></>;
}

export function MonthPill({label,value,max,onChange}:{label:string;value:string;max?:string;onChange:(v:string)=>void}){
  return <DatePicker selected={value?toDate(value+'-01'):null} onChange={(d:Date|null)=>d&&onChange(toKey(d).slice(0,7))} maxDate={max?toDate(max+'-01'):undefined} showMonthYearPicker locale={th} popperClassName="date-pill-popper" portalId="date-pill-portal" popperPlacement="bottom-start" showPopperArrow={false} renderCustomHeader={thaiYearHeader}
    customInput={<button type="button" className="date-pill" aria-label={label+' '+thaiMonth(value)}>{icon}<span>{thaiMonth(value)}</span></button>}/>;
}
