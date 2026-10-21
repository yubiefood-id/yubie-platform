import { createRoot } from "react-dom/client";
import { useEffect, useState, type FormEvent } from "react";
import { Refine, useList, type BaseRecord, type DataProvider, type HttpError, type GetListParams } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminRole } from "../src/rbac.js";
import "./style.css";

type Resource = "orders" | "payments" | "exceptions" | "inventory";
const labels: Record<Resource, string> = { orders: "Orders", payments: "Payments", exceptions: "Payment exceptions", inventory: "Inventory lots" };
const denyWrite = async (): Promise<never> => { throw { message: "This action requires separate approval.", statusCode: 403 } satisfies HttpError; };

const dataProvider: DataProvider = {
  getApiUrl: () => "/v1",
  async getList<TData extends BaseRecord>({ resource, meta }: GetListParams) {
    if (!Object.hasOwn(labels, resource)) throw { message: "Resource unavailable", statusCode: 403 };
    const query = new URLSearchParams({ limit: "20" });
    if (typeof meta?.cursor === "string") query.set("cursor", meta.cursor);
    if (typeof meta?.search === "string") query.set("search", meta.search);
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
  const [message, setMessage] = useState("Preparing staff sign-in…");
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
          } catch { setMessage("Staff sign-in is unavailable. Try again when the service recovers."); }
        } });
        window.google.accounts.id.renderButton(host, { theme: "outline", size: "large", text: "continue_with", locale: "id" });
        setMessage("Use your approved staff account. Customer accounts have no operations access.");
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
  return <main className="login"><div className="wordmark">Yubie</div><h1>Operations sign-in</h1><p role="status">{message}</p><div id="staff-google-button" /><p className="muted">Access is restricted to approved staff.</p></main>;
}

const columns: Record<Resource, Array<[string, string]>> = {
  orders: [["id", "Order"], ["checkoutRef", "Reference"], ["status", "Status"], ["amount", "Total (IDR)"]],
  payments: [["id", "Payment"], ["orderId", "Order"], ["status", "Status"], ["amount", "Amount (IDR)"], ["reconciliationState", "Reconciliation"]],
  exceptions: [["id", "Payment"], ["orderId", "Order"], ["status", "Status"], ["reconciliationState", "Review reason"], ["amount", "Amount (IDR)"]],
  inventory: [["id", "Lot"], ["productId", "Product"], ["sizeId", "Variant"], ["quantity", "Quantity"], ["status", "QA status"], ["expiryDate", "Expiry"]],
};

function ResourceTable({ resource }: { resource: Resource }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<Array<string | null>>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const { query, result } = useList({ resource, pagination: { mode: "off" }, meta: { cursor, search }, queryOptions: { retry: false, refetchOnWindowFocus: false, gcTime: 0 } });
  const next = typeof result.nextCursor === "string" ? result.nextCursor : null;
  const filter = (event: FormEvent) => { event.preventDefault(); setCursor(null); setPrevious([]); setSearch(draft.trim()); };
  return <>
    <header className="page-heading"><div><h1>{labels[resource]}</h1><p>{resource === "exceptions" ? "Verify provider evidence before taking any financial action." : "Live operational records. All reads are audited."}</p></div><button onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh</button></header>
    <form className="search" onSubmit={filter}><label htmlFor="resource-search">Search by record or reference</label><div><input id="resource-search" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={80} /><button type="submit">Search</button></div></form>
    {query.isLoading ? <p role="status">Loading records…</p> : query.isError ? <p role="alert" className="error">{query.error.message}</p> : <>
      <div className="table-scroll" role="region" tabIndex={0} aria-label={`${labels[resource]} records`}><table><caption>{result.data.length} records on this page</caption><thead><tr>{columns[resource].map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead><tbody>{result.data.map((row) => <tr key={String(row.id)}>{columns[resource].map(([key]) => <td key={key}>{key === "amount" ? new Intl.NumberFormat("id-ID").format(Number(row[key])) : String(row[key] ?? "—")}</td>)}</tr>)}</tbody></table></div>
      {!result.data.length && <p role="status">No matching records.</p>}
      <nav className="pagination" aria-label="Record pages"><button disabled={!previous.length} onClick={() => { setCursor(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous</button><span>Page {previous.length + 1}</span><button disabled={!next} onClick={() => { setPrevious([...previous, cursor]); setCursor(next); }}>Next</button></nav>
    </>}
    <aside className="policy-note"><strong>Controlled actions</strong><p>Refunds, inventory adjustments, price changes, and ERP writes require a separately approved workflow. Review payment exceptions with the finance owner.</p></aside>
  </>;
}

function Console({ role, onLogout }: { role: AdminRole; onLogout: () => void }) {
  const client = useQueryClient();
  const [resource, setResource] = useState<Resource>("orders");
  const [logoutError, setLogoutError] = useState(false);
  async function logout() {
    try {
      const config = await (await fetch("/auth/config", { cache: "no-store" })).json();
      const response = await fetch("/auth/logout", { method: "POST", headers: { "x-yubie-csrf": config.data.csrfToken } });
      if (!response.ok) throw new Error("logout unavailable");
      client.clear(); onLogout();
    } catch { setLogoutError(true); }
  }
  const resources = (Object.keys(labels) as Resource[]).filter((name) => role !== "viewer" || name === "orders" || name === "inventory");
  return <div className="workspace"><aside className="sidebar"><div className="wordmark">Yubie</div><p>Operations</p><nav aria-label="Operations">{resources.map((name) => <button key={name} aria-current={resource === name ? "page" : undefined} onClick={() => setResource(name)}>{labels[name]}</button>)}</nav><div className="identity"><span>Role: {role}</span><button onClick={() => void logout()}>Sign out</button></div></aside><main id="main"><ResourceTable key={resource} resource={resource} />{logoutError && <p role="alert">Sign-out could not be confirmed. Close this browser and contact the operator.</p>}</main></div>;
}

function Application() {
  const [role, setRole] = useState<AdminRole | "loading" | "unavailable" | null>("loading");
  // Stable callback prevents the GIS setup from being re-created on status changes.
  const [reloadSession] = useState(() => () => {
    void fetch("/auth/session", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401 || response.status === 403) { setRole(null); return; }
      const payload = await response.json();
      const value = payload?.data?.role;
      setRole(response.ok && ["viewer", "operator", "finance"].includes(value) ? value as AdminRole : "unavailable");
    }).catch(() => setRole("unavailable"));
  });
  useEffect(() => { reloadSession(); }, [reloadSession]);
  if (role === "loading") return <main className="login"><p role="status">Checking staff session…</p></main>;
  if (role === "unavailable") return <main className="login"><h1>Operations unavailable</h1><p role="alert">Staff access could not be verified. No operational data has been loaded.</p><button onClick={reloadSession}>Try again</button></main>;
  if (!role) return <StaffLogin onLogin={reloadSession} />;
  return <Console role={role} onLogout={() => setRole(null)} />;
}

createRoot(document.getElementById("root")!).render(<Refine dataProvider={dataProvider} resources={Object.keys(labels).map((name) => ({ name }))} options={{ disableTelemetry: true }}><Application /></Refine>);
