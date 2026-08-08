import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  ArrowUpDown,
  Bell,
  CalendarDays,
  CheckCheck,
  Check,
  ChevronLeft,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Crown,
  FileClock,
  Gauge,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Filter,
  Download,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  Volume2,
  VolumeX,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppStore, type View } from "./store/app-store";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";
import {
  findServiceBrand,
  searchServiceCatalog,
  serviceLogoUrl,
  type ServiceBrand,
} from "./lib/service-catalog";
import {
  firebaseReady,
  signInWithGoogle,
  signOutUser,
  watchAuth,
} from "./lib/firebase";
import {
  ALL_PERMISSIONS,
  approveRequest,
  createRenewalRequest,
  createSubscription,
  createSubscriptionRequest,
  deleteSubscription,
  deleteRole,
  deleteUser,
  ensureUserProfile,
  listAllRequests,
  listAllSubscriptions,
  listAuditLogs,
  listMyRequests,
  listMySubscriptions,
  listNotifications,
  subscribeRealtime,
  listRoles,
  listUsers,
  markNotificationRead,
  markAllNotificationsRead,
  syncSubscriptionAlerts,
  activateSuperAdmin,
  grantSystemOwner,
  rejectRequest,
  revealCredential,
  saveRole,
  storeCredential,
  updateSubscription,
  assignRoles,
  type RequestRecord,
  type SubscriptionRecord,
  type UserProfile,
} from "./lib/firestore-repository";

type Status = "نشط" | "قارب على الانتهاء" | "منتهٍ" | "ملغى";
type RequestStatus = "قيد المراجعة" | "مكتمل" | "مرفوض";
type Subscription = {
  id: string | number;
  name: string;
  short: string;
  color: string;
  price: number;
  cycle: string;
  renewal: string;
  days: number;
  status: Status;
  email: string;
  accessUrl?: string;
  hasStoredCredentials?: boolean;
  category?: string;
  assignedTo: string[];
  renewalDate: string;
  teamLeadName?: string;
  beneficiaryName?: string;
  requestedPlan?: string;
  renewalOf?: string;
  renewalCount?: number;
};
type RequestItem = {
  id: string | number;
  service: string;
  requester: string;
  purpose: string;
  date: string;
  type: "اشتراك جديد" | "تجديد";
  status: RequestStatus;
  rejectionReason?: string;
  beneficiaryName?: string;
  requestedPlan?: string;
  requestedAccess?: string;
  proposedEmail?: string;
  suggestedStartDate?: string;
  suggestedRenewalDate?: string;
};

const subscriptions: Subscription[] = [];
const requests: RequestItem[] = [];
const monthlySeries = (value: number) =>
  Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (6 - index));
    return {
      month: new Intl.DateTimeFormat("ar-SA-u-nu-latn", { month: "long" }).format(date),
      value,
    };
  });
const nav: { id: View; label: string; icon: typeof Gauge }[] = [
  { id: "employee", label: "مساحتي", icon: Users },
  { id: "dashboard", label: "نظرة عامة", icon: Gauge },
  { id: "subscriptions", label: "الاشتراكات", icon: WalletCards },
  { id: "requests", label: "الطلبات", icon: FileClock },
  { id: "reports", label: "التقارير", icon: Activity },
  { id: "roles", label: "الصلاحيات", icon: ShieldCheck },
  { id: "audit", label: "سجل التحركات", icon: FileClock },
];
const formatSAR = (value: number) =>
  new Intl.NumberFormat("en-US").format(value) + " ر.س";
const billingCycleMonths = (cycle: string) => cycle === "شهري" ? 1 : cycle === "ربع سنوي" ? 3 : cycle === "نصف سنوي" ? 6 : 12;
const isOneTimeCycle = (cycle: string) => cycle === "مرة واحدة";
const monthlyEquivalent = (item: Subscription) => isOneTimeCycle(item.cycle) ? 0 : item.price / billingCycleMonths(item.cycle);
const annualEquivalent = (item: Subscription) => item.cycle === "مرة واحدة" ? item.price : monthlyEquivalent(item) * 12;
const addBillingMonths = (date: Date, months: number) => {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
};
const colors = ["#2ac0eb", "#7357ff", "#10a37f", "#d97757", "#d50c2d"];
const daysUntil = (date?: Date) =>
  date ? Math.ceil((date.getTime() - Date.now()) / 86400000) : 0;
const formatDate = (date?: Date) => date ? date.toLocaleDateString("en-CA").replaceAll("-", "/") : "الآن";
const dateText = (date?: { toDate(): Date }) => formatDate(date?.toDate());
const mapSubscription = (item: SubscriptionRecord, index = 0): Subscription => {
  const renewal = item.renewal_date?.toDate();
  const days = daysUntil(renewal);
  const status: Status =
    item.status === "ملغى"
      ? "ملغى"
      : !renewal
        ? item.status === "منتهٍ" ? "منتهٍ" : "نشط"
      : days < 0
        ? "منتهٍ"
        : days <= 3
          ? "قارب على الانتهاء"
          : "نشط";
  return {
    id: item.id,
    name: item.name,
    short: item.name.slice(0, 2),
    color: colors[index % colors.length],
    price: Number(item.price ?? 0),
    cycle: item.billing_cycle ?? "شهري",
    renewal: renewal ? formatDate(renewal) : "غير محدد",
    days,
    status,
    email: item.account_email ?? "حساب الشركة",
    accessUrl: item.access_url,
    hasStoredCredentials: item.has_stored_credentials,
    category: item.category,
    assignedTo: item.assigned_to ?? [],
    renewalDate: renewal?.toISOString().slice(0, 10) ?? "",
    teamLeadName: item.team_lead_name,
    beneficiaryName: item.beneficiary_name,
    requestedPlan: item.requested_plan,
    renewalOf: item.renewal_of,
    renewalCount: item.renewal_count,
  };
};
const mapRequest = (item: RequestRecord): RequestItem => ({
  id: item.id,
  service: item.service_name,
  requester: item.requester_name ?? "موظف",
  purpose: item.purpose,
  date: dateText(item.created_at),
  type: item.type === "renewal" ? "تجديد" : "اشتراك جديد",
  status: item.status,
  rejectionReason: item.rejection_reason,
  beneficiaryName: item.beneficiary_name,
  requestedPlan: item.requested_plan,
  requestedAccess: item.requested_access,
  proposedEmail: item.proposed_account_email,
  suggestedStartDate: item.suggested_start_date,
  suggestedRenewalDate: item.suggested_renewal_date,
});
const permissionForView: Partial<Record<View, string>> = {
  dashboard: "view_subscriptions",
  subscriptions: "view_subscriptions",
  requests: "review_requests",
  reports: "view_financial_reports",
  roles: "manage_users_roles",
  audit: "view_audit_log",
};
const permissionLabels: Record<(typeof ALL_PERMISSIONS)[number], string> = {
  view_subscriptions: "عرض الاشتراكات",
  manage_subscriptions: "إضافة وتعديل الاشتراكات",
  delete_subscriptions: "حذف الاشتراكات",
  review_requests: "الموافقة على الطلبات",
  reject_requests: "رفض الطلبات",
  view_financial_reports: "عرض التقارير المالية",
  manage_users_roles: "إدارة المستخدمين والأدوار",
  store_credentials: "تخزين بيانات الاعتماد",
  reveal_credentials: "عرض بيانات الاعتماد",
  view_audit_log: "عرض سجل التحركات",
};

const statusLabel = (status: Status | RequestStatus) => status === "منتهٍ" ? "اشتراك منتهي" : status;
function StatusBadge({ status }: { status: Status | RequestStatus }) {
  return (
    <span
      className={cn(
        "status",
        status === "نشط" || status === "مكتمل"
          ? "success"
          : status === "قارب على الانتهاء" || status === "قيد المراجعة"
            ? "warning"
            : "danger",
      )}
    >
      <span />
      {statusLabel(status)}
    </span>
  );
}
function Metric({
  icon: Icon,
  title,
  value,
  trend,
  tone = "cyan",
}: {
  icon: typeof Gauge;
  title: string;
  value: ReactNode;
  trend: string;
  tone?: string;
}) {
  return (
    <article className="metric-card">
      <div className={cn("metric-icon", tone)}>
        <Icon size={22} />
      </div>
      <div>
        <p>{title}</p>
        <h3>{value}</h3>
        <small>{trend}</small>
      </div>
    </article>
  );
}

function AnimatedNumber({ value, formatter = (number) => String(number) }: { value: number; formatter?: (value: number) => string }) {
  const [displayed, setDisplayed] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const startValue = previous.current;
    previous.current = value;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayed(value);
      return undefined;
    }
    const startedAt = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / 360, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(startValue + ((value - startValue) * eased)));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return formatter(displayed);
}

type ReportSortKey = "name" | "price" | "cycle" | "renewal" | "status" | "teamLead" | "beneficiary";
function ReportSortButton({ label, field, activeField, direction, onSort }: { label: string; field: ReportSortKey; activeField: ReportSortKey; direction: "asc" | "desc"; onSort: (field: ReportSortKey) => void }) {
  const active = field === activeField;
  return <button type="button" className={cn("table-sort", active && "active")} onClick={() => onSort(field)} aria-label={`ترتيب حسب ${label}`} aria-pressed={active}>{label}<ArrowUpDown className={cn(active && direction === "desc" && "descending")} /></button>;
}

function ServiceLogo({
  name,
  fallback,
  color,
  compact = false,
}: {
  name: string;
  fallback?: string;
  color?: string;
  compact?: boolean;
}) {
  const service = findServiceBrand(name);
  const label = fallback ?? name.slice(0, 2);
  const hasRemoteLogo = service && service.domain !== "nashernet.com";
  return (
    <div
      className={cn("service-logo", compact && "compact")}
      style={{ background: service ? "#fff" : (color ?? "#e9f8fc") }}
      title={service?.name ?? name}
    >
      <span style={{ color: service?.color ?? "#168eb2" }}>{label}</span>
      {hasRemoteLogo && (
        <img
          src={serviceLogoUrl(service)}
          alt={`شعار ${service.name}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => { event.currentTarget.hidden = true; }}
        />
      )}
    </div>
  );
}

function ServicePicker({
  name,
  label,
  initialValue = "",
  required = false,
  onSelect,
}: {
  name: string;
  label: string;
  initialValue?: string;
  required?: boolean;
  onSelect?: (service: ServiceBrand) => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState(initialValue);
  const [expanded, setExpanded] = useState(false);
  const results = searchServiceCatalog(query).slice(0, 10);
  return (
    <div className="form-field service-picker">
      <label htmlFor={inputId}>{label} {required && <b>*</b>}</label>
      <div className="service-picker-input">
        {query && <ServiceLogo name={query} fallback={query.slice(0, 1)} compact />}
        <input
          id={inputId}
          name={name}
          value={query}
          required={required}
          autoComplete="off"
          placeholder="ابحث باسم الخدمة أو اكتب اسمًا مخصصًا"
          onFocus={() => setExpanded(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setExpanded(true);
          }}
          onBlur={() => window.setTimeout(() => setExpanded(false), 120)}
        />
      </div>
      {expanded && (
        <div className="service-picker-results" role="listbox" aria-label="الخدمات المقترحة">
          {results.length ? results.map((service) => (
            <button
              type="button"
              role="option"
              aria-selected={query === service.name}
              key={service.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery(service.name);
                setExpanded(false);
                onSelect?.(service);
              }}
            >
              <ServiceLogo name={service.name} compact />
              <span><strong>{service.name}</strong><small>{service.category}</small></span>
            </button>
          )) : (
            <div className="service-picker-custom">لا توجد خدمة مطابقة؛ سيُستخدم الاسم الذي كتبته كشعار مخصص.</div>
          )}
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content confirm-dialog" dir="rtl">
          <div className={cn("dialog-icon", danger && "danger")}>
            {danger ? <X /> : <ShieldCheck />}
          </div>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <div className="dialog-actions">
            <button
              className={cn("btn", danger ? "danger" : "primary")}
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  await onConfirm();
                  onOpenChange(false);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء");
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "جارٍ التنفيذ..." : confirmLabel}
            </button>
            <Dialog.Close className="btn secondary">تراجع</Dialog.Close>
          </div>
          <Dialog.Close className="dialog-close" aria-label="إغلاق">
            <X />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SubscriptionFormDialog({
  open,
  item,
  users,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  item?: Subscription | null;
  users: UserProfile[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(item?.category ?? "خدمات أخرى");
  const employeeUsers = users.filter((user) => !user.is_owner);
  const editing = Boolean(item);
  useEffect(() => {
    if (open) setSelectedCategory(item?.category ?? "خدمات أخرى");
  }, [open, item?.category]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content subscription-dialog" dir="rtl">
          <div className="dialog-heading">
            <div className="dialog-icon"><WalletCards /></div>
            <div>
              <Dialog.Title>{editing ? "تعديل الاشتراك" : "إضافة اشتراك جديد"}</Dialog.Title>
              <Dialog.Description>
                {editing
                  ? "حدّث بيانات الخدمة وسيُحفظ التغيير في سجل التحركات."
                  : "أدخل بيانات الخدمة والفوترة والوصول، ثم احفظ الاشتراك."}
              </Dialog.Description>
            </div>
          </div>
          <form
            key={`${item?.id ?? "new"}-${String(open)}`}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = String(form.get("name") ?? "").trim();
              const price = Number(form.get("price"));
              const renewalDate = String(form.get("renewalDate") ?? "");
              if (!name || !Number.isFinite(price) || price < 0 || !renewalDate) {
                toast.error("تحقق من اسم الخدمة والتكلفة وتاريخ التجديد");
                return;
              }
              const assignedTo = form.getAll("assignedTo").map(String);
              setLoading(true);
              try {
                const values = {
                  name,
                  category: String(form.get("category") ?? "خدمات أخرى"),
                  price,
                  billing_cycle: String(form.get("billingCycle") ?? "شهري"),
                  renewal_date: renewalDate,
                  account_email: String(form.get("accountEmail") ?? "").trim(),
                  access_url: String(form.get("accessUrl") ?? "").trim(),
                  assigned_to: assignedTo,
                  status: String(form.get("status") ?? "نشط"),
                };
                if (item) {
                  await updateSubscription(String(item.id), values);
                } else {
                  await createSubscription({
                    name: values.name,
                    category: values.category,
                    price: values.price,
                    billingCycle: values.billing_cycle,
                    renewalDate: values.renewal_date,
                    accountEmail: values.account_email,
                    accessUrl: values.access_url,
                    assignedTo: values.assigned_to,
                  });
                }
                onSaved();
                onOpenChange(false);
                toast.success(item ? "تم تحديث الاشتراك" : "تمت إضافة الاشتراك بنجاح");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "تعذر حفظ الاشتراك");
              } finally {
                setLoading(false);
              }
            }}
          >
            <fieldset disabled={loading}>
              <legend>معلومات الخدمة</legend>
              <div className="form-grid two-columns">
                <ServicePicker
                  name="name"
                  label="اسم الخدمة"
                  required
                  initialValue={item?.name}
                  onSelect={(service) => setSelectedCategory(service.category)}
                />
                <label>
                  التصنيف <b>*</b>
                  <select name="category" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                    <option>برمجيات وإنتاجية</option>
                    <option>استضافة وبنية تحتية</option>
                    <option>تصميم وتسويق</option>
                    <option>أمن وحماية</option>
                    <option>خدمات أخرى</option>
                  </select>
                </label>
              </div>
            </fieldset>
            <fieldset disabled={loading}>
              <legend>الفوترة والتجديد</legend>
              <div className="form-grid three-columns">
                <label>
                  التكلفة بالريال <b>*</b>
                  <input name="price" type="number" min="0" step="0.01" required defaultValue={item?.price ?? ""} placeholder="0.00" dir="ltr" />
                </label>
                <label>
                  دورة الفوترة <b>*</b>
                  <select name="billingCycle" defaultValue={item?.cycle ?? "شهري"}>
                    <option>شهري</option><option>ربع سنوي</option><option>نصف سنوي</option><option>سنوي</option><option>مرة واحدة</option>
                  </select>
                </label>
                <label>
                  تاريخ التجديد <b>*</b>
                  <input name="renewalDate" type="date" required defaultValue={item?.renewalDate ?? ""} dir="ltr" />
                </label>
              </div>
            </fieldset>
            <fieldset disabled={loading}>
              <legend>الوصول والحساب</legend>
              <div className="form-grid two-columns">
                <label>
                  بريد حساب الخدمة
                  <input name="accountEmail" type="email" defaultValue={item?.email === "حساب الشركة" ? "" : item?.email} placeholder="service@aait.sa" dir="ltr" />
                </label>
                <label>
                  رابط الوصول
                  <input name="accessUrl" type="url" defaultValue={item?.accessUrl} placeholder="https://" dir="ltr" />
                </label>
              </div>
              {editing && (
                <label>
                  حالة الاشتراك
                  <select name="status" defaultValue={item?.status}>
                    <option>نشط</option><option>قارب على الانتهاء</option><option>منتهٍ</option><option>ملغى</option>
                  </select>
                </label>
              )}
            </fieldset>
            {editing && (
              <fieldset disabled={loading}>
                <legend>الموظفون المستفيدون</legend>
                <p className="field-help">لن يظهر هذا الاشتراك إلا للموظفين المحددين هنا.</p>
                {employeeUsers.length ? (
                  <div className="assignee-list">
                    {employeeUsers.map((user) => (
                      <label key={user.uid}>
                        <input type="checkbox" name="assignedTo" value={user.uid} defaultChecked={item?.assignedTo.includes(user.uid)} />
                        <span><strong>{user.name}</strong><small>{user.email}</small></span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="inline-empty">لا يوجد موظفون مسجلون بعد. يمكنك إضافة الاشتراك دون إسناد.</div>
                )}
              </fieldset>
            )}
            <div className="dialog-actions sticky-actions">
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? "جارٍ الحفظ..." : editing ? "حفظ التعديلات" : "إضافة الاشتراك"}
              </button>
              <Dialog.Close className="btn secondary" type="button">إلغاء</Dialog.Close>
            </div>
          </form>
          <Dialog.Close className="dialog-close" aria-label="إغلاق"><X /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CredentialDialog({
  item,
  open,
  onOpenChange,
}: {
  item: Subscription;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" dir="rtl">
          <div className="dialog-heading">
            <div className="dialog-icon"><LockKeyhole /></div>
            <div>
              <Dialog.Title>بيانات دخول {item.name}</Dialog.Title>
              <Dialog.Description>ستُشفّر البيانات قبل حفظها ولن تظهر كنص صريح.</Dialog.Description>
            </div>
          </div>
          <form onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const password = String(form.get("password") ?? "");
            if (!password) return toast.error("أدخل كلمة المرور");
            setLoading(true);
            try {
              await storeCredential(String(item.id), {
                username: String(form.get("username") ?? "").trim(),
                password,
                url: String(form.get("url") ?? "").trim(),
              });
              toast.success("تم تشفير بيانات الدخول وحفظها بأمان");
              onOpenChange(false);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "تعذر الحفظ");
            } finally { setLoading(false); }
          }}>
            <label>اسم المستخدم أو البريد<input name="username" autoComplete="off" dir="ltr" /></label>
            <label>
              كلمة المرور <b>*</b>
              <div className="password-field">
                <input name="password" type={showPassword ? "text" : "password"} required autoComplete="new-password" dir="ltr" />
                <button type="button" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            <label>رابط الخدمة <span>اختياري</span><input name="url" type="url" placeholder="https://" dir="ltr" /></label>
            <div className="security-note"><ShieldCheck /> تشفير من طرف الخادم مع تسجيل كل عملية إظهار.</div>
            <div className="dialog-actions">
              <button className="btn primary" disabled={loading}>{loading ? "جارٍ التشفير..." : "حفظ آمن"}</button>
              <Dialog.Close className="btn secondary" type="button">إلغاء</Dialog.Close>
            </div>
          </form>
          <Dialog.Close className="dialog-close" aria-label="إغلاق"><X /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SubscriptionCard({
  item,
  manage = false,
  canDelete = false,
  canReveal = false,
  canStore = false,
  onChanged,
  users = [],
}: {
  item: Subscription;
  manage?: boolean;
  canDelete?: boolean;
  canReveal?: boolean;
  canStore?: boolean;
  onChanged?: () => void;
  users?: UserProfile[];
}) {
  const [secret, setSecret] = useState("");
  const [revealOpen, setRevealOpen] = useState(false);
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const setRenewalTarget = useAppStore((s) => s.setRenewalTarget);
  const reveal = async () => {
    if (secret) {
      setSecret("");
      return;
    }
    try {
      const result = await revealCredential(String(item.id));
      setSecret(
        [result.secret.username, result.secret.password, result.secret.url]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر إظهار البيانات",
      );
    }
  };
  const remove = async () => {
    try {
      await deleteSubscription(String(item.id));
      onChanged?.();
      toast.success("تم حذف الاشتراك");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الحذف");
    }
  };
  return (
    <article className={cn("subscription-card", item.status === "منتهٍ" && "subscription-expired")}>
      <div className="subscription-top">
        <ServiceLogo name={item.name} fallback={item.short} color={item.color} />
        <div className="service-title">
          <h3>{item.name}</h3>
          <p>{item.email}</p>
          {item.accessUrl && (
            <a href={item.accessUrl} target="_blank" rel="noreferrer">
              فتح الخدمة
            </a>
          )}
        </div>
        <StatusBadge status={item.status} />
      </div>
      <div className="subscription-meta">
        <div>
          <span>التكلفة</span>
          <strong>{formatSAR(item.price)}</strong>
          <small> / {item.cycle}</small>
        </div>
        <div>
          <span>تاريخ انتهاء الاشتراك</span>
          <strong>{item.renewal}</strong>
          <small className={item.days <= 3 ? "urgent" : ""}>
            {item.days < 0 ? "اشتراك منتهي" : `متبقي ${item.days} يومًا`}
          </small>
        </div>
      </div>
      {(item.teamLeadName || item.beneficiaryName) && <div className="subscription-people"><span>قائد الفريق: <strong>{item.teamLeadName ?? "—"}</strong></span><span>المهندس المستفيد: <strong>{item.beneficiaryName ?? "—"}</strong></span></div>}
      {secret && <p className="credential-value">{secret}</p>}
      <div className="card-actions">
        <button
          className="btn secondary"
          onClick={() => setRenewalTarget(`${item.id}|${item.name}|${item.renewalDate}`)}
        >
          <RefreshCw size={16} /> طلب تجديد
        </button>
        {canReveal && (
          <button className="btn ghost" onClick={() => secret ? setSecret("") : setRevealOpen(true)}>
            <LockKeyhole size={16} />
            {secret ? "إخفاء البيانات" : "بيانات الدخول"}
          </button>
        )}
        {canStore && (
          <button className="btn ghost" onClick={() => setCredentialOpen(true)}>
            حفظ بيانات
          </button>
        )}
        {manage && (
          <button className="btn ghost" onClick={() => setEditOpen(true)}>
            تعديل
          </button>
        )}
        {canDelete && (
          <button className="btn ghost danger-text" onClick={() => setDeleteOpen(true)}>
            حذف
          </button>
        )}
      </div>
      <ConfirmDialog
        open={revealOpen}
        onOpenChange={setRevealOpen}
        title="إظهار بيانات الدخول؟"
        description="هذه عملية حساسة وستُسجل باسمك في سجل التحركات. أخفِ البيانات بعد الانتهاء."
        confirmLabel="إظهار مؤقتًا"
        onConfirm={reveal}
      />
      <CredentialDialog item={item} open={credentialOpen} onOpenChange={setCredentialOpen} />
      <SubscriptionFormDialog open={editOpen} item={item} users={users} onOpenChange={setEditOpen} onSaved={() => onChanged?.()} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`حذف اشتراك ${item.name}؟`}
        description="سيُحذف الاشتراك وبيانات دخوله المحفوظة، وستبقى العملية موثقة في سجل التحركات."
        confirmLabel="حذف نهائي"
        danger
        onConfirm={remove}
      />
    </article>
  );
}

function EmployeeDashboard() {
  const [tab, setTab] = useState("الكل");
  const { data: requestData = requests } = useQuery({
    queryKey: ["my-requests"],
    queryFn: async () =>
      firebaseReady ? (await listMyRequests()).map(mapRequest) : requests,
  });
  const { data: subscriptionData = subscriptions } = useQuery({
    queryKey: ["my-subscriptions"],
    queryFn: async () =>
      firebaseReady
        ? (await listMySubscriptions()).map(mapSubscription)
        : subscriptions,
  });
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    enabled: firebaseReady,
  });
  const myRequests =
    tab === "الكل" ? requestData : requestData.filter((r) => r.status === tab);
  return (
    <>
      <section className="employee-hero">
        <div>
          <span className="eyebrow">
            <Sparkles size={15} /> مساحة الموظف
          </span>
          <h1>مرحبًا بك، ماذا تحتاج اليوم؟</h1>
          <p>اطلب خدمة جديدة وتابع حالة طلباتك واشتراكاتك الحالية.</p>
        </div>
        <NewRequestButton />
      </section>
      <section className="employee-summary">
        <div>
          <Clock3 />
          <span>
            <strong>
              {requestData.filter((x) => x.status === "قيد المراجعة").length}{" "}
              طلبات
            </strong>{" "}
            قيد المراجعة
          </span>
        </div>
        <div>
          <WalletCards />
          <span>
            <strong>{subscriptionData.length} خدمات</strong> مسلّمة لك
          </span>
        </div>
        <div>
          <Bell />
          <span>
            <strong>
              {notifications.filter((x) => !x.read).length} تنبيهات
            </strong>{" "}
            غير مقروءة
          </span>
        </div>
      </section>
      <section className="section-head employee-heading">
        <div>
          <h2>طلباتي</h2>
          <p>تابع مسار طلبات الاشتراك والتجديد</p>
        </div>
      </section>
      <div className="tabs employee-tabs">
        {["الكل", "قيد المراجعة", "مكتمل", "مرفوض"].map((x) => (
          <button
            className={tab === x ? "active" : ""}
            onClick={() => setTab(x)}
            key={x}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="employee-requests">
        {myRequests.length ? (
          myRequests.map((r) => (
            <article key={r.id}>
              <div className="request-service">
                <ServiceLogo name={r.service} fallback={r.service.slice(0, 1)} compact />
                <div>
                  <h3>{r.service}</h3>
                  <p>
                    {r.type} · {r.date}
                  </p>
                </div>
              </div>
              <StatusBadge status={r.status} />
              {r.status === "مرفوض" && (
                <small>
                  {r.rejectionReason ?? "راجع المسؤول لمعرفة السبب"}
                </small>
              )}
            </article>
          ))
        ) : (
          <EmptyState
            icon={FileClock}
            title="لا توجد طلبات هنا"
            description={requestData.length ? "لا توجد طلبات بهذه الحالة." : "ابدأ بطلب الخدمة التي تحتاجها للعمل."}
            action={!requestData.length ? <NewRequestButton /> : undefined}
          />
        )}
      </div>
      <section className="section-head">
        <div>
          <h2>اشتراكاتي الحالية</h2>
          <p>الخدمات المسلّمة لك وتواريخ التجديد</p>
        </div>
      </section>
      <div className="subscriptions-grid">
        {subscriptionData.length ? (
          subscriptionData.map((item) => (
            <SubscriptionCard
              key={item.id}
              item={item}
              canReveal={item.hasStoredCredentials}
            />
          ))
        ) : (
          <EmptyState icon={WalletCards} title="لا توجد خدمات مسلّمة لك بعد" description="عند اعتماد طلبك ستظهر الخدمة وبيانات الوصول هنا." />
        )}
      </div>
      <button
        className="floating-request"
        onClick={() => useAppStore.getState().setRequestOpen(true)}
      >
        <Plus /> طلب اشتراك جديد
      </button>
    </>
  );
}

function Dashboard({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const { data: items = subscriptions } = useQuery({
    queryKey: ["all-subscriptions"],
    queryFn: async () =>
      firebaseReady
        ? (await listAllSubscriptions()).map(mapSubscription)
        : subscriptions,
  });
  const { data: pending = [] } = useQuery({
    queryKey: ["all-requests"],
    queryFn: async () =>
      firebaseReady ? (await listAllRequests()).map(mapRequest) : requests,
    enabled:
      !firebaseReady ||
      permissions.includes("review_requests") ||
      permissions.includes("reject_requests"),
  });
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    enabled: firebaseReady,
  });
  const monthlyTotal = Math.round(
    items.reduce(
      (sum, item) =>
        sum +
        item.price /
          (item.cycle === "سنوي" ? 12 : item.cycle === "ربع سنوي" ? 3 : 1),
      0,
    ),
  );
  const active = items.filter((x) => x.status === "نشط").length;
  const near = items.filter((x) => x.status === "قارب على الانتهاء").length;
  const forecastData = monthlySeries(monthlyTotal);
  const cycleNames = [...new Set(items.map((x) => x.cycle))];
  const cycleData = cycleNames.map((name, index) => {
    const total = items
      .filter((x) => x.cycle === name)
      .reduce((sum, x) => sum + x.price, 0);
    const all = items.reduce((sum, x) => sum + x.price, 0) || 1;
    return {
      name,
      value: Math.round((total / all) * 100),
      color: colors[index % colors.length],
    };
  });
  return (
    <>
      <section className="welcome">
        <div>
          <span className="eyebrow">
            <Sparkles size={15} /> صباح الخير
          </span>
          <h1>كل اشتراكات الشركة، تحت السيطرة.</h1>
          <p>تابع التكاليف والتجديدات والطلبات من مكان واحد.</p>
        </div>
        <NewRequestButton />
      </section>
      <section className="metrics-grid">
        <Metric
          icon={WalletCards}
          title="الاشتراكات النشطة"
          value={String(active)}
          trend="اشتراكات فعّالة حاليًا"
        />
        <Metric
          icon={CircleDollarSign}
          title="الإنفاق الشهري"
          value={formatSAR(monthlyTotal)}
          trend="تكلفة شهرية معادلة"
          tone="green"
        />
        <Metric
          icon={Clock3}
          title="تجديدات قريبة"
          value={String(near)}
          trend="تنتهي خلال 3 أيام أو أقل"
          tone="orange"
        />
        <Metric
          icon={FileClock}
          title="طلبات معلّقة"
          value={String(
            pending.filter((x) => x.status === "قيد المراجعة").length,
          )}
          trend="بحاجة إلى مراجعة"
          tone="violet"
        />
      </section>
      <section className="panel dashboard-notifications">
        <div className="panel-head"><div><h2><Bell /> تنبيهات تحتاج إلى متابعة</h2><p>أحدث التنبيهات المهمة وغير المقروءة.</p></div><button className="text-btn" onClick={() => document.querySelector<HTMLButtonElement>(".bell")?.click()}>فتح مركز التنبيهات <ChevronLeft size={16} /></button></div>
        <div className="dashboard-notification-list">
          {notifications.filter((item) => !item.read).sort((a,b) => Number(b.created_at?.toDate() ?? 0) - Number(a.created_at?.toDate() ?? 0)).slice(0, 4).map((item) => <button key={item.id} className={cn("dashboard-notification", item.priority === "high" && "important")} onClick={async () => { await markNotificationRead(item.id); await queryClient.invalidateQueries({queryKey:["notifications"]}); if (item.request_id) useAppStore.getState().setView("requests"); else if (item.subscription_id) useAppStore.getState().setView("subscriptions"); }}><Bell /><span><strong>{item.title}</strong><small>{item.body}</small></span></button>)}
          {!notifications.some((item) => !item.read) && <div className="inline-empty">لا توجد تنبيهات جديدة تحتاج إلى إجراء.</div>}
        </div>
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h2>الإنفاق الشهري</h2>
              <p>التكلفة الشهرية المعادلة</p>
            </div>
            <button className="period">
              آخر 7 أشهر <ChevronLeft size={15} />
            </button>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData}>
                <defs>
                  <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2ac0eb" stopOpacity={0.3} />
                    <stop offset="1" stopColor="#2ac0eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--chart-grid)"
                  strokeDasharray="4 4"
                />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v) => formatSAR(Number(v))} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#20acd6"
                  strokeWidth={3}
                  fill="url(#spend)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>توزيع التكاليف</h2>
              <p>حسب دورة الفوترة</p>
            </div>
          </div>
          <div className="donut-wrap">
            <ResponsiveContainer width="52%" height={190}>
              <PieChart>
                <Pie
                  data={cycleData}
                  dataKey="value"
                  innerRadius={54}
                  outerRadius={78}
                  paddingAngle={4}
                  stroke="none"
                >
                  {cycleData.map((x) => (
                    <Cell key={x.name} fill={x.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="legend">
              {cycleData.map((x) => (
                <div key={x.name}>
                  <i style={{ background: x.color }} />
                  <span>{x.name}</span>
                  <strong>{x.value}%</strong>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>
      <section className="section-head">
        <div>
          <h2>تحتاج انتباهك</h2>
          <p>الاشتراكات التي تنتهي خلال 3 أيام أو انتهت بالفعل</p>
        </div>
        <button
          className="text-btn"
          onClick={() => useAppStore.getState().setView("subscriptions")}
        >
          عرض كل الاشتراكات <ChevronLeft size={16} />
        </button>
      </section>
      <div className="subscriptions-grid">
        {items.filter((x) => x.status !== "نشط").length ? items
          .filter((x) => x.status !== "نشط")
          .slice(0, 3)
          .map((item) => (
            <SubscriptionCard
              key={item.id}
              item={item}
              canReveal={permissions.includes("reveal_credentials")}
              canStore={permissions.includes("store_credentials")}
            />
          )) : <EmptyState icon={Check} title="لا توجد عناصر تحتاج انتباهك" description="كل الاشتراكات الحالية بحالة جيدة." />}
      </div>
    </>
  );
}
function calculateRenewalDate(startDate: string, cycle: string) {
  if (!startDate || cycle === "مرة واحدة") return "";
  const date = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const months = cycle === "شهري" ? 1 : cycle === "ربع سنوي" ? 3 : cycle === "نصف سنوي" ? 6 : 12;
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function RequestReviewDialog({
  target,
  mode,
  onOpenChange,
  onCompleted,
}: {
  target: RequestItem | null;
  mode: "approve" | "reject";
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const approving = mode === "approve";
  const suggestedCategory = findServiceBrand(target?.service ?? "")?.category ?? "خدمات أخرى";
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [startDate, setStartDate] = useState(today);
  const [billingCycle, setBillingCycle] = useState("شهري");
  const [renewalDate, setRenewalDate] = useState("");
  const [manualRenewal, setManualRenewal] = useState(false);
  useEffect(() => {
    if (!target) return;
    const initialStart = target.suggestedStartDate || today;
    const initialCycle = "شهري";
    setStartDate(initialStart);
    setBillingCycle(initialCycle);
    setRenewalDate(target.suggestedRenewalDate || calculateRenewalDate(initialStart, initialCycle));
    setManualRenewal(Boolean(target.suggestedRenewalDate));
  }, [target, target?.id, target?.suggestedStartDate, target?.suggestedRenewalDate, today]);
  useEffect(() => {
    if (!manualRenewal) setRenewalDate(calculateRenewalDate(startDate, billingCycle));
  }, [startDate, billingCycle, manualRenewal]);
  return (
    <Dialog.Root open={Boolean(target)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content review-dialog" dir="rtl">
          <div className="dialog-heading">
            <div className={cn("dialog-icon", !approving && "danger")}>{approving ? <Check /> : <X />}</div>
            <div>
              <Dialog.Title>{approving ? "اعتماد طلب الاشتراك" : "رفض الطلب"}</Dialog.Title>
              <Dialog.Description>{target?.service} · مقدم الطلب: {target?.requester}</Dialog.Description>
            </div>
          </div>
          <div className="request-review-summary">
            <span>الغرض من الطلب</span>
            <p>{target?.purpose}</p>
            {target?.beneficiaryName && <p><strong>المهندس المستفيد:</strong> {target.beneficiaryName}</p>}
            {target?.requestedPlan && <p><strong>الباقة المطلوبة:</strong> {target.requestedPlan}</p>}
            {target?.requestedAccess && <p><strong>الصلاحية المطلوبة:</strong> {target.requestedAccess}</p>}
            {target?.proposedEmail && <p><strong>البريد المرتبط بالخدمة:</strong> <span dir="ltr">{target.proposedEmail}</span></p>}
          </div>
          <form onSubmit={async (event) => {
            event.preventDefault();
            if (!target) return;
            const form = new FormData(event.currentTarget);
            setLoading(true);
            try {
              if (approving) {
                await approveRequest(String(target.id), {
                  cost: Number(form.get("cost")),
                  billingCycle: String(form.get("billingCycle") ?? "شهري"),
                  renewalStartDate: String(form.get("renewalStartDate") ?? ""),
                  renewalDate: String(form.get("renewalDate") ?? ""),
                  subscriptionStartDate: String(form.get("subscriptionStartDate") ?? "").trim(),
                  category: String(form.get("category") ?? "خدمات أخرى"),
                });
              } else {
                const reason = String(form.get("reason") ?? "").trim();
                if (reason.length < 5) {
                  toast.error("اكتب سببًا واضحًا للرفض");
                  return;
                }
                await rejectRequest(String(target.id), reason);
              }
              onCompleted();
              onOpenChange(false);
              toast.success(approving ? "تمت الموافقة وإنشاء الاشتراك" : "تم رفض الطلب وحفظ السبب");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء");
            } finally { setLoading(false); }
          }}>
            {approving ? (
              <>
                <fieldset disabled={loading}>
                  {target?.type !== "تجديد" && <label>تاريخ الاشتراك <b>*</b><input name="subscriptionStartDate" type="date" required dir="ltr" value={startDate} onChange={(event) => { setStartDate(event.target.value); setManualRenewal(false); }} /></label>}
                  <legend>تفاصيل الاشتراك الناتج</legend>
                  <div className="form-grid two-columns">
                    <label>التكلفة بالريال <b>*</b><input name="cost" type="number" min="0" step="0.01" required dir="ltr" /></label>
                     <label>التصنيف<select name="category" defaultValue={suggestedCategory}><option>برمجيات وإنتاجية</option><option>استضافة وبنية تحتية</option><option>تصميم وتسويق</option><option>أمن وحماية</option><option>خدمات أخرى</option></select></label>
                      <label>دورة الفوترة<select name="billingCycle" value={billingCycle} onChange={(event) => { setBillingCycle(event.target.value); setManualRenewal(false); }}><option>شهري</option><option>ربع سنوي</option><option>نصف سنوي</option><option>سنوي</option><option>مرة واحدة</option></select></label>
                     {target?.type === "تجديد" && <label>بداية الفترة الجديدة <b>*</b><input name="renewalStartDate" type="date" required dir="ltr" defaultValue={target.suggestedStartDate} /></label>}
                      <label>تاريخ انتهاء الاشتراك <b>*</b><input name="renewalDate" type="date" required={billingCycle !== "مرة واحدة"} dir="ltr" value={renewalDate} onChange={(event) => { setRenewalDate(event.target.value); setManualRenewal(true); }} /><small className="calculated-field-note">{manualRenewal ? "تم تعديل التاريخ يدويًا" : "محسوب تلقائيًا من تاريخ البداية والدورة"}</small></label>
                    <label>رابط الوصول <span>اختياري</span><input name="accessUrl" type="url" placeholder="https://" dir="ltr" /></label>
                  </div>
                </fieldset>
                <div className="security-note"><Users /> سيُربط الاشتراك بقائد الفريق مقدم الطلب، ويُحفظ اسم المهندس المستفيد ضمن تفاصيله.</div>
              </>
            ) : (
              <label>سبب الرفض <b>*</b><textarea name="reason" required minLength={5} rows={4} placeholder="وضّح للموظف سبب الرفض وما المطلوب لتقديم طلب أفضل..." autoFocus /></label>
            )}
            <div className="dialog-actions">
              <button className={cn("btn", approving ? "primary" : "danger")} disabled={loading}>{loading ? "جارٍ الحفظ..." : approving ? "اعتماد وإنشاء الاشتراك" : "تأكيد الرفض"}</button>
              <Dialog.Close className="btn secondary" type="button">إلغاء</Dialog.Close>
            </div>
          </form>
          <Dialog.Close className="dialog-close" aria-label="إغلاق"><X /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RequestsView({ permissions }: { permissions: string[] }) {
  const [tab, setTab] = useState("الكل");
  const [reviewTarget, setReviewTarget] = useState<RequestItem | null>(null);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject">("approve");
  const queryClient = useQueryClient();
  const { data: all = requests } = useQuery({
    queryKey: ["all-requests"],
    queryFn: async () =>
      firebaseReady ? (await listAllRequests()).map(mapRequest) : requests,
  });
  const openReview = (request: RequestItem, mode: "approve" | "reject") => {
    setReviewTarget(request);
    setReviewMode(mode);
  };
  const shown = tab === "الكل" ? all : all.filter((r) => r.status === tab);
  return (
    <>
      <PageTitle
        title="طلبات الاشتراك"
        subtitle="راجع طلبات الموظفين واتخذ الإجراء المناسب"
        action={<NewRequestButton />}
      />
      <div className="tabs">
        {["الكل", "قيد المراجعة", "مكتمل", "مرفوض"].map((x) => (
          <button
            className={tab === x ? "active" : ""}
            onClick={() => setTab(x)}
            key={x}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="request-list">
        {shown.length ? (
          shown.map((r) => (
            <article className="request-row" key={r.id}>
               <div className="request-main">
                <div>
                  <h3>{r.service}</h3>
                  <p>{r.purpose}</p>
                </div>
                 <div className="request-details">
                  <span>
                    <Users size={15} />
                    {r.requester}
                  </span>
                  <span>
                    <CalendarDays size={15} />
                    {r.date}
                  </span>
                   <span>{r.type}</span>
                   {r.beneficiaryName && <span>المهندس: {r.beneficiaryName}</span>}
                   {r.requestedPlan && <span>الباقة: {r.requestedPlan}</span>}
                </div>
                {r.rejectionReason && (
                  <small className="urgent">
                    سبب الرفض: {r.rejectionReason}
                  </small>
                )}
              </div>
              <StatusBadge status={r.status} />
              {r.status === "قيد المراجعة" && (
                <div className="review-actions">
                  {permissions.includes("review_requests") && (
                    <button aria-label="موافقة" onClick={() => openReview(r, "approve")}>
                      <Check /> اعتماد
                    </button>
                  )}
                  {permissions.includes("reject_requests") && (
                    <button
                      aria-label="رفض"
                      className="reject"
                      onClick={() => openReview(r, "reject")}
                    >
                      <X /> رفض
                    </button>
                  )}
                </div>
              )}
            </article>
          ))
        ) : (
          <EmptyState icon={FileClock} title="لا توجد طلبات هنا" description="ستظهر طلبات الموظفين في هذه القائمة فور إرسالها." />
        )}
      </div>
      <RequestReviewDialog
        target={reviewTarget}
        mode={reviewMode}
        onOpenChange={(open) => !open && setReviewTarget(null)}
        onCompleted={() => queryClient.invalidateQueries({ queryKey: ["all-requests"] })}
      />
    </>
  );
}
function ReportsView() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detailSearch, setDetailSearch] = useState("");
  const [detailStatus, setDetailStatus] = useState("الكل");
  const [detailCycle, setDetailCycle] = useState("الكل");
  const [detailTeamLead, setDetailTeamLead] = useState("الكل");
  const [detailBeneficiary, setDetailBeneficiary] = useState("الكل");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sortField, setSortField] = useState<ReportSortKey>("renewal");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedDetail, setSelectedDetail] = useState<Subscription | null>(null);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [activePreset, setActivePreset] = useState<"month" | "quarter" | "year" | "urgent" | null>(null);
  const deferredSearch = useDeferredValue(detailSearch.trim().toLowerCase());
  const { data: items = subscriptions } = useQuery({
    queryKey: ["all-subscriptions"],
    queryFn: async () =>
      firebaseReady
        ? (await listAllSubscriptions()).map(mapSubscription)
        : subscriptions,
  });
  const availableServices = useMemo(() => [...new Set(items.map((item) => item.name))].sort(), [items]);
  const availableCycles = useMemo(() => [...new Set(items.map((item) => item.cycle))].sort(), [items]);
  const availableTeamLeads = useMemo(() => [...new Set(items.map((item) => item.teamLeadName).filter(Boolean) as string[])].sort(), [items]);
  const availableBeneficiaries = useMemo(() => [...new Set(items.map((item) => item.beneficiaryName).filter(Boolean) as string[])].sort(), [items]);
  const filteredItems = useMemo(() => items.filter((item) => {
    const date = item.renewalDate;
    const searchable = `${item.name} ${item.category ?? ""} ${item.teamLeadName ?? ""} ${item.beneficiaryName ?? ""}`.toLowerCase();
    return (!selectedServices.length || selectedServices.includes(item.name))
      && (!from || date >= from)
      && (!to || date <= to)
      && (!deferredSearch || searchable.includes(deferredSearch))
      && (detailStatus === "الكل" || item.status === detailStatus)
      && (detailCycle === "الكل" || item.cycle === detailCycle)
      && (detailTeamLead === "الكل" || item.teamLeadName === detailTeamLead)
      && (detailBeneficiary === "الكل" || item.beneficiaryName === detailBeneficiary)
      && (!minimumPrice || item.price >= Number(minimumPrice))
      && (!maximumPrice || item.price <= Number(maximumPrice));
  }), [items, selectedServices, from, to, deferredSearch, detailStatus, detailCycle, detailTeamLead, detailBeneficiary, minimumPrice, maximumPrice]);
  const hasDetailedFilters = Boolean(detailCycle !== "الكل" || detailTeamLead !== "الكل" || detailBeneficiary !== "الكل" || minimumPrice || maximumPrice);
  const hasAnyFilters = Boolean(detailSearch || from || to || detailStatus !== "الكل" || hasDetailedFilters || selectedServices.length);
  const resetDetailedFilters = () => {
    setDetailCycle("الكل");
    setDetailTeamLead("الكل");
    setDetailBeneficiary("الكل");
    setMinimumPrice("");
    setMaximumPrice("");
  };
  const clearAllFilters = () => {
    setFrom(""); setTo(""); setDetailSearch(""); setDetailStatus("الكل");
    resetDetailedFilters(); setSelectedServices([]); setActivePreset(null); setPage(1);
  };
  const applyPeriod = (period: "month" | "quarter" | "year" | "urgent") => {
    const now = new Date();
    const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (period === "urgent") {
      const end = new Date(now); end.setDate(end.getDate() + 3);
      setFrom(localDate(now)); setTo(localDate(end)); setDetailStatus("قارب على الانتهاء");
    } else {
      const start = period === "year" ? new Date(now.getFullYear(), 0, 1) : period === "quarter" ? now : new Date(now.getFullYear(), now.getMonth(), 1);
      const end = period === "year"
        ? new Date(now.getFullYear(), 11, 31)
        : period === "quarter"
          ? addBillingMonths(now, 3)
          : new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFrom(localDate(start)); setTo(localDate(end)); setDetailStatus("الكل");
    }
    setActivePreset(period);
    setPage(1);
  };
  const recurringItems = filteredItems.filter((item) => !isOneTimeCycle(item.cycle));
  const monthly = Math.round(recurringItems.reduce((sum, item) => sum + monthlyEquivalent(item), 0));
  const annual = Math.round(filteredItems.reduce((sum, item) => sum + annualEquivalent(item), 0));
  const average = recurringItems.length ? Math.round(monthly / recurringItems.length) : 0;
  const activeCount = filteredItems.filter((x) => x.status === "نشط").length;
  const nearCount = filteredItems.filter(
    (x) => x.status === "قارب على الانتهاء",
  ).length;
  const expiredCount = filteredItems.filter((x) => x.status === "منتهٍ").length;
  const canceledCount = filteredItems.filter((x) => x.status === "ملغى").length;
  const sortedItems = useMemo(() => [...filteredItems].sort((left, right) => {
    const values: Record<ReportSortKey, [string | number, string | number]> = {
      name: [left.name, right.name], price: [left.price, right.price], cycle: [left.cycle, right.cycle],
      renewal: [left.renewalDate, right.renewalDate], status: [left.status, right.status],
      teamLead: [left.teamLeadName ?? "", right.teamLeadName ?? ""], beneficiary: [left.beneficiaryName ?? "", right.beneficiaryName ?? ""],
    };
    const [a, b] = values[sortField];
    const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "ar");
    return sortDirection === "asc" ? result : -result;
  }), [filteredItems, sortField, sortDirection]);
  const pages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const safePage = Math.min(page, pages);
  const visibleItems = sortedItems.slice((safePage - 1) * pageSize, safePage * pageSize);
  const sortReport = (field: ReportSortKey) => {
    if (field === sortField) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDirection("asc"); }
    setPage(1);
  };
  const costByService = useMemo(() => {
    const totals = new Map<string, number>();
    filteredItems.filter((item) => !isOneTimeCycle(item.cycle)).forEach((item) => totals.set(item.name, (totals.get(item.name) ?? 0) + monthlyEquivalent(item)));
    return [...totals].map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [filteredItems]);
  const renewalForecast = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
      const year = date.getFullYear(), month = date.getMonth();
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
      const value = filteredItems.reduce((sum, item) => {
        if (!item.renewalDate || isOneTimeCycle(item.cycle) || item.status === "ملغى" || item.status === "منتهٍ") return sum;
        let occurrence = new Date(`${item.renewalDate}T00:00:00`);
        const cycleMonths = billingCycleMonths(item.cycle);
        while (occurrence < monthStart) occurrence = addBillingMonths(occurrence, cycleMonths);
        return occurrence <= monthEnd ? sum + item.price : sum;
      }, 0);
      return { month: new Intl.DateTimeFormat("ar-SA-u-nu-latn", { month: "short" }).format(date), value };
    });
  }, [filteredItems]);
  const highestCost = filteredItems.reduce<Subscription | null>((highest, item) => !highest || item.price > highest.price ? item : highest, null);
  const nearestExpiry = filteredItems.filter((item) => !isOneTimeCycle(item.cycle) && item.days >= 0 && item.status !== "ملغى").sort((a, b) => a.days - b.days)[0];
  const renewalThisMonth = renewalForecast[0]?.value ?? 0;
  const reportPeriod = `${from || "بداية السجل"} - ${to || "اليوم"}`;
  const exportExcel = async () => {
    if (!filteredItems.length) return toast.error("لا توجد بيانات مطابقة لتصديرها");
    setExporting("excel");
    try {
      const XLSX = await import("xlsx-js-style");
      const workbook = XLSX.utils.book_new();
      const summary = XLSX.utils.aoa_to_sheet([
        ["تقرير الاشتراكات والخدمات - AAIT", "", "", "", "", "", ""],
        ["", "", "", "", "", "", ""],
        [`الفترة: ${reportPeriod}`, "", "", "", "", "", `تاريخ الإصدار: ${new Date().toLocaleDateString("en-CA").replaceAll("-", "/")}`],
        [],
        ["الإنفاق الشهري", "", "الإجمالي السنوي المتوقع", "", "عدد الاشتراكات", "", "متوسط الاشتراك"],
        [monthly, "", annual, "", filteredItems.length, "", average],
        [],
        ["ملخص الخدمات", "", "", "", "", "", ""],
        ["الخدمة", "عدد الاشتراكات", "الإنفاق الشهري", "الحصة من الإنفاق", "", "", ""],
        ...availableServices.filter((service) => !selectedServices.length || selectedServices.includes(service)).map((service) => {
          const serviceItems = filteredItems.filter((item) => item.name === service);
          const serviceMonthly = Math.round(serviceItems.reduce((sum, item) => sum + monthlyEquivalent(item), 0));
          return [service, serviceItems.length, serviceMonthly, monthly ? serviceMonthly / monthly : 0, "", "", ""];
        }),
      ]);
      summary["!merges"] = [XLSX.utils.decode_range("A1:G2"), XLSX.utils.decode_range("A8:G8"), XLSX.utils.decode_range("A5:B5"), XLSX.utils.decode_range("A6:B6"), XLSX.utils.decode_range("C5:D5"), XLSX.utils.decode_range("C6:D6"), XLSX.utils.decode_range("E5:F5"), XLSX.utils.decode_range("E6:F6")];
      summary["!views"] = [{ rightToLeft: true, showGridLines: false }];
      summary["!cols"] = [{ wch: 27 }, { wch: 17 }, { wch: 24 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 21 }];
      summary["!rows"] = [{ hpt: 28 }, { hpt: 28 }, { hpt: 24 }, { hpt: 10 }, { hpt: 24 }, { hpt: 34 }, { hpt: 10 }, { hpt: 26 }, { hpt: 24 }];
      const navy = "102D3E", cyan = "20B7DF", pale = "EAF8FC", border = "DCE8ED", white = "FFFFFF", muted = "607783";
      for (const cell of ["A1"]) summary[cell].s = { font: { name: "IBM Plex Sans Arabic", bold: true, sz: 20, color: { rgb: white } }, fill: { fgColor: { rgb: navy } }, alignment: { horizontal: "right", vertical: "center", readingOrder: 2 } };
      for (const cell of ["A3", "G3"]) summary[cell].s = { font: { name: "IBM Plex Sans Arabic", sz: 10, color: { rgb: muted } }, alignment: { horizontal: cell === "A3" ? "right" : "left", readingOrder: 2 } };
      ["A5", "C5", "E5", "G5"].forEach((cell) => summary[cell].s = { font: { name: "IBM Plex Sans Arabic", bold: true, sz: 10, color: { rgb: muted } }, fill: { fgColor: { rgb: pale } }, alignment: { horizontal: "center", vertical: "center", readingOrder: 2 }, border: { bottom: { style: "thin", color: { rgb: border } } } });
      ["A6", "C6", "E6", "G6"].forEach((cell) => summary[cell].s = { font: { name: "IBM Plex Sans Arabic", bold: true, sz: 18, color: { rgb: navy } }, fill: { fgColor: { rgb: pale } }, alignment: { horizontal: "center", vertical: "center" }, numFmt: cell === "E6" ? "#,##0" : '#,##0 "ر.س"' });
      summary["A8"].s = { font: { name: "IBM Plex Sans Arabic", bold: true, sz: 13, color: { rgb: white } }, fill: { fgColor: { rgb: cyan } }, alignment: { horizontal: "right", vertical: "center", readingOrder: 2 } };
      ["A9", "B9", "C9", "D9"].forEach((cell) => summary[cell].s = { font: { name: "IBM Plex Sans Arabic", bold: true, color: { rgb: white } }, fill: { fgColor: { rgb: navy } }, alignment: { horizontal: "center", readingOrder: 2 } });
      const summaryEnd = 9 + filteredItems.length;
      for (let row = 10; row <= summaryEnd; row += 1) {
        for (const col of ["A", "B", "C", "D"]) if (summary[`${col}${row}`]) summary[`${col}${row}`].s = { font: { name: "IBM Plex Sans Arabic", sz: 10, color: { rgb: navy } }, fill: { fgColor: { rgb: row % 2 ? "F6FAFC" : white } }, alignment: { horizontal: col === "A" ? "right" : "center", readingOrder: 2 }, border: { bottom: { style: "thin", color: { rgb: border } } }, numFmt: col === "C" ? '#,##0 "ر.س"' : col === "D" ? "0%" : undefined };
      }
      const detailsRows = filteredItems.map((item) => [item.name, item.price, item.cycle, new Date(`${item.renewalDate}T00:00:00`), statusLabel(item.status), item.teamLeadName ?? "-", item.beneficiaryName ?? "-"]);
      const details = XLSX.utils.aoa_to_sheet([["تفاصيل الاشتراكات", "", "", "", "", "", ""], ["الخدمة", "التكلفة", "الدورة", "تاريخ انتهاء الاشتراك", "الحالة", "قائد الفريق", "المستفيد"], ...detailsRows]);
      details["!merges"] = [XLSX.utils.decode_range("A1:G1")];
      details["!views"] = [{ rightToLeft: true, showGridLines: false }];
      details["!cols"] = [{ wch: 25 }, { wch: 16 }, { wch: 17 }, { wch: 18 }, { wch: 18 }, { wch: 23 }, { wch: 23 }];
      details["!rows"] = [{ hpt: 32 }, { hpt: 27 }];
      details["!autofilter"] = { ref: `A2:G${detailsRows.length + 2}` };
      details["!freeze"] = { xSplit: 0, ySplit: 2, topLeftCell: "A3", activePane: "bottomLeft", state: "frozen" };
      details["A1"].s = { font: { name: "IBM Plex Sans Arabic", bold: true, sz: 17, color: { rgb: white } }, fill: { fgColor: { rgb: navy } }, alignment: { horizontal: "right", vertical: "center", readingOrder: 2 } };
      for (let col = 0; col < 7; col += 1) details[XLSX.utils.encode_cell({ r: 1, c: col })].s = { font: { name: "IBM Plex Sans Arabic", bold: true, color: { rgb: white } }, fill: { fgColor: { rgb: cyan } }, alignment: { horizontal: "center", vertical: "center", readingOrder: 2 } };
      for (let row = 2; row < detailsRows.length + 2; row += 1) for (let col = 0; col < 7; col += 1) {
        const cell = details[XLSX.utils.encode_cell({ r: row, c: col })];
        if (!cell) continue;
        cell.s = { font: { name: "IBM Plex Sans Arabic", sz: 10, color: { rgb: navy } }, fill: { fgColor: { rgb: row % 2 ? "F5FAFC" : white } }, alignment: { horizontal: col === 0 || col >= 4 ? "right" : "center", vertical: "center", readingOrder: 2 }, border: { bottom: { style: "thin", color: { rgb: border } } }, numFmt: col === 1 ? '#,##0 "ر.س"' : col === 3 ? "yyyy/mm/dd" : undefined };
      }
      XLSX.utils.book_append_sheet(workbook, summary, "الملخص");
      XLSX.utils.book_append_sheet(workbook, details, "التفاصيل");
      XLSX.writeFile(workbook, `تقرير-اشتراكات-AAIT-${from || "كامل"}-${to || "الحالي"}.xlsx`, { compression: true });
      toast.success("تم إنشاء ملف Excel الاحترافي");
    } catch { toast.error("تعذر إنشاء ملف Excel، حاول مرة أخرى"); }
    finally { setExporting(null); }
  };
  const exportPdf = async () => {
    if (!filteredItems.length) return toast.error("لا توجد بيانات مطابقة لتصديرها");
    setExporting("pdf");
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const fontBuffer = await fetch("/fonts/IBMPlexSansArabic-Regular.ttf").then((response) => { if (!response.ok) throw new Error("font"); return response.arrayBuffer(); });
      let binary = ""; const bytes = new Uint8Array(fontBuffer); for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      doc.addFileToVFS("IBMPlexSansArabic-Regular.ttf", btoa(binary));
      doc.addFont("IBMPlexSansArabic-Regular.ttf", "IBMPlexArabic", "normal");
      doc.setFont("IBMPlexArabic");
      doc.setFillColor(16, 45, 62); doc.rect(0, 0, 297, 36, "F");
      doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.text("تقرير الاشتراكات والخدمات", 282, 15, { align: "right" });
      doc.setFontSize(9); doc.setTextColor(189, 220, 232); doc.text(`AAIT  |  الفترة: ${reportPeriod}`, 282, 25, { align: "right" });
      const cards = [{ x: 15, title: "متوسط الاشتراك", value: formatSAR(average) }, { x: 106, title: "عدد الاشتراكات", value: String(filteredItems.length) }, { x: 197, title: "الإنفاق السنوي المتوقع", value: formatSAR(annual) }];
      cards.forEach((card) => { doc.setFillColor(239, 249, 252); doc.roundedRect(card.x, 43, 85, 24, 3, 3, "F"); doc.setTextColor(91, 116, 129); doc.setFontSize(8); doc.text(card.title, card.x + 78, 51, { align: "right" }); doc.setTextColor(16, 45, 62); doc.setFontSize(14); doc.text(card.value, card.x + 78, 61, { align: "right" }); });
      autoTable(doc, {
        startY: 75,
        head: [["المستفيد", "قائد الفريق", "الحالة", "تاريخ انتهاء الاشتراك", "الدورة", "التكلفة", "الخدمة"]],
        body: filteredItems.map((item) => [item.beneficiaryName ?? "-", item.teamLeadName ?? "-", statusLabel(item.status), item.renewal, item.cycle, formatSAR(item.price), item.name]),
        styles: { font: "IBMPlexArabic", fontSize: 8.5, halign: "right", valign: "middle", cellPadding: 3.5, textColor: [39, 63, 76], lineColor: [220, 232, 237], lineWidth: { bottom: .15 } },
        headStyles: { fillColor: [32, 183, 223], textColor: 255, fontStyle: "normal", halign: "right", minCellHeight: 10 },
        alternateRowStyles: { fillColor: [247, 251, 252] },
        margin: { left: 15, right: 15, bottom: 16 },
        didDrawPage: ({ pageNumber }) => { doc.setFont("IBMPlexArabic"); doc.setFontSize(7.5); doc.setTextColor(117, 137, 148); doc.text(`صفحة ${pageNumber}`, 15, 202); doc.text(`صدر في ${new Date().toLocaleDateString("en-CA").replaceAll("-", "/")}`, 282, 202, { align: "right" }); },
      });
      doc.save(`تقرير-اشتراكات-AAIT-${from || "كامل"}-${to || "الحالي"}.pdf`);
      toast.success("تم تنزيل تقرير PDF بنجاح");
    } catch { toast.error("تعذر إنشاء PDF. تحقق من الاتصال ثم حاول مجددًا"); }
    finally { setExporting(null); }
  };
  return (
    <>
      <PageTitle
        title="التقارير المالية"
        subtitle="استكشف التكاليف والتجديدات واتخذ القرار من بيانات واضحة"
        action={
          <DropdownMenu.Root dir="rtl">
            <DropdownMenu.Trigger asChild><button className="btn primary report-export-trigger" disabled={Boolean(exporting)}><Download /> {exporting ? "جارٍ تجهيز التقرير..." : "تصدير التقرير"}<ChevronDown /></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content className="export-menu" align="end" sideOffset={8}>
              <div className="export-menu-head"><strong>تصدير {filteredItems.length} اشتراك</strong><small>{reportPeriod}</small></div>
              <DropdownMenu.Item onSelect={() => void exportExcel()}><FileSpreadsheet /><span><strong>ملف Excel</strong><small>جداول منسقة وقابلة للتحليل</small></span></DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => void exportPdf()}><FileText /><span><strong>ملف PDF</strong><small>تقرير عربي جاهز للمشاركة</small></span></DropdownMenu.Item>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
        }
      />
      <section className="panel report-filters">
        <div className="filter-heading"><div className="filter-heading-icon"><Filter /></div><div><h2>نطاق التقرير</h2><p>اختر نطاقًا سريعًا أو خصص البيانات بدقة.</p></div><span><AnimatedNumber value={filteredItems.length} /> نتيجة</span></div>
        <div className="report-presets" aria-label="فترات جاهزة">
          <button type="button" className={cn(activePreset === "month" && "selected")} aria-pressed={activePreset === "month"} onClick={() => applyPeriod("month")}><CalendarDays /> هذا الشهر</button>
          <button type="button" className={cn(activePreset === "quarter" && "selected")} aria-pressed={activePreset === "quarter"} onClick={() => applyPeriod("quarter")}><TrendingUp /> الأشهر 3 القادمة</button>
          <button type="button" className={cn(activePreset === "year" && "selected")} aria-pressed={activePreset === "year"} onClick={() => applyPeriod("year")}><Activity /> هذا العام</button>
          <button type="button" className={cn("urgent", activePreset === "urgent" && "selected")} aria-pressed={activePreset === "urgent"} onClick={() => applyPeriod("urgent")}><Clock3 /> ينتهي خلال 3 أيام</button>
        </div>
        <div className="filter-fields report-filter-fields basic">
          <label><span>بحث شامل</span><div className="filter-control"><Search /><input value={detailSearch} onChange={(event) => { setDetailSearch(event.target.value); setPage(1); }} placeholder="الخدمة، قائد الفريق، المستفيد..." /></div></label>
          <label><span>من تاريخ</span><div className="filter-control"><CalendarDays /><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setActivePreset(null); setPage(1); }} dir="ltr" /></div></label>
          <label><span>إلى تاريخ</span><div className="filter-control"><CalendarDays /><input type="date" value={to} onChange={(event) => { setTo(event.target.value); setActivePreset(null); setPage(1); }} dir="ltr" /></div></label>
          <label><span>الحالة</span><div className="filter-control"><Filter /><select value={detailStatus} onChange={(event) => { setDetailStatus(event.target.value); setActivePreset(null); setPage(1); }}><option value="الكل">كل الحالات</option><option>نشط</option><option>قارب على الانتهاء</option><option value="منتهٍ">اشتراك منتهي</option><option>ملغى</option></select></div></label>
        </div>
        <button className={cn("advanced-filter-toggle", advancedOpen && "active")} type="button" onClick={() => setAdvancedOpen((current) => !current)} aria-expanded={advancedOpen}><SlidersHorizontal /> فلاتر متقدمة {hasDetailedFilters ? <b>مفعّلة</b> : null}<ChevronDown /></button>
        {advancedOpen ? <div className="advanced-filter-panel">
          <div className="filter-fields report-filter-fields advanced">
            <label><span>دورة الفوترة</span><div className="filter-control"><RefreshCw /><select value={detailCycle} onChange={(event) => { setDetailCycle(event.target.value); setPage(1); }}><option value="الكل">كل الدورات</option>{availableCycles.map((cycle) => <option key={cycle}>{cycle}</option>)}</select></div></label>
            <label><span>قائد الفريق</span><div className="filter-control"><Users /><select value={detailTeamLead} onChange={(event) => { setDetailTeamLead(event.target.value); setPage(1); }}><option value="الكل">كل قادة الفرق</option>{availableTeamLeads.map((name) => <option key={name}>{name}</option>)}</select></div></label>
            <label><span>المستفيد</span><div className="filter-control"><Users /><select value={detailBeneficiary} onChange={(event) => { setDetailBeneficiary(event.target.value); setPage(1); }}><option value="الكل">كل المستفيدين</option>{availableBeneficiaries.map((name) => <option key={name}>{name}</option>)}</select></div></label>
            <label><span>أقل تكلفة</span><div className="filter-control"><CircleDollarSign /><input type="number" min="0" value={minimumPrice} onChange={(event) => { setMinimumPrice(event.target.value); setPage(1); }} placeholder="0" dir="ltr" /></div></label>
            <label><span>أعلى تكلفة</span><div className="filter-control"><CircleDollarSign /><input type="number" min="0" value={maximumPrice} onChange={(event) => { setMaximumPrice(event.target.value); setPage(1); }} placeholder="بدون حد" dir="ltr" /></div></label>
          </div>
          <div className="filter-section-label"><span>الخدمات المشمولة</span><button type="button" onClick={() => { setSelectedServices([]); setPage(1); }} disabled={!selectedServices.length}>عرض الكل</button></div>
          <div className="service-filter-list">{availableServices.map((service) => <label key={service} className={selectedServices.includes(service) ? "selected" : ""}><input type="checkbox" checked={selectedServices.includes(service)} onChange={(event) => { setSelectedServices((current) => event.target.checked ? [...current, service] : current.filter((value) => value !== service)); setPage(1); }} /><span className="filter-check"><Check /></span><span>{service}</span></label>)}</div>
        </div> : null}
        {hasAnyFilters ? <div className="active-filter-bar"><span>الفلاتر النشطة</span><div>
          {detailSearch ? <button onClick={() => setDetailSearch("")}>بحث: {detailSearch}<X /></button> : null}
          {from ? <button onClick={() => { setFrom(""); setActivePreset(null); }}>من {from}<X /></button> : null}
          {to ? <button onClick={() => { setTo(""); setActivePreset(null); }}>إلى {to}<X /></button> : null}
          {detailStatus !== "الكل" ? <button onClick={() => { setDetailStatus("الكل"); setActivePreset(null); }}>{statusLabel(detailStatus as Status)}<X /></button> : null}
          {detailCycle !== "الكل" ? <button onClick={() => setDetailCycle("الكل")}>{detailCycle}<X /></button> : null}
          {detailTeamLead !== "الكل" ? <button onClick={() => setDetailTeamLead("الكل")}>القائد: {detailTeamLead}<X /></button> : null}
          {detailBeneficiary !== "الكل" ? <button onClick={() => setDetailBeneficiary("الكل")}>المستفيد: {detailBeneficiary}<X /></button> : null}
          {selectedServices.map((service) => <button key={service} onClick={() => setSelectedServices((current) => current.filter((value) => value !== service))}>{service}<X /></button>)}
          {(minimumPrice || maximumPrice) ? <button onClick={() => { setMinimumPrice(""); setMaximumPrice(""); }}>التكلفة {minimumPrice || "0"}–{maximumPrice || "∞"}<X /></button> : null}
        </div><button className="clear-all-filters" type="button" onClick={clearAllFilters}>مسح الكل</button></div> : null}
      </section>
      <section className="panel report-details">
        <div className="panel-head">
          <div>
            <h2>تفاصيل الاشتراكات</h2>
            <p>رتّب النتائج واضغط على أي صف لعرض التفاصيل الكاملة.</p>
          </div>
          <div className="table-head-actions"><label>عرض <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option>10</option><option>25</option><option>50</option></select></label><span className="result-count"><AnimatedNumber value={filteredItems.length} /> اشتراك</span></div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th><ReportSortButton label="الخدمة" field="name" activeField={sortField} direction={sortDirection} onSort={sortReport} /></th><th><ReportSortButton label="التكلفة" field="price" activeField={sortField} direction={sortDirection} onSort={sortReport} /></th><th><ReportSortButton label="الدورة" field="cycle" activeField={sortField} direction={sortDirection} onSort={sortReport} /></th><th><ReportSortButton label="تاريخ الانتهاء" field="renewal" activeField={sortField} direction={sortDirection} onSort={sortReport} /></th><th><ReportSortButton label="الحالة" field="status" activeField={sortField} direction={sortDirection} onSort={sortReport} /></th><th><ReportSortButton label="قائد الفريق" field="teamLead" activeField={sortField} direction={sortDirection} onSort={sortReport} /></th><th><ReportSortButton label="المستفيد" field="beneficiary" activeField={sortField} direction={sortDirection} onSort={sortReport} /></th></tr></thead>
            <tbody>
              {visibleItems.map((item, index) => <tr key={item.id} style={{ "--row-index": index } as React.CSSProperties} className={item.status === "منتهٍ" ? "expired-row" : undefined} role="button" tabIndex={0} onClick={() => setSelectedDetail(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedDetail(item); }}><td><div className="table-service"><ServiceLogo name={item.name} fallback={item.short} color={item.color} compact /><strong>{item.name}</strong></div></td><td>{formatSAR(item.price)}</td><td>{item.cycle}</td><td dir="ltr">{item.renewal}</td><td><span className={cn("table-status", item.status === "منتهٍ" && "expired", item.status === "قارب على الانتهاء" && "near")}>{statusLabel(item.status)}</span></td><td>{item.teamLeadName ?? "—"}</td><td>{item.beneficiaryName ?? "—"}</td></tr>)}
              {!filteredItems.length && <tr><td colSpan={7} className="table-empty"><div className="report-empty-state"><Filter /><strong>لا توجد نتائج مطابقة</strong><span>جرّب تعديل الفترة أو إزالة بعض الفلاتر.</span><button type="button" className="btn secondary compact" onClick={clearAllFilters}>مسح الفلاتر</button></div></td></tr>}
            </tbody>
          </table>
        </div>
        {filteredItems.length > pageSize ? <nav className="pagination report-pagination" aria-label="صفحات تفاصيل الاشتراكات"><button className="btn secondary compact" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>السابق</button><span>صفحة {safePage} من {pages}</span><button className="btn secondary compact" disabled={safePage === pages} onClick={() => setPage((current) => Math.min(pages, current + 1))}>التالي</button></nav> : null}
      </section>
      <section className="report-insights" aria-label="أهم ملاحظات التقرير">
        <article><span className="insight-icon high"><TrendingUp /></span><div><small>أعلى اشتراك تكلفة</small><strong>{highestCost ? highestCost.name : "—"}</strong><p>{highestCost ? formatSAR(highestCost.price) : "لا توجد بيانات"}</p></div></article>
        <article><span className="insight-icon near"><Clock3 /></span><div><small>أقرب تاريخ انتهاء</small><strong>{nearestExpiry ? nearestExpiry.name : "—"}</strong><p>{nearestExpiry ? (nearestExpiry.days === 0 ? "ينتهي اليوم" : `متبقي ${nearestExpiry.days} أيام`) : "لا توجد تجديدات قريبة"}</p></div></article>
        <article><span className="insight-icon month"><CircleDollarSign /></span><div><small>مطلوب خلال هذا الشهر</small><strong><AnimatedNumber value={Math.round(renewalThisMonth)} formatter={formatSAR} /></strong><p>قيمة الاشتراكات المستحقة</p></div></article>
      </section>
      <section className="metrics-grid">
        <Metric
          icon={CircleDollarSign}
          title="الإنفاق السنوي المتوقع"
          value={<AnimatedNumber value={annual} formatter={formatSAR} />}
          trend="تقدير سنوي حسب الاشتراكات الحالية"
          tone="green"
        />
        <Metric
          icon={WalletCards}
          title="متوسط التكلفة الشهرية المتكررة"
          value={<AnimatedNumber value={average} formatter={formatSAR} />}
          trend="لا يشمل المشتريات لمرة واحدة"
        />
        <Metric
          icon={Activity}
          title="حالات الاشتراكات"
          value={<AnimatedNumber value={filteredItems.length} />}
          trend={`نشط ${activeCount} · قريب ${nearCount} · منتهٍ ${expiredCount} · ملغى ${canceledCount}`}
          tone="orange"
        />
      </section>
      <section className="report-analytics-grid">
        <article className="panel report-chart service-cost-panel"><div className="panel-head"><div><h2>تكلفة الخدمات شهريًا</h2><p>الاشتراكات الدورية فقط، مرتبة حسب التكلفة الشهرية المعادلة</p></div></div>{costByService.length ? <div className="service-cost-ranking">{costByService.map((item, index) => { const maximum = costByService[0]?.value || 1; return <div className="service-cost-row" key={item.name} style={{ "--rank-index": index } as React.CSSProperties}><div className="service-cost-meta"><strong title={item.name}>{item.name}</strong><span>{formatSAR(item.value)}</span></div><div className="service-cost-track" aria-label={`${item.name}: ${formatSAR(item.value)}`}><span style={{ width: `${Math.max(5, (item.value / maximum) * 100)}%` }} /></div></div>; })}</div> : <div className="chart-empty"><Activity /><strong>لا توجد تكاليف دورية</strong><span>المشتريات لمرة واحدة لا تدخل في التكلفة الشهرية.</span></div>}</article>
        <article className="panel report-chart"><div className="panel-head"><div><h2>التجديدات القادمة</h2><p>المبالغ المستحقة خلال الأشهر الستة المقبلة</p></div></div><ResponsiveContainer width="100%" height={300}><BarChart data={renewalForecast}><CartesianGrid vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis hide /><Tooltip formatter={(value) => formatSAR(Number(value))} /><Bar dataKey="value" fill="#7357ff" radius={[8, 8, 0, 0]} maxBarSize={42} animationDuration={520} /></BarChart></ResponsiveContainer></article>
      </section>
      <Dialog.Root open={Boolean(selectedDetail)} onOpenChange={(open) => !open && setSelectedDetail(null)}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="report-detail-drawer" dir="rtl">
          <div className="drawer-service"><ServiceLogo name={selectedDetail?.name ?? ""} fallback={selectedDetail?.short} color={selectedDetail?.color} /><div><Dialog.Title>{selectedDetail?.name}</Dialog.Title><Dialog.Description>تفاصيل الاشتراك ضمن التقرير الحالي</Dialog.Description></div><StatusBadge status={selectedDetail?.status ?? "نشط"} /></div>
          <div className="drawer-highlight"><span>التكلفة</span><strong>{formatSAR(selectedDetail?.price ?? 0)}</strong><small>{selectedDetail?.cycle}</small></div>
          <dl className="drawer-details"><div><dt>تاريخ انتهاء الاشتراك</dt><dd dir="ltr">{selectedDetail?.renewal}</dd></div><div><dt>قائد الفريق</dt><dd>{selectedDetail?.teamLeadName ?? "غير محدد"}</dd></div><div><dt>المستفيد</dt><dd>{selectedDetail?.beneficiaryName ?? "غير محدد"}</dd></div><div><dt>التصنيف</dt><dd>{selectedDetail?.category ?? "غير مصنف"}</dd></div><div><dt>الباقة</dt><dd>{selectedDetail?.requestedPlan ?? "غير محددة"}</dd></div><div><dt>التكلفة الشهرية المعادلة</dt><dd>{selectedDetail ? isOneTimeCycle(selectedDetail.cycle) ? "غير دوري" : formatSAR(Math.round(monthlyEquivalent(selectedDetail))) : "—"}</dd></div></dl>
          <Dialog.Close className="dialog-close" aria-label="إغلاق"><X /></Dialog.Close>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
function UserRoleEditor({
  user,
  roles,
  onSave,
  onGrantOwner,
  canGrantOwner,
}: {
  user: UserProfile;
  roles: { id: string; name: string }[];
  onSave: (uid: string, roleIds: string[]) => Promise<void>;
  onGrantOwner: (user: UserProfile) => void;
  canGrantOwner: boolean;
}) {
  const [selectedRoles, setSelectedRoles] = useState(user.roles ?? []);
  const [saving, setSaving] = useState(false);
  const changed = selectedRoles.join("|") !== (user.roles ?? []).join("|");
  return (
    <div className={cn("user-role-row", user.is_owner && "protected-user")}>
      <div className="user-role-identity">
        <span className="avatar small">{user.name.slice(0, 1)}</span>
        <span>
          <strong>{user.name}</strong>
          <small>{user.email}</small>
        </span>
      </div>
      {user.is_owner ? (
        <span className="protected-badge"><ShieldCheck /> مالك النظام · صلاحيات كاملة ومحميّة</span>
      ) : (
        <div className="role-assignment">
          <div className="role-checks">
            {roles.map((role) => (
              <label key={role.id} className={cn(selectedRoles.includes(role.id) && "selected")}>
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(role.id)}
                  onChange={(event) => setSelectedRoles((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))}
                />
                {role.name}
              </label>
            ))}
            {!roles.length && <small>أنشئ دورًا إداريًا أولًا لمنح هذا الموظف صلاحيات إضافية.</small>}
          </div>
          <button
            className="btn secondary compact"
            disabled={!changed || saving}
            onClick={async () => {
              setSaving(true);
              try { await onSave(user.uid, selectedRoles); }
              finally { setSaving(false); }
            }}
          >
            {saving ? "جارٍ الحفظ..." : "حفظ الصلاحيات"}
          </button>
          {canGrantOwner && (
            <button className="btn owner compact" type="button" onClick={() => onGrantOwner(user)}>
              <Crown /> منح صلاحية مالك
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RolesView({ canGrantOwner, canDeleteUsers }: { canGrantOwner: boolean; canDeleteUsers: boolean }) {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<"roles" | "members">("roles");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [ownerTarget, setOwnerTarget] = useState<UserProfile | null>(null);
  const [userDeleteTarget, setUserDeleteTarget] = useState<UserProfile | null>(null);
  const { data: roleData = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
    enabled: firebaseReady,
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
    enabled: firebaseReady,
  });
  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name || !selected.length)
      return toast.error("أدخل اسم الدور واختر صلاحية واحدة على الأقل");
    setCreating(true);
    try {
      await saveRole(name, selected);
      setSelected([]);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("تم إنشاء الدور");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء الدور");
    } finally {
      setCreating(false);
    }
  };
  const assign = async (uid: string, roleIds: string[]) => {
    try {
      await assignRoles(uid, roleIds);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("تم إسناد الأدوار والصلاحيات");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الإسناد");
    }
  };
  const normalizedSearch = employeeSearch.trim().toLowerCase();
  const visibleUsers = users.filter((user) =>
    !normalizedSearch || `${user.name} ${user.email}`.toLowerCase().includes(normalizedSearch),
  );
  return (
    <>
      <PageTitle
        title="الأدوار والصلاحيات"
        subtitle="كل مستخدم جديد موظف تلقائيًا، ولا يحصل على الإدارة إلا بدور تمنحه أنت"
        action={
          <div className="section-switcher" role="tablist" aria-label="أقسام الصلاحيات">
            <button type="button" role="tab" aria-selected={activeSection === "roles"} className={activeSection === "roles" ? "active" : ""} onClick={() => setActiveSection("roles")}><ShieldCheck /> الأدوار</button>
            <button type="button" role="tab" aria-selected={activeSection === "members"} className={activeSection === "members" ? "active" : ""} onClick={() => setActiveSection("members")}><Users /> الأعضاء</button>
          </div>
        }
      />
      {activeSection === "roles" ? <>
      <div className="roles-grid">
        {roleData.map((role, i) => (
          <article className="role-card" key={role.id}>
            <div
              className="role-icon"
              style={{
                background: colors[i % colors.length] + "22",
                color: colors[i % colors.length],
              }}
            >
              <ShieldCheck />
            </div>
            <h3>{role.name}</h3>
            <p>
              {users.filter((u) => u.roles?.includes(role.id)).length} أعضاء ·{" "}
              {role.permissions.length} صلاحيات
            </p>
            <div className="permission-bar">
              <span
                style={{
                  width: `${(role.permissions.length / ALL_PERMISSIONS.length) * 100}%`,
                  background: colors[i % colors.length],
                }}
              />
            </div>
            {role.protected && <small>دور محمي</small>}
            {!role.protected && (
              <button className="role-delete" type="button" onClick={() => setDeleteTarget(role)}>
                <Trash2 /> حذف الدور
              </button>
            )}
          </article>
        ))}
      </div>
      <section className="panel permission-panel">
        <div className="panel-head">
          <div>
            <h2>إنشاء دور مخصص</h2>
            <p>اختر الصلاحيات الذرية المطلوبة</p>
          </div>
        </div>
        <form className="role-form" onSubmit={create}>
          <input name="name" placeholder="اسم الدور" />
          <div className="permission-select-actions">
            <span>{selected.length} من {ALL_PERMISSIONS.length} محددة</span>
            <button
              type="button"
              onClick={() => setSelected(selected.length === ALL_PERMISSIONS.length ? [] : [...ALL_PERMISSIONS])}
            >
              {selected.length === ALL_PERMISSIONS.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
            </button>
          </div>
          <div className="permission-list">
            {ALL_PERMISSIONS.map((permission) => (
              <label key={permission}>
                <input
                  type="checkbox"
                  checked={selected.includes(permission)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, permission]
                        : s.filter((x) => x !== permission),
                    )
                  }
                />
                {permissionLabels[permission]}
              </label>
            ))}
          </div>
          <button className="btn primary" type="submit" disabled={creating}>
            <Plus size={17} /> {creating ? "جارٍ الإنشاء..." : "إنشاء الدور"}
          </button>
        </form>
      </section>
      </> :
      <section className="panel permission-panel">
        <div className="panel-head">
          <div>
            <h2>إسناد الأدوار</h2>
            <p>يمكن اختيار دور واحد أو عدة أدوار لكل موظف</p>
          </div>
        </div>
        <div className="permission-callout"><Users /> الحسابات الجديدة تبدأ كموظفين بلا وصول إداري. اختر الأدوار الإدارية هنا فقط عند الحاجة.</div>
        <label className="employee-role-search">
          <Search />
          <input
            value={employeeSearch}
            onChange={(event) => setEmployeeSearch(event.target.value)}
            placeholder="ابحث باسم الموظف أو البريد الإلكتروني"
          />
          {employeeSearch && <button type="button" onClick={() => setEmployeeSearch("")} aria-label="مسح البحث"><X /></button>}
        </label>
        {visibleUsers.map((user) => <div className="user-role-actions" key={`${user.uid}:${(user.roles ?? []).join(",")}`}>
          <UserRoleEditor user={user} roles={roleData.filter((role) => !role.protected)} onSave={assign} onGrantOwner={setOwnerTarget} canGrantOwner={canGrantOwner} />
          {canDeleteUsers && <button className="btn danger compact" type="button" onClick={() => setUserDeleteTarget(user)}><Trash2 /> حذف الحساب</button>}
        </div>)}
        {!visibleUsers.length && <div className="inline-empty">لا يوجد موظف مطابق لبحثك.</div>}
      </section>
      }
      <ConfirmDialog
        open={Boolean(userDeleteTarget)}
        title="حذف حساب المستخدم؟"
        description={`سيُحذف حساب «${userDeleteTarget?.name ?? ""}» نهائيًا، بما في ذلك إمكانية تسجيل الدخول. هذا الإجراء مخصص للسوبر أدمن فقط.`}
        confirmLabel="حذف الحساب نهائيًا"
        danger
        onOpenChange={(open) => !open && setUserDeleteTarget(null)}
        onConfirm={async () => { if (!userDeleteTarget) return; await deleteUser(userDeleteTarget.uid); await queryClient.invalidateQueries({ queryKey: ["users"] }); toast.success("تم حذف الحساب"); }}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="حذف الدور المخصص؟"
        description={`سيُحذف دور «${deleteTarget?.name ?? ""}» من جميع الموظفين المرتبطين به، وستُعاد مزامنة صلاحياتهم تلقائيًا.`}
        confirmLabel="حذف الدور"
        danger
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteRole(deleteTarget.id);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["roles"] }),
            queryClient.invalidateQueries({ queryKey: ["users"] }),
          ]);
          toast.success("تم حذف الدور وتحديث صلاحيات الموظفين");
        }}
      />
      <ConfirmDialog
        open={Boolean(ownerTarget)}
        title="منح صلاحية مالك النظام؟"
        description={`سيحصل ${ownerTarget?.name ?? "المستخدم"} على جميع الصلاحيات الإدارية الكاملة، وسيصبح حسابه محميًا من تعديل الأدوار.`}
        confirmLabel="تأكيد منحه صلاحية المالك"
        onOpenChange={(open) => !open && setOwnerTarget(null)}
        onConfirm={async () => {
          if (!ownerTarget) return;
          await grantSystemOwner(ownerTarget.uid);
          await queryClient.invalidateQueries({ queryKey: ["users"] });
          toast.success("تم منح المستخدم صلاحية مالك النظام");
        }}
      />
    </>
  );
}
function AuditView() {
  const [queryText, setQueryText] = useState("");
  const [actionFilter, setActionFilter] = useState("الكل");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const { data: events = [] } = useQuery({
    queryKey: ["audit"],
    queryFn: listAuditLogs,
    enabled: firebaseReady,
  });
  const knownEntityNames = new Map<string, string>();
  events.forEach((event) => {
    const detailsContainName = ["إضافة اشتراك", "حذف اشتراك", "إنشاء دور", "حذف دور", "موافقة على طلب", "موافقة على تجديد"].includes(event.action);
    const candidate = event.entity_name || (detailsContainName ? event.details : undefined);
    if (candidate && !candidate.includes(",") && candidate !== event.entity_id)
      knownEntityNames.set(event.entity_id, candidate);
  });
  const actions = ["الكل", ...new Set(events.map((event) => event.action))];
  const filteredEvents = events.filter((event) => {
    const text = `${event.action} ${event.entity_name ?? ""} ${event.actor_name ?? ""} ${event.summary ?? ""}`.toLowerCase();
    const date = event.created_at?.toDate().toISOString().slice(0, 10) ?? "";
    return (actionFilter === "الكل" || event.action === actionFilter) && (!queryText || text.includes(queryText.toLowerCase())) && (!from || date >= from) && (!to || date <= to);
  });
  const pages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const visibleEvents = filteredEvents.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);
  const actionPresentation = (action: string) => {
    if (action.includes("حذف")) return { icon: Trash2, tone: "danger", label: action.replace("بيانات اعتماد", "بيانات الدخول") };
    if (action.includes("إظهار") || action.includes("عرض")) return { icon: Eye, tone: "warning", label: "عرض بيانات الدخول" };
    if (action.includes("حفظ بيانات") || action.includes("تحديث بيانات")) return { icon: LockKeyhole, tone: "violet", label: "تحديث بيانات الدخول" };
    if (action.includes("موافقة")) return { icon: Check, tone: "success", label: action };
    if (action.includes("رفض")) return { icon: X, tone: "danger", label: action };
    if (action.includes("دور") || action.includes("مالك") || action.includes("إسناد")) return { icon: ShieldCheck, tone: "violet", label: action };
    if (action.includes("تعديل") || action.includes("تجديد")) return { icon: RefreshCw, tone: "warning", label: action };
    return { icon: Plus, tone: "success", label: action };
  };
  return (
    <>
      <PageTitle
        title="سجل التحركات"
        subtitle="تفاصيل واضحة لكل إجراء: ماذا حدث، وعلى أي عنصر، ومن نفّذه ومتى"
      />
      <section className="panel audit-filters">
        <div className="filter-heading"><div className="filter-heading-icon"><Filter /></div><div><h2>تصفية السجل</h2><p>اعثر على الإجراء المطلوب بسرعة.</p></div><span>{filteredEvents.length} نتيجة</span></div>
        <div className="filter-fields audit-filter-fields">
          <label className="wide-filter"><span>بحث</span><div className="filter-control"><Search /><input value={queryText} onChange={(event) => { setQueryText(event.target.value); setPage(1); }} placeholder="الخدمة أو المستخدم أو وصف الإجراء" /></div></label>
          <label><span>نوع الإجراء</span><div className="filter-control"><Activity /><select value={actionFilter} onChange={(event) => { setActionFilter(event.target.value); setPage(1); }}>{actions.map((action) => <option key={action}>{action}</option>)}</select></div></label>
          <label><span>من تاريخ</span><div className="filter-control"><CalendarDays /><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} dir="ltr" /></div></label>
          <label><span>إلى تاريخ</span><div className="filter-control"><CalendarDays /><input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} dir="ltr" /></div></label>
        </div>
        <div className="filter-footer"><span>يمكن الجمع بين البحث ونوع الإجراء والفترة الزمنية.</span><button className="clear-filters" onClick={() => { setQueryText(""); setActionFilter("الكل"); setFrom(""); setTo(""); setPage(1); }}><X /> مسح الفلاتر</button></div>
      </section>
      <div className="activity-log">
        {visibleEvents.length ? (
          visibleEvents.map((event) => {
            const presentation = actionPresentation(event.action);
            const Icon = presentation.icon;
            const entityName = event.entity_name || knownEntityNames.get(event.entity_id);
            const createdAt = event.created_at?.toDate();
            return (
              <article className="activity-entry" key={event.id}>
                <div className={cn("activity-icon", presentation.tone)}><Icon /></div>
                <div className="activity-content">
                  <div className="activity-title-row">
                    <h3>{presentation.label}</h3>
                    {event.entity_type && <span className="entity-type">{event.entity_type}</span>}
                  </div>
                  <p className="activity-summary">
                    {event.summary || (entityName ? `تم تنفيذ الإجراء على «${entityName}»` : "تم تنفيذ الإجراء على عنصر لم يعد متاحًا")}
                  </p>
                  <div className="activity-meta">
                    <span><Users /> نفّذها: <strong>{event.actor_name ?? "النظام"}</strong></span>
                    {entityName && <span>العنصر: <strong>{entityName}</strong></span>}
                  </div>
                </div>
                <time>
                  <strong>{formatDate(createdAt)}</strong>
                  <span>{createdAt?.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) ?? ""}</span>
                </time>
              </article>
            );
          })
        ) : (
          <article className="empty-state">لا توجد تحركات مسجلة بعد</article>
        )}
      </div>
      {filteredEvents.length > pageSize && <nav className="pagination" aria-label="صفحات سجل التحركات"><button className="btn secondary compact" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>السابق</button><span>صفحة {Math.min(page, pages)} من {pages}</span><button className="btn secondary compact" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>التالي</button></nav>}
    </>
  );
}
function SubscriptionsView({ permissions }: { permissions: string[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [addOpen, setAddOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: all = subscriptions } = useQuery({
    queryKey: ["all-subscriptions"],
    queryFn: async () =>
      firebaseReady
        ? (await listAllSubscriptions()).map(mapSubscription)
        : subscriptions,
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
    enabled: firebaseReady,
  });
  const shown = all.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) &&
      (statusFilter === "الكل" || item.status === statusFilter),
  );
  return (
    <>
      <PageTitle
        title="الاشتراكات"
        subtitle="تابع جميع خدمات الشركة وتواريخ تجديدها"
        action={
          permissions.includes("manage_subscriptions") ? (
            <button className="btn primary" onClick={() => setAddOpen(true)}>
              <Plus size={17} /> إضافة اشتراك
            </button>
          ) : undefined
        }
      />
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن خدمة..."
          />
        </div>
        <label className="filter-select">
          <span>الحالة</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="الكل">كل الحالات</option>
            <option>نشط</option><option>قارب على الانتهاء</option><option value="منتهٍ">اشتراك منتهي</option><option>ملغى</option>
          </select>
        </label>
      </div>
      <div className="subscriptions-grid full">
        {shown.length ? (
          shown.map((item) => (
            <SubscriptionCard
              key={item.id}
              item={item}
              manage={permissions.includes("manage_subscriptions")}
              canDelete={permissions.includes("delete_subscriptions")}
              canReveal={permissions.includes("reveal_credentials")}
              canStore={permissions.includes("store_credentials")}
              users={users}
              onChanged={() =>
                queryClient.invalidateQueries({
                  queryKey: ["all-subscriptions"],
                })
              }
            />
          ))
        ) : (
          <EmptyState
            icon={WalletCards}
            title={all.length ? "لا توجد نتائج مطابقة" : "لا توجد اشتراكات بعد"}
            description={all.length ? "جرّب تغيير كلمة البحث أو فلتر الحالة." : "أضف أول اشتراك للشركة وحدد الموظفين المستفيدين منه."}
            action={permissions.includes("manage_subscriptions") ? (
              <button className="btn primary" onClick={() => setAddOpen(true)}><Plus size={17} /> إضافة أول اشتراك</button>
            ) : undefined}
          />
        )}
      </div>
      <SubscriptionFormDialog
        open={addOpen}
        users={users}
        onOpenChange={setAddOpen}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["all-subscriptions"] })}
      />
    </>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Gauge;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <article className="empty-state">
      <span className="empty-icon"><Icon /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </article>
  );
}
function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function NewRequestButton() {
  const setRequestOpen = useAppStore((s) => s.setRequestOpen);
  return (
    <Button
      className="btn primary big"
      size="lg"
      onClick={() => setRequestOpen(true)}
    >
      <Plus size={19} /> طلب اشتراك جديد
    </Button>
  );
}
function RequestDialog() {
  const open = useAppStore((s) => s.requestOpen),
    setOpen = useAppStore((s) => s.setRequestOpen);
  const [loading, setLoading] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" dir="rtl">
          <div className="dialog-icon">
            <Plus />
          </div>
          <Dialog.Title>طلب اشتراك جديد</Dialog.Title>
          <Dialog.Description>
            أرسل تفاصيل الخدمة، وسيصل الطلب إلى المسؤول المعتمد.
          </Dialog.Description>
          <form
            key={String(open)}
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setLoading(true);
              try {
                if (firebaseReady)
                  await createSubscriptionRequest({
                    service_name: String(data.get("service")),
                    purpose: String(data.get("purpose")),
                    notes: String(data.get("notes") ?? ""),
                    beneficiaryName: String(data.get("beneficiaryName") ?? "").trim(),
                    requestedPlan: String(data.get("requestedPlan") ?? "").trim(),
                    accountEmail: String(data.get("accountEmail") ?? "").trim(),
                    accountPassword: String(data.get("accountPassword") ?? ""),
                  });
                setOpen(false);
                toast.success("تم إرسال الطلب بنجاح وأصبح قيد المراجعة");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "تعذر إرسال الطلب. تحقق من الاتصال والصلاحيات.");
              } finally {
                setLoading(false);
              }
            }}
          >
            <ServicePicker name="service" label="اسم الخدمة المطلوبة" required />
            <div className="form-grid two-columns">
              <label>نوع الاشتراك أو الباقة <input name="requestedPlan" placeholder="مثال: Team أو Pro" /></label>
              <label>اسم المهندس المستفيد <b>*</b><input name="beneficiaryName" required placeholder="اسم الموظف التابع لفريقك" /></label>
              <label>البريد الإلكتروني المرتبط بالخدمة <input name="accountEmail" type="email" dir="ltr" placeholder="name@company.com" /></label>
            </div>
            <label>
              كلمة المرور المقترحة <span>اختياري</span>
              <input name="accountPassword" type="password" autoComplete="new-password" dir="ltr" placeholder="تحفظ مشفرة ولا تظهر في السجل أو التقارير" />
            </label>
            <label>
              الغاية والفائدة المتوقعة
              <textarea
                name="purpose"
                required
                rows={4}
                placeholder="اشرح كيف ستساعد هذه الخدمة في عملك..."
              />
            </label>
            <label>
              ملاحظات إضافية <span>اختياري</span>
              <textarea name="notes" rows={2} placeholder="أي تفاصيل أخرى" />
            </label>
            <div className="dialog-actions">
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? "جارٍ إرسال الطلب..." : "إرسال الطلب"}
              </button>
              <Dialog.Close className="btn secondary" type="button">
                إلغاء
              </Dialog.Close>
            </div>
          </form>
          <Dialog.Close className="dialog-close" aria-label="إغلاق">
            <X />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RenewalDialog() {
  const target = useAppStore((s) => s.renewalTarget),
    setTarget = useAppStore((s) => s.setRenewalTarget);
  const [id, name = "الاشتراك", previousEnd] = target?.split("|") ?? [];
  const fallback = subscriptions.find((x) => String(x.id) === id);
  const serviceName = name || fallback?.name || "الاشتراك";
  const suggestedPeriod = useMemo(() => {
    const end = previousEnd ? new Date(`${previousEnd}T00:00:00`) : new Date();
    const start = new Date(end); start.setDate(start.getDate() + 1);
    const nextEnd = new Date(start); nextEnd.setMonth(nextEnd.getMonth() + 1); nextEnd.setDate(nextEnd.getDate() - 1);
    return { start: start.toISOString().slice(0, 10), end: nextEnd.toISOString().slice(0, 10) };
  }, [previousEnd]);
  return (
    <Dialog.Root
      open={Boolean(target)}
      onOpenChange={(open) => !open && setTarget(null)}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content renewal-dialog" dir="rtl">
          <div className="dialog-icon">
            <RefreshCw />
          </div>
          <Dialog.Title>طلب تجديد {serviceName}</Dialog.Title>
          <Dialog.Description>
            سيُرسل طلب التجديد للمراجعة دون تغيير الاشتراك قبل اعتماده.
          </Dialog.Description>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              try {
                if (firebaseReady && id)
                  await createRenewalRequest(
                    id,
                    serviceName,
                   String(data.get("notes") ?? ""),
                    suggestedPeriod.start,
                    suggestedPeriod.end,
                  );
                setTarget(null);
                toast.success("تم إرسال طلب التجديد وأصبح قيد المراجعة");
              } catch {
                toast.error("تعذر إرسال طلب التجديد");
              }
            }}
          >
            <div className="renewal-confirm">
              <Check /> أؤكد رغبتي في تجديد هذا الاشتراك
            </div>
            <div className="renewal-period">الفترة المقترحة: <strong dir="ltr">{suggestedPeriod.start.replaceAll("-", "/")} — {suggestedPeriod.end.replaceAll("-", "/")}</strong></div>
            <label>
              ملاحظة إضافية <span>اختياري</span>
              <textarea
                name="notes"
                rows={3}
                placeholder="أضف ملاحظة للمراجع"
              />
            </label>
            <div className="dialog-actions">
              <button className="btn primary" type="submit">
                تأكيد وإرسال
              </button>
              <Dialog.Close className="btn secondary" type="button">
                إلغاء
              </Dialog.Close>
            </div>
          </form>
          <Dialog.Close className="dialog-close" aria-label="إغلاق">
            <X />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Header({
  onMenu,
  profile,
  theme,
  onToggleTheme,
}: {
  onMenu: () => void;
  profile: UserProfile | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    enabled: firebaseReady,
  });
  const unread = items.filter((x) => !x.read).length;
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("aait-notification-sound") !== "off");
  const previousUnread = useRef(unread);
  useEffect(() => {
    if (soundEnabled && unread > previousUnread.current) {
      try {
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = 780;
        gain.gain.setValueAtTime(0.035, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(); oscillator.stop(audio.currentTime + 0.18);
      } catch { /* الصوت اختياري وقد تمنعه المتصفحات قبل تفاعل المستخدم */ }
    }
    previousUnread.current = unread;
  }, [unread, soundEnabled]);
  const toggleSound = () => setSoundEnabled((enabled) => {
    const next = !enabled;
    localStorage.setItem("aait-notification-sound", next ? "on" : "off");
    return next;
  });
  return (
    <header>
      <button className="mobile-menu" onClick={onMenu}>
        <Menu />
      </button>
      <div className="header-context">
        <ShieldCheck size={18} />
        <span><strong>مساحة عمل AAIT</strong><small>إدارة آمنة وموثّقة للاشتراكات</small></span>
      </div>
      <div className="header-actions">
        <button
          className="icon-btn theme-toggle"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
          title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
          <DropdownMenu.Root dir="rtl">
          <DropdownMenu.Trigger asChild>
            <button className="icon-btn bell">
              <Bell />
              {unread > 0 && <b>{unread}</b>}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="notifications" align="end">
              <div className="notifications-head"><h3>الإشعارات {unread ? <small>{unread} جديدة</small> : null}</h3><div><button type="button" className="icon-btn compact-icon" onClick={toggleSound} title={soundEnabled ? "كتم صوت التنبيهات" : "تفعيل صوت التنبيهات"}>{soundEnabled ? <Volume2 /> : <VolumeX />}</button>{unread > 0 && <button type="button" className="icon-btn compact-icon" onClick={async () => { await markAllNotificationsRead(); queryClient.invalidateQueries({ queryKey: ["notifications"] }); }} title="تعليم الكل كمقروء"><CheckCheck /></button>}</div></div>
              {items.length ? (
                [...items].sort((a, b) => Number(b.created_at?.toDate() ?? 0) - Number(a.created_at?.toDate() ?? 0)).slice(0, 8).map((item) => (
                  <DropdownMenu.Item
                    key={item.id}
                    className={cn(!item.read && "unread", item.priority === "high" && "important")}
                    onSelect={async () => {
                      if (!item.read) {
                        await markNotificationRead(item.id);
                        queryClient.invalidateQueries({
                          queryKey: ["notifications"],
                        });
                      }
                      if (item.request_id) useAppStore.getState().setView("requests");
                      else if (item.subscription_id) useAppStore.getState().setView("subscriptions");
                    }}
                  >
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.body}</small>
                    </span>
                  </DropdownMenu.Item>
                ))
              ) : (
                <DropdownMenu.Item disabled>لا توجد إشعارات</DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <DropdownMenu.Root dir="rtl">
          <DropdownMenu.Trigger asChild>
            <button className="user user-button" aria-label="قائمة الحساب">
              <div className="avatar">
                {profile?.photo_url ? <img src={profile.photo_url} alt="" /> : (profile?.name?.slice(0, 1) ?? "م")}
              </div>
              <div>
                <strong>{profile?.name ?? "موظف AAIT"}</strong>
                <span>{profile?.is_owner ? "مالك النظام" : "موظف"}</span>
              </div>
              <ChevronLeft size={15} className="account-chevron" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="account-menu" align="end" sideOffset={8}>
              <div className="account-menu-head">
                <strong>{profile?.name}</strong>
                <span>{profile?.email}</span>
              </div>
              <DropdownMenu.Separator />
              <DropdownMenu.Item className="logout-item" onSelect={() => signOutUser()}>
                <LogOut /> تسجيل الخروج
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
function Sidebar({
  open,
  close,
  permissions,
  isOwner,
  pendingRequestCount,
}: {
  open: boolean;
  close: () => void;
  permissions: string[];
  isOwner: boolean;
  pendingRequestCount: number;
}) {
  const workspace = useAppStore((s) => s.workspace),
    setWorkspace = useAppStore((s) => s.setWorkspace),
    view = useAppStore((s) => s.view),
    setView = useAppStore((s) => s.setView);
  const adminItems = nav.filter(
    (item) =>
      item.id !== "employee" &&
      (Boolean(
        permissionForView[item.id] &&
        permissions.includes(permissionForView[item.id]!),
      ) ||
        (item.id === "requests" && permissions.includes("reject_requests"))),
  );
  const activeWorkspace = isOwner
    ? "admin"
    : adminItems.length
      ? workspace
      : "employee";
  const changeWorkspace = (next: "employee" | "admin") => {
    if (isOwner && next === "employee") return;
    if (next === "admin" && !adminItems.length) return;
    setWorkspace(next);
    setView(next === "employee" ? "employee" : adminItems[0].id);
    close();
  };
  const visibleItems =
    activeWorkspace === "employee"
      ? nav.filter((item) => item.id === "employee")
      : adminItems;
  const renderItem = (item: (typeof nav)[number]) => (
    <button
      key={item.id}
      className={view === item.id ? "active" : ""}
      onClick={() => {
        setView(item.id);
        close();
      }}
    >
      <item.icon size={19} />
      {item.label}
      {item.id === "requests" && pendingRequestCount > 0 && <span className="nav-count" aria-label={`${pendingRequestCount} طلب جديد`}>{pendingRequestCount > 99 ? "99+" : pendingRequestCount}</span>}
    </button>
  );
  return (
    <>
      <aside className={cn(open && "open")}>
        <div className="brand">
          <img src="/aait-logo.svg" alt="AAIT" />
          <div>
            <strong>
              {activeWorkspace === "employee" ? "بوابة الموظف" : "إدارة الاشتراكات"}
            </strong>
            <span>
              {activeWorkspace === "employee" ? "AAIT Employee" : "AAIT Admin"}
            </span>
          </div>
        </div>
        {!isOwner && adminItems.length > 0 && (
          <div
            className="workspace-switch"
            role="group"
            aria-label="تبديل مساحة العمل"
          >
            <button
              className={activeWorkspace === "employee" ? "active" : ""}
              onClick={() => changeWorkspace("employee")}
            >
              <Users size={15} />
              الموظف
            </button>
            <button
              className={activeWorkspace === "admin" ? "active" : ""}
              onClick={() => changeWorkspace("admin")}
            >
              <ShieldCheck size={15} />
              الإدارة
            </button>
          </div>
        )}
        <nav>
          <span className="nav-label">
            {activeWorkspace === "employee" ? "مساحة الموظف" : "لوحة الإدارة"}
          </span>
          {visibleItems.map(renderItem)}
        </nav>
        <div className="sidebar-help">
          <div>
            <ShieldCheck />
          </div>
          <strong>
            {activeWorkspace === "employee" ? "مساحتك الشخصية" : "نظامك محمي"}
          </strong>
          <p>
            {activeWorkspace === "employee"
              ? "طلباتك واشتراكاتك فقط"
              : "الصلاحيات مطبّقة على الواجهة وقاعدة البيانات"}
          </p>
          <span>
            <i /> متصل وآمن
          </span>
        </div>
      </aside>
      {open && <button className="sidebar-overlay" onClick={close} />}
    </>
  );
}
function LoginScreen({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="login-page" dir="rtl">
      <button
        className="login-theme-toggle"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </button>
      <section className="login-card">
        <img src="/aait-logo.svg" alt="شعار AAIT" />
        <span>مساحة عمل AAIT</span>
        <h1>أهلًا بك من جديد</h1>
        <p>سجّل الدخول بحساب الشركة للوصول إلى نظام إدارة الاشتراكات.</p>
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await signInWithGoogle();
            } catch {
              toast.error("تعذر تسجيل الدخول. تحقق من إعدادات Firebase.");
              setLoading(false);
            }
          }}
        >
          <b>G</b>
          {loading ? "جارٍ تسجيل الدخول..." : "المتابعة باستخدام Google"}
        </button>
        <small>
          <ShieldCheck size={14} /> نظام داخلي آمن ومخصص لموظفي الشركة فقط
        </small>
      </section>
    </div>
  );
}
export default function App() {
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("aait-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(!firebaseReady);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const workspace = useAppStore((s) => s.workspace),
    view = useAppStore((s) => s.view);
  useEffect(
    () =>
      firebaseReady
        ? watchAuth(async (user) => {
            setAuthenticated(Boolean(user));
            if (user) {
              try {
                let loadedProfile = await ensureUserProfile();
                if (user.email?.toLowerCase() === "asimesmat1@gmail.com") {
                  loadedProfile = await activateSuperAdmin();
                }
                setProfile(loadedProfile);
              } catch {
                toast.error("تعذر تحميل ملف المستخدم");
              }
            } else setProfile(null);
          })
        : undefined,
    [],
  );
  useEffect(() => {
    if (!firebaseReady || !authenticated) return undefined;
    try {
      return subscribeRealtime((collectionName) => {
        const queryKeys: Record<string, string[]> = {
          subscriptions: ["all-subscriptions", "my-subscriptions"],
          requests: ["all-requests", "my-requests"],
          notifications: ["notifications"],
          audit: ["audit"],
          roles: ["roles"],
          users: ["users"],
        };
        (queryKeys[collectionName] ?? []).forEach((queryKey) => {
          void queryClient.invalidateQueries({ queryKey: [queryKey] });
        });
      });
    } catch {
      return undefined;
    }
  }, [authenticated, queryClient]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#07151e" : "#102a3a",
    );
    localStorage.setItem("aait-theme", theme);
  }, [theme]);
  const permissions = useMemo(
    () =>
      !firebaseReady ? [...ALL_PERMISSIONS] : (profile?.permissions ?? []),
    [profile],
  );
  useEffect(() => {
    if (!firebaseReady || !authenticated || !permissions.includes("view_subscriptions")) return;
    void syncSubscriptionAlerts()
      .then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }))
      .catch(() => undefined);
  }, [authenticated, permissions, queryClient]);
  const canRefreshSubscriptionStatus = permissions.includes("view_subscriptions");
  useEffect(() => {
    if (!firebaseReady || !authenticated || !canRefreshSubscriptionStatus) return;
    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
      timer = setTimeout(() => {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ["all-subscriptions"] }),
          queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] }),
          syncSubscriptionAlerts().then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] })),
        ]).finally(scheduleMidnightRefresh);
      }, Math.max(1000, nextDay.getTime() - now.getTime()));
    };
    scheduleMidnightRefresh();
    return () => clearTimeout(timer);
  }, [authenticated, canRefreshSubscriptionStatus, queryClient]);
  const canSeeRequests = permissions.includes("review_requests") || permissions.includes("reject_requests");
  const { data: sidebarRequests = [] } = useQuery({
    queryKey: ["all-requests"],
    queryFn: async () => (firebaseReady ? (await listAllRequests()).map(mapRequest) : requests),
    enabled: firebaseReady && canSeeRequests,
  });
  const adminViews = useMemo(
    () =>
      nav.filter(
        (item) =>
          item.id !== "employee" &&
          (Boolean(
            permissionForView[item.id] &&
            permissions.includes(permissionForView[item.id]!),
          ) ||
            (item.id === "requests" &&
              permissions.includes("reject_requests"))),
      ),
    [permissions],
  );
  const activeWorkspace = profile?.is_owner
    ? "admin"
    : adminViews.length
      ? workspace
      : "employee";
  const required = permissionForView[view];
  const allowed =
    activeWorkspace === "employee"
      ? view === "employee"
      : view !== "employee" &&
        (Boolean(required && permissions.includes(required)) ||
          (view === "requests" && permissions.includes("reject_requests")));
  const safeView = allowed
    ? view
    : activeWorkspace === "employee"
      ? "employee"
      : (adminViews[0]?.id ?? "employee");
  const content = useMemo(
    () =>
      ({
        employee: <EmployeeDashboard />,
        dashboard: <Dashboard permissions={permissions} />,
        subscriptions: <SubscriptionsView permissions={permissions} />,
        requests: <RequestsView permissions={permissions} />,
        reports: <ReportsView />,
        roles: <RolesView canGrantOwner={Boolean(profile?.is_owner)} canDeleteUsers={profile?.email?.toLowerCase() === "asimesmat1@gmail.com"} />,
        audit: <AuditView />,
      })[safeView],
    [safeView, permissions, profile?.is_owner, profile?.email],
  );
  const toggleTheme = () => setTheme((current) => current === "dark" ? "light" : "dark");
  if (!authenticated) return <LoginScreen theme={theme} onToggleTheme={toggleTheme} />;
  return (
    <div
      className={cn(
        "app-shell",
        activeWorkspace === "admin" ? "admin-workspace" : "employee-workspace",
      )}
      dir="rtl"
    >
      <Sidebar
        open={sidebarOpen}
        close={() => setSidebarOpen(false)}
        permissions={permissions}
        isOwner={Boolean(profile?.is_owner)}
        pendingRequestCount={sidebarRequests.filter((request) => request.status === "قيد المراجعة").length}
      />
      <div className="main-column">
        <Header
          onMenu={() => setSidebarOpen(true)}
          profile={profile}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <main><div className="view-frame" key={`${activeWorkspace}:${safeView}`}>{content}</div></main>
        <footer>
          {activeWorkspace === "employee"
            ? "بوابة موظفي AAIT"
            : "نظام إدارة اشتراكات الشركة"}{" "}
          · AAIT © 2026
        </footer>
      </div>
      <RequestDialog />
      <RenewalDialog />
    </div>
  );
}
