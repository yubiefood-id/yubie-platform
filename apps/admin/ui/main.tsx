import { createRoot } from "react-dom/client";
import { useEffect, useState, type FormEvent } from "react";
import { Refine, useList, type BaseRecord, type DataProvider, type HttpError, type GetListParams } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import { canOperate, STAFF_ROLES, type StaffRole, type OperationsPermission } from "@yubie/domain";
import { DailyReport, CheckoutFreeze, IntakeForm, ShippingForm, OrderWork, FinanceWork, StaffForm, RequestActions, type Row } from "./operations.js";
import "./style.css";

type Resource = "orders" | "payments" | "exceptions" | "inventory" | "requests" | "shipping" | "fulfillment" | "refunds" | "notes" | "staff" | "audit" | "stock" | "movements" | "cases";
const labels: Record<Resource, string> = { stock: "Ketersediaan SKU", movements: "Ledger stok", cases: "Kasus Finance", orders: "Pesanan", payments: "Pembayaran", exceptions: "Pengecualian pembayaran", inventory: "Lot dan stok", requests: "Persetujuan", shipping: "Pengiriman", fulfillment: "Packing dan resi", refunds: "Refund manual", notes: "Catatan internal", staff: "Hak staf", audit: "Jejak audit" };
const resourcePermissions: Record<Resource, OperationsPermission> = { stock: "inventory:read", movements: "inventory:read", cases: "exceptions:read", orders: "orders:read", payments: "payments:read", exceptions: "exceptions:read", inventory: "inventory:read", requests: "inventory:read", shipping: "shipping:read", fulfillment: "fulfillment:read", refunds: "payments:read", notes: "notes:write", staff: "staff:manage", audit: "audit:read" };
const denyWrite = async (): Promise<never> => { throw { message: "This action requires separate approval.", statusCode: 403 } satisfies HttpError; };

const dataProvider: DataProvider = {
  getApiUrl: () => "/v1",
  async getList<TData extends BaseRecord>({ resource, meta }: GetListParams) {
    if (!Object.hasOwn(labels, resource)) throw { message: "Resource unavailable", statusCode: 403 };
    const query = new URLSearchParams({ limit: "20" });
    if (typeof meta?.cursor === "string") query.set("cursor", meta.cursor);
    if (typeof meta?.search === "string") query.set("search", meta.search);
    if (typeof meta?.status === "string" && meta.status) query.set("status",meta.status);
    const response = await fetch(`/v1/${resource}?${query}`, { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || payload.data?.source !== "reader") throw { message: response.status === 403 ? "Your role cannot read this resource." : "The data source is unavailable. No empty result has been assumed.", statusCode: response.status || 503 };
    const rows = payload.data.orders ?? payload.data.payments ?? payload.data.items;
    if (!Array.isArray(rows)) throw { message: "Invalid data response", statusCode: 503 };
    return { data: rows as TData[], total: rows.length, nextCursor: payload.data.nextCursor as string | null };
  },
  getOne: denyWrite, create: denyWrite, update: denyWrite, deleteOne: denyWrite,
};

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
      renderButton(element: HTMLElement, options: Record<string, unknown>): void;
    } } };
  }
}

function StaffLogin({ onLogin }: { onLogin: () => void }) {
  const [message, setMessage] = useState("Menyiapkan login staf…");
  useEffect(() => {
    const controller = new AbortController();
    let script: HTMLScriptElement | undefined;
    async function load() {
      const response = await fetch("/auth/config", { cache: "no-store", signal: controller.signal });
      const { data } = await response.json();
      if (!data?.googleClientId) { setMessage("Staff identity is not configured. Contact the release operator."); return; }
      const render = () => {
        if (controller.signal.aborted) return;
        const host = document.getElementById("staff-google-button");
        if (!host || !window.google) { setMessage("Staff sign-in could not load. Contact the operator."); return; }
        window.google.accounts.id.initialize({ client_id: data.googleClientId, callback: async ({ credential }) => {
          setMessage("Checking staff access…");
          try {
            const login = await fetch("/auth/google", { method: "POST", headers: { "content-type": "application/json", "x-yubie-csrf": data.csrfToken }, body: JSON.stringify({ credential }) });
            if (login.ok) onLogin(); else setMessage("Staff access was denied. Check your approved account with the operator.");
          } catch { setMessage("Staff sign-in is unavailable. Coba lagi when the service recovers."); }
        } });
        window.google.accounts.id.renderButton(host, { theme: "outline", size: "large", text: "continue_with", locale: "id" });
        setMessage("Gunakan akun staf yang disetujui. Akun pelanggan tidak memiliki akses operasi.");
      };
      if (window.google) render();
      else {
        script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true;
        script.onload = render; script.onerror = () => { if (!controller.signal.aborted) setMessage("Google sign-in could not load. Contact the operator."); };
        document.head.append(script);
      }
    }
    void load().catch(() => { if (!controller.signal.aborted) setMessage("Staff identity is unavailable. Contact the operator."); });
    return () => { controller.abort(); script?.remove(); };
  }, [onLogin]);
  return <main className="login"><div className="wordmark">Yubie</div><h1>Masuk operasi Yubie</h1><p role="status">{message}</p><div id="staff-google-button" /><p className="muted">Akses dibatasi untuk staf yang disetujui.</p></main>;
}

const columns: Record<Resource, Array<[string, string]>> = {
  stock: [["sku","SKU"],["productId","Keluarga"],["sizeId","Varian"],["maxQuantity","Batas jual saat ini"],["status","Kelayakan"]],
  movements: [["occurred_at","Waktu"],["lot_id","Lot"],["product_id","Keluarga"],["size_id","Varian"],["movement_type","Pergerakan"],["quantity_delta","Perubahan"],["order_id","Pesanan"],["reason","Alasan"]],
  cases: [["id","Pembayaran"],["order_id","Pesanan"],["reconciliation_state","Pengecualian ledger"],["case_state","Penanganan"],["version","Versi kasus"],["updated_by","Staf"]],
  requests: [["id","Permintaan"],["kind","Jenis"],["status","Status"],["version","Versi"],["created_by","Pembuat"]],
  shipping: [["id","Persetujuan"],["cities","Kota/kabupaten"],["policy","Kebijakan"],["service_coverage","Layanan"],["starts_at","Mulai"],["ends_at","Berakhir"]],
  fulfillment: [["id","Pesanan"],["stage","Tahap"],["version","Versi"],["carrier","Kurir"],["tracking_number","Resi"],["fulfillment_hold","Hold"]],
  refunds: [["id","Permintaan"],["order_id","Pesanan"],["amount","Jumlah IDR"],["state","Status"],["merchant_reference","Referensi merchant"]],
  notes: [["order_id","Pesanan"],["body","Catatan"],["actor","Staf"],["created_at","Waktu"]],
  staff: [["subject","Google subject"],["role","Peran"],["approval_ref","Persetujuan"],["revoked_at","Dicabut"]],
  audit: [["occurred_at","Waktu"],["actor","Staf"],["action","Tindakan"],["resource_id","Catatan"]],
  orders: [["id", "Order"], ["checkoutRef", "Reference"], ["status", "Status"], ["amount", "Total (IDR)"]],
  payments: [["id", "Payment"], ["orderId", "Order"], ["status", "Status"], ["amount", "Amount (IDR)"], ["reconciliationState", "Reconciliation"]],
  exceptions: [["id", "Payment"], ["orderId", "Order"], ["status", "Status"], ["reconciliationState", "Review reason"], ["amount", "Amount (IDR)"]],
  inventory: [["id", "Lot"], ["productId", "Product"], ["sizeId", "Variant"], ["quantity", "Saldo belum direservasi"], ["availableQuantity", "Dapat dijual"], ["reservedQuantity", "Direservasi"], ["lotCode", "Batch"], ["qcApprovalRef", "Bukti QC"], ["status", "QA status"], ["expiryDate", "Expiry"]],
};

function ResourceTable({ resource, roles }: { resource: Resource; roles: StaffRole[] }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<Array<string | null>>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status,setStatus] = useState("");
  const statuses: Partial<Record<Resource,string[]>> = { orders: ["draft","pending_payment","paid","processing","shipped","completed","cancelled"], payments: ["pending","succeeded","failed","expired","cancelled","refunded"], exceptions: ["pending","succeeded","failed","expired","cancelled","refunded"], inventory: ["received","quarantined","released","recalled","depleted"] };
  const { query, result } = useList({ resource, pagination: { mode: "off" }, meta: { cursor, search, status }, queryOptions: { retry: false, refetchOnWindowFocus: false, gcTime: 0 } });
  const next = typeof result.nextCursor === "string" ? result.nextCursor : null;
  const filter = (event: FormEvent) => { event.preventDefault(); setCursor(null); setPrevious([]); setSearch(draft.trim()); };
  return <>
    <header className="page-heading"><div><h1>{labels[resource]}</h1><p>{resource === "exceptions" ? "Periksa bukti provider sebelum tindakan keuangan." : "Catatan operasional aktual. Akses data diaudit."}</p></div><button onClick={() => void query.refetch()} disabled={query.isFetching}>Muat ulang</button></header>
    {statuses[resource] && <label className="status-filter">Filter status<select value={status} onChange={e=>{setStatus(e.target.value);setCursor(null);setPrevious([]);}}><option value="">Semua status</option>{statuses[resource]!.map(value=><option key={value}>{value}</option>)}</select></label>}
    {resource === "stock" && <p>Multipack memakai stok komponennya. Jangan menjumlahkan kapasitas varian sebagai stok fisik tambahan.</p>}
    <form className="search" onSubmit={filter}><label htmlFor="resource-search">Cari ID atau referensi</label><div><input id="resource-search" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={80} /><button type="submit">Search</button></div></form>
    {query.isLoading ? <p role="status">Memuat catatan…</p> : query.isError ? <p role="alert" className="error">{query.error.message}</p> : <>
      <div className="table-scroll" role="region" tabIndex={0} aria-label={`${labels[resource]} records`}><table><caption>{result.data.length} records on this page</caption><thead><tr>{columns[resource].map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead><tbody>{result.data.map((row) => <tr key={String(row.id)}>{columns[resource].map(([key]) => <td key={key}>{key === "amount" ? new Intl.NumberFormat("id-ID").format(Number(row[key])) : String(row[key] ?? "—")}</td>)}</tr>)}</tbody></table></div>
      {!result.data.length && <p role="status">Tidak ada catatan yang cocok.</p>}
      <nav className="pagination" aria-label="Record pages"><button disabled={!previous.length} onClick={() => { setCursor(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Sebelumnya</button><span>Page {previous.length + 1}</span><button disabled={!next} onClick={() => { setPrevious([...previous, cursor]); setCursor(next); }}>Berikutnya</button></nav>
    </>}
    {resource === "requests" && result.data.map(row => <RequestActions key={String(row.id)} row={row as Row} roles={roles} refresh={() => void query.refetch()} />)}
    {["inventory","shipping"].includes(resource) && canOperate(roles,"inventory:apply") && <CheckoutFreeze />}
    {resource === "inventory" && canOperate(roles,"inventory:propose") && <IntakeForm refresh={() => void query.refetch()} />}
    {resource === "shipping" && canOperate(roles,"shipping:propose") && <ShippingForm refresh={() => void query.refetch()} />}
    {(resource === "orders" || resource === "fulfillment") && <OrderWork roles={roles} />}
    {["payments","exceptions","refunds","cases"].includes(resource) && canOperate(roles,"reconciliation:request") && <FinanceWork refresh={() => void query.refetch()} />}
    {resource === "staff" && <StaffForm refresh={() => void query.refetch()} />}
    <aside className="policy-note" aria-label="Kebijakan tindakan"><strong>Tindakan terkendali</strong><p>Stok dan pengiriman memerlukan persetujuan berbeda. Refund dicatat manual setelah bukti provider; status uang tidak dapat dipaksa dari dashboard.</p></aside>
  </>;
}

function Console({ roles, onLogout }: { roles: StaffRole[]; onLogout: () => void }) {
  const client = useQueryClient();
  const [resource, setResource] = useState<Resource | "overview">("overview");
  const [logoutError, setLogoutError] = useState(false);
  async function logout() {
    try {
      const config = await (await fetch("/auth/config", { cache: "no-store" })).json();
      const response = await fetch("/auth/logout", { method: "POST", headers: { "x-yubie-csrf": config.data.csrfToken } });
      if (!response.ok) throw new Error("logout unavailable");
      client.clear(); onLogout();
    } catch { setLogoutError(true); }
  }
  const resources = (Object.keys(labels) as Resource[]).filter(name => canOperate(roles,resourcePermissions[name]));
  return <div className="workspace"><aside className="sidebar" aria-label="Navigasi dan identitas staf"><div className="wordmark">Yubie</div><p>Operations</p><nav aria-label="Operations"><button aria-current={resource === "overview" ? "page" : undefined} onClick={() => setResource("overview")}>Ringkasan</button>{resources.map((name) => <button key={name} aria-current={resource === name ? "page" : undefined} onClick={() => setResource(name)}>{labels[name]}</button>)}</nav><div className="identity"><span>Peran: {roles.join(", ")}</span><button onClick={() => void logout()}>Keluar</button></div></aside><main id="main">{resource === "overview" ? <DailyReport /> : <ResourceTable key={resource} resource={resource} roles={roles} />}{logoutError && <p role="alert">Sign-out could not be confirmed. Close this browser and contact the operator.</p>}</main></div>;
}

function Application() {
  const [role, setRole] = useState<StaffRole[] | "loading" | "unavailable" | null>("loading");
  // Stable callback prevents the GIS setup from being re-created on status changes.
  const [reloadSession] = useState(() => () => {
    void fetch("/auth/session", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401 || response.status === 403) { setRole(null); return; }
      const payload = await response.json();
      const value: unknown = payload?.data?.roles ?? [payload?.data?.role];
      setRole(response.ok && Array.isArray(value) && value.length > 0 && value.every(item => STAFF_ROLES.includes(item as StaffRole)) ? value as StaffRole[] : "unavailable");
    }).catch(() => setRole("unavailable"));
  });
  useEffect(() => { reloadSession(); }, [reloadSession]);
  if (role === "loading") return <main className="login"><p role="status">Memeriksa sesi staf…</p></main>;
  if (role === "unavailable") return <main className="login"><h1>Operasi belum tersedia</h1><p role="alert">Akses staf belum terverifikasi. Data operasional belum dimuat.</p><button onClick={reloadSession}>Coba lagi</button></main>;
  if (!role) return <StaffLogin onLogin={reloadSession} />;
  return <Console roles={role} onLogout={() => setRole(null)} />;
}

createRoot(document.getElementById("root")!).render(<Refine dataProvider={dataProvider} resources={Object.keys(labels).map((name) => ({ name }))} options={{ disableTelemetry: true }}><Application /></Refine>);
