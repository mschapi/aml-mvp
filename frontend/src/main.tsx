import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Filter,
  LayoutDashboard,
  ListChecks,
  Network,
  Play,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from "lucide-react";
import { request, download, type Row } from "./api";
import "./styles.css";

const nav = [
  ["dashboard", "Resumen", LayoutDashboard],
  ["cases", "Gestion de casos", ListChecks],
  ["entities", "Entidades", Users],
  ["rules", "Motor de alertas", SlidersHorizontal],
  ["screening", "Screening", ShieldCheck],
  ["segments", "Segmentacion", Network],
  ["team", "Equipo y auditoria", Activity],
] as const;
const fmt = (v: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(v);
const stamp = (v: string) => (v ? new Date(v).toLocaleString("es-AR") : "—");
const day = (ago = 0) =>
  new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10);
function Badge({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        (value === "Alto" || value === "Vencido"
          ? "danger"
          : value === "Bajo" || value === "active" || value === "ROS aprobado"
            ? "success"
            : value === "Medio" || value === "pending"
              ? "warning"
              : "")
      }
    >
      {value}
    </span>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({
  text = "Sin resultados para esta seleccion",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <Search size={28} />
      <p>{text}</p>
    </div>
  );
}
function App() {
  const [user, setUser] = useState(localStorage.getItem("aml-user") || "ana");
  const [data, setData] = useState<Row | null>(null),
    [page, setPage] = useState(location.hash.slice(1) || "dashboard"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(""),
    [entityId, setEntityId] = useState(""),
    [q, setQ] = useState("");
  const [business, setBusiness] = useState(""),
    [status, setStatus] = useState(""),
    [risk, setRisk] = useState(""),
    [checked, setChecked] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Row | null>(null),
    [reason, setReason] = useState(""),
    [target, setTarget] = useState(""),
    [text, setText] = useState(""),
    [fields, setFields] = useState<Row>({});
  const [ruleForm, setRuleForm] = useState<Row | null>(null),
    [ruleId, setRuleId] = useState(""),
    [sim, setSim] = useState<Row | null>(null),
    [start, setStart] = useState(day(179)),
    [end, setEnd] = useState(day());
  const [entity, setEntity] = useState<Row | null>(null),
    [compare, setCompare] = useState(""),
    [config, setConfig] = useState<Row | null>(null),
    [notifications, setNotifications] = useState(false),
    [caseTab, setCaseTab] = useState("Resumen");
  async function load() {
    const result = await request("/bootstrap", user);
    setData(result);
    setConfig(result.config);
  }
  useEffect(() => {
    localStorage.setItem("aml-user", user);
    load().catch((e) => setError(e.message));
  }, [user]);
  useEffect(() => {
    const fn = () => setPage(location.hash.slice(1) || "dashboard");
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  useEffect(() => {
    if (entityId) {
      setEntity(null);
      request("/entities/" + entityId, user)
        .then(setEntity)
        .catch((e) => setError(e.message));
    }
  }, [entityId, user]);
  function go(p: string) {
    location.hash = p;
    setPage(p);
    setSelected("");
    setEntityId("");
    setQ("");
    setStatus("");
    setBusiness("");
    setRisk("");
    setChecked([]);
  }
  async function act(
    path: string,
    body: unknown,
    success = "Cambios guardados",
    method = "POST",
  ) {
    setBusy(true);
    setError("");
    try {
      const r = await request(path, user, body, method);
      await load();
      setNotice(success);
      setDialog(null);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  function open(action: string, id = "", extra: Row = {}) {
    setReason("");
    setText("");
    setTarget(extra.target || "");
    setFields({});
    setDialog({ action, id, ...extra });
  }
  async function exportGrid(table: string) {
    try {
      await download(
        "/export/" +
          table +
          "?" +
          new URLSearchParams({ q, business, status, risk }),
        user,
        "aml-" + table + ".xlsx",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const cases: Row[] = data?.cases || [],
    entities: Row[] = data?.entities || [],
    rules: Row[] = data?.rules || [];
  const activeCase = cases.find((c) => c.id === selected),
    current = data?.users.find((u: Row) => u.id === user),
    privileged = current?.role !== "analyst";
  const filtered = cases.filter(
    (c) =>
      (!q || JSON.stringify(c).toLowerCase().includes(q.toLowerCase())) &&
      (!business || c.business === business) &&
      (!status || c.status === status) &&
      (!risk || c.risk === risk),
  );
  const entityRows = entities.filter(
    (e) =>
      (!q || JSON.stringify(e).toLowerCase().includes(q.toLowerCase())) &&
      (!business || e.business === business) &&
      (!risk || e.risk === risk),
  );
  const urgent = cases.filter(
    (c) =>
      c.hours_remaining < 72 &&
      !["Cerrada no inusual", "ROS aprobado"].includes(c.status),
  );
  function filters(caseFilters = true) {
    return (
      <div className="filters">
        <div className="search">
          <Search size={16} />
          <input
            aria-label="Buscar"
            placeholder="Buscar nombre, CUIT, CBU o caso"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          aria-label="Negocio"
          value={business}
          onChange={(e) => setBusiness(e.target.value)}
        >
          <option value="">Todos los negocios</option>
          {data?.businesses.map((b: string) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        {caseFilters && (
          <select
            aria-label="Estado"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {data?.states.map((s: string) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
        <select
          aria-label="Riesgo"
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
        >
          <option value="">Todos los riesgos</option>
          {["Alto", "Medio", "Bajo"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
    );
  }
  function table(
    rows: Row[],
    columns: [string, string, ((r: Row) => React.ReactNode)?][],
    onRow?: (r: Row) => void,
  ) {
    return rows.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map(([k, label]) => (
                <th key={k}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i}>
                {columns.map(([k, , render]) => (
                  <td key={k}>
                    {render ? (
                      render(r)
                    ) : onRow && k === "name" ? (
                      <button className="link" onClick={() => onRow(r)}>
                        {r[k]}
                      </button>
                    ) : (
                      String(r[k] ?? "—")
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty />
    );
  }
  function caseTable(rows: Row[], selectable = false) {
    return table(rows, [
      ...(selectable
        ? [
            [
              "pick",
              "",
              (r: Row) => (
                <input
                  aria-label={"Seleccionar " + r.id}
                  type="checkbox"
                  checked={checked.includes(r.id)}
                  onChange={(e) =>
                    setChecked(
                      e.target.checked
                        ? [...checked, r.id]
                        : checked.filter((id) => id !== r.id),
                    )
                  }
                />
              ),
            ] as [string, string, (r: Row) => React.ReactNode],
          ]
        : []),
      [
        "id",
        "Caso",
        (r) => (
          <button
            className="link"
            onClick={() => {
              setSelected(r.id);
              setCaseTab("Resumen");
            }}
          >
            {r.id}
          </button>
        ),
      ],
      [
        "entity_name",
        "Entidad",
        (r) => (
          <div>
            <strong>{r.entity_name}</strong>
            <small>{r.cuit}</small>
          </div>
        ),
      ],
      ["title", "Escenario"],
      ["risk", "Riesgo", (r) => <Badge value={r.risk} />],
      ["status", "Estado", (r) => <Badge value={r.status} />],
      [
        "assignee",
        "Analista",
        (r) =>
          data?.users.find((u: Row) => u.id === r.assignee)?.name ||
          "Sin asignar",
      ],
      [
        "hours_remaining",
        "Plazo",
        (r) => (
          <span className={r.hours_remaining < 72 ? "deadline" : ""}>
            {r.hours_remaining < 0
              ? "Vencido"
              : Math.round(r.hours_remaining) + " h"}
          </span>
        ),
      ],
    ]);
  }
  async function submitDialog() {
    if (!dialog) return;
    if (dialog.action === "bulk") {
      await act("/cases/bulk-close", { action: "close", reason, ids: checked });
      setChecked([]);
      return;
    }
    if (dialog.action === "screen") {
      await act("/screening/" + dialog.id + "/resolve", {
        action: "resolve",
        target,
        reason,
      });
      return;
    }
    if (dialog.action === "delegate") {
      await act("/team/delegate", {
        action: "delegate",
        text: dialog.source,
        target,
        reason,
      });
      return;
    }
    if (dialog.action === "view") {
      await act("/preferences", {
        action: "view",
        text,
        fields: { q, business, status, risk },
      });
      return;
    }
    if (dialog.kind === "rule") {
      await act("/rules/" + dialog.id + "/action", {
        action: dialog.action,
        reason,
      });
      return;
    }
    await act("/cases/" + dialog.id + "/action", {
      action: dialog.action,
      reason,
      target,
      text,
      fields,
    });
  }
  async function saveRule() {
    if (!ruleForm) return;
    const r = await act(
      "/rules" + (ruleId ? "/" + ruleId : ""),
      ruleForm,
      "Regla guardada",
      ruleId ? "PUT" : "POST",
    );
    if (r) {
      setRuleId(r.id);
      setRuleForm(null);
    }
  }
  function editRule(r?: Row) {
    setRuleId(r?.id || "");
    setSim(null);
    setRuleForm(
      r
        ? {
            name: r.name,
            business: r.business,
            window_days: r.window_days,
            severity: r.severity,
            conditions: r.conditions.map((c: Row) => ({ ...c })),
          }
        : {
            name: "",
            business: data?.businesses[0],
            window_days: 30,
            severity: "Medio",
            conditions: [{ field: "profile_ratio", operator: ">", value: 2 }],
          },
    );
  }
  async function fileUpload(file: File) {
    if (!activeCase) return;
    if (file.size > 2000000) {
      setError("Maximo 2 MB por adjunto");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      act(
        "/cases/" + activeCase.id + "/attachments",
        { name: file.name, content: String(reader.result).split(",")[1] },
        "Adjunto guardado",
      );
    reader.readAsDataURL(file);
  }
  if (!data)
    return (
      <div className="loading">
        <img src="/brand/logo.svg" alt="Neural Co" />
        <p>{error || "Cargando plataforma AML…"}</p>
        <button onClick={() => load().catch((e) => setError(e.message))}>
          Reintentar
        </button>
      </div>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#dashboard" onClick={() => go("dashboard")}>
          <img src="/brand/logo.svg" alt="Neural Co" />
        </a>
        <div className="workspace">
          <span className="workspace-icon">P</span>
          <div>
            <strong>Payway</strong>
            <small>AML / PLAFT</small>
          </div>
          <span className="demo-dot" />
        </div>
        <p className="nav-label">PLATAFORMA</p>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              className={page === id ? "nav-item active" : "nav-item"}
              key={id}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              {label}
              {id === "cases" && <span>{cases.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={18} />
          <div>
            Entorno de demostracion<small>Datos sinteticos · v0.1</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div className="breadcrumb">
            Payway <ChevronRight size={14} />{" "}
            <strong>{nav.find((n) => n[0] === page)?.[1]}</strong>
          </div>
          <div className="header-actions">
            <button
              className="icon"
              title="Notificaciones"
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={18} />
              {data.notifications.length > 0 && (
                <b>{data.notifications.length}</b>
              )}
            </button>
            <select
              aria-label="Usuario demo"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            >
              {data.users.map((u: Row) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.role}
                </option>
              ))}
            </select>
          </div>
        </header>
        {notifications && (
          <div className="notifications">
            {data.notifications.length
              ? data.notifications.map((n: Row) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      go("cases");
                      setSelected(n.case_id);
                      setNotifications(false);
                    }}
                  >
                    {n.text}
                  </button>
                ))
              : "No tenes notificaciones"}
          </div>
        )}
        <main>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button
                className="icon"
                onClick={() => setError("")}
                aria-label="Cerrar error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <Check size={16} />
              {notice}
              <button
                className="icon"
                onClick={() => setNotice("")}
                aria-label="Cerrar aviso"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {activeCase ? (
            <>
              <button className="back" onClick={() => setSelected("")}>
                <ArrowLeft size={16} /> Volver a casos
              </button>
              <div className="page-title">
                <div>
                  <div className="eyebrow">EXPEDIENTE {activeCase.id}</div>
                  <h1>{activeCase.entity_name}</h1>
                  <p>{activeCase.title}</p>
                </div>
                <button
                  onClick={() =>
                    download(
                      "/cases/" + activeCase.id + "/pdf",
                      user,
                      activeCase.id + ".pdf",
                    ).catch((e) => setError(e.message))
                  }
                >
                  <Download size={16} />
                  Exportar PDF
                </button>
              </div>
              <div className="case-summary">
                <Badge value={activeCase.status} />
                <Badge value={activeCase.risk} />
                <span>CUIT {activeCase.cuit}</span>
                <span className="deadline">
                  <Clock size={14} />
                  {activeCase.hours_remaining < 0
                    ? "Vencido"
                    : Math.round(activeCase.hours_remaining) + " h restantes"}
                </span>
                <span>Limite demo: {stamp(activeCase.deadline)}</span>
              </div>
              <div className="tabs">
                {[
                  "Resumen",
                  "Investigacion",
                  "Registro inusual",
                  "ROS",
                  "Historial",
                ].map((t) => (
                  <button
                    key={t}
                    className={caseTab === t ? "selected" : ""}
                    onClick={() => setCaseTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {caseTab === "Resumen" && (
                <>
                  <div className="split">
                    <section>
                      <h2>Motivo de la alerta</h2>
                      <div className="explanation">
                        {activeCase.explanation}
                      </div>
                      <div className="metrics compact">
                        <div>
                          <small>Valor observado</small>
                          <strong>{fmt(activeCase.observed)}</strong>
                        </div>
                        <div>
                          <small>Umbral</small>
                          <strong>{fmt(activeCase.threshold)}</strong>
                        </div>
                        <div>
                          <small>Operacion mas antigua</small>
                          <strong className="date-value">
                            {activeCase.oldest_operation}
                          </strong>
                        </div>
                      </div>
                      <h2>Acciones del caso</h2>
                      <div className="actions">
                        {data.transitions[activeCase.status].map(
                          (s: string) => (
                            <button
                              className="primary"
                              disabled={busy}
                              key={s}
                              onClick={() =>
                                open("transition", activeCase.id, { target: s })
                              }
                            >
                              {s}
                              <ChevronRight size={14} />
                            </button>
                          ),
                        )}
                        <button onClick={() => open("assign", activeCase.id)}>
                          Asignar
                        </button>
                        <button onClick={() => open("snooze", activeCase.id)}>
                          Pausar
                        </button>
                        <button
                          onClick={() => {
                            setEntityId(activeCase.entity_id);
                            setSelected("");
                            setPage("entities");
                            location.hash = "entities";
                          }}
                        >
                          Ficha 360
                        </button>
                      </div>
                      {activeCase.snooze_until && (
                        <p>
                          Pausa hasta {activeCase.snooze_until}. El reloj del
                          caso sigue activo.
                        </p>
                      )}
                    </section>
                    <section>
                      <h2>Comentarios</h2>
                      {activeCase.comments.map((c: Row, i: number) => (
                        <div className="comment" key={i}>
                          <strong>{c.user}</strong>
                          <small>{stamp(c.at)}</small>
                          <p>{c.text}</p>
                        </div>
                      ))}
                      <button onClick={() => open("comment", activeCase.id)}>
                        <Plus size={16} />
                        Agregar comentario
                      </button>
                      <h2>Casos similares</h2>
                      {cases
                        .filter(
                          (c) =>
                            c.id !== activeCase.id &&
                            c.rule_id === activeCase.rule_id,
                        )
                        .slice(0, 4)
                        .map((c) => (
                          <button
                            className="list-link"
                            key={c.id}
                            onClick={() => setSelected(c.id)}
                          >
                            {c.id} · {c.status}
                            <ChevronRight size={14} />
                          </button>
                        ))}
                    </section>
                  </div>
                </>
              )}
              {caseTab === "Investigacion" && (
                <div className="split">
                  <section>
                    <h2>Documentacion</h2>
                    <label
                      className="dropzone"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files[0])
                          fileUpload(e.dataTransfer.files[0]);
                      }}
                    >
                      <FileText size={25} />
                      <span>Adjuntar evidencia</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.txt"
                        onChange={(e) =>
                          e.target.files?.[0] && fileUpload(e.target.files[0])
                        }
                      />
                    </label>
                    {activeCase.attachments.map((a: Row) => (
                      <button
                        className="list-link"
                        key={a.id}
                        onClick={() => {
                          download(
                            "/cases/" + activeCase.id + "/attachments/" + a.id,
                            user,
                            a.name,
                          ).catch((e) => setError(e.message));
                        }}
                      >
                        <FileText size={16} />
                        {a.name}
                        <Download size={14} />
                      </button>
                    ))}
                  </section>
                  <section>
                    <h2>Investigacion vinculada</h2>
                    {activeCase.linked_cases.map((id: string) => (
                      <button
                        className="list-link"
                        key={id}
                        onClick={() => setSelected(id)}
                      >
                        {id}
                        <ChevronRight size={14} />
                      </button>
                    ))}
                    <button onClick={() => open("link", activeCase.id)}>
                      <Plus size={16} />
                      Vincular caso
                    </button>
                  </section>
                </div>
              )}
              {caseTab === "Registro inusual" && (
                <section>
                  <h2>Registro de operacion inusual</h2>
                  {Object.keys(activeCase.unusual).length ? (
                    table(
                      Object.entries(activeCase.unusual).map(
                        ([name, value]) => ({ name, value }),
                      ),
                      [
                        ["name", "Campo"],
                        ["value", "Contenido"],
                      ],
                    )
                  ) : (
                    <Empty text="El registro se completa al pasar a Inusual registrada" />
                  )}
                </section>
              )}
              {caseTab === "ROS" && (
                <section>
                  <div className="section-title">
                    <h2>Borrador de ROS</h2>
                    <Badge
                      value={
                        activeCase.status === "ROS aprobado"
                          ? "ROS aprobado"
                          : "Borrador"
                      }
                    />
                  </div>
                  <p className="muted">
                    Documento de trabajo · sin envio a UIF
                  </p>
                  <pre>
                    {activeCase.ros || "Todavia no se preparo el borrador."}
                  </pre>
                  <button
                    disabled={activeCase.status === "ROS aprobado"}
                    className="primary"
                    onClick={() => {
                      open("ros", activeCase.id);
                      setText(activeCase.ros);
                    }}
                  >
                    <FileText size={16} />
                    {activeCase.ros ? "Editar borrador" : "Generar borrador"}
                  </button>
                </section>
              )}
              {caseTab === "Historial" &&
                table(
                  data.audit.filter((a: Row) => a.target === activeCase.id),
                  [
                    ["at", "Fecha", (r) => stamp(r.at)],
                    ["user", "Usuario"],
                    ["action", "Accion"],
                    ["detail", "Detalle"],
                  ],
                )}
            </>
          ) : entityId && entity ? (
            <>
              <button className="back" onClick={() => setEntityId("")}>
                <ArrowLeft size={16} />
                Volver a entidades
              </button>
              <div className="page-title">
                <div>
                  <div className="eyebrow">VISTA 360 · {entity.id}</div>
                  <h1>{entity.name}</h1>
                  <p>
                    {entity.cuit} / {entity.establishment} / {entity.subclient}
                  </p>
                </div>
                <button
                  onClick={() =>
                    act(
                      "/preferences",
                      { action: "watch", target: entity.id },
                      "Seguimiento actualizado",
                    )
                  }
                >
                  <Star size={16} />
                  {data.watchlist.some(
                    (w: Row) => w.entity_id === entity.id && w.user === user,
                  )
                    ? "En seguimiento"
                    : "Seguir entidad"}
                </button>
              </div>
              <div className="metrics">
                <div>
                  <small>Riesgo individual</small>
                  <strong>{entity.score}</strong>
                  <Badge value={entity.risk} />
                </div>
                <div>
                  <small>Riesgo CUIT agregado</small>
                  <strong>{entity.group_score ?? entity.score}</strong>
                </div>
                <div>
                  <small>Transacciones</small>
                  <strong>{entity.transactions.length}</strong>
                </div>
                <div>
                  <small>Casos</small>
                  <strong>{entity.cases.length}</strong>
                </div>
              </div>
              <div className="split">
                <section>
                  <h2>Perfil y relaciones</h2>
                  <dl>
                    {[
                      "business",
                      "activity",
                      "jurisdiction",
                      "cbu",
                      "beneficiary",
                      "device",
                      "address",
                    ].map((k) => (
                      <React.Fragment key={k}>
                        <dt>{k}</dt>
                        <dd>{entity[k]}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                  <h2>Entidades vinculadas</h2>
                  {entity.related.map((r: Row) => (
                    <button
                      className="list-link"
                      key={r.id}
                      onClick={() => setEntityId(r.id)}
                    >
                      <Network size={16} />
                      <span>
                        {r.name}
                        <small>{r.shared.join(" · ")}</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </section>
                <section>
                  <h2>Comparar entidad</h2>
                  <select
                    value={compare}
                    onChange={(e) => setCompare(e.target.value)}
                  >
                    <option value="">Seleccionar entidad</option>
                    {entities
                      .filter((e) => e.id !== entity.id)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                  {compare &&
                    table(
                      [entity, entities.find((e) => e.id === compare)!],
                      [
                        ["name", "Entidad"],
                        ["score", "Score"],
                        ["risk", "Riesgo"],
                        ["declared_profile", "Perfil declarado"],
                      ],
                    )}
                  <h2>Documentos</h2>
                  {entity.documents.map((d: Row) => (
                    <div className="list-link" key={d.name}>
                      {d.name}
                      <Badge value={d.status} />
                    </div>
                  ))}
                  <h2>Historial de riesgo</h2>
                  {entity.risk_history.length ? (
                    table(entity.risk_history, [
                      ["at", "Fecha", (r) => stamp(r.at)],
                      ["before", "Antes"],
                      ["after", "Despues"],
                    ])
                  ) : (
                    <p className="muted">Sin recalculos registrados</p>
                  )}
                </section>
              </div>
              <h2>Casos de la entidad</h2>
              {caseTable(entity.cases)}
              <h2>Operatoria</h2>
              {table(entity.transactions.slice(0, 100), [
                ["id", "Transaccion"],
                ["date", "Fecha"],
                ["amount", "Importe", (r) => fmt(r.amount)],
                ["currency", "Moneda"],
                ["card", "Tarjeta tokenizada"],
              ])}
            </>
          ) : (
            <>
              <div className="page-title">
                <div>
                  <div className="eyebrow">AML / PLAFT</div>
                  <h1>{nav.find((n) => n[0] === page)?.[1]}</h1>
                  <p>
                    {page === "dashboard"
                      ? "Una mirada sobre la cartera, las alertas y el trabajo del equipo."
                      : page === "cases"
                        ? "Investigaciones, decisiones y seguimiento."
                        : page === "rules"
                          ? "Escenarios y umbrales por linea de negocio."
                          : page === "screening"
                            ? "Coincidencias y decisiones sobre listas de demostracion."
                            : page === "segments"
                              ? "Clasificacion de la cartera y matriz de riesgo."
                              : page === "entities"
                                ? "CUIT, establecimientos y subclientes."
                                : "Carga operativa, configuracion e historial de actividad."}
                  </p>
                </div>
                <div className="actions">
                  {page === "cases" && (
                    <>
                      <button onClick={() => exportGrid("cases")}>
                        <Download size={16} />
                        Excel
                      </button>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={async () => {
                          const c = await act(
                            "/cases/next",
                            {},
                            "Caso asignado",
                          );
                          if (c) setSelected(c.id);
                        }}
                      >
                        Tomar siguiente
                        <ChevronRight size={16} />
                      </button>
                    </>
                  )}
                  {page === "rules" && (
                    <button className="primary" onClick={() => editRule()}>
                      <Plus size={16} />
                      Nueva regla
                    </button>
                  )}
                  {page === "entities" && (
                    <button onClick={() => exportGrid("entities")}>
                      <Download size={16} />
                      Excel
                    </button>
                  )}
                  {page === "screening" && (
                    <button
                      className="primary"
                      disabled={busy || !privileged}
                      onClick={async () => {
                        const r = await act("/screening/run", {});
                        if (r)
                          setNotice(`${r.new_matches} coincidencias nuevas`);
                      }}
                    >
                      <Play size={16} />
                      Ejecutar screening
                    </button>
                  )}
                </div>
              </div>
              {page === "dashboard" && (
                <>
                  <div className="metrics">
                    <div>
                      <small>Transacciones monitoreables</small>
                      <strong>{fmt(data.transaction_count)}</strong>
                      <span>180 dias de datos sinteticos</span>
                    </div>
                    <div>
                      <small>Casos abiertos</small>
                      <strong>
                        {
                          cases.filter(
                            (c) =>
                              !["Cerrada no inusual", "ROS aprobado"].includes(
                                c.status,
                              ),
                          ).length
                        }
                      </strong>
                      <span>{cases.length} casos en total</span>
                    </div>
                    <div>
                      <small>Vencen en menos de 72 h</small>
                      <strong className="deadline">{urgent.length}</strong>
                      <span>Incluye casos vencidos</span>
                    </div>
                    <div>
                      <small>Entidades de riesgo alto</small>
                      <strong>
                        {entities.filter((e) => e.risk === "Alto").length}
                      </strong>
                      <span>{entities.length} establecimientos</span>
                    </div>
                  </div>
                  <div className="split overview">
                    <section>
                      <div className="section-title">
                        <h2>Distribucion de casos</h2>
                        <span className="muted">Por negocio</span>
                      </div>
                      {data.businesses.map((b: string, i: number) => {
                        const count = cases.filter(
                          (c) => c.business === b,
                        ).length;
                        return (
                          <div className="bar-row" key={b}>
                            <div>
                              <span>{b}</span>
                              <strong>{count}</strong>
                            </div>
                            <div className="bar-track">
                              <div
                                style={{
                                  width:
                                    (100 * count) / (cases.length || 1) + "%",
                                  background: [
                                    "#820020",
                                    "#177e89",
                                    "#a87920",
                                    "#626a81",
                                  ][i],
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </section>
                    <section>
                      <h2>Embudo de gestion</h2>
                      {[
                        ["Transacciones", data.transaction_count],
                        ["Casos", cases.length],
                        [
                          "Inusuales",
                          cases.filter((c) =>
                            [
                              "Inusual registrada",
                              "Remitida a Cumplimiento",
                              "ROS aprobado",
                            ].includes(c.status),
                          ).length,
                        ],
                        [
                          "ROS aprobados",
                          cases.filter((c) => c.status === "ROS aprobado")
                            .length,
                        ],
                      ].map(([label, count]) => (
                        <div className="funnel-row" key={label}>
                          <span>{label}</span>
                          <strong>{fmt(Number(count))}</strong>
                        </div>
                      ))}
                    </section>
                  </div>
                  <div className="section-title">
                    <h2>Atencion prioritaria</h2>
                    <button className="link" onClick={() => go("cases")}>
                      Ver todos los casos
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  {caseTable(urgent.length ? urgent : cases.slice(0, 5))}
                </>
              )}
              {page === "cases" && (
                <>
                  {filters()}
                  <div className="toolbar">
                    <span>
                      {filtered.length} casos · {checked.length} seleccionados
                    </span>
                    <div className="actions">
                      <button onClick={() => open("view")}>
                        <Save size={14} />
                        Guardar vista
                      </button>
                      <button
                        disabled={!checked.length || !privileged}
                        onClick={() => open("bulk")}
                      >
                        Cerrar seleccion
                      </button>
                    </div>
                  </div>
                  {data.saved_views.filter((v: Row) => v.user === user).length >
                    0 && (
                    <div className="saved-views">
                      {data.saved_views
                        .filter((v: Row) => v.user === user)
                        .map((v: Row) => (
                          <button
                            key={v.id}
                            onClick={() => {
                              setQ(v.filters.q || "");
                              setBusiness(v.filters.business || "");
                              setStatus(v.filters.status || "");
                              setRisk(v.filters.risk || "");
                            }}
                          >
                            <Filter size={14} />
                            {v.name}
                          </button>
                        ))}
                    </div>
                  )}
                  {caseTable(filtered, true)}
                </>
              )}
              {page === "entities" && (
                <>
                  {filters(false)}
                  {table(
                    entityRows,
                    [
                      ["name", "Entidad"],
                      ["cuit", "CUIT"],
                      ["business", "Negocio"],
                      ["establishment", "Establecimiento"],
                      ["score", "Score"],
                      ["risk", "Riesgo", (r) => <Badge value={r.risk} />],
                      [
                        "watch",
                        "Seguimiento",
                        (r) =>
                          data.watchlist.some(
                            (w: Row) => w.user === user && w.entity_id === r.id,
                          ) ? (
                            <Star size={16} />
                          ) : null,
                      ],
                    ],
                    (r) => setEntityId(r.id),
                  )}
                </>
              )}
              {page === "rules" && (
                <>
                  <div className="toolbar">
                    <span>
                      {rules.length} escenarios ·{" "}
                      {rules.filter((r) => r.status === "active").length}{" "}
                      activos
                    </span>
                    <button
                      disabled={busy || !privileged}
                      onClick={async () => {
                        const r = await act("/monitor/run", {});
                        if (r)
                          setNotice(
                            `${r.generated} casos nuevos · ${r.shadow_matches} coincidencias en sombra`,
                          );
                      }}
                    >
                      <Play size={16} />
                      Ejecutar motor
                    </button>
                  </div>
                  {table(rules, [
                    [
                      "name",
                      "Escenario",
                      (r) => (
                        <button
                          className="link"
                          onClick={() => {
                            setRuleId(r.id);
                            setSim(r.last_simulation);
                          }}
                        >
                          {r.name}
                          <small>{r.business}</small>
                        </button>
                      ),
                    ],
                    ["window_days", "Ventana", (r) => r.window_days + " dias"],
                    ["status", "Estado", (r) => <Badge value={r.status} />],
                    ["version", "Version", (r) => "v" + r.version],
                    ["author", "Autor"],
                    [
                      "action",
                      "Acciones",
                      (r) => (
                        <div className="row-actions">
                          <button
                            disabled={r.status === "active"}
                            onClick={() => editRule(r)}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              setRuleId(r.id);
                              setSim(r.last_simulation);
                            }}
                          >
                            Simular
                          </button>
                          <select
                            aria-label={"Accion " + r.name}
                            value=""
                            onChange={(e) =>
                              open(e.target.value, r.id, { kind: "rule" })
                            }
                          >
                            <option value="" disabled>
                              Gestionar
                            </option>
                            <option value="draft">Pasar a borrador</option>
                            <option value="shadow">Modo sombra</option>
                            <option value="submit">Solicitar aprobacion</option>
                            <option value="approve">Aprobar</option>
                            <option value="rollback">Restaurar anterior</option>
                          </select>
                        </div>
                      ),
                    ],
                  ])}
                  {ruleId && !ruleForm && (
                    <section className="simulation">
                      <div className="section-title">
                        <h2>
                          Simulacion ·{" "}
                          {rules.find((r) => r.id === ruleId)?.name}
                        </h2>
                        <button
                          className="icon"
                          onClick={() => setRuleId("")}
                          title="Cerrar simulacion"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="actions">
                        <Field label="Desde">
                          <input
                            type="date"
                            value={start}
                            onChange={(e) => setStart(e.target.value)}
                          />
                        </Field>
                        <Field label="Hasta">
                          <input
                            type="date"
                            value={end}
                            onChange={(e) => setEnd(e.target.value)}
                          />
                        </Field>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={async () => {
                            const r = await act(
                              "/rules/" + ruleId + "/simulate",
                              { start_date: start, end_date: end },
                              "Simulacion completa",
                            );
                            if (r) setSim(r);
                          }}
                        >
                          <Play size={16} />
                          Simular
                        </button>
                      </div>
                      {sim && (
                        <>
                          <p>
                            <strong>{sim.matched_entities}</strong> entidades
                            alcanzadas de {sim.total_entities} · v{sim.version}{" "}
                            · {sim.start} a {sim.end}
                          </p>
                          {table(sim.matches, [
                            ["name", "Entidad"],
                            ["period_start", "Desde"],
                            ["period_end", "Hasta"],
                            [
                              "values",
                              "Indicadores",
                              (r) =>
                                Object.entries(r.values)
                                  .filter(([k]) => k !== "transaction_count")
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join(" · "),
                            ],
                          ])}
                        </>
                      )}
                    </section>
                  )}
                </>
              )}
              {page === "screening" && (
                <>
                  <div className="list-sources">
                    {data.lists.map((l: Row) => (
                      <div key={l.id}>
                        <ShieldCheck size={18} />
                        <strong>{l.source}</strong>
                        <small>Version {l.version}</small>
                        <button
                          disabled={!privileged}
                          onClick={() =>
                            act(
                              "/lists/revise",
                              { action: "revise", target: l.id },
                              "Version actualizada; ejecuta screening para volver a evaluar",
                            )
                          }
                        >
                          Actualizar demo
                        </button>
                      </div>
                    ))}
                  </div>
                  {table(data.screening, [
                    ["entity_name", "Entidad"],
                    ["candidate", "Candidato"],
                    ["source", "Lista"],
                    ["score", "Similitud", (r) => r.score + "%"],
                    ["version", "Version"],
                    ["status", "Decision", (r) => <Badge value={r.status} />],
                    [
                      "action",
                      "Revision",
                      (r) => (
                        <button
                          onClick={() =>
                            open("screen", r.id, { target: "Falso positivo" })
                          }
                        >
                          Resolver
                        </button>
                      ),
                    ],
                  ])}
                </>
              )}
              {page === "segments" && config && (
                <>
                  <div className="split">
                    <section>
                      <h2>Matriz de riesgo</h2>
                      <div className="form-grid">
                        {Object.entries(config.weights).map(([k, v]) => (
                          <Field
                            key={k}
                            label={
                              k
                                .replace("_risk", "")
                                .replace("activity", "Actividad")
                                .replace("jurisdiction", "Jurisdiccion")
                                .replace("behavior", "Comportamiento")
                                .replace("ownership", "Estructura societaria") +
                              " (%)"
                            }
                          >
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={Number(v)}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  weights: {
                                    ...config.weights,
                                    [k]: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </Field>
                        ))}
                        <Field label="Riesgo medio desde">
                          <input
                            type="number"
                            value={config.medium}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                medium: Number(e.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="Riesgo alto desde">
                          <input
                            type="number"
                            value={config.high}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                high: Number(e.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="Agregacion por CUIT">
                          <select
                            value={config.aggregation}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                aggregation: e.target.value,
                              })
                            }
                          >
                            <option value="worst">Peor establecimiento</option>
                            <option value="weighted">
                              Ponderado por perfil declarado
                            </option>
                            <option value="percentile">Percentil 90</option>
                          </select>
                        </Field>
                      </div>
                      <div className="actions">
                        <button
                          disabled={!privileged || busy}
                          onClick={() =>
                            act("/config", config, "Matriz guardada", "PUT")
                          }
                        >
                          <Save size={16} />
                          Guardar matriz
                        </button>
                        <button
                          disabled={!privileged || busy}
                          className="primary"
                          onClick={() =>
                            act(
                              "/segments/recalculate",
                              {},
                              "Cartera recalculada",
                            )
                          }
                        >
                          <Play size={16} />
                          Recalcular cartera
                        </button>
                      </div>
                    </section>
                    <section>
                      <h2>Distribucion de riesgo</h2>
                      {["Alto", "Medio", "Bajo"].map((r) => (
                        <div className="funnel-row" key={r}>
                          <Badge value={r} />
                          <strong>
                            {entities.filter((e) => e.risk === r).length}
                          </strong>
                        </div>
                      ))}
                      <p className="muted">
                        Modelo ilustrativo. La validacion contra el modelo
                        vigente de Payway requiere sus parametros y datos.
                      </p>
                    </section>
                  </div>
                  {table(
                    entities,
                    [
                      ["name", "Entidad"],
                      ["segment", "Segmento"],
                      ["score", "Score"],
                      ["group_score", "Score CUIT"],
                      ["risk", "Riesgo", (r) => <Badge value={r.risk} />],
                    ],
                    (r) => {
                      setEntityId(r.id);
                    },
                  )}
                </>
              )}
              {page === "team" && config && (
                <>
                  <div className="team-grid">
                    {data.users.map((u: Row) => {
                      const assigned = cases.filter(
                        (c) =>
                          c.assignee === u.id &&
                          !["Cerrada no inusual", "ROS aprobado"].includes(
                            c.status,
                          ),
                      );
                      return (
                        <div className="person" key={u.id}>
                          <div className="avatar">{u.name.slice(0, 1)}</div>
                          <strong>{u.name}</strong>
                          <small>{u.role}</small>
                          <div className="load-line">
                            {assigned.length} / {u.capacity} casos
                          </div>
                          <progress value={assigned.length} max={u.capacity} />
                          <button
                            disabled={!privileged}
                            onClick={() =>
                              open("delegate", "", { source: u.id })
                            }
                          >
                            Delegar por ausencia
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <section>
                    <h2>Configuracion de la cola</h2>
                    <div className="form-grid">
                      <Field label="Asignacion">
                        <select
                          value={config.assignment}
                          onChange={(e) =>
                            setConfig({ ...config, assignment: e.target.value })
                          }
                        >
                          <option value="risk">Prioridad por riesgo</option>
                          <option value="fifo">FIFO</option>
                          <option value="random">Aleatoria</option>
                        </select>
                      </Field>
                      <Field label="Plazo desde sospecha (horas demo)">
                        <input
                          type="number"
                          value={config.regulatory_hours}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              regulatory_hours: Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field label="Tope desde operacion (dias demo)">
                        <input
                          type="number"
                          value={config.operation_limit_days}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              operation_limit_days: Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field label="Muestra de calidad (%)">
                        <input
                          type="number"
                          value={config.quality_sample}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              quality_sample: Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <button
                      disabled={!privileged || busy}
                      onClick={() =>
                        act("/config", config, "Configuracion guardada", "PUT")
                      }
                    >
                      <Save size={16} />
                      Guardar
                    </button>
                  </section>
                  <h2>Muestra de control de calidad</h2>
                  {caseTable(
                    cases.filter(
                      (c) =>
                        c.status === "Cerrada no inusual" &&
                        (c.risk === "Alto" ||
                          c.id
                            .split("")
                            .reduce(
                              (a: number, s: string) => a + s.charCodeAt(0),
                              0,
                            ) %
                            100 <
                            config.quality_sample),
                    ),
                  )}
                  <div className="section-title">
                    <h2>Actividad y auditoria</h2>
                    <button onClick={() => exportGrid("audit")}>
                      <Download size={16} />
                      Excel
                    </button>
                  </div>
                  {table(data.audit, [
                    ["at", "Fecha", (r) => stamp(r.at)],
                    ["user", "Usuario"],
                    ["action", "Accion"],
                    ["target", "Registro"],
                    ["detail", "Detalle"],
                  ])}
                </>
              )}
            </>
          )}
        </main>
        <footer>
          Neural Co · AML / PLAFT{" "}
          <span>
            Demo local · {data.data_start} a {data.data_end}
          </span>
        </footer>
      </div>
      {dialog && (
        <div className="overlay">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              submitDialog();
            }}
          >
            <div className="section-title">
              <h2>
                {dialog.action === "transition"
                  ? dialog.target
                  : dialog.action === "screen"
                    ? "Resolver coincidencia"
                    : dialog.action === "view"
                      ? "Guardar vista"
                      : dialog.action === "ros"
                        ? "Borrador de ROS"
                        : dialog.action === "comment"
                          ? "Agregar comentario"
                          : dialog.action === "bulk"
                            ? "Cierre en lote"
                            : "Confirmar accion"}
              </h2>
              <button
                type="button"
                className="icon"
                onClick={() => setDialog(null)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
            {["assign", "delegate"].includes(dialog.action) && (
              <Field label="Analista destino">
                <select
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  {data.users.map((u: Row) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {dialog.action === "screen" && (
              <Field label="Decision">
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option>Falso positivo</option>
                  <option>Confirmado</option>
                </select>
              </Field>
            )}
            {dialog.action === "snooze" && (
              <Field label="Hasta">
                <input
                  required
                  type="date"
                  value={target}
                  min={day()}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </Field>
            )}
            {dialog.action === "link" && (
              <Field label="Caso vinculado">
                <select
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Seleccionar caso</option>
                  {cases
                    .filter((c) => c.id !== dialog.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} · {c.entity_name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {["comment", "view", "ros"].includes(dialog.action) && (
              <Field
                label={
                  dialog.action === "view"
                    ? "Nombre de la vista"
                    : dialog.action === "ros"
                      ? "Texto (vacio para generar desde el caso)"
                      : "Comentario · menciones @ana, @lucas, @sofia, @oficial"
                }
              >
                <textarea
                  required={dialog.action !== "ros"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={dialog.action === "ros" ? 12 : 4}
                />
              </Field>
            )}
            {!["comment", "view", "link", "ros"].includes(dialog.action) && (
              <Field label="Justificacion">
                <textarea
                  required
                  minLength={8}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              </Field>
            )}
            {dialog.target === "Cerrada no inusual" && (
              <button
                type="button"
                onClick={() =>
                  setReason(
                    "Operatoria compatible con el perfil declarado, segun evidencia revisada. Completar detalle de la evidencia.",
                  )
                }
              >
                Usar plantilla de cierre
              </button>
            )}
            {dialog.target === "Inusual registrada" && (
              <div className="form-grid">
                {[
                  ["operation_date", "Fecha operacion"],
                  ["amount", "Importe"],
                  ["currency", "Moneda"],
                  ["description", "Descripcion"],
                  ["typology", "Tipologia"],
                  ["analysis", "Analisis"],
                  ["evidence", "Evidencia"],
                  ["decision", "Decision"],
                  ["responsible", "Responsable"],
                ].map(([k, label]) => (
                  <Field label={label} key={k}>
                    <input
                      required
                      value={fields[k] || ""}
                      onChange={(e) =>
                        setFields({ ...fields, [k]: e.target.value })
                      }
                    />
                  </Field>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => setDialog(null)}>
                Cancelar
              </button>
              <button className="primary" disabled={busy} type="submit">
                <Check size={16} />
                Confirmar
              </button>
            </div>
          </form>
        </div>
      )}
      {ruleForm && (
        <div className="overlay">
          <form
            className="modal wide"
            onSubmit={(e) => {
              e.preventDefault();
              saveRule();
            }}
          >
            <div className="section-title">
              <h2>{ruleId ? "Editar escenario" : "Nuevo escenario"}</h2>
              <button
                className="icon"
                type="button"
                onClick={() => setRuleForm(null)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="form-grid">
              <Field label="Nombre">
                <input
                  required
                  minLength={3}
                  value={ruleForm.name}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Negocio">
                <select
                  value={ruleForm.business}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, business: e.target.value })
                  }
                >
                  {data.businesses.map((b: string) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <Field label="Ventana (dias)">
                <input
                  required
                  type="number"
                  min="1"
                  max="180"
                  value={ruleForm.window_days}
                  onChange={(e) =>
                    setRuleForm({
                      ...ruleForm,
                      window_days: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Riesgo">
                <select
                  value={ruleForm.severity}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, severity: e.target.value })
                  }
                >
                  {["Bajo", "Medio", "Alto"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <h3>Condiciones · todas deben cumplirse</h3>
            {ruleForm.conditions.map((c: Row, i: number) => (
              <div className="condition" key={i}>
                <select
                  aria-label="Variable"
                  value={c.field}
                  onChange={(e) =>
                    setRuleForm({
                      ...ruleForm,
                      conditions: ruleForm.conditions.map(
                        (v: Row, j: number) =>
                          i === j ? { ...v, field: e.target.value } : v,
                      ),
                    })
                  }
                >
                  {data.catalog.map((v: Row) => (
                    <option key={v.field} value={v.field}>
                      {v.label} ({v.unit})
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Operador"
                  value={c.operator}
                  onChange={(e) =>
                    setRuleForm({
                      ...ruleForm,
                      conditions: ruleForm.conditions.map(
                        (v: Row, j: number) =>
                          i === j ? { ...v, operator: e.target.value } : v,
                      ),
                    })
                  }
                >
                  {[">", ">=", "<", "<=", "==", "!="].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <input
                  aria-label="Valor"
                  required
                  type="number"
                  step="any"
                  value={c.value}
                  onChange={(e) =>
                    setRuleForm({
                      ...ruleForm,
                      conditions: ruleForm.conditions.map(
                        (v: Row, j: number) =>
                          i === j ? { ...v, value: Number(e.target.value) } : v,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="icon"
                  title="Eliminar condicion"
                  disabled={ruleForm.conditions.length === 1}
                  onClick={() =>
                    setRuleForm({
                      ...ruleForm,
                      conditions: ruleForm.conditions.filter(
                        (_: Row, j: number) => j !== i,
                      ),
                    })
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setRuleForm({
                  ...ruleForm,
                  conditions: [
                    ...ruleForm.conditions,
                    { field: "volume", operator: ">", value: 100000 },
                  ],
                })
              }
            >
              <Plus size={16} />
              Agregar condicion
            </button>
            <div className="modal-actions">
              <button className="primary" disabled={busy} type="submit">
                <Save size={16} />
                Guardar borrador
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
