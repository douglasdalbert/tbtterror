import { useEffect, useState } from "react";
import { adminOverviewSchema, parseApiResponse, type AdminOverview } from "@terror/contracts";

export function App() {
  const [overview, setOverview] = useState<AdminOverview>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setOverview(undefined);
    void fetch("/api/admin/overview", { signal: controller.signal })
      .then((response) => parseApiResponse(response, adminOverviewSchema))
      .then(setOverview)
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : "Falha ao acessar a administração.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  return (
    <main>
      <h1>Administração · Terror</h1>
      <p>Painel local sem login. Os CRUDs completos serão implementados na etapa 9.</p>
      <button disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
        {loading ? "Consultando…" : "Atualizar conteúdo"}
      </button>
      {error && <p role="alert" className="error">{error}</p>}
      {overview && (
        <section aria-live="polite">
          <h2>PostgreSQL conectado · conteúdo v{overview.revision}</h2>
          <ul>
            <li>Personagens: {overview.counts.characters}</li>
            <li>Monstros: {overview.counts.monsters}</li>
          </ul>
          <p>Conteúdo mínimo criado por migração. Edição ainda não disponível.</p>
        </section>
      )}
    </main>
  );
}
