exports.handler = async (event) => {
  const respond = (statusCode, obj) => ({
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(obj),
  });
  if (event.httpMethod !== "POST")
    return respond(405, { error: "Método no permitido" });
  const {
    GITHUB_TOKEN,
    GITHUB_REPO,
    ADMIN_PASSWORD,
    GITHUB_BRANCH = "main",
  } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO || !ADMIN_PASSWORD)
    return respond(503, {
      error: "Faltan GITHUB_TOKEN, GITHUB_REPO o ADMIN_PASSWORD en Netlify",
    });
  if (event.headers["x-admin-password"] !== ADMIN_PASSWORD)
    return respond(401, { error: "Contraseña de administrador incorrecta" });
  if (!/^[\w.-]+\/[\w.-]+$/.test(GITHUB_REPO))
    return respond(500, {
      error: "GITHUB_REPO debe tener formato usuario/repositorio",
    });
  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "Datos inválidos" });
  }
  if (
    typeof data.html !== "string" ||
    !data.html.startsWith("<!DOCTYPE html>") ||
    !data.html.includes('id="cars"') ||
    data.html.length > 9_000_000
  )
    return respond(400, { error: "HTML inválido o demasiado grande" });
  const api = `https://api.github.com/repos/${GITHUB_REPO}/contents/index.html`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Mantos-Admin",
  };
  try {
    const current = await fetch(
      `${api}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
      { headers }
    );
    if (!current.ok)
      return respond(502, {
        error: `No se pudo leer index.html de GitHub (${current.status}). Revisa repositorio, rama y permisos del token.`,
      });
    const { sha } = await current.json();
    const content = Buffer.from(data.html, "utf8").toString("base64");
    const updated = await fetch(api, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Actualizar inventario Mantos Autos",
        content,
        sha,
        branch: GITHUB_BRANCH,
      }),
    });
    if (!updated.ok)
      return respond(502, {
        error: `GitHub rechazó el cambio (${updated.status}). Verifica permisos Contents: Read and write.`,
      });
    return respond(200, { ok: true });
  } catch {
    return respond(502, { error: "No se pudo conectar con GitHub" });
  }
};
