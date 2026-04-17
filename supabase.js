import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(url && anonKey);
export const supabase = hasSupabaseEnv ? createClient(url, anonKey) : null;

export async function saveImportSnapshot(payload) {
  if (!supabase) {
    return { ok: false, message: 'Supabase não configurado no .env' };
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (!company?.id) {
    return { ok: false, message: 'Cadastre ao menos uma empresa no Supabase.' };
  }

  const { data: importRun, error: runError } = await supabase
    .from('import_runs')
    .insert({
      company_id: company.id,
      source_filename: payload.filename,
      status: 'processed',
      row_count: payload.rows.length,
      summary: payload.summary,
    })
    .select('id')
    .single();

  if (runError) {
    return { ok: false, message: runError.message };
  }

  const rows = payload.rows.map((row) => ({
    company_id: company.id,
    import_run_id: importRun.id,
    order_code: String(row.pedido ?? ''),
    transportadora: row.transportadora,
    tipo_cobranca: row.tipoCobranca,
    marketplace: row.marketplace,
    uf_destino: row.uf,
    cidade_destino: row.cidade,
    operation_type: row.tipoOperacao,
    amount_carrier: Number(row.cobradoTransportadora || 0),
    amount_customer: Number(row.pagoCliente || 0),
    amount_table: Number(row.valorTabela || 0),
    amount_divergence: Number(row.divergencia || 0),
  }));

  const { error: rowsError } = await supabase.from('shipments').insert(rows);
  if (rowsError) {
    return { ok: false, message: rowsError.message };
  }

  return { ok: true, message: 'Importação salva no Supabase com sucesso.' };
}
