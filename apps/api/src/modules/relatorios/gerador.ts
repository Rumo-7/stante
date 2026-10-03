import { env } from '../../env';
import { ErroHttp } from '../../http/erros';

export interface MensagemIA {
  role: 'system' | 'user';
  content: string;
}

export interface RespostaIA {
  texto: string;
  modelo: string;
  tokensEntrada: number | null;
  tokensSaida: number | null;
}

/** O que o resto do sistema conhece da IA: trocar de provedor é escrever outra classe com isto. */
export interface GeradorDeTexto {
  readonly modelo: string;
  gerar(mensagens: MensagemIA[]): Promise<RespostaIA>;
}

const URL_DA_GROQ = 'https://api.groq.com/openai/v1/chat/completions';

interface OpcoesGroq {
  chave: string;
  modelo: string;
  url?: string;
  /** Para os testes trocarem a rede por um falso. */
  fetchImpl?: typeof fetch;
  tempoLimiteMs?: number;
}

/**
 * Groq fala o mesmo protocolo da OpenAI. Temperatura baixa: o texto deve seguir os dados,
 * não "criar". Nenhuma mensagem de erro daqui inclui a chave nem o conteúdo enviado.
 */
export class GeradorGroq implements GeradorDeTexto {
  readonly modelo: string;

  constructor(private readonly opcoes: OpcoesGroq) {
    this.modelo = opcoes.modelo;
  }

  async gerar(mensagens: MensagemIA[]): Promise<RespostaIA> {
    const chamar = this.opcoes.fetchImpl ?? fetch;

    let resposta: Response;
    try {
      resposta = await chamar(this.opcoes.url ?? URL_DA_GROQ, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.opcoes.chave}` },
        body: JSON.stringify({ model: this.opcoes.modelo, messages: mensagens, temperature: 0.2, max_tokens: 1800 }),
        signal: AbortSignal.timeout(this.opcoes.tempoLimiteMs ?? 45_000),
      });
    } catch (erro) {
      if (erro instanceof Error && (erro.name === 'TimeoutError' || erro.name === 'AbortError')) {
        throw new ErroHttp(504, 'O serviço de IA não respondeu a tempo. Tente novamente.');
      }
      console.error('Falha de rede ao chamar o serviço de IA:', erro instanceof Error ? erro.name : 'erro desconhecido');
      throw new ErroHttp(502, 'Não foi possível falar com o serviço de IA. Tente novamente em instantes.');
    }

    if (!resposta.ok) {
      console.error(`O serviço de IA respondeu com status ${resposta.status}.`);
      if (resposta.status === 401 || resposta.status === 403) {
        throw new ErroHttp(502, 'A chave de acesso ao serviço de IA foi recusada. Avise o administrador do sistema.');
      }
      if (resposta.status === 429) {
        throw new ErroHttp(429, 'O limite de uso do serviço de IA foi atingido. Tente de novo em alguns minutos.');
      }
      if (resposta.status === 400 || resposta.status === 404) {
        throw new ErroHttp(502, 'O serviço de IA recusou o pedido. Verifique o modelo configurado.');
      }
      throw new ErroHttp(502, 'O serviço de IA está indisponível no momento.');
    }

    const corpo = (await resposta.json().catch(() => null)) as {
      model?: string;
      choices?: { message?: { content?: unknown } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | null;

    const texto = corpo?.choices?.[0]?.message?.content;
    if (typeof texto !== 'string' || texto.trim() === '') {
      throw new ErroHttp(502, 'O serviço de IA devolveu uma resposta vazia.');
    }

    return {
      texto: texto.trim(),
      modelo: corpo?.model ?? this.opcoes.modelo,
      tokensEntrada: corpo?.usage?.prompt_tokens ?? null,
      tokensSaida: corpo?.usage?.completion_tokens ?? null,
    };
  }
}

/** Sem a chave configurada não há gerador, e a tela de relatórios avisa isso em vez de falhar. */
export function criarGeradorPadrao(): GeradorDeTexto | null {
  return env.GROQ_API_KEY ? new GeradorGroq({ chave: env.GROQ_API_KEY, modelo: env.GROQ_MODEL }) : null;
}
