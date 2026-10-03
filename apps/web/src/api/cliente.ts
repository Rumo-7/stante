/** Erro devolvido pela API, já com a mensagem pronta para mostrar ao usuário. */
export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const MENSAGEM_PADRAO = 'Não foi possível concluir a operação.';

function mensagemDaResposta(dados: unknown): string {
  return dados && typeof dados === 'object' && 'erro' in dados && typeof dados.erro === 'string'
    ? dados.erro
    : MENSAGEM_PADRAO;
}

async function enviar(metodo: Metodo, caminho: string, corpo?: unknown): Promise<Response> {
  const opcoes: RequestInit = { method: metodo, credentials: 'same-origin' };

  if (corpo instanceof FormData) {
    // O navegador define o Content-Type (com o boundary) sozinho
    opcoes.body = corpo;
  } else if (corpo !== undefined) {
    opcoes.headers = { 'Content-Type': 'application/json' };
    opcoes.body = JSON.stringify(corpo);
  }

  return fetch(`/api${caminho}`, opcoes);
}

async function requisitar<T>(metodo: Metodo, caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await enviar(metodo, caminho, corpo);
  if (resposta.status === 204) return undefined as T;

  const dados: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new ErroApi(resposta.status, mensagemDaResposta(dados));
  return dados as T;
}

/** Uma lista mais o total de resultados do filtro (que vem no cabeçalho X-Total-Count). */
export interface ListaComTotal<T> {
  itens: T[];
  total: number;
}

async function requisitarLista<T>(caminho: string): Promise<ListaComTotal<T>> {
  const resposta = await enviar('GET', caminho);
  const dados: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new ErroApi(resposta.status, mensagemDaResposta(dados));

  const itens = dados as T[];
  const total = Number(resposta.headers.get('X-Total-Count'));
  // Sem o cabeçalho (ou com valor estranho), o total é o que veio
  return { itens, total: Number.isFinite(total) && total >= 0 ? total : itens.length };
}

export const api = {
  get: <T>(caminho: string) => requisitar<T>('GET', caminho),
  lista: <T>(caminho: string) => requisitarLista<T>(caminho),
  post: <T>(caminho: string, corpo?: unknown) => requisitar<T>('POST', caminho, corpo),
  patch: <T>(caminho: string, corpo?: unknown) => requisitar<T>('PATCH', caminho, corpo),
  delete: <T>(caminho: string) => requisitar<T>('DELETE', caminho),
};

/** Texto para mostrar quando uma chamada falha (erro da API ou falha de rede). */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.message;
  return 'Erro ao conectar com o servidor.';
}
