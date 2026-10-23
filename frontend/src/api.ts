export type Row = Record<string, any>;
export async function request(
  path: string,
  user: string,
  body?: unknown,
  method = "POST",
) {
  const res = await fetch("/api" + path, {
    method: body === undefined ? "GET" : method,
    headers: { "Content-Type": "application/json", "X-User": user },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : "Revisa los campos del formulario",
    );
  }
  return res.json();
}
export async function download(path: string, user: string, name: string) {
  const res = await fetch("/api" + path, { headers: { "X-User": user } });
  if (!res.ok) throw new Error("No se pudo descargar");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
