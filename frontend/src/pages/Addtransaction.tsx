import { useToast } from '../components/LocalToast';
import { loadPendingTransaction, storePendingTransaction, clearPendingTransaction, normalizedTransactionBody, definitiveTransactionRejection, type PendingTransaction, type TransactionDraft } from '../lib/pendingTransaction';
import { validateReceipt } from '../lib/receiptOcr';
import ReceiptOcr from '../components/ReceiptOcr';
import { useSessionKey, getToken } from '../auth';
import type { ReceiptFields, ReceiptResult } from '../utils/receiptParser';
import { useEffect, useRef, useState } from 'react';
import DatePicker from 'react-datepicker';
import UserHeader from '../components/UserHeader';
import 'react-datepicker/dist/react-datepicker.css';
import './Addtransaction.css';
import { Utensils, Bus, ShoppingBag, Clapperboard, HeartPulse, GraduationCap, Ellipsis } from 'lucide-react';
import { transactionCategoryLabel, transactionCategoryOrder } from '../utils/transactionCategoryLabel';
import { apiFetch } from '../api';
import { getTransactionMaxDate, isFutureTransactionDate } from '../utils/transactionStatus';

type TransactionType = 'income' | 'expense';

type Category = {
  id: string;
  name: string;
  type: TransactionType;
};

export default function AddTransaction() {
  const toast = useToast();
  const [type, setType] = useState<TransactionType>('expense');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');

  const [amount, setAmount] = useState('');

  const [transactionDate, setTransactionDate] = useState<Date | null>(new Date());

  const [transactionTime, setTransactionTime] = useState('');
  // No explicit confirmation control: do not infer consent from a time value.
  const transactionTimeConfirmed = false;

  const [paymentMethod, setPaymentMethod] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptError,setReceiptError]=useState('');
  const receiptSelection=useRef(0);
  const editedReceiptFields=useRef(new Set<keyof ReceiptFields|'paymentMethod'>());
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const session=useSessionKey();
  const pendingRequest=useRef<PendingTransaction|null>(null);
  const savingRef=useRef(false);
  const saveController=useRef<AbortController|null>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;saveController.current?.abort();};},[]);
  const [uncertain,setUncertain]=useState(false);
  const [pendingReady,setPendingReady]=useState(false);
  const [pendingError,setPendingError]=useState('');
  useEffect(()=>{
    let active=true;
    saveController.current?.abort();
    pendingRequest.current=null;savingRef.current=false;
    setIsSaving(false);setUncertain(false);setPendingReady(false);setPendingError('');resetForm();
    if(session)void loadPendingTransaction(session,()=>active&&getToken()===session).then(request=>{
      if(!active||getToken()!==session)return;
      pendingRequest.current=request;
      if(request){
        const saved=JSON.parse(request.body) as TransactionDraft;
        setType(saved.type);setCategoryId(saved.categoryId);setAmount(saved.amount);
        setTransactionDate(new Date(saved.transactionDate+'T00:00:00'));
        setTransactionTime(saved.transactionTime??'');setPaymentMethod(saved.paymentMethod??'');
        setDescription(saved.description??'');setNote(saved.note??'');setUncertain(true);
      }
      setPendingReady(true);
    }).catch(()=>{
      if(active&&getToken()===session)setPendingError('อ่านคำขอค้างไม่ได้ กรุณาตรวจประวัติธุรกรรมก่อนล้างคำขอนี้');
    });
    return()=>{active=false;saveController.current?.abort();};
  },[session]);
  const abandonPending=()=>{
    if(savingRef.current)return;
    if(!window.confirm('ยกเลิกการติดตามคำขอนี้? การกระทำนี้ไม่ยกเลิกธุรกรรมที่อาจบันทึกแล้ว กรุณาตรวจประวัติก่อนสร้างรายการใหม่'))return;
    clearPendingTransaction();pendingRequest.current=null;setUncertain(false);
    setPendingError('');setPendingReady(true);resetForm();
  };
  const selectReceipt=async(file:File|null)=>{
    if(savingRef.current||pendingRequest.current||!pendingReady)return;
    const selection=++receiptSelection.current,owner=getToken();
    setReceiptFile(null);setReceiptError('');
    beginReceipt(selection,owner);
    if(!file)return;
    try{await validateReceipt(file);if(selection===receiptSelection.current&&owner===getToken()&&mounted.current)setReceiptFile(file);}
    catch(e){if(selection===receiptSelection.current&&owner===getToken()&&mounted.current)setReceiptError(e instanceof Error?e.message:'เปิดภาพไม่ได้');}
  };
  const currentReceipt=(selection:number,owner:string|null)=>
    mounted.current&&selection===receiptSelection.current&&owner===getToken()&&!savingRef.current&&!pendingRequest.current;
  const beginReceipt=(selection:number,owner:string|null)=>{
    if(!currentReceipt(selection,owner))return;
    // Remove only previous OCR/default values; explicit user edits survive rereads.
    const dirty=editedReceiptFields.current;
    if(!dirty.has('transactionDate'))setTransactionDate(null);
    if(!dirty.has('transactionTime'))setTransactionTime('');
    if(!dirty.has('amount'))setAmount('');
    if(!dirty.has('description'))setDescription('');
    if(!dirty.has('paymentMethod'))setPaymentMethod('transfer');
  };
  const applyReceipt=(result:ReceiptResult,selection:number,owner:string|null)=>{
    if(!currentReceipt(selection,owner))return;
    const fields=result.fields,dirty=editedReceiptFields.current;
    if(fields.transactionDate&&!dirty.has('transactionDate'))setTransactionDate(new Date(fields.transactionDate+'T00:00:00'));
    if(fields.transactionTime&&!dirty.has('transactionTime'))setTransactionTime(fields.transactionTime);
    if(fields.amount&&!dirty.has('amount'))setAmount(fields.amount);
    if(fields.description&&!dirty.has('description'))setDescription(fields.description);
    // Scanning defaults to transfer; OCR must not change the user's payment selection.
  };

  useEffect(() => {
    apiFetch('/categories', { auth: false })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to load categories');
        }

        return res.json();
      })
      .then((data) => {
        setCategories(data);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  useEffect(() => {
    if (!receiptFile) {
      setReceiptPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(receiptFile);

    setReceiptPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [receiptFile]);

  const filteredCategories = categories
    .filter((category) => category.type === type)
    .sort((a, b) => transactionCategoryOrder(a.name) - transactionCategoryOrder(b.name));
  const categoryIcons = [Utensils, Bus, ShoppingBag, Clapperboard, HeartPulse, GraduationCap, Ellipsis];

  const handleChangeType = (newType: TransactionType) => {
    setType(newType);
    setCategoryId('');
  };

  const resetForm = () => {
    editedReceiptFields.current.clear();
    setType('expense');
    setCategoryId('');
    setAmount('');
    setTransactionDate(new Date());
    setTransactionTime('');
    setPaymentMethod('');
    setDescription('');
    setNote('');
    receiptSelection.current++;setReceiptError('');setReceiptFile(null);
  };

  const formatDateForBackend = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  const handleSubmit = async () => {
    if(savingRef.current||!pendingReady||!session||getToken()!==session)return;
    toast('');
    const requestSession=session;
    let request=pendingRequest.current;
    if(!request){
      if(!categoryId){toast('กรุณาเลือกหมวดหมู่');return;}
      if(!transactionDate||Number.isNaN(transactionDate.getTime())||isFutureTransactionDate(transactionDate)){
        toast('กรุณาเลือกวันที่ถูกต้องและไม่เป็นวันที่อนาคต');return;
      }
      try{
        request={
          key:crypto.randomUUID(),createdAt:new Date().toISOString(),
          body:normalizedTransactionBody({
            categoryId,type,amount,transactionDate:formatDateForBackend(transactionDate),
            transactionTime:transactionTime||null,transactionTimeConfirmed,
            paymentMethod:paymentMethod||null,description:description||null,note:note||null,
          }),
        };
      }catch{toast('กรุณาตรวจจำนวนเงิน วันที่ และเวลาให้ถูกต้อง');return;}
    }
    savingRef.current=true;setIsSaving(true);setPendingError('');
    const controller=new AbortController();saveController.current=controller;
    const timeout=window.setTimeout(()=>controller.abort(),30000);
    const isCurrent=()=>mounted.current&&getToken()===requestSession&&saveController.current===controller;
    try{
      if(!pendingRequest.current){
        await storePendingTransaction(requestSession,request,isCurrent);
        if(!isCurrent())return;
        pendingRequest.current=request;
      }
      const response=await apiFetch('/transactions',{
        method:'POST',signal:controller.signal,
        headers:{'Idempotency-Key':request.key},body:request.body,
      });
      const data=await response.json();
      if(!isCurrent())return;
      if(!response.ok){
        if(definitiveTransactionRejection(response.status,data)){
          clearPendingTransaction(request.key);pendingRequest.current=null;setUncertain(false);
        }else setUncertain(true);
        setPendingError(data.code==='IDEMPOTENCY_CONFLICT'
          ? 'คำขอนี้ใช้กับข้อมูลอื่นแล้ว กรุณาตรวจประวัติก่อนสร้างรายการใหม่'
          : 'บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลหรือลองคำขอเดิมอีกครั้ง');
        return;
      }
      if(response.status!==201||typeof data.id!=='string')throw Error('UNKNOWN_RESULT');
      clearPendingTransaction(request.key);pendingRequest.current=null;setUncertain(false);
      resetForm();toast('บันทึกธุรกรรมสำเร็จ', 'success');
    }catch{
      if(!isCurrent())return;
      setUncertain(Boolean(pendingRequest.current));
      setPendingError(pendingRequest.current
        ? 'ยังยืนยันผลบันทึกไม่ได้ คำขอเดิมถูกเก็บไว้ชั่วคราว คุณสามารถ reload แล้วกด retry เองได้'
        : 'เก็บคำขอชั่วคราวไม่ได้ จึงยังไม่ได้ส่งรายการ กรุณาอนุญาต sessionStorage แล้วลองใหม่');
    }finally{
      window.clearTimeout(timeout);
      if(isCurrent()){savingRef.current=false;setIsSaving(false);}
    }
  };

  return (
    <div className="add-page">
      <header className="add-header">
        <button
          type="button"
          className="back-button"
          onClick={() => window.history.back()}
        >
          ← ย้อนกลับ
        </button>

      <UserHeader />
      </header>

      <main className="add-layout">
        {!pendingReady&&!pendingError&&<p role="status">กำลังตรวจคำขอค้าง…</p>}
        {(uncertain||pendingError)&&<section className="pending-transaction" aria-label="คำขอธุรกรรมค้าง">
          {uncertain&&<><h2>มีคำขอที่ยังไม่ทราบผลแน่ชัด</h2><p>ระบบจะไม่ส่งซ้ำอัตโนมัติ กดปุ่มลองคำขอเดิมด้านล่างเพื่อใช้ key และข้อมูลเดิม ห้ามแก้ข้อมูลของคำขอค้าง</p></>}
          {pendingError&&<p role="alert">{pendingError}</p>}
          <a href="/transactions">ตรวจประวัติธุรกรรม</a>
          {(uncertain||!pendingReady)&&<button type="button" disabled={isSaving} aria-busy={isSaving} onClick={abandonPending}>ยกเลิกการติดตามคำขอนี้</button>}
          <p>การยกเลิกนี้ไม่ลบหรือย้อนธุรกรรมที่อาจบันทึกแล้ว</p>
        </section>}
        <div className="left-column">
          <fieldset className="transaction-draft" disabled={isSaving||uncertain||!pendingReady}>
          {/* 1. Transaction Type */}
          <section className="card">
            <h2>1. ประเภทธุรกรรม</h2>

            <div className="type-grid">
              <button
                type="button"
                className={`type-button expense-button ${
                  type === 'expense' ? 'active' : ''
                }`}
                onClick={() => handleChangeType('expense')}
              >
                <div className="type-icon">↗</div>

                <div>
                  <strong>รายจ่าย</strong>
                  <span>เงินที่ออกจากบัญชี</span>
                </div>
              </button>

              <button
                type="button"
                className={`type-button income-button ${
                  type === 'income' ? 'active' : ''
                }`}
                onClick={() => handleChangeType('income')}
              >
                <div className="type-icon">↙</div>

                <div>
                  <strong>รายได้</strong>
                  <span>เงินที่เข้าบัญชี</span>
                </div>
              </button>
            </div>
          </section>

          {/* 2. Transaction Details */}
          <section className="card">
            <h2>2. รายละเอียดธุรกรรม</h2>

            <div className="form-grid">
              
              <fieldset className="category-field">
                <legend>หมวดหมู่ <span className="required">*</span></legend>
                <div className="category-options">
                  {filteredCategories.map(category => {
                    const Icon = categoryIcons[transactionCategoryOrder(category.name)] ?? Ellipsis;
                    return <label key={category.id} className="category-option">
                      <input type="radio" name="transaction-category" value={category.id}
                        checked={categoryId === category.id} onChange={() => setCategoryId(category.id)} />
                      <span className="category-option-content"><Icon size={21} aria-hidden="true" />
                        <span>{transactionCategoryLabel(category.name)}</span>
                      </span>
                    </label>;
                  })}
                </div>
              </fieldset>

              <div className="field">
                <label>
                  วันที่ / เวลาไทย <span className="required">*</span>
                </label>

                <div className="date-time-grid">
                  <DatePicker
  selected={transactionDate}
                maxDate={getTransactionMaxDate()}
  onChangeRaw={()=>{editedReceiptFields.current.add('transactionDate');}}
  onChange={(date: Date | null) => {editedReceiptFields.current.add('transactionDate');setTransactionDate(date);}}
  dateFormat="dd/MM/yyyy"
  calendarStartDay={1}
  todayButton="วันนี้"
  className="input date-picker-input"
  wrapperClassName="date-picker-wrapper"
  popperClassName="transaction-date-popper"
  popperPlacement="bottom-start"
  portalId="root-portal"
/>

                  <input
                    className="input"
                    aria-label="เวลาไทย (ไม่บังคับ)"
                    type="time"
                    value={transactionTime}
                    onChange={(e) => {editedReceiptFields.current.add('transactionTime');setTransactionTime(e.target.value);}}
                  />
                </div>
              </div>

              <div className="field">
                <label>
                  จำนวนเงิน <span className="required">*</span>
                </label>

                <input
                  className="input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {editedReceiptFields.current.add('amount');setAmount(e.target.value);}}
                />
              </div>

              <div className="field">
                <label>วิธีการชำระเงิน</label>

                <select
                  className="input"
                  value={paymentMethod}
                  onChange={(e) => {editedReceiptFields.current.add('paymentMethod');setPaymentMethod(e.target.value);}}
                >
                  <option value="">
                    เลือกวิธีการชำระเงิน
                  </option>

                  <option value="cash">เงินสด</option>
                  <option value="transfer">โอนเงิน</option>
                  <option value="card">บัตร</option>
                  <option value="ewallet">กระเป๋าเงินอิเล็กทรอนิกส์</option>
                </select>
              </div>

              <div className="field">
                <label>รายละเอียด</label>

                <input
                  className="input"
                  type="text"
                  placeholder="เช่น ค่าอาหารกลางวัน"
                  value={description}
                  onChange={(e) => {editedReceiptFields.current.add('description');setDescription(e.target.value);}}
                />
              </div>

              <div className="field">
                <label>หมายเหตุ</label>

                <input
                  className="input"
                  type="text"
                  placeholder="หมายเหตุเพิ่มเติม"
                  value={note}
                  onChange={(e) =>
                    setNote(e.target.value)
                  }
                />
              </div>
            </div>
          </section>

          </fieldset>
          {/* 3. Receipt */}
          <section className="card">
            <h2>3. ดูภาพสลิปประกอบการกรอก</h2>

<p className="small-text">อ่านภาพบนอุปกรณ์นี้ · ตรวจข้อมูลก่อนบันทึก · ไม่เก็บภาพสลิป</p>

            {receiptError&&<p role="alert">{receiptError} — กรอกข้อมูลเองต่อได้</p>}
            <div className="receipt-actions">
              <label className="upload-box">
                <div className="upload-icon">⇧</div>

                <strong>เลือกภาพสลิป</strong>

                <span className="small-text">
                  รองรับไฟล์ JPG, PNG, WebP
                </span>

                <input
                  type="file"
                  disabled={isSaving||uncertain||!pendingReady}
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    const file =
                      e.target.files?.[0] ?? null;

                    void selectReceipt(file);
                  }}
                />

                <span className="upload-button">
                  เลือกไฟล์
                </span>
              </label>

              <label className="upload-box camera-upload">
                <div className="upload-icon">📷</div>

                <strong>ถ่ายรูปสลิป</strong>

                <span className="small-text">
                  ใช้กล้องเพื่อถ่ายรูป
                </span>

                <input
                  type="file"
                  disabled={isSaving||uncertain||!pendingReady}
                  accept="image/png,image/jpeg"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    const file =
                      e.target.files?.[0] ?? null;

                    void selectReceipt(file);
                  }}
                />

                <span className="upload-button">
                  ถ่ายรูป
                </span>
              </label>
            </div>
            {receiptFile && (
              <div className="file-name">
                ไฟล์ที่เลือก: {receiptFile.name}
              </div>
            )}

            <div className="footer-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={resetForm}
                disabled={isSaving||uncertain||!pendingReady}
              >
                ยกเลิก
              </button>

              <button
                type="button"
                className="save-button"
                onClick={handleSubmit}
                disabled={isSaving||!pendingReady} aria-busy={isSaving}
              >
                {isSaving
                  ? 'กำลังบันทึก...'
                  : uncertain ? 'ลองบันทึกคำขอเดิมอีกครั้ง' : 'ยืนยันและบันทึกธุรกรรม'}
              </button>
            </div>
          </section>
        </div>

        {/* Right Preview */}
<aside className="preview-card">
  <div className="preview-header">
    <strong>ตัวอย่างสลิป</strong>

    {receiptFile && type==='expense' && !uncertain && !isSaving
      ? <ReceiptOcr key={receiptSelection.current+String(session)} file={receiptFile} session={session}
          selection={receiptSelection.current} onStart={beginReceipt} onResult={applyReceipt}/>
      : <span className="small-text">{receiptFile?'เลือกไฟล์แล้ว':'ยังไม่ได้เลือกไฟล์'}</span>}
  </div>

  <div className="receipt-preview">
    {receiptPreviewUrl ? (
      <img
        className="preview-image"
        src={receiptPreviewUrl}
        alt="ตัวอย่างสลิปที่เลือก"
      />
    ) : (
      <span>เลือกภาพสลิปเพื่อแสดงตัวอย่าง</span>
    )}
  </div>



  <div className="detected-header">
    <strong>ข้อมูลที่กรอกในแบบฟอร์ม</strong>
  </div>

  <div className="detected-list">
    <div className="detected-row">
      <span>วันที่</span>
      <span>
        {transactionDate?.toLocaleDateString('th-TH') ?? 'ยังไม่ได้ระบุวันที่'}
      </span>
    </div>

    <div className="detected-row">
      <span>เวลา</span>
      <span>{transactionTime || 'ไม่ได้ระบุ'}</span>
    </div>

    <div className="detected-row">
      <span>จำนวนเงิน</span>
      <span>
        {amount.trim() !== '' && Number.isFinite(Number(amount))
          ? `${Number(amount).toLocaleString('th-TH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} บาท`
          : 'ยังไม่ได้ระบุ'}
      </span>
    </div>
  </div>
</aside>
      </main>
    </div>
  );
}