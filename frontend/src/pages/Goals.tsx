import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  House,
  Plane,
  GraduationCap,
  Shield,
  Target,
  Pencil,
  LayoutGrid,
  List,
  Plus,
  X,
  TriangleAlert,
  ArrowRight,
  CircleCheck,
  Flag,
  CalendarDays,
  Undo2,
  History,
  Archive,
  Check,
  Car,
  Gift,
  Smartphone,
  HeartPulse,
  PiggyBank,
} from "lucide-react";
import { thaiMonth } from "../utils/thaiDate";
import { useToast } from "../components/LocalToast";
import { apiFetch } from "../api";
import { getToken } from "../auth";
import Dropdown from "../components/Dropdown";
import { DateField } from "../components/DatePill";
import { PageRecommendations } from "../components/OverviewInsights";
import "./Goals.css";
type Feasibility = {
  status: string;
  cashFlow: { period: { month: string }; netCashFlow: string };
};
type Goal = {
  feasibility?: Feasibility;
  id: string;
  name: string;
  targetAmount: string;
  targetDate: string | null;
  plannedMonthlyAmount: string | null;
  categoryKey: string;
  note: string | null;
  archivedAt: string | null;
  savedAmount: string;
  remainingAmount: string;
  overfundedAmount: string;
  progressPercent: string;
  progressBarPercent: string;
  monthsRemaining: number | null;
  requiredMonthlyAmount: string | null;
  calculatedStatus: string;
  warnings: string[];
};
type Opening = {
  id: string;
  openingAmount: string;
  cutoffDate: string;
  note: string;
  availableAmount: string;
  netAllocated: string;
  cutoffLocked: boolean;
};
type Income = {
  id: string;
  transactionDate: string;
  description: string | null;
  availableAmount: string;
  eligible: boolean;
};
type Entry = {
  id: string;
  kind: string;
  amount: string;
  createdAt: string;
  allocationId: string | null;
  sourceSnapshot: {
    sourceType: string;
    description?: string;
    sourceDate?: string;
  };
  operation: {
    reason: string | null;
    kind: string;
  };
};
type Mode =
  | "create"
  | "edit"
  | "opening"
  | "allocate"
  | "release"
  | "history"
  | "correct";
type Modal = {
  mode: Mode;
  goal?: Goal;
  initialName?: string;
};
const categories = {
  home: { label: "บ้าน", Icon: House },
  car: { label: "รถ", Icon: Car },
  travel: { label: "ท่องเที่ยว", Icon: Plane },
  education: { label: "การศึกษา", Icon: GraduationCap },
  emergency: { label: "เงินสำรอง", Icon: Shield },
  gift: { label: "ของขวัญ", Icon: Gift },
  gadget: { label: "อุปกรณ์", Icon: Smartphone },
  health: { label: "สุขภาพ", Icon: HeartPulse },
  savings: { label: "เงินออม", Icon: PiggyBank },
  other: { label: "อื่น ๆ", Icon: Target },
};
const statusLabels: Record<string, string> = {
  active: "กำลังดำเนินการ",
  completed: "ครบเป้าหมาย",
  overdue: "เลยกำหนด",
  not_started: "ยังไม่ได้เก็บเงิน",
};
const money = (v: string) =>
  new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v));
// Card figures: drop ".00" so large goal amounts stay readable.
const baht = (v: string) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(Number(v));
const dateLabel =(v: string | null) =>
  v
    ? new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(v + "T00:00:00Z"))
    : "ไม่กำหนด";
function ownerFromToken(token: string | null) {
  try {
    return String(
      JSON.parse(
        atob(token!.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
      ).userId ?? "",
    );
  } catch {
    return "";
  }
}
function todayKey() {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)!.value)
    .join("-");
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const r = await apiFetch(path, options);
  const body = await r.json();
  if (!r.ok)
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : (body.error?.message ?? "ไม่สามารถดำเนินการได้"),
    );
  return body;
}
export default function Goals() {
  const [session, setSession] = useState(getToken);
  useEffect(() => {
    const changed = () => setSession(getToken());
    window.addEventListener("spendsense-session", changed);
    return () => window.removeEventListener("spendsense-session", changed);
  }, []);
  return <GoalsSession key={session ?? "signed-out"} session={session} />;
}
function GoalsSession({ session }: { session: string | null }) {
  const owner = ownerFromToken(session);
  const toast = useToast();
  const [intention, setIntention] = useState<string | null>(null);
  const [intentionError, setIntentionError] = useState(false),
    [intentionRetry, setIntentionRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setIntention(null);
    setIntentionError(false);
    request<{ legacyGoal?: unknown }>("/settings", {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted && getToken() === session)
          setIntention(
            data.legacyGoal === "เงินสำรองฉุกเฉิน" ||
              data.legacyGoal === "ออมเงินซื้อของ"
              ? data.legacyGoal
              : null,
          );
      })
      .catch(() => {
        if (!controller.signal.aborted && getToken() === session)
          setIntentionError(true);
      });
    return () => controller.abort();
  }, [session, intentionRetry]);
  const [goals, setGoals] = useState<Goal[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [status, setStatus] = useState(""),
    [archived, setArchived] = useState("exclude");
  const [view, setView] = useState<"card" | "list">("card"),
    [viewMoved, setViewMoved] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [asOfDate, setAsOfDate] = useState(todayKey);
  useEffect(() => {
    const refresh = () => {
      setAsOfDate(todayKey());
      setRevision((n) => n + 1);
    };
    const timer = window.setInterval(() => setAsOfDate(todayKey()), 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("spendsense-data-changed", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("spendsense-data-changed", refresh);
    };
  }, []);
  const [modal, setModal] = useState<Modal | null>(null),
    [opening, setOpening] = useState<Opening | null>(null),
    [incomes, setIncomes] = useState<Income[]>([]),
    [entries, setEntries] = useState<Entry[]>([]);
  const [modalLoading, setModalLoading] = useState(false),
    [modalError, setModalError] = useState(""),
    [inputError, setInputError] = useState(""),
    [busy, setBusy] = useState(false),
    [modalReload, setModalReload] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef<{
      signature: string;
      key: string;
    } | null>(null),
    actionBusy = useRef(false),
    epoch = useRef(0),
    listGeneration = useRef(0);
  const [modalReady, setModalReady] = useState(false);
  useEffect(() => {
    epoch.current++;
    setGoals([]);
    setModal(null);
    setOpening(null);
    setEntries([]);
    setIncomes([]);
    pending.current = null;
    actionBusy.current = false;
    setBusy(false);
    try {
      setView(
        localStorage.getItem("spendsense-goals-view:" + owner) === "list"
          ? "list"
          : "card",
      );
    } catch {
      setView("card");
    }
  }, [session, owner]);
  function changeView(v: "card" | "list") {
    if (v !== view) setViewMoved(true);
    setView(v);
    if (owner)
      try {
        localStorage.setItem("spendsense-goals-view:" + owner, v);
      } catch {
        /* Storage may be disabled. */
      }
  }
  useEffect(() => {
    const controller = new AbortController();
    listGeneration.current++;
    setLoading(true);
    setError("");
    setGoals([]);
    setCursor(null);
    request<{
      data: Goal[];
      nextCursor: string | null;
    }>(`/goals?archived=${archived}${status ? "&status=" + status : ""}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (getToken() === session && !controller.signal.aborted) {
          setGoals(data.data);
          setCursor(data.nextCursor);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session, status, archived, revision, asOfDate]);
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal) dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (!modal) return;
    const controller = new AbortController();
    setModalError("");
    setInputError("");
    setModalLoading(true);
    setModalReady(false);
    setEntries([]);
    setIncomes([]);
    const load = async () => {
      if (["opening", "allocate", "correct"].includes(modal.mode)) {
        const data = await request<{
          data: Opening | null;
        }>("/goal-funding/opening-balance", { signal: controller.signal });
        if (!controller.signal.aborted && getToken() === session)
          setOpening(data.data);
      }
      if (["allocate", "correct"].includes(modal.mode)) {
        const all: Income[] = [];
        let next: string | null = null;
        do {
          const data: {
            data: Income[];
            nextCursor: string | null;
          } = await request(
            "/goal-funding/incomes?limit=100" + (next ? "&cursor=" + next : ""),
            { signal: controller.signal },
          );
          all.push(...data.data);
          next = data.nextCursor;
        } while (next);
        if (!controller.signal.aborted && getToken() === session)
          setIncomes(all.filter((x) => x.eligible));
      }
      if (["history", "correct"].includes(modal.mode) && modal.goal) {
        const all: Entry[] = [];
        let next: string | null = null;
        do {
          const data: {
            data: Entry[];
            nextCursor: string | null;
          } = await request(
            `/goals/${modal.goal.id}/ledger?limit=100` +
              (next ? "&cursor=" + next : ""),
            { signal: controller.signal },
          );
          all.push(...data.data);
          next = data.nextCursor;
        } while (next);
        if (!controller.signal.aborted && getToken() === session)
          setEntries(all);
      }
    };
    void load()
      .then(() => {
        if (!controller.signal.aborted) setModalReady(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setModalError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setModalLoading(false);
      });
    return () => controller.abort();
  }, [modal, modalReload, session]);
  // Live icon choice in the goal form, so the dialog header previews it before saving.
  const [pickedIcon, setPickedIcon] = useState<string | null>(null);
  function open(mode: Mode, goal?: Goal, initialName?: string) {
    setPickedIcon(null);
    pending.current = null;
    setModalError("");
    setInputError("");
    setModalLoading(true);
    setModal(goal ? { mode, goal } : { mode, initialName });
  }
  function close() {
    if (!actionBusy.current) {
      setModal(null);
      pending.current = null;
    }
  }
  async function more() {
    if (!cursor || loading) return;
    const captured = epoch.current,
      generation = listGeneration.current;
    setLoading(true);
    setError("");
    try {
      const data = await request<{
        data: Goal[];
        nextCursor: string | null;
      }>(
        `/goals?archived=${archived}${status ? "&status=" + status : ""}&cursor=${cursor}`,
      );
      if (
        captured === epoch.current &&
        generation === listGeneration.current &&
        getToken() === session
      ) {
        setGoals((g) => [...g, ...data.data]);
        setCursor(data.nextCursor);
      }
    } catch (e) {
      if (captured === epoch.current && generation === listGeneration.current)
        setError((e as Error).message);
    } finally {
      if (captured === epoch.current && generation === listGeneration.current)
        setLoading(false);
    }
  }
  async function archive(goal: Goal) {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    const captured = epoch.current;
    try {
      await request(
        `/goals/${goal.id}/${goal.archivedAt ? "restore" : "archive"}`,
        { method: "POST", body: "{}" },
      );
      if (captured === epoch.current) {
        setRevision((x) => x + 1);
        window.clearTimeout(undoTimer.current);
        // Archiving offers a 6s undo (restore endpoint); restoring does not.
        setUndoArchive(goal.archivedAt ? null : goal);
        if (!goal.archivedAt)
          undoTimer.current = window.setTimeout(() => setUndoArchive(null), 6000);
      }
    } catch (e) {
      if (captured === epoch.current) setError((e as Error).message);
    } finally {
      if (captured === epoch.current) {
        actionBusy.current = false;
        setBusy(false);
      }
    }
  }
  const [undoArchive, setUndoArchive] = useState<Goal | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || actionBusy.current) return;
    const f = new FormData(event.currentTarget),
      v = (k: string) => String(f.get(k) ?? "").trim();
    let path = "",
      method = "POST",
      body: Record<string, unknown> = {};
    const g = modal.goal;
    if (modal.mode === "create" || modal.mode === "edit") {
      path = g ? "/goals/" + g.id : "/goals";
      method = g ? "PATCH" : "POST";
      body = {
        name: v("name"),
        targetAmount: v("targetAmount"),
        targetDate: v("targetDate") || null,
        plannedMonthlyAmount: v("plannedMonthlyAmount") || null,
        categoryKey: v("categoryKey"),
        note: v("note") || null,
      };
    }
    if (modal.mode === "opening") {
      path = "/goal-funding/opening-balance" + (opening ? "/corrections" : "");
      body = {
        amount: v("amount"),
        cutoffDate: opening?.cutoffLocked
          ? opening.cutoffDate
          : v("cutoffDate"),
        note: v("note"),
        ...(opening ? { reason: v("reason") } : {}),
      };
    }
    const source = () =>
      v("source") === "opening"
        ? { type: "OPENING_BALANCE" }
        : { type: "INCOME_TRANSACTION", transactionId: v("source") };
    // Client-side ceilings mirror what the server will reject anyway; message names the limit.
    const limit =
      modal.mode === "release"
        ? g?.savedAmount
        : modal.mode === "allocate"
          ? v("source") === "opening"
            ? opening?.availableAmount
            : incomes.find((i) => i.id === v("source"))?.availableAmount
          : undefined;
    if (limit !== undefined && Number(v("amount")) > Number(limit)) {
      setInputError(
        (modal.mode === "release" ? "คืนได้สูงสุด " : "แหล่งเงินนี้เหลือ ") + money(limit) + " ฿",
      );
      return;
    }
    if (modal.mode === "allocate") {
      path = `/goals/${g!.id}/allocations`;
      body = { amount: v("amount"), source: source() };
    }
    if (modal.mode === "release") {
      path = `/goals/${g!.id}/releases`;
      body = { amount: v("amount"), reason: v("reason") };
    }
    if (modal.mode === "correct") {
      path = `/goals/${g!.id}/allocation-corrections`;
      body = {
        allocationId: v("allocationId"),
        amount: v("amount"),
        reason: v("reason"),
        ...(v("source") ? { replacementSource: source() } : {}),
      };
    }
    const signature = JSON.stringify({ path, method, body });
    if (pending.current?.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID() };
    const captured = epoch.current;
    actionBusy.current = true;
    setBusy(true);
    setModalError("");
    setInputError("");
    try {
      await request(path, {
        method,
        body: JSON.stringify(body),
        headers: { "Idempotency-Key": pending.current.key },
      });
      if (captured === epoch.current && getToken() === session) {
        pending.current = null;
        setModal(null);
        setRevision((x) => x + 1);
        const amount = money(v("amount") || "0");
        toast(
          modal.mode === "allocate"
            ? `เก็บ ${amount} ฿ เข้า “${g!.name}” แล้ว`
            : modal.mode === "release"
              ? `คืน ${amount} ฿ จาก “${g!.name}” แล้ว`
              : modal.mode === "correct"
                ? "บันทึกการแก้รายการแล้ว"
                : "บันทึกแล้ว",
          "success",
        );
      }
    } catch (e) {
      if (captured === epoch.current) setModalError((e as Error).message);
    } finally {
      if (captured === epoch.current) {
        actionBusy.current = false;
        setBusy(false);
      }
    }
  }
  const titles: Record<Mode, string> = {
    create: "สร้างเป้าหมายใหม่",
    edit: "แก้ไขเป้าหมาย",
    opening: "เงินออมตั้งต้น",
    allocate: "เก็บเงินเข้าเป้าหมาย",
    release: "คืนเงินจากเป้าหมาย",
    history: "ประวัติการเก็บเงิน",
    correct: "แก้รายการเก็บเงินที่บันทึกผิด",
  };
  const g = modal?.goal;
  const isGoalForm = modal?.mode === "create" || modal?.mode === "edit";
  const isMoneyForm = modal?.mode === "allocate" || modal?.mode === "release";
  const styledForm = isGoalForm || isMoneyForm || modal?.mode === "history";
  const headIconKey = (pickedIcon ?? g?.categoryKey ?? "other") as keyof typeof categories;
  const HeadIcon = (categories[headIconKey] ?? categories.other).Icon;
  return (
    <div className="goals-page">
      {undoArchive && (
        <div className="local-toast-region goals-undo">
          <div className="local-toast" role="status">
            <span>จัดเก็บ “{undoArchive.name}” แล้ว</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const goal = undoArchive;
                window.clearTimeout(undoTimer.current);
                setUndoArchive(null);
                void archive({ ...goal, archivedAt: "pending-restore" });
              }}
            >
              เลิกทำ
            </button>
          </div>
        </div>
      )}
      <header className="goals-header compact-page-toolbar">
        <h1 className="page-heading-accessible">เป้าหมายการออมเงิน</h1>
        <button className="goals-primary" onClick={() => open("create")}>
          <Plus size={18} />
          สร้างเป้าหมายใหม่
        </button>
      </header>
      {intention && !loading && !goals.length && (
        <aside
          className="goals-intention"
          aria-labelledby="goals-intention-title"
        >
          <div>
            <h2 id="goals-intention-title">เริ่มเป้าหมายจากความตั้งใจของคุณ</h2>
            <p>
              คุณเลือก “{intention}” ไว้
              เริ่มร่างเป้าหมายแล้วกำหนดยอดและวันที่ได้ด้วยตัวเอง
            </p>
          </div>
          <button
            type="button"
            className="goals-primary"
            onClick={() => open("create", undefined, intention)}
          >
            เริ่มสร้างเป้าหมาย
          </button>
        </aside>
      )}
      {intentionError && (
        <div className="goals-error" role="status">
          โหลดคำแนะนำจากความตั้งใจไม่สำเร็จ ยังใช้งานหน้าเป้าหมายได้ตามปกติ{" "}
          <button type="button" onClick={() => setIntentionRetry((n) => n + 1)}>
            ลองโหลดคำแนะนำใหม่
          </button>
        </div>
      )}
      <section className="goals-panel" aria-label="เป้าหมายของคุณ">
        <div className="goals-toolbar">
          <h2>เป้าหมายของคุณ</h2>
          <label>
            สถานะ{" "}
            <Dropdown
              value={status}
              onChange={setStatus}
              options={[
                { value: "", label: "ทั้งหมด" },
                ...Object.entries(statusLabels).map(([k, label]) => ({
                  value: k,
                  label,
                })),
              ]}
            />
          </label>
          <label>
            การจัดเก็บ{" "}
            <Dropdown
              value={archived}
              onChange={setArchived}
              options={[
                { value: "exclude", label: "ใช้งานอยู่" },
                { value: "only", label: "จัดเก็บแล้ว" },
                { value: "include", label: "ทั้งหมด" },
              ]}
            />
          </label>
          <div className={"goals-view" + (viewMoved ? " goals-view-moved" : "")} role="group" aria-label="มุมมอง" data-view={view}>
            {/* Keyed so the droplet animation replays on every switch. */}
            <span key={view} className="goals-view-drop" aria-hidden="true" />
            <button
              aria-pressed={view === "card"}
              onClick={() => changeView("card")}
            >
              <LayoutGrid size={18} />
              การ์ด
            </button>
            <button
              aria-pressed={view === "list"}
              onClick={() => changeView("list")}
            >
              <List size={18} />
              รายการ
            </button>
          </div>
        </div>
        <div className="goals-funding-note">
          <span>
            เงินที่เก็บเข้าเป้าหมายเป็นการกันเงินไว้ ไม่เปลี่ยนรายรับ รายจ่าย หรืองบประมาณ
            และไม่ใช่ยอดเงินสดคงเหลือ
          </span>
          <button onClick={() => open("opening")}>
            ตั้งค่า / แก้ไขเงินออมตั้งต้น
          </button>
        </div>
        {error && (
          <div role="alert" className="goals-error">
            {error}{" "}
            <button onClick={() => setRevision((x) => x + 1)}>ลองใหม่</button>
          </div>
        )}
        {loading && !goals.length && <p role="status">กำลังโหลดเป้าหมาย…</p>}
        {!loading && !error && !goals.length && (
          <div className="goals-empty">
            <Target size={44} />
            <h3>ยังไม่มีเป้าหมายในรายการนี้</h3>
            <p>สร้างเป้าหมาย แล้วเลือกแหล่งเงินจริงเพื่อเริ่มเก็บเงิน</p>
            <button onClick={() => open("create")}>สร้างเป้าหมายใหม่</button>
          </div>
        )}
        <div className={"goals-items goals-" + view}>
          {goals.map((goal) => {
            const category =
                categories[goal.categoryKey as keyof typeof categories] ??
                categories.other,
              Icon = category.Icon;
            return (
              <article
                className={"goal-card goal-" + goal.categoryKey + (goal.calculatedStatus === "completed" ? " goal-done" : "")}
                key={goal.id}
              >
                <div className="goal-heading">
                  <span className="goal-icon">
                    <Icon size={36} />
                  </span>
                  <div>
                    <span className={"goal-status " + goal.calculatedStatus}>
                      {statusLabels[goal.calculatedStatus]}
                    </span>
                    {goal.archivedAt && (
                      <span className="goal-status">จัดเก็บแล้ว</span>
                    )}
                    <h3>{goal.name}</h3>
                    <p>
                      เป้าหมาย <strong>{baht(goal.targetAmount)}</strong> ฿
                    </p>
                  </div>
                  <button
                    className="goal-edit"
                    aria-label={"แก้ไข " + goal.name}
                    onClick={() => open("edit", goal)}
                  >
                    <Pencil size={18} />
                  </button>
                </div>
                <div className="goal-progress-block">
                  <div className="goal-saved">
                    <p>
                      <strong>{baht(goal.savedAmount)}</strong> ฿ ออมแล้ว
                    </p>
                    <strong className="goal-percent" aria-hidden="true">{goal.progressPercent}%</strong>
                  </div>
                  <progress
                    className="goal-bar"
                    max="100"
                    value={goal.progressBarPercent}
                    aria-label={"ความคืบหน้า " + goal.name}
                    aria-valuetext={goal.progressPercent + "%"}
                  />
                </div>
                <dl className="goal-stats">
                  <div>
                    <dt><Flag size={16} aria-hidden="true" /> ต้องการอีก</dt>
                    <dd>{baht(goal.remainingAmount)} <small>฿</small></dd>
                  </div>
                  <div>
                    <dt><CalendarDays size={16} aria-hidden="true" /> กำหนดเสร็จ</dt>
                    <dd>{dateLabel(goal.targetDate)}</dd>
                    {goal.monthsRemaining !== null && goal.monthsRemaining > 0 && (
                      <small className="goal-stats-note">อีก {goal.monthsRemaining} เดือน</small>
                    )}
                  </div>
                </dl>
                {(() => {
                  const required = goal.requiredMonthlyAmount !== null ? Number(goal.requiredMonthlyAmount) : null;
                  const planned = goal.plannedMonthlyAmount ? Number(goal.plannedMonthlyAmount) : null;
                  const cash = goal.feasibility?.cashFlow;
                  // A month that spent more than it earned must warn at least as loudly as one with too little left.
                  const negative = goal.feasibility?.status === "non_positive_cash_flow";
                  const net = cash && (negative || Number(cash.netCashFlow) > 0) ? Number(cash.netCashFlow) : null;
                  const short = goal.warnings.includes("PLAN_INSUFFICIENT");
                  const shortfall = required !== null && planned !== null && planned < required ? required - planned : null;
                  const overNet = negative || goal.feasibility?.status === "exceeds_observed_cash_flow";
                  const rows = [
                    { label: "ต้องออมต่อเดือน", value: required, tone: "required" },
                    { label: "แผนปัจจุบัน", value: planned, tone: "planned" },
                    { label: cash ? "เงินสุทธิเดือน " + thaiMonth(cash.period.month) : "", value: net, tone: "net" },
                  ].filter((r): r is { label: string; value: number; tone: string } => r.value !== null);
                  const scale = Math.max(1, ...rows.map((r) => r.value));
                  return (
                    <div className={"goal-plan" + (short || overNet ? " goal-warning" : "")}>
                      {required !== null ? (
                        <div className="goal-plan-head">
                          <div>
                            <span>ต้องออมเฉลี่ย</span>
                            <p>
                              <strong>{baht(goal.requiredMonthlyAmount!)}</strong> ฿/เดือน
                            </p>
                          </div>
                          {(short || shortfall !== null || overNet) && (
                            <span className="goal-plan-flag">
                              <TriangleAlert size={18} aria-hidden="true" />
                              {short || shortfall !== null ? "แผนยังไม่พอ" : "สูงกว่าเงินสุทธิ"}
                            </span>
                          )}
                        </div>
                      ) : (
                        <strong>
                          {goal.calculatedStatus === "overdue"
                            ? "เลยกำหนดแล้ว ยังขาด " + baht(goal.remainingAmount) + " ฿"
                            : goal.calculatedStatus === "completed"
                              ? <span className="goal-done-line"><CircleCheck size={20} aria-hidden="true" /> ครบเป้าหมายแล้ว ออมได้ตามที่ตั้งใจ</span>
                              : "เพิ่มวันกำหนดเสร็จเพื่อคำนวณยอดต่อเดือน"}
                        </strong>
                      )}
                      {required !== null && rows.length > 1 && (
                        <ul className="goal-compare">
                          {rows.map((r) => (
                            <li key={r.tone}>
                              <span>{r.label}</span>
                              <strong>{baht(String(r.value))} ฿</strong>
                              <i aria-hidden="true">
                                <b className={"goal-compare-" + r.tone} style={{ width: (Math.max(r.value, 0) / scale) * 100 + "%" }} />
                              </i>
                            </li>
                          ))}
                        </ul>
                      )}
                      {cash && goal.feasibility?.status === "no_income" && (
                        <small className="goal-stats-note">
                          ยังเทียบกับเงินสุทธิไม่ได้: เดือน {thaiMonth(cash.period.month)} ไม่มีรายรับที่บันทึก
                        </small>
                      )}
                      {cash && goal.feasibility?.status === "no_transactions" && (
                        <small className="goal-stats-note">
                          ยังเทียบกับเงินสุทธิไม่ได้: เดือน {thaiMonth(cash.period.month)} ยังไม่มีธุรกรรมที่บันทึก
                        </small>
                      )}
                      {required !== null && (planned === null || short || overNet || shortfall !== null) && (
                        <button
                          type="button"
                          className="goal-plan-next"
                          disabled={!!goal.archivedAt || busy}
                          onClick={() => open("edit", goal)}
                        >
                          <ArrowRight size={16} aria-hidden="true" />
                          <span>
                            {planned === null
                              ? "ยังไม่ได้ตั้งแผนออมรายเดือน — ตั้งแผน"
                              : shortfall !== null
                                ? <>ขาดอีก <strong>{baht(String(shortfall))} ฿</strong>/เดือน จากแผนปัจจุบัน
                                    {overNet ? " และสูงกว่าเงินสุทธิเดือนที่แล้ว" : ""}</>
                                : overNet
                                  ? "ยอดที่ต้องออมสูงกว่าเงินสุทธิเดือนที่แล้ว"
                                  : "เพิ่มแผนรายเดือนหรือเลื่อนวันกำหนดเสร็จ"}
                          </span>
                        </button>
                      )}
                      {goal.overfundedAmount !== "0.00" && (
                        <span>
                          เกินเป้าหมาย {baht(goal.overfundedAmount)} ฿ — เลือกคืนเงินได้
                        </span>
                      )}
                    </div>
                  );
                })()}
                <div className="goal-actions">
                  <button
                    className="goal-action-primary"
                    disabled={!!goal.archivedAt || busy}
                    onClick={() => open("allocate", goal)}
                  >
                    <Plus size={18} aria-hidden="true" /> เก็บเงิน
                  </button>
                  <button
                    disabled={goal.savedAmount === "0.00" || busy}
                    onClick={() => open("release", goal)}
                  >
                    <Undo2 size={16} aria-hidden="true" /> คืนเงิน
                  </button>
                  <button type="button" onClick={() => open("history", goal)}>
                    <History size={16} aria-hidden="true" /> ประวัติ
                  </button>
                  <button type="button" disabled={busy} onClick={() => void archive(goal)}>
                    <Archive size={16} aria-hidden="true" /> {goal.archivedAt ? "เลิกจัดเก็บ" : "จัดเก็บ"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {cursor && (
          <button
            className="goals-more"
            disabled={loading}
            onClick={() => void more()}
          >
            {loading ? "กำลังโหลด…" : "โหลดเพิ่มเติม"}
          </button>
        )}
      </section>
      <PageRecommendations rules={["R6", "R7", "R8"]} />
      <dialog
        ref={dialog}
        className={"goals-dialog" + (styledForm ? " goals-dialog-goal" : "")}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => {
          if (!actionBusy.current) setModal(null);
        }}
        aria-labelledby="goal-dialog-title"
      >
        {modal && (
          <>
            <div className="goals-dialog-header">
              {styledForm ? (
                <div className="goal-form-head">
                  {/* Keyed by icon so a new pick replays the swap animation. */}
                  <span key={headIconKey} className="goal-form-head-icon" aria-hidden="true">
                    <HeadIcon size={24} />
                  </span>
                  <div>
                    <small>{titles[modal.mode]}</small>
                    <h2 id="goal-dialog-title">
                      {g?.name || modal.initialName || "เป้าหมายใหม่"}
                    </h2>
                  </div>
                </div>
              ) : (
                <h2 id="goal-dialog-title">{titles[modal.mode]}</h2>
              )}
              <button aria-label="ปิด" disabled={busy} onClick={close}>
                <X />
              </button>
            </div>
            {inputError && (
              <div className="goals-error" role="alert">
                {inputError}
              </div>
            )}
            {modalError && (
              <div className="goals-error" role="alert">
                {modalError}{" "}
                <button
                  disabled={busy}
                  onClick={() => setModalReload((x) => x + 1)}
                >
                  โหลดข้อมูลใหม่
                </button>
              </div>
            )}
            {modalLoading ? (
              <p role="status">กำลังโหลด…</p>
            ) : !modalReady ? (
              <p role="status">ยังโหลดข้อมูลไม่สำเร็จ กรุณากดลองใหม่</p>
            ) : modal.mode === "history" ? (
              <div className="goal-history-body">
                <p className="goal-form-hint">ยอดนี้เป็นประวัติ ณ เวลาบันทึก</p>
                {entries.length === 0 ? (
                  <p className="goal-history-empty">ยังไม่มีการเก็บเงิน</p>
                ) : (
                  <ol className="goal-history">
                    {entries.map((e) => (
                      <li key={e.id} className={e.kind === "ALLOCATE" ? "in" : "out"}>
                        <span className="goal-history-icon" aria-hidden="true">
                          {e.kind === "ALLOCATE" ? <Plus size={16} /> : <Undo2 size={16} />}
                        </span>
                        <strong>
                          {e.kind === "ALLOCATE" ? "เก็บเข้า" : "คืนออก"}{" "}
                          {money(e.amount)} ฿
                        </strong>
                        <span>
                          {new Intl.DateTimeFormat("th-TH", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "Asia/Bangkok",
                          }).format(new Date(e.createdAt))}
                        </span>
                        <span>
                          {e.sourceSnapshot.sourceType === "OPENING_BALANCE"
                            ? "เงินออมตั้งต้น"
                            : e.sourceSnapshot.description || "รายรับ"}
                        </span>
                        {e.operation.reason && (
                          <span>{e.operation.reason}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                <div className="goal-history-fix">
                  <p className="goal-form-hint">
                    แก้รายการที่บันทึกผิดได้โดยไม่ลบของเดิม ระบบจะเพิ่มรายการชดเชยไว้
                    ประวัติจึงตรวจสอบย้อนหลังได้
                  </p>
                  <button onClick={() => open("correct", g)}>
                    แก้รายการที่บันทึกผิด
                  </button>
                </div>
              </div>
            ) : (
              <form
                key={modal.mode + (g?.id ?? "") + modalReload}
                onSubmit={(e) => void submit(e)}
              >
                {(modal.mode === "create" || modal.mode === "edit") && (
                  <>
                    <label className="goal-form-half">
                      <span className="goal-form-label">ชื่อเป้าหมาย</span>
                      <input
                        name="name"
                        required
                        maxLength={120}
                        defaultValue={g?.name ?? modal.initialName}
                        autoFocus
                      />
                    </label>
                    <label className="goal-form-half">
                      <span className="goal-form-label">ยอดเป้าหมาย</span>
                      <span className="goal-form-money">
                        <input
                          name="targetAmount"
                          required
                          inputMode="decimal"
                          pattern="[0-9]{1,10}([.][0-9]{1,2})?"
                          defaultValue={g?.targetAmount}
                        />
                        <i>฿</i>
                      </span>
                    </label>
                    <fieldset className="goal-icon-picker">
                      <legend>ไอคอน</legend>
                      {Object.entries(categories).map(([k, { label, Icon }]) => (
                        <label key={k} title={label}>
                          <input
                            type="radio"
                            name="categoryKey"
                            value={k}
                            defaultChecked={(g?.categoryKey ?? "other") === k}
                            onChange={() => setPickedIcon(k)}
                          />
                          <Icon size={22} aria-hidden="true" />
                          <span>{label}</span>
                        </label>
                      ))}
                    </fieldset>
                    <label className="goal-form-half">
                      <span className="goal-form-label">
                        กำหนดเสร็จ <em className="goal-form-optional">ไม่บังคับ</em>
                      </span>
                      <DateField name="targetDate" label="กำหนดเสร็จ" defaultValue={g?.targetDate ?? ""} clearable />
                    </label>
                    <label className="goal-form-half">
                      <span className="goal-form-label">
                        แผนเก็บเงินต่อเดือน{" "}
                        <em className="goal-form-optional">ไม่บังคับ</em>
                      </span>
                      <span className="goal-form-money">
                        <input
                          name="plannedMonthlyAmount"
                          inputMode="decimal"
                          pattern="[0-9]{1,10}([.][0-9]{1,2})?"
                          defaultValue={g?.plannedMonthlyAmount ?? ""}
                        />
                        <i>฿</i>
                      </span>
                    </label>
                    <label>
                      <span className="goal-form-label">
                        หมายเหตุ <em className="goal-form-optional">ไม่บังคับ</em>
                      </span>
                      <textarea
                        name="note"
                        maxLength={1000}
                        defaultValue={g?.note ?? ""}
                      />
                    </label>
                  </>
                )}
                {modal.mode === "opening" && (
                  <>
                    <p>
                      ยอดเงินที่มีอยู่ ณ สิ้นวันตัดยอดตามเวลาไทย
                      รายรับก่อนหรือเท่ากับวันนั้นจะใช้เก็บเงินซ้ำไม่ได้
                    </p>
                    <label>
                      จำนวนเงิน (฿)
                      <input
                        name="amount"
                        required
                        inputMode="decimal"
                        pattern="[0-9]{1,10}([.][0-9]{1,2})?"
                        defaultValue={opening?.openingAmount}
                        autoFocus
                      />
                    </label>
                    <label>
                      วันตัดยอด
                      <DateField name="cutoffDate" label="วันตัดยอด" max={todayKey()} disabled={opening?.cutoffLocked} defaultValue={opening?.cutoffDate ?? todayKey()} />
                    </label>
                    {opening?.cutoffLocked && (
                      <p>วันตัดยอดถูกล็อกเพราะมีประวัติการเก็บเงินแล้ว</p>
                    )}
                    <label>
                      ที่มา / หมายเหตุ
                      <textarea
                        name="note"
                        required
                        maxLength={1000}
                        defaultValue={opening?.note}
                      />
                    </label>
                    {opening && (
                      <label>
                        เหตุผลที่แก้ไข
                        <textarea name="reason" required maxLength={1000} />
                      </label>
                    )}
                  </>
                )}
                {(modal.mode === "allocate" || modal.mode === "correct") && (
                  <label>
                    <span className="goal-form-label">
                      แหล่งเงิน
                      {modal.mode === "correct"
                        ? "ทดแทน (ไม่เลือก = คืนเงินอย่างเดียว)"
                        : ""}
                    </span>
                    <Dropdown
                      name="source"
                      required={modal.mode === "allocate"}
                      options={[
                        { value: "", label: "เลือกแหล่งเงิน" },
                        ...(opening
                          ? [{ value: "opening", label: `เงินตั้งต้น — เหลือ ${money(opening.availableAmount)} ฿` }]
                          : []),
                        ...incomes.map((i) => ({
                          value: i.id,
                          label: `${dateLabel(i.transactionDate)} ${i.description || "รายรับ"} — เหลือ ${money(i.availableAmount)} ฿`,
                        })),
                      ]}
                    />
                  </label>
                )}
                {modal.mode === "correct" && (
                  <label>
                    รายการเก็บเงินที่ต้องการแก้
                    <Dropdown
                      name="allocationId"
                      required
                      options={[
                        { value: "", label: "เลือกรายการต้นทาง" },
                        ...entries
                          .filter((e) => e.kind === "ALLOCATE")
                          .map((e) => ({
                            value: e.id,
                            label: `${new Date(e.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} — ${money(e.amount)} ฿ · ${e.sourceSnapshot.sourceType === "OPENING_BALANCE" ? "เงินตั้งต้น" : e.sourceSnapshot.description || "รายรับ"}`,
                          })),
                      ]}
                    />
                  </label>
                )}
                {["allocate", "release", "correct"].includes(modal.mode) && (
                  <>
                    {g && (
                      <dl className="goal-money-summary">
                        <div>
                          <dt>ออมแล้ว</dt>
                          <dd>{money(g.savedAmount)} ฿</dd>
                        </div>
                        <div>
                          <dt>เป้าหมาย</dt>
                          <dd>{money(g.targetAmount)} ฿</dd>
                        </div>
                        <div>
                          <dt>{modal.mode === "release" ? "คืนได้สูงสุด" : "ต้องการอีก"}</dt>
                          <dd>{money(modal.mode === "release" ? g.savedAmount : g.remainingAmount)} ฿</dd>
                        </div>
                      </dl>
                    )}
                    <label>
                      <span className="goal-form-label">จำนวนเงิน</span>
                      <span className="goal-form-money">
                        <input
                          name="amount"
                          required
                          inputMode="decimal"
                          pattern="[0-9]{1,10}([.][0-9]{1,2})?"
                          defaultValue={
                            modal.mode === "release" &&
                            g?.overfundedAmount !== "0.00"
                              ? g?.overfundedAmount
                              : undefined
                          }
                        />
                        <i>฿</i>
                      </span>
                    </label>
                    {modal.mode !== "allocate" && (
                      <label>
                        <span className="goal-form-label">เหตุผล</span>
                        <textarea name="reason" required maxLength={1000} />
                      </label>
                    )}
                    {modal.mode === "release" && (
                      <p className="goal-form-hint">
                        ระบบคืนเงินจากรายการที่เก็บไว้ก่อนสุดก่อน
                      </p>
                    )}
                  </>
                )}
                <div className="goals-dialog-actions">
                  <button type="button" disabled={busy} onClick={close}>
                    ยกเลิก
                  </button>
                  <button
                    className={"goals-primary" + (styledForm ? " goal-form-save" : "")}
                    disabled={busy || modalLoading}
                    type="submit"
                  >
                    {styledForm && !busy && <Check size={18} aria-hidden="true" />}
                    {busy ? "กำลังบันทึก…" : modal.mode === "allocate" ? "เก็บเงิน" : modal.mode === "release" ? "คืนเงิน" : "บันทึก"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
