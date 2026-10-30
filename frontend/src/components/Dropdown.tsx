import { useEffect,useId,useRef,useState,type KeyboardEvent,type ReactNode } from 'react';
import './Dropdown.css';

export const TagIcon=()=><svg aria-hidden="true" viewBox="0 0 24 24" className="dropdown-icon"><path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>;

export type DropdownOption={value:string;label:ReactNode;disabled?:boolean;color?:string};

type Props={
  options:DropdownOption[];
  value?:string;
  defaultValue?:string;
  onChange?:(value:string)=>void;
  id?:string;
  name?:string;
  required?:boolean;
  disabled?:boolean;
  icon?:ReactNode;
  className?:string;
  'aria-label'?:string;
  'aria-describedby'?:string;
};

// Styled replacement for <select>. A hidden native select carries name/required so forms still submit and validate.
export default function Dropdown({options,value,defaultValue='',onChange,id,name,required,disabled,icon,className,...aria}:Props){
  const [own,setOwn]=useState(defaultValue),current=value??own;
  const [open,setOpen]=useState(false),[active,setActive]=useState(0);
  const root=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),list=useId();
  const selected=options.find(o=>o.value===current);
  useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);},[open]);
  useEffect(()=>{if(open)document.getElementById(list+active)?.scrollIntoView({block:'nearest'});},[open,active,list]);
  const enabled=(i:number)=>!options[i]?.disabled;
  const move=(from:number,step:number)=>{for(let i=from+step;i>=0&&i<options.length;i+=step)if(enabled(i))return i;return from;};
  const show=()=>{if(disabled)return;const i=options.findIndex(o=>o.value===current);setActive(i>=0?i:move(-1,1));setOpen(true);};
  const pick=(i:number)=>{if(!enabled(i))return;const v=options[i].value;if(value===undefined)setOwn(v);if(v!==current)onChange?.(v);setOpen(false);button.current?.focus();};
  const key=(e:KeyboardEvent)=>{
    if(!open){if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();show();}return;}
    if(e.key==='Escape'){e.preventDefault();setOpen(false);return;}
    if(e.key==='Tab'){setOpen(false);return;}
    e.preventDefault();
    if(e.key==='ArrowDown')setActive(i=>move(i,1));
    else if(e.key==='ArrowUp')setActive(i=>move(i,-1));
    else if(e.key==='Home')setActive(move(-1,1));
    else if(e.key==='End')setActive(move(options.length,-1));
    else if(e.key==='Enter'||e.key===' ')pick(active);
  };
  return <div className={'dropdown'+(open?' is-open':'')+(className?' '+className:'')} ref={root}>
    <button ref={button} id={id} type="button" className="dropdown-button" role="combobox" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={list} aria-activedescendant={open?list+active:undefined} aria-label={aria['aria-label']} aria-describedby={aria['aria-describedby']} onClick={()=>open?setOpen(false):show()} onKeyDown={key}>
      {icon}<span className={'dropdown-value'+(current===''&&selected?.disabled?' is-placeholder':'')}>{selected?.label??''}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="dropdown-chevron"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    {name&&<select className="dropdown-native" name={name} required={required} value={current} onChange={()=>{}} tabIndex={-1} aria-hidden="true" onInvalid={()=>button.current?.focus()}>{options.map(o=><option key={o.value} value={o.value} disabled={o.disabled}/>)}</select>}
    {open&&<ul className="dropdown-list" role="listbox" id={list} aria-label={aria['aria-label']}>{options.map((o,i)=><li key={o.value||'__empty'} id={list+i} role="option" aria-selected={o.value===current} aria-disabled={o.disabled||undefined} className={(i===active?'is-active':'')+(o.disabled?' is-disabled':'')} onMouseEnter={()=>enabled(i)&&setActive(i)} onMouseDown={e=>e.preventDefault()} onClick={e=>{e.preventDefault();pick(i);}}>
      {o.color&&<i aria-hidden="true" style={{background:o.color}}/>}<span>{o.label}</span>{o.value===current&&<svg aria-hidden="true" viewBox="0 0 24 24" className="dropdown-check"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>}
    </li>)}</ul>}
  </div>;
}
