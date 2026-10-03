// Lista os modelos de IA que a chave configurada pode usar, para escolher o GROQ_MODEL.
//   npm run ia:modelos
// Só imprime os nomes dos modelos: a chave nunca aparece na tela.

// Modelos de voz, de moderação e de embeddings não servem para redigir texto
const NAO_SERVE = /whisper|guard|tts|embed|moderation|playai/i;

interface ModeloDaGroq {
  id: string;
  active?: boolean;
  context_window?: number;
}

async function main() {
  const chave = process.env.GROQ_API_KEY?.trim();
  const atual = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b';

  if (!chave || chave.startsWith('COLE_')) {
    console.error('GROQ_API_KEY não está configurada no apps/api/.env (ainda está o texto de exemplo).');
    process.exit(1);
  }

  let resposta: Response;
  try {
    resposta = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${chave}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (erro) {
    console.error('Não foi possível falar com a Groq:', erro instanceof Error ? erro.name : 'erro desconhecido');
    process.exit(1);
  }

  if (!resposta.ok) {
    const erro = (await resposta.json().catch(() => null)) as { error?: { message?: string } } | null;
    console.error(`A Groq respondeu com status ${resposta.status}: ${erro?.error?.message ?? 'sem detalhe'}`);
    if (resposta.status === 401) console.error('A chave foi recusada: confira se foi copiada inteira para o .env.');
    process.exit(1);
  }

  const corpo = (await resposta.json()) as { data?: ModeloDaGroq[] };
  const modelos = (corpo.data ?? [])
    .filter((modelo) => modelo.active !== false && !NAO_SERVE.test(modelo.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  const disponivel = modelos.some((modelo) => modelo.id === atual);
  console.log(`Modelo configurado agora: ${atual}  ->  ${disponivel ? 'DISPONÍVEL' : 'NÃO ESTÁ NA LISTA'}\n`);
  console.log('Modelos de texto liberados para a sua chave:');
  for (const modelo of modelos) {
    const janela = modelo.context_window ? `  (contexto: ${modelo.context_window})` : '';
    console.log(` - ${modelo.id}${janela}`);
  }
  console.log('\nPara trocar: edite GROQ_MODEL no apps/api/.env, salve e reinicie a API.');
}

main();
