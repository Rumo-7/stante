# Carrega o Node (via nvm) apenas na janela atual, sem editar ~/.zshrc.
# Uso:  source ./dev.sh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use >/dev/null
echo "Node $(node -v) | npm $(npm -v)"
