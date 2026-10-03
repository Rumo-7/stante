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
  /** O modelo parou por atingir o limite de tamanho: o texto está incompleto. */
  truncada?: boolean;
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

  /**
   * O limite de tamanho é folgado porque modelos que raciocinam gastam parte dele "pensando" antes de
   * escrever. Nos da família gpt-oss o raciocínio é pedido curto: o parecer precisa de redação, não de
   * cálculo (os números já chegam prontos). O parâmetro só vai para quem o aceita.
   */
  private montarPedido(mensagens: MensagemIA[]) {
    const pedido: Record<string, unknown> = {
      model: this.opcoes.modelo,
      messages: mensagens,
      temperature: 0.2,
      max_tokens: 4000,
    };
    if (this.opcoes.modelo.startsWith('openai/gpt-oss')) pedido.reasoning_effort = 'low';
    return pedido;
  }

  async gerar(mensagens: MensagemIA[]): Promise<RespostaIA> {
    const chamar = this.opcoes.fetchImpl ?? fetch;

    let resposta: Response;
    try {
      resposta = await chamar(this.opcoes.url ?? URL_DA_GROQ, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.opcoes.chave}` },
        body: JSON.stringify(this.montarPedido(mensagens)),
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
      // A explicação da Groq (ex.: "o modelo X foi descontinuado") vai para o log do servidor. Ela não contém
      // a chave nem o nosso texto, e é o que permite descobrir por que o pedido foi recusado.
      const detalhe = await lerDetalheDoErro(resposta);
      console.error(`O serviço de IA respondeu com status ${resposta.status}: ${detalhe.mensagem ?? 'sem detalhe'}`);

      if (resposta.status === 401 || resposta.status === 403) {
        throw new ErroHttp(502, 'A chave de acesso ao serviço de IA foi recusada. Avise o administrador do sistema.');
      }
      if (resposta.status === 429) {
        throw new ErroHttp(429, 'O limite de uso do serviço de IA foi atingido. Tente de novo em alguns minutos.');
      }
      if (detalhe.ehDeModelo || resposta.status === 404) {
        throw new ErroHttp(
          502,
          `O modelo de IA "${this.opcoes.modelo}" não está disponível para esta chave. Veja os modelos liberados com "npm run ia:modelos" e ajuste GROQ_MODEL no .env.`,
        );
      }
      if (resposta.status === 400) {
        throw new ErroHttp(502, 'O serviço de IA recusou o pedido. O detalhe está no registro (log) do servidor.');
      }
      throw new ErroHttp(502, 'O serviço de IA está indisponível no momento.');
    }

    const corpo = (await resposta.json().catch(() => null)) as {
      model?: string;
      choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | null;

    const texto = corpo?.choices?.[0]?.message?.content;
    if (typeof texto !== 'string' || texto.trim() === '') {
      throw new ErroHttp(502, 'O serviço de IA devolveu uma resposta vazia.');
    }

    const semRaciocinio = texto.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (semRaciocinio === '') throw new ErroHttp(502, 'O serviço de IA devolveu uma resposta vazia.');

    return {
      texto: semRaciocinio,
      modelo: corpo?.model ?? this.opcoes.modelo,
      tokensEntrada: corpo?.usage?.prompt_tokens ?? null,
      tokensSaida: corpo?.usage?.completion_tokens ?? null,
      truncada: corpo?.choices?.[0]?.finish_reason === 'length',
    };
  }
}

interface DetalheDoErro {
  mensagem: string | null;
  ehDeModelo: boolean;
}

/** Lê, com segurança, a explicação de um erro da Groq. Nunca falha: no pior caso devolve "sem detalhe". */
async function lerDetalheDoErro(resposta: Response): Promise<DetalheDoErro> {
  const corpo = (await resposta.json().catch(() => null)) as { error?: { message?: unknown; code?: unknown } } | null;
  const mensagem = typeof corpo?.error?.message === 'string' ? corpo.error.message.slice(0, 300) : null;
  const codigo = typeof corpo?.error?.code === 'string' ? corpo.error.code : '';
  return { mensagem, ehDeModelo: /model/i.test(codigo) || /\bmodel\b/i.test(mensagem ?? '') };
}

/** Sem a chave configurada não há gerador, e a tela de relatórios avisa isso em vez de falhar. */
export function criarGeradorPadrao(): GeradorDeTexto | null {
  return env.GROQ_API_KEY ? new GeradorGroq({ chave: env.GROQ_API_KEY, modelo: env.GROQ_MODEL }) : null;
}
