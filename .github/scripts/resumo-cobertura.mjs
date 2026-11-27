// Junta os coverage-summary.json dos workspaces numa tabela Markdown.
// Uso: node .github/scripts/resumo-cobertura.mjs >> "$GITHUB_STEP_SUMMARY"
import { existsSync, readFileSync } from 'node:fs';

const workspaces = [
  ['API (apps/api)', 'apps/api/coverage/coverage-summary.json'],
  ['Web (apps/web)', 'apps/web/coverage/coverage-summary.json'],
  ['Shared (packages/shared)', 'packages/shared/coverage/coverage-summary.json'],
];
const pct = (m) => `${m.pct.toFixed(1)}% (${m.covered}/${m.total})`;

const linhas = ['## Cobertura de testes', '', '| Workspace | Linhas | Branches | Funções |', '|---|---|---|---|'];
for (const [nome, arquivo] of workspaces) {
  if (!existsSync(arquivo)) {
    linhas.push(`| ${nome} | sem relatório | | |`);
    continue;
  }
  const { total } = JSON.parse(readFileSync(arquivo, 'utf8'));
  linhas.push(`| ${nome} | ${pct(total.lines)} | ${pct(total.branches)} | ${pct(total.functions)} |`);
}
console.log(linhas.join('\n'));
