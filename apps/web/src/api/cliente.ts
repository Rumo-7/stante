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

async function requisitar<T>(metodo: Metodo, caminho: string, corpo?: unknown): Promise<T> {
  const opcoes: RequestInit = { method: metodo, credentials: 'same-origin' };

  if (corpo instanceof FormData) {
    // O navegador define o Content-Type (com o boundary) sozinho
    opcoes.body = corpo;
  } else if (corpo !== undefined) {
    opcoes.headers = { 'Content-Type': 'application/json' };
    opcoes.body = JSON.stringify(corpo);
  }

  const resposta = await fetch(`/api${caminho}`, opcoes);
  if (resposta.status === 204) return undefined as T;

  const dados: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem =
      dados && typeof dados === 'object' && 'erro' in dados && typeof dados.erro === 'string'
        ? dados.erro
        : 'Não foi possível concluir a operação.';
    throw new ErroApi(resposta.status, mensagem);
  }
  return dados as T;
}

export const api = {
  get: <T>(caminho: string) => requisitar<T>('GET', caminho),
  post: <T>(caminho: string, corpo?: unknown) => requisitar<T>('POST', caminho, corpo),
  patch: <T>(caminho: string, corpo?: unknown) => requisitar<T>('PATCH', caminho, corpo),
  delete: <T>(caminho: string) => requisitar<T>('DELETE', caminho),
};

/** Texto para mostrar quando uma chamada falha (erro da API ou falha de rede). */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.message;
  return 'Erro ao conectar com o servidor.';
}
