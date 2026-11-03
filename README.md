# Gerador de Moldes

Endereço: https://nelsivansouza40-web.github.io/gerador-moldes/ (instalável no celular e funciona sem internet).

Aplicativo web que calcula moldes planificados a partir das medidas e gera as
folhas em escala real (1:1) para imprimir em A4, A3 ou Carta. Funciona com
papel, papel-cartão, papelão (até 10 mm) e EVA.

## Como usar

1. Abra `index.html` no navegador (computador ou celular).
2. Escolha o modelo e digite as medidas em centímetros.
3. Escolha o material. A espessura entra no cálculo das peças.
4. Toque em **Baixar PDF** e imprima em **tamanho real (100%)**, sem
   "ajustar à página". Confira a régua de 5 cm no rodapé de cada folha.

## Modelos

| Grupo | Modelos |
|---|---|
| Formas básicas (medidas livres) | caixa, cilindro, cone, tronco de cone, prisma, pirâmide, tronco de pirâmide, peça plana |
| Animais | tatu, arara, pombo, jabuti, cobra, coelho, aranha, joaninha, abelha, libélula, marimbondo, onça-pintada, leão, raposa, anta, girafa |
| Corpo humano | cabeça, nariz, olho, orelha, boca, braço, antebraço, punho, mão, coxa, perna, pé |
| Veículos | carro, caminhão baú, empilhadeira |
| Instalações | galpão industrial, casa, caixa d'água elevada |
| EPI e EPC | capacete, protetor auricular tipo concha, botina, óculos de proteção, cone de sinalização, extintor |
| Máquinas | trator, betoneira |
| Personagens | trabalhador com EPI, robô |
| Seu modelo 3D | importação de arquivo .obj ou .stl (por exemplo, de Printables, Thingiverse ou Sketchfab) |

As partes do corpo vêm em tamanho real por padrão (cabeça, braço, mão, pé etc.);
olho, orelha, nariz e boca vêm ampliados para estudo e demonstração.

## Figuras 3D: como o molde é gerado

1. Cada figura é descrita como um conjunto de formas 3D de faces planas
   (`js/figuras.js` e `js/figuras2.js`), com cores e pinturas (olhos, pintas,
   janelas, faixas refletivas).
2. O campo **Acabamento** multiplica o número de faces das partes arredondadas
   (simples, médio, suave, muito suave).
3. Faces maiores que a folha são divididas automaticamente.
4. O planificador (`js/malha3d.js`) abre a malha no plano girando cada face em
   torno da aresta comum. Por isso **todas as arestas mantêm o comprimento
   real**, e os testes conferem isso. As junções mais planas são abertas primeiro;
   corpos arredondados saem em gomos, como casca de laranja aberta.
5. Onde duas faces quase não mudam de direção, não há linha de dobra: o papel
   é curvado à mão, para a superfície ficar lisa.
6. Bordas cortadas recebem um **número** (bordas com o mesmo número se colam) e
   uma aba de cola sem sobrepor outras partes.
7. A prévia 3D mostra a figura montada; dá para girar com o dedo ou o mouse.

Modelos importados são simplificados para o número de faces escolhido
(agrupamento de vértices) antes de planificar.

## Como as medidas são calculadas

- **Medidas externas.** O que você digita é a medida da peça pronta, por fora.
- **Linha neutra.** O material dobra em torno do meio da sua espessura. Por
  isso cada painel entre duas dobras mede *(medida externa − espessura)* e um
  tubo de diâmetro D tem comprimento π × (D − espessura) no molde. Em papel a
  diferença é desprezível; em papelão de 3 a 7 mm é o que faz a peça fechar.
- **Abas de cola.** Largura automática conforme a espessura (8 a 20 mm). Os
  cantos das abas são cortados em meia-esquadria conforme o espaço livre, para
  uma aba nunca invadir a peça vizinha. Quando não há espaço, o aplicativo
  avisa e sugere uma tira de emenda.
- **Material grosso (1,5 mm ou mais).** Junções em "T", como as costelas do
  tatu, são coladas de topo, sem abas.
- **Peças maiores que a folha** são giradas até caber. Quando nem assim cabem,
  saem divididas em partes com 10 mm de sobreposição para emendar.

## Tatu: como as peças fecham

As medidas de todas as peças saem do comprimento total:

- costelas B em meia elipse, mais altas no meio do corpo;
- cada faixa C mede exatamente a meia volta da sua costela, somada à espessura
  do material (conferido também pela fórmula de Ramanujan nos testes);
- a cabeça D é dimensionada para caber na frente da costela B1, e a cauda G
  para caber na traseira da última costela. A tela mostra as duas conferências.

## Arquivos

- `index.html`: tela do aplicativo.
- `js/geometria.js`: planificação das peças (sem dependência de navegador).
- `js/paginacao.js`: distribuição das peças nas folhas e lista de desenho.
- `js/app.js`: formulário, prévia em SVG, impressão e PDF.
- `js/lib/jspdf.umd.min.js`: biblioteca jsPDF 2.5.1 (licença MIT, em
  `js/lib/jspdf-LICENSE.txt`) para gerar o PDF sem internet.
- `js/malha3d.js`: formas 3D, pinturas, subdivisão e planificação.
- `js/figuras.js`, `js/figuras2.js`: catálogo de figuras.
- `js/importar.js`: leitura e simplificação de .obj e .stl.
- `js/previa3d.js`: prévia 3D da figura montada.
- `testes/testes.js`: testes automáticos.

## Testes

```bash
node testes/testes.js
```

Os testes geram todos os modelos em todos os materiais, conferem que nenhum
contorno se cruza (inclusive com centenas de medidas aleatórias), conferem as
contas de cada forma e verificam que as peças ficam dentro da folha e não se
sobrepõem.

## Próximas etapas possíveis

- Mais figuras no catálogo, com os mesmos módulos.
- Simplificação de modelos importados com preservação de cantos vivos.
