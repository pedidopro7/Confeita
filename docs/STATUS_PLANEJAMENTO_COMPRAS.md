Implementado em `feature/planejamento-compras`:

- normalização de kg/g e L/ml no banco;
- suporte a unidade de compra personalizada por item;
- entrada de compra atômica com custo médio, lote e validade;
- registro de perda normalizado;
- planejador automático de compras por horizonte;
- tela `/painel/compras/lista`;
- pré-preenchimento da entrada de compra a partir da lista;
- atalho entre estoque e planejamento;
- fornecedor mais recente e atalho de WhatsApp quando disponível.

Validação pendente nesta branch: CI (typecheck + build) antes do merge em `main`.
