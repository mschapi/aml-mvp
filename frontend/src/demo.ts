import seed from './demo-seed.json';
import type { Row } from './api';

const KEY = 'aml-public-demo-v1';
const DAY = 86400000;
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const uid = () => crypto.randomUUID();
const clone = <T,>(x: T): T => structuredClone(x);
const round = (x: number) => Math.round(x * 100) / 100;
const shift = (d: string, days: number) => new Date(Date.parse(d) + days * DAY).toISOString().slice(0, 10);
const requireThat = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const reasonRequired = (s = '') => requireThat(s.trim().length >= 8, 'Escribi un motivo de al menos 8 caracteres');
const privileged = (u: Row) => requireThat(['supervisor', 'officer'].includes(u.role), 'Requiere supervisor o Cumplimiento');
const closed = (c: Row) => ['Cerrada no inusual', 'ROS aprobado'].includes(c.status);

function fresh(): Row {
  const d: Row = clone(seed);
  const last = d.transactions.reduce((a: string, t: Row) => t.date > a ? t.date : a, '');
  const days = Math.round((Date.parse(today()) - Date.parse(last)) / DAY);
  for (const t of d.transactions) t.date = shift(t.date, days);
  for (const c of d.cases) { c.oldest_operation = shift(c.oldest_operation, days); c.created_at = now(); c.updated_at = now(); }
  return d;
}
function read(): Row {
  const saved = localStorage.getItem(KEY);
  if (!saved) return fresh();
  try { const d = JSON.parse(saved); if (Array.isArray(d.transactions) && d.config && Array.isArray(d.cases)) return d; } catch { /* Recover only this demo's invalid cache. */ }
  throw new Error('Los datos locales no se pueden leer. Restablece la demo desde el aviso superior o borra aml-public-demo-v1 del almacenamiento.');
}
function persist(d: Row) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); }
  catch { throw new Error('No hay espacio local disponible. Descarga los datos necesarios y restablece la demo.'); }
}
function item(d: Row, table: string, id: string): Row {
  const value = d[table].find((r: Row) => r.id === id);
  requireThat(value, 'Registro inexistente'); return value;
}
function audit(d: Row, user: string, action: string, target: string) {
  d.audit.push({ id: uid(), at: now(), user, action, target, detail: 'Demo local', hash: '', previous: '' });
  d.audit = d.audit.slice(-300);
}
function enrich(d: Row, c: Row): Row {
  const e = item(d, 'entities', c.entity_id);
  let deadline = Date.parse(c.oldest_operation) + d.config.operation_limit_days * DAY;
  if (c.suspicious_at) deadline = Math.min(deadline, Date.parse(c.suspicious_at) + d.config.regulatory_hours * 3600000);
  return { ...c, entity_name: e.name, cuit: e.cuit, deadline: new Date(deadline).toISOString(), hours_remaining: round((deadline - Date.now()) / 3600000) };
}
function bootstrap(d: Row, user: Row) {
  const { transactions, ...rest } = d;
  const dates = transactions.map((t: Row) => t.date).sort();
  return { ...rest, current_user: user, cases: d.cases.map((c: Row) => enrich(d, c)), audit: [...d.audit].reverse(), notifications: d.notifications.filter((n: Row) => n.user === user.id), transaction_count: transactions.length, data_start: dates[0], data_end: dates.at(-1) };
}
function metrics(d: Row, e: Row, start: string, end: string): Row {
  const tx = d.transactions.filter((t: Row) => t.entity_id === e.id && t.date >= start && t.date <= end);
  const sum = (rows: Row[], k: string) => rows.reduce((s: number, t: Row) => s + t[k], 0);
  const volume = sum(tx, 'amount');
  const cards: Record<string, number> = {};
  tx.forEach((t: Row) => { cards[t.card] = (cards[t.card] || 0) + t.amount; });
  const pct = (n: number) => volume ? round(100 * n / volume) : 0;
  return { volume: round(volume), profile_ratio: round(volume / e.declared_profile), refund_ratio: pct(sum(tx.filter((t: Row) => t.refund), 'amount')), outflow_ratio: pct(sum(tx, 'outflow')), card_concentration: pct(Object.values(cards).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0)), counterparties: new Set(tx.map((t: Row) => t.counterparty)).size, age_days: e.age_days, device_accounts: d.entities.filter((o: Row) => o.device === e.device).length, unlinked_refunds: tx.filter((t: Row) => t.refund && !t.original_found).length, transaction_count: tx.length };
}
const ops: Record<string, (a: number, b: number) => boolean> = {
  '==': (a, b) => a === b, '!=': (a, b) => a !== b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b,
};
function validateRule(d: Row, b: Row) {
  requireThat(typeof b.name === 'string' && b.name.trim().length >= 3 && b.name.length <= 120, 'El nombre requiere entre 3 y 120 caracteres');
  requireThat(d.businesses.includes(b.business) && ['Bajo', 'Medio', 'Alto'].includes(b.severity), 'Negocio o severidad invalido');
  requireThat(Number.isInteger(b.window_days) && b.window_days >= 1 && b.window_days <= 180, 'Ventana: 1 a 180 dias');
  requireThat(Array.isArray(b.conditions) && b.conditions.length > 0 && b.conditions.length <= 12, 'Agrega de 1 a 12 condiciones');
  for (const c of b.conditions) requireThat(d.catalog.some((v: Row) => v.field === c.field) && Object.hasOwn(ops, c.operator) && typeof c.value === 'number' && Number.isFinite(c.value), 'Condicion fuera del catalogo o valor invalido');
  return { name: b.name, business: b.business, severity: b.severity, window_days: b.window_days, conditions: clone(b.conditions) };
}
function evaluate(d: Row, r: Row, start: string, end: string) {
  requireThat(/^\d{4}-\d{2}-\d{2}$/.test(start || '') && /^\d{4}-\d{2}-\d{2}$/.test(end || '') && Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) && end >= start && Date.parse(end) - Date.parse(start) <= 180 * DAY, 'Selecciona fechas validas en orden, hasta 181 dias');
  const found = new Map<string, Row>();
  for (let cursor = start; cursor <= end;) {
    const last = shift(cursor, r.window_days - 1), windowEnd = last < end ? last : end;
    for (const e of d.entities.filter((e: Row) => e.business === r.business)) {
      const values = metrics(d, e, cursor, windowEnd);
      if (values.transaction_count && r.conditions.every((c: Row) => ops[c.operator](values[c.field], c.value))) found.set(e.id, { entity_id: e.id, name: e.name, values, period_start: cursor, period_end: windowEnd });
    }
    cursor = shift(windowEnd, 1);
  }
  return [...found.values()];
}
function execute(d: Row, path: string, user: Row, b: Row, method: string): any {
  const [, resource, id, action] = path.split('/');
  if (path === '/bootstrap') return bootstrap(d, user);
  if (resource === 'entities') {
    const e = item(d, resource, id);
    return { ...e, transactions: d.transactions.filter((t: Row) => t.entity_id === id), cases: d.cases.filter((c: Row) => c.entity_id === id).map((c: Row) => enrich(d, c)), related: d.entities.filter((o: Row) => o.id !== id).map((o: Row) => ({ ...o, shared: ['cuit', 'cbu', 'beneficiary', 'device', 'address'].filter(k => e[k] === o[k]) })).filter((o: Row) => o.shared.length) };
  }
  if (resource === 'rules') {
    if (!id) { const r = { ...validateRule(d, b), id: 'R' + uid(), status: 'draft', version: 1, author: user.id, approver: null, updated_at: now(), history: [], last_simulation: null }; d.rules.push(r); return r; }
    const r = item(d, 'rules', id);
    if (method === 'PUT') {
      requireThat(r.status !== 'active', 'Pasar a borrador antes de editar');
      const value = validateRule(d, b); const { history, ...snapshot } = r; history.push(clone(snapshot));
      Object.assign(r, value, { version: r.version + 1, author: user.id, status: 'draft', last_simulation: null, approver: null, updated_at: now() }); return r;
    }
    if (action === 'simulate') { const matches = evaluate(d, r, b.start_date, b.end_date); r.last_simulation = { start: b.start_date, end: b.end_date, version: r.version, matches, matched_entities: matches.length, total_entities: d.entities.filter((e: Row) => e.business === r.business).length, at: now() }; return r.last_simulation; }
    reasonRequired(b.reason);
    if (b.action === 'submit') { requireThat(r.last_simulation?.version === r.version && ['draft', 'shadow'].includes(r.status), 'Simula esta version en borrador antes de solicitar aprobacion'); r.status = 'pending'; }
    else if (b.action === 'approve') { privileged(user); requireThat(r.author !== user.id, 'Cuatro ojos: quien edita no aprueba'); requireThat(r.status === 'pending', 'No hay aprobacion pendiente'); r.status = 'active'; r.approver = user.id; }
    else if (b.action === 'shadow') { requireThat(['draft', 'active'].includes(r.status), 'Estado incompatible'); r.status = 'shadow'; }
    else if (b.action === 'draft') r.status = 'draft';
    else if (b.action === 'rollback') { privileged(user); requireThat(r.history.length, 'Sin version anterior'); const { history, ...snapshot } = r; Object.assign(r, clone(history.at(-1)), { version: r.version + 1, status: 'draft', author: user.id, approver: null, last_simulation: null }); history.push(snapshot); }
    else throw new Error('Accion desconocida');
    r.updated_at = now(); return r;
  }
  if (path === '/monitor/run') {
    privileged(user); let generated = 0, shadow_matches = 0;
    for (const r of d.rules.filter((r: Row) => ['active', 'shadow'].includes(r.status))) {
      const matches = evaluate(d, r, shift(today(), 1 - r.window_days), today());
      if (r.status === 'shadow') { shadow_matches += matches.length; continue; }
      for (const m of matches) {
        if (d.cases.some((c: Row) => c.entity_id === m.entity_id && c.rule_id === r.id && c.created_at.slice(0, 10) === today())) continue;
        const first = r.conditions[0];
        const c = { id: 'C' + uid(), entity_id: m.entity_id, rule_id: r.id, title: r.name, business: r.business, risk: r.severity, status: 'Nueva', assignee: null, created_at: now(), updated_at: now(), oldest_operation: m.period_start, suspicious_at: null, explanation: `${first.field}: ${m.values[first.field]} ${first.operator} ${first.value} en ${r.window_days} dias.`, observed: m.values[first.field], threshold: first.value, reason: '', unusual: {}, comments: [], attachments: [], linked_cases: [], snooze_until: null, ros: '', ros_author: null };
        d.cases.push(c); generated++;
        for (const w of d.watchlist.filter((w: Row) => w.entity_id === c.entity_id)) d.notifications.push({ id: uid(), user: w.user, text: 'Nueva alerta en entidad en seguimiento', case_id: c.id, at: now() });
      }
    }
    const result = { at: now(), generated, shadow_matches }; d.runs.push(result); return result;
  }
  if (path === '/cases/next') {
    requireThat(d.cases.filter((c: Row) => c.assignee === user.id && !closed(c)).length < user.capacity, 'Capacidad maxima alcanzada');
    const queue = d.cases.filter((c: Row) => c.status === 'Nueva' && !c.assignee);
    queue.sort((a: Row, b: Row) => d.config.assignment === 'risk' ? Number(b.risk === 'Alto') - Number(a.risk === 'Alto') || a.created_at.localeCompare(b.created_at) : a.created_at.localeCompare(b.created_at));
    const c = d.config.assignment === 'random' ? queue[Math.floor(Math.random() * queue.length)] : queue[0];
    requireThat(c, 'No hay casos disponibles'); Object.assign(c, { assignee: user.id, status: 'Asignada', updated_at: now() }); return c;
  }
  if (path === '/cases/bulk-close') { privileged(user); reasonRequired(b.reason); const cases = (b.ids || []).map((id: string) => item(d, 'cases', id)); requireThat(cases.length && cases.every((c: Row) => c.status === 'En revision'), 'Selecciona casos en revision'); cases.forEach((c: Row) => Object.assign(c, { status: 'Cerrada no inusual', reason: b.reason, updated_at: now() })); return { closed: cases.length }; }
  if (resource === 'cases') {
    const c = item(d, 'cases', id);
    if (action === 'attachments') { requireThat(/\.(pdf|png|jpg|txt)$/i.test(b.name) && b.content.length <= 2666668, 'Solo PDF, PNG, JPG o TXT hasta 2 MB'); const raw = atob(b.content); requireThat(raw.length <= 2000000, 'Maximo 2 MB'); c.attachments.push({ id: uid(), name: b.name, content: b.content, size: raw.length, user: user.id, at: now() }); return { ok: true }; }
    if (b.action === 'comment') { reasonRequired(b.text); c.comments.push({ user: user.id, text: b.text, at: now() }); for (const u of d.users) if (b.text.includes('@' + u.id)) d.notifications.push({ id: uid(), user: u.id, text: `Mencion en ${id}`, case_id: id, at: now() }); }
    else if (b.action === 'transition') {
      reasonRequired(b.reason); requireThat(d.transitions[c.status].includes(b.target), 'Transicion no permitida');
      if (['En revision', 'Remitida a Cumplimiento'].includes(c.status)) privileged(user);
      requireThat(user.role !== 'analyst' || c.assignee === user.id, 'Solo el analista asignado puede avanzar el caso');
      if (b.target === 'Inusual registrada') { requireThat(['operation_date', 'amount', 'currency', 'description', 'typology', 'analysis', 'evidence', 'decision', 'responsible'].every(k => b.fields?.[k]?.trim()), 'Completa los nueve campos del registro inusual demo'); c.unusual = b.fields; }
      if (b.target === 'Remitida a Cumplimiento') c.suspicious_at = now();
      if (b.target === 'ROS aprobado') { requireThat(user.role === 'officer', 'Solo Cumplimiento aprueba ROS'); requireThat(c.ros && c.ros_author !== user.id, 'Se requiere borrador de otra persona'); const e = item(d, 'entities', c.entity_id); d.entities.filter((o: Row) => o.id !== e.id && ['cbu', 'beneficiary', 'device'].some(k => e[k] === o[k])).forEach((o: Row) => { o.review_required = true; }); }
      c.status = b.target; c.reason = b.reason;
    } else if (b.action === 'assign') { privileged(user); reasonRequired(b.reason); const u = item(d, 'users', b.target); requireThat(d.cases.filter((x: Row) => x.assignee === u.id && !closed(x)).length < u.capacity, 'Capacidad maxima alcanzada'); c.assignee = u.id; if (c.status === 'Nueva') c.status = 'Asignada'; }
    else if (b.action === 'snooze') { reasonRequired(b.reason); requireThat(Number.isFinite(Date.parse(b.target)) && b.target >= today(), 'La pausa debe ser futura'); c.snooze_until = b.target; }
    else if (b.action === 'link') { const other = item(d, 'cases', b.target); requireThat(other.id !== id, 'Selecciona otro caso'); if (!c.linked_cases.includes(other.id)) { c.linked_cases.push(other.id); other.linked_cases.push(id); } }
    else if (b.action === 'ros') { requireThat(c.status !== 'ROS aprobado', 'ROS aprobado no editable'); c.ros = b.text?.trim() || `BORRADOR DEMO - ${id}\nEntidad: ${item(d, 'entities', c.entity_id).name}\nMotivo: ${c.explanation}\nAnalisis: ${c.reason}\nRegistro: ${JSON.stringify(c.unusual)}\nNo enviado a UIF.`; c.ros_author = user.id; }
    else throw new Error('Accion desconocida');
    c.updated_at = now(); return enrich(d, c);
  }
  if (path === '/preferences') {
    if (b.action === 'watch') { item(d, 'entities', b.target); const index = d.watchlist.findIndex((w: Row) => w.user === user.id && w.entity_id === b.target); if (index < 0) d.watchlist.push({ user: user.id, entity_id: b.target }); else d.watchlist.splice(index, 1); }
    else if (b.action === 'view') d.saved_views.push({ id: uid(), user: user.id, name: b.text.slice(0, 60), filters: b.fields });
    else throw new Error('Accion desconocida'); return { ok: true };
  }
  if (path === '/screening/run') {
    privileged(user); let count = 0;
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/).sort().join(' ');
    // The public demo uses exact normalized matches, never live sanctions lists.
    for (const e of d.entities) for (const l of d.lists) if ([e.name, e.beneficiary].some(n => norm(n) === norm(l.name)) && !d.screening.some((h: Row) => h.entity_id === e.id && h.list_id === l.id && h.version === l.version)) { d.screening.push({ id: uid(), entity_id: e.id, entity_name: e.name, list_id: l.id, source: l.source, candidate: l.name, version: l.version, score: 100, status: 'Pendiente', reason: '', at: now() }); count++; }
    return { new_matches: count };
  }
  if (resource === 'screening' && action === 'resolve') { reasonRequired(b.reason); requireThat(['Falso positivo', 'Confirmado'].includes(b.target), 'Decision invalida'); const h = item(d, 'screening', id); Object.assign(h, { status: b.target, reason: b.reason, resolved_by: user.id }); return h; }
  if (path === '/lists/revise') { privileged(user); const l = item(d, 'lists', b.target); l.version++; return l; }
  if (path === '/config') {
    privileged(user); const keys = Object.keys(d.config.weights);
    requireThat(b.weights && Object.keys(b.weights).length === keys.length && keys.every(k => Number.isFinite(b.weights[k]) && b.weights[k] >= 0) && Math.abs(Object.values(b.weights as Record<string, number>).reduce((a, b) => a + b, 0) - 100) < .01 && b.medium >= 0 && b.high <= 100 && b.medium < b.high, 'Pesos deben sumar 100 y umbrales estar ordenados');
    requireThat(['worst', 'weighted', 'percentile'].includes(b.aggregation) && ['risk', 'fifo', 'random'].includes(b.assignment) && b.regulatory_hours >= 1 && b.regulatory_hours <= 168 && b.operation_limit_days >= 1 && b.operation_limit_days <= 365 && b.quality_sample >= 0 && b.quality_sample <= 100, 'Configuracion invalida'); d.config = clone(b); return d.config;
  }
  if (path === '/segments/recalculate') {
    privileged(user); const cfg = d.config;
    for (const e of d.entities) { const score = round(Object.entries(cfg.weights as Record<string, number>).reduce((s, [k, w]) => s + e[k] * w / 100, 0)); const risk = score >= cfg.high ? 'Alto' : score >= cfg.medium ? 'Medio' : 'Bajo'; e.risk_history.push({ at: now(), before: e.score, after: score, risk }); Object.assign(e, { score, risk, segment: `${e.business} / ${risk}` }); }
    for (const e of d.entities) { const siblings = d.entities.filter((o: Row) => o.cuit === e.cuit); const scores = siblings.map((o: Row) => o.score).sort((a: number, b: number) => a - b); e.group_score = cfg.aggregation === 'worst' ? Math.max(...scores) : cfg.aggregation === 'percentile' ? scores[Math.floor((scores.length - 1) * .9)] : round(siblings.reduce((s: number, o: Row) => s + o.score * o.declared_profile, 0) / siblings.reduce((s: number, o: Row) => s + o.declared_profile, 0)); }
    return { count: d.entities.length };
  }
  if (path === '/team/delegate') { privileged(user); reasonRequired(b.reason); item(d, 'users', b.text); const u = item(d, 'users', b.target); requireThat(b.target !== b.text, 'Selecciona reemplazo distinto'); const pending = d.cases.filter((c: Row) => c.assignee === b.text && !closed(c)); requireThat(pending.length + d.cases.filter((c: Row) => c.assignee === u.id && !closed(c)).length <= u.capacity, 'El reemplazo no tiene capacidad suficiente'); pending.forEach((c: Row) => { c.assignee = u.id; }); return { reassigned: pending.length }; }
  throw new Error('Operacion no disponible en esta demo');
}
export async function demoRequest(path: string, userId: string, body?: unknown, method = 'POST') {
  const d = read(); const user = item(d, 'users', userId);
  const result = execute(d, path, user, (body || {}) as Row, method);
  if (body !== undefined) audit(d, userId, (body as Row).action || method, path);
  persist(d); return clone(result);
}
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function demoDownload(path: string, userId: string, name: string) {
  const d = read(); item(d, 'users', userId);
  const url = new URL(path, 'https://demo.invalid'); const [, resource, id, action, attachmentId] = url.pathname.split('/');
  if (resource === 'export') {
    requireThat(['cases', 'entities', 'rules', 'audit'].includes(id), 'Grilla inexistente');
    const rows = (id === 'cases' ? d.cases.map((c: Row) => enrich(d, c)) : d[id]).filter((r: Row) => ['business', 'status', 'risk'].every(k => !url.searchParams.get(k) || r[k] === url.searchParams.get(k)) && JSON.stringify(r).toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase()));
    const keys = rows.length ? Object.keys(rows[0]).filter(k => !['attachments', 'history', 'content'].includes(k)) : ['Sin resultados'];
    const cell = (v: unknown) => { let s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const csv = [keys, ...rows.map((r: Row) => keys.map(k => r[k]))].map(row => row.map(cell).join(',')).join('\r\n');
    save(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), name.replace(/\.xlsx$/, '.csv'));
  } else if (resource === 'cases' && action === 'attachments') {
    const a = item(d, 'cases', id).attachments.find((a: Row) => a.id === attachmentId); requireThat(a, 'Adjunto inexistente'); save(new Blob([Uint8Array.from(atob(a.content), c => c.charCodeAt(0))]), name);
  } else if (resource === 'cases' && action === 'pdf') {
    const { jsPDF } = await import('jspdf'); const doc = new jsPDF(); const c = enrich(d, item(d, 'cases', id)); let y = 20;
    doc.setFontSize(11);
    const lines = ['NEURAL CO | AML - DEMO', ...['id', 'entity_name', 'cuit', 'business', 'status', 'risk', 'deadline', 'explanation', 'reason', 'unusual', 'comments', 'ros'].map(k => `${k}: ${typeof c[k] === 'object' ? JSON.stringify(c[k]) : c[k] || ''}`), 'Datos sinteticos. No enviado a UIF.'];
    for (const line of lines) for (const wrapped of doc.splitTextToSize(line, 175)) { if (y > 275) { doc.addPage(); y = 20; } doc.text(wrapped, 15, y); y += 6; }
    save(doc.output('blob'), name);
  } else throw new Error('Exportacion no disponible');
  audit(d, userId, 'exportar demo', path); persist(d);
}
