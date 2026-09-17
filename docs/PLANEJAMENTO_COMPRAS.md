# Planejamento automático de compras

O módulo cruza quatro fontes para sugerir compras:

1. estoque físico atual;
2. ingredientes reservados para pedidos confirmados dentro do horizonte escolhido;
3. estoque mínimo configurado em cada item;
4. unidade real de compra (pacote, caixa, fardo etc.) e seu multiplicador para a unidade-base.

## Fórmula

`necessidade em unidade-base = max(0, reservado + estoque mínimo - estoque físico)`

Quando o item possui unidade de compra configurada, a quantidade sugerida é arredondada para cima:

`sugestão = ceil(necessidade / conteúdo da unidade de compra)`

Exemplo: chocolate controlado em gramas, comprado em pacote de 2.100 g. Se faltarem 3.200 g, a lista sugere **2 pacotes**, não 3.200 unidades.

## Horizonte

A tela `/painel/compras/lista` permite planejar próximas 24h, 3, 7, 14 ou 30 dias. Apenas pedidos `confirmed` com reservas ativas entram no cálculo. Pedidos em produção já tiveram o estoque consumido e não entram novamente.

## Entrada de compra

A entrada aceita a unidade real de compra do item. O RPC `record_inventory_purchase` converte tudo para a unidade-base, atualiza custo médio e, quando informado, cria lote/validade.
