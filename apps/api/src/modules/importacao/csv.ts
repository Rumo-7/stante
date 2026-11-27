// Leitura de CSV exportado do Excel/LibreOffice, sem biblioteca externa.
//
// O que uma planilha real costuma trazer, e que este arquivo trata:
// - Excel em português separa por ";" (vírgula é o separador decimal); outros programas usam ",".
// - Arquivo em Windows-1252 (o "ANSI" do Excel) em vez de UTF-8: sem cuidado, "Órgão" vira "Ã“rgÃ£o".
// - BOM (um caractere invisível) no início de arquivos UTF-8 salvos pelo Excel.
// - Células com ";" ou quebra de linha dentro, protegidas por aspas ("Rua A; nº 5").
// - Aspas dentro de uma célula escritas em dobro ("Ofício ""urgente""").
// - Quebras de linha do Windows (\r\n).

/** Bytes do arquivo -> texto. Tenta UTF-8; se houver byte inválido, o arquivo é Windows-1252. */
export function decodificar(bytes: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  return texto.replace(/^\uFEFF/, '');
}

/** Descobre o separador olhando o cabeçalho: o que aparece mais vezes fora de aspas, ";" ou ",". */
export function detectarSeparador(texto: string): ';' | ',' {
  const primeiraLinha = texto.split(/\r?\n/, 1)[0] ?? '';
  const semAspas = primeiraLinha.replace(/"[^"]*"/g, '');
  const contar = (caractere: string) => semAspas.split(caractere).length - 1;
  return contar(',') > contar(';') ? ',' : ';';
}

/**
 * Texto CSV -> linhas de células. Linhas vazias são mantidas (como [""]) para que a posição
 * no resultado continue batendo com o número da linha que a pessoa vê na planilha.
 */
export function lerCsv(texto: string, separador = detectarSeparador(texto)): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = '';
  let entreAspas = false;

  const fecharCelula = () => {
    linha.push(celula);
    celula = '';
  };
  const fecharLinha = () => {
    fecharCelula();
    linhas.push(linha);
    linha = [];
  };

  for (let i = 0; i < texto.length; i += 1) {
    const caractere = texto[i];

    if (entreAspas) {
      if (caractere === '"') {
        // "" dentro de aspas é uma aspa literal; uma aspa sozinha fecha a célula
        if (texto[i + 1] === '"') {
          celula += '"';
          i += 1;
        } else {
          entreAspas = false;
        }
      } else {
        celula += caractere;
      }
      continue;
    }

    if (caractere === '"' && celula === '') entreAspas = true;
    else if (caractere === separador) fecharCelula();
    else if (caractere === '\n') fecharLinha();
    else if (caractere !== '\r') celula += caractere;
  }

  // Última linha, quando o arquivo não termina com quebra de linha
  if (celula !== '' || linha.length > 0) fecharLinha();

  return linhas;
}

export const linhaVazia = (celulas: string[]) => celulas.every((valor) => valor.trim() === '');
