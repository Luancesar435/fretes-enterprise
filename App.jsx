import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Download,
  FileSpreadsheet,
  Filter,
  Globe2,
  LayoutDashboard,
  PackageSearch,
  RefreshCcw,
  Save,
  Truck,
  Upload,
  Wallet,
} from 'lucide-react';
import { buildInsights, exportRowsToCsv, formatCurrency, formatPercent, groupBy, parseWorkbook, summarize } from './lib/analytics';
import { sampleRows } from './lib/sampleData';
import { hasSupabaseEnv, saveImportSnapshot } from './lib/supabase';

const navItems = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'pedidos', label: 'Pedidos', icon: PackageSearch },
  { key: 'transportadoras', label: 'Transportadoras', icon: Truck },
  { key: 'marketplaces', label: 'Marketplaces', icon: Globe2 },
  { key: 'importacoes', label: 'Importações', icon: FileSpreadsheet },
  { key: 'empresa', label: 'Empresa', icon: Building2 },
];

function SectionTitle({ title, subtitle, right }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, helper, tone = 'default' }) {
  return (
    <div className={`card stat-card tone-${tone}`}>
      <div className="stat-head">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty-cell">Nenhum registro encontrado.</td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.pedido || row.nome || index}>
                {columns.map((col) => (
                  <td key={col.key}>{col.render ? col.render(row[col.key], row) : row[col.key]}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function BarList({ rows, valueKey, titleKey = 'nome' }) {
  const max = Math.max(...rows.map((r) => Math.abs(r[valueKey] || 0)), 1);
  return (
    <div className="bar-list">
      {rows.map((row) => {
        const value = row[valueKey] || 0;
        const width = `${(Math.abs(value) / max) * 100}%`;
        const positive = value >= 0;
        return (
          <div className="bar-item" key={row[titleKey]}>
            <div className="bar-row">
              <span>{row[titleKey]}</span>
              <strong className={positive ? 'positive' : 'negative'}>{formatCurrency(value)}</strong>
            </div>
            <div className="bar-track">
              <div className={`bar-fill ${positive ? 'positive' : 'negative'}`} style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [rows, setRows] = useState(sampleRows);
  const [imports, setImports] = useState([
    { nome: 'MODELO DE FRETES.xlsx', data: new Date().toLocaleString('pt-BR'), status: 'Amostra carregada', registros: sampleRows.length },
  ]);
  const [filters, setFilters] = useState({ marketplace: 'Todos', transportadora: 'Todas', uf: 'Todas', tipoOperacao: 'Todos' });
  const [banner, setBanner] = useState('Sistema pronto para importar Excel e apresentar resultado executivo amanhã.');
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => ({
    marketplaces: ['Todos', ...new Set(rows.map((r) => r.marketplace))],
    transportadoras: ['Todas', ...new Set(rows.map((r) => r.transportadora))],
    ufs: ['Todas', ...new Set(rows.map((r) => r.uf))],
    tipos: ['Todos', ...new Set(rows.map((r) => r.tipoOperacao))],
  }), [rows]);

  const filtered = useMemo(() => rows.filter((row) => {
    const okMarketplace = filters.marketplace === 'Todos' || row.marketplace === filters.marketplace;
    const okTransportadora = filters.transportadora === 'Todas' || row.transportadora === filters.transportadora;
    const okUf = filters.uf === 'Todas' || row.uf === filters.uf;
    const okTipo = filters.tipoOperacao === 'Todos' || row.tipoOperacao === filters.tipoOperacao;
    return okMarketplace && okTransportadora && okUf && okTipo;
  }), [rows, filters]);

  const summary = useMemo(() => summarize(filtered), [filtered]);
  const insights = useMemo(() => buildInsights(filtered), [filtered]);
  const byTransportadora = useMemo(() => groupBy(filtered, 'transportadora'), [filtered]);
  const byMarketplace = useMemo(() => groupBy(filtered, 'marketplace'), [filtered]);
  const byUf = useMemo(() => groupBy(filtered, 'uf'), [filtered]);
  const worstOrders = useMemo(() => [...filtered].sort((a, b) => a.resultado - b.resultado).slice(0, 8), [filtered]);
  const bestOrders = useMemo(() => [...filtered].sort((a, b) => b.resultado - a.resultado).slice(0, 8), [filtered]);

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  async function onUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseWorkbook(file);
      setRows(parsed);
      setImports((prev) => [{ nome: file.name, data: new Date().toLocaleString('pt-BR'), status: 'Processado localmente', registros: parsed.length }, ...prev]);
      setBanner(`Arquivo ${file.name} importado com ${parsed.length} linhas.`);
      setPage('dashboard');
    } catch (error) {
      console.error(error);
      setBanner('Falha ao importar a planilha. Verifique os cabeçalhos e o formato do arquivo.');
    }
  }

  async function onSaveSupabase() {
    setSaving(true);
    const result = await saveImportSnapshot({ filename: imports[0]?.nome || 'importacao.xlsx', rows, summary });
    setSaving(false);
    setBanner(result.message);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand card">
          <div className="brand-badge">Fretes Enterprise</div>
          <h1>LCR Logística</h1>
          <p>O cockpit executivo para transformar frete em inteligência de margem.</p>
        </div>

        <nav className="nav-list">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`nav-item ${page === key ? 'active' : ''}`} onClick={() => setPage(key)}>
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="card sidebar-alert">
          <div className="sidebar-alert-header">
            <AlertTriangle size={16} />
            <strong>Radar executivo</strong>
          </div>
          <ul>
            <li>Pedidos negativos: {formatPercent(summary.percentualPrejuizo)}</li>
            <li>Devoluções: {formatCurrency(summary.devolucoes)}</li>
            <li>Reentregas: {formatCurrency(summary.reentregas)}</li>
            <li>Divergências: {formatCurrency(summary.divergencia)}</li>
            <li>Cadastros inválidos: {summary.invalidos}</li>
          </ul>
        </div>
      </aside>

      <main className="main-content">
        <header className="hero card">
          <div>
            <div className="hero-eyebrow">Cloudflare-ready • Supabase-ready • Excel-ready</div>
            <h2>Melhor sistema de análise logística já criado para apresentação executiva</h2>
            <p>Upload da planilha, leitura automática das colunas, cálculo do lucro/prejuízo por pedido, visão por transportadora, marketplace, UF, divergências e qualidade cadastral.</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-secondary" onClick={() => exportRowsToCsv(filtered)}><Download size={16} /> Exportar CSV</button>
            <label className="btn btn-primary">
              <Upload size={16} /> Importar Excel
              <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onUpload} />
            </label>
          </div>
        </header>

        <div className="banner">{banner}</div>

        {page === 'dashboard' && (
          <>
            <SectionTitle
              title="Visão executiva"
              subtitle="Diagnóstico consolidado e leitura de margem operacional"
              right={<span className="pill">{filtered.length} linhas analisadas</span>}
            />

            <div className="filters-grid card compact-card">
              <label>
                Marketplace
                <select value={filters.marketplace} onChange={(e) => updateFilter('marketplace', e.target.value)}>
                  {options.marketplaces.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Transportadora
                <select value={filters.transportadora} onChange={(e) => updateFilter('transportadora', e.target.value)}>
                  {options.transportadoras.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                UF
                <select value={filters.uf} onChange={(e) => updateFilter('uf', e.target.value)}>
                  {options.ufs.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Tipo de operação
                <select value={filters.tipoOperacao} onChange={(e) => updateFilter('tipoOperacao', e.target.value)}>
                  {options.tipos.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>

            <section className="stats-grid">
              <StatCard icon={Wallet} label="Receita de frete" value={formatCurrency(summary.receita)} helper="Cobrança de frete ao cliente" tone="good" />
              <StatCard icon={Truck} label="Custo logístico" value={formatCurrency(summary.custo)} helper="Cobrado pelas transportadoras" />
              <StatCard icon={BarChart3} label="Resultado" value={formatCurrency(summary.resultado)} helper={`Margem consolidada: ${formatPercent(summary.margem)}`} tone={summary.resultado >= 0 ? 'good' : 'bad'} />
              <StatCard icon={AlertTriangle} label="Pedidos com prejuízo" value={formatPercent(summary.percentualPrejuizo)} helper={`${summary.pedidosPrejuizo} pedidos negativos`} tone={summary.percentualPrejuizo > 35 ? 'warn' : 'default'} />
            </section>

            <section className="two-column">
              <div className="card">
                <SectionTitle title="Resultado por transportadora" subtitle="Quem sustenta a margem e quem destrói resultado" />
                <BarList rows={byTransportadora.slice(0, 10)} valueKey="resultado" />
              </div>
              <div className="card">
                <SectionTitle title="Insight board" subtitle="Pontos para falar na reunião" />
                <div className="insight-list">
                  {insights.map((insight) => (
                    <div className="insight-item" key={insight}>{insight}</div>
                  ))}
                </div>
              </div>
            </section>

            <section className="three-column">
              <div className="card">
                <SectionTitle title="Melhores pedidos" subtitle="Maiores contribuições de margem" />
                <div className="mini-cards">
                  {bestOrders.map((row) => (
                    <div className="mini-card" key={row.pedido}>
                      <strong>#{row.pedido} • {row.transportadora}</strong>
                      <span>{row.marketplace} • {row.uf} • {row.tipoOperacao}</span>
                      <b className="positive">{formatCurrency(row.resultado)}</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <SectionTitle title="Piores pedidos" subtitle="Maiores erosões de margem" />
                <div className="mini-cards">
                  {worstOrders.map((row) => (
                    <div className="mini-card" key={row.pedido}>
                      <strong>#{row.pedido} • {row.transportadora}</strong>
                      <span>{row.marketplace} • {row.uf} • {row.tipoOperacao}</span>
                      <b className="negative">{formatCurrency(row.resultado)}</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card accent-card">
                <SectionTitle title="Plano de ação" subtitle="Recomendação enterprise" />
                <div className="action-list">
                  <div>1. Renegociar rotas e tabelas nas transportadoras com prejuízo recorrente.</div>
                  <div>2. Ajustar o frete cobrado do cliente nas UFs de maior perda.</div>
                  <div>3. Tratar devolução e reentrega como KPI de diretoria.</div>
                  <div>4. Bloquear marketplace/UF inválidos na importação.</div>
                  <div>5. Salvar snapshots mensais no Supabase para comparação histórica.</div>
                </div>
              </div>
            </section>
          </>
        )}

        {page === 'pedidos' && (
          <section className="card">
            <SectionTitle title="Pedidos analíticos" subtitle="Lucro ou prejuízo por linha" right={<span className="pill"><Filter size={14} /> filtros ativos</span>} />
            <DataTable
              columns={[
                { key: 'pedido', label: 'Pedido' },
                { key: 'transportadora', label: 'Transportadora' },
                { key: 'marketplace', label: 'Marketplace' },
                { key: 'uf', label: 'UF' },
                { key: 'tipoOperacao', label: 'Tipo' },
                { key: 'cobradoTransportadora', label: 'Custo', render: (v) => formatCurrency(v) },
                { key: 'pagoCliente', label: 'Receita', render: (v) => formatCurrency(v) },
                { key: 'divergencia', label: 'Divergência', render: (v) => formatCurrency(v) },
                { key: 'resultado', label: 'Resultado', render: (v) => <span className={v >= 0 ? 'positive' : 'negative'}>{formatCurrency(v)}</span> },
              ]}
              rows={filtered}
            />
          </section>
        )}

        {page === 'transportadoras' && (
          <section className="card">
            <SectionTitle title="Performance por transportadora" subtitle="Receita, custo, margem, divergência e percentual de prejuízo" />
            <DataTable
              columns={[
                { key: 'nome', label: 'Transportadora' },
                { key: 'pedidos', label: 'Pedidos' },
                { key: 'receita', label: 'Receita', render: (v) => formatCurrency(v) },
                { key: 'custo', label: 'Custo', render: (v) => formatCurrency(v) },
                { key: 'divergencia', label: 'Divergência', render: (v) => formatCurrency(v) },
                { key: 'resultado', label: 'Resultado', render: (v) => <span className={v >= 0 ? 'positive' : 'negative'}>{formatCurrency(v)}</span> },
                { key: 'margem', label: 'Margem', render: (v) => formatPercent(v) },
                { key: 'percentualPrejuizo', label: '% Prejuízo', render: (v) => formatPercent(v) },
              ]}
              rows={byTransportadora}
            />
          </section>
        )}

        {page === 'marketplaces' && (
          <div className="two-column">
            <section className="card">
              <SectionTitle title="Resultado por marketplace" subtitle="Rentabilidade por canal de venda" />
              <DataTable
                columns={[
                  { key: 'nome', label: 'Marketplace' },
                  { key: 'pedidos', label: 'Pedidos' },
                  { key: 'receita', label: 'Receita', render: (v) => formatCurrency(v) },
                  { key: 'custo', label: 'Custo', render: (v) => formatCurrency(v) },
                  { key: 'resultado', label: 'Resultado', render: (v) => <span className={v >= 0 ? 'positive' : 'negative'}>{formatCurrency(v)}</span> },
                  { key: 'margem', label: 'Margem', render: (v) => formatPercent(v) },
                ]}
                rows={byMarketplace}
              />
            </section>
            <section className="card">
              <SectionTitle title="Resultado por UF" subtitle="Leitura geográfica da margem" />
              <DataTable
                columns={[
                  { key: 'nome', label: 'UF' },
                  { key: 'pedidos', label: 'Pedidos' },
                  { key: 'receita', label: 'Receita', render: (v) => formatCurrency(v) },
                  { key: 'custo', label: 'Custo', render: (v) => formatCurrency(v) },
                  { key: 'resultado', label: 'Resultado', render: (v) => <span className={v >= 0 ? 'positive' : 'negative'}>{formatCurrency(v)}</span> },
                  { key: 'margem', label: 'Margem', render: (v) => formatPercent(v) },
                ]}
                rows={byUf}
              />
            </section>
          </div>
        )}

        {page === 'importacoes' && (
          <div className="two-column import-grid">
            <section className="card">
              <SectionTitle title="Central de importação" subtitle="Fluxo pronto para receber Excel e gravar snapshots" />
              <label className="upload-zone">
                <Upload size={28} />
                <strong>Enviar planilha de fretes</strong>
                <span>O sistema identifica as colunas mais comuns e calcula o resultado automaticamente.</span>
                <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onUpload} />
              </label>
              <div className="stack-list">
                <div>• Processa Excel no navegador com segurança.</div>
                <div>• Normaliza colunas como transportadora, marketplace, UF e divergência.</div>
                <div>• Salva no Supabase quando as variáveis de ambiente estiverem configuradas.</div>
              </div>
              <div className="button-row">
                <button className="btn btn-secondary" onClick={() => setRows(sampleRows)}><RefreshCcw size={16} /> Restaurar base demo</button>
                <button className="btn btn-primary" onClick={onSaveSupabase} disabled={saving || !hasSupabaseEnv}>
                  <Save size={16} /> {saving ? 'Salvando...' : 'Salvar no Supabase'}
                </button>
              </div>
              {!hasSupabaseEnv && <p className="helper-text">Configure o arquivo .env para ativar o salvamento no Supabase.</p>}
            </section>
            <section className="card">
              <SectionTitle title="Histórico de importações" subtitle="Arquivos processados no ambiente" />
              <DataTable
                columns={[
                  { key: 'nome', label: 'Arquivo' },
                  { key: 'data', label: 'Data/Hora' },
                  { key: 'status', label: 'Status' },
                  { key: 'registros', label: 'Registros' },
                ]}
                rows={imports}
              />
            </section>
          </div>
        )}

        {page === 'empresa' && (
          <div className="two-column">
            <section className="card">
              <SectionTitle title="Arquitetura do produto" subtitle="Estrutura recomendada para escalar como SaaS" />
              <div className="grid-cards">
                <div className="mini-card"><strong>Multiempresa</strong><span>Segregação por tenant, RLS e usuários por companhia.</span></div>
                <div className="mini-card"><strong>Cadastros</strong><span>Transportadoras, marketplaces, regras de cobrança e política de frete.</span></div>
                <div className="mini-card"><strong>Motor analítico</strong><span>Lucro/prejuízo por pedido, por rota, por parceiro e por período.</span></div>
                <div className="mini-card"><strong>Auditoria</strong><span>Snapshots de importação, rastreio de versão e histórico mensal.</span></div>
              </div>
            </section>
            <section className="card accent-card">
              <SectionTitle title="Stack recomendada" subtitle="Tudo pronto para deploy no Cloudflare" />
              <div className="action-list">
                <div>Frontend em React + Vite.</div>
                <div>Hospedagem em Cloudflare Pages.</div>
                <div>Banco, autenticação e storage no Supabase.</div>
                <div>Políticas RLS prontas no SQL entregue junto.</div>
                <div>Base preparada para histórico e expansão comercial.</div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
