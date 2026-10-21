import './PageSkeleton.css';

export default function PageSkeleton() {
  return (
    <div className="page-skeleton" role="status" aria-label="กำลังโหลดหน้า" aria-busy="true">
      <div aria-hidden="true">
        <div className="page-skeleton-toolbar"><span /><span /></div>
        <div className="page-skeleton-cards">
          {[0,1,2].map(i=><div className="page-skeleton-card" key={i}><i /><b /></div>)}
        </div>
        <div className="page-skeleton-panel">
          <i />
          {[0,1,2,3].map(i=><div className="page-skeleton-row" key={i}><span /><span /></div>)}
        </div>
      </div>
    </div>
  );
}
