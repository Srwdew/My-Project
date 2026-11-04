import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { resetKey: string; children: ReactNode };

// Keeps the bar and account menu usable when one page throws while rendering; moving to another page clears it.
export default class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="app-page-error" role="alert">
        <h1>หน้านี้แสดงผลไม่สำเร็จ</h1>
        <p>ข้อมูลของคุณไม่ได้รับผลกระทบ ลองใหม่อีกครั้ง หรือเลือกหน้าอื่นจากเมนูด้านล่าง</p>
        <button type="button" onClick={() => this.setState({ failed: false })}>ลองใหม่</button>
      </section>
    );
  }
}
