import { useEffect, useState } from 'react';

function App() {
  const [status, setStatus] = useState('กำลังเช็ค...');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/health`)
      .then(res => res.json())
      .then(data => setStatus(data.status))
      .catch(() => setStatus('เชื่อมต่อไม่ได้'));
  }, []);

  return (
    <div style={{ padding: '2rem' }}>
      <h1>spendsence</h1>
      <p>สถานะ backend: {status}</p>
    </div>
  );
}

export default App;