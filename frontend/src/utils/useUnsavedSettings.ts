import { useContext, useEffect, type MutableRefObject } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
export function useUnsavedSettings(dirty: boolean, bypass: MutableRefObject<boolean>) {
    const { navigator } = useContext(UNSAFE_NavigationContext);
    useEffect(() => {
        if (!dirty)
            return;
        const confirm = () => bypass.current || window.confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการออกจากหน้านี้หรือไม่?');
        const push = navigator.push.bind(navigator), replace = navigator.replace.bind(navigator), go = navigator.go.bind(navigator);
        let index = window.history.state?.idx ?? 0, restoring = false, approvedPop = false;
        navigator.push = (...args) => { if (confirm())
            push(...args); };
        navigator.replace = (...args) => { if (confirm())
            replace(...args); };
        navigator.go = (...args) => { if (confirm()) {
            approvedPop = true;
            go(...args);
        } };
        const unload = (e: BeforeUnloadEvent) => { if (!bypass.current) {
            e.preventDefault();
            e.returnValue = '';
        } };
        const pop = (e: PopStateEvent) => { if (restoring) {
            restoring = false;
            e.stopImmediatePropagation();
            return;
        } const next = e.state?.idx ?? index; if (approvedPop) {
            approvedPop = false;
            index = next;
            return;
        } if (!confirm()) {
            e.stopImmediatePropagation();
            restoring = true;
            window.history.go(index - next);
        }
        else
            index = next; };
        const logout = (e: Event) => { if (!confirm())
            e.preventDefault();
        else
            bypass.current = true; };
        window.addEventListener('spendsense-before-logout', logout);
        window.addEventListener('beforeunload', unload);
        window.addEventListener('popstate', pop, true);
        return () => { navigator.push = push; navigator.replace = replace; navigator.go = go; window.removeEventListener('spendsense-before-logout', logout); window.removeEventListener('beforeunload', unload); window.removeEventListener('popstate', pop, true); };
    }, [dirty, navigator, bypass]);
}
