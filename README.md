# Terror — tabuleiro cooperativo multitoque

Jogo de fuga de um monstro, jogado por várias pessoas simultaneamente em um
tablet. Cada participante arrasta seu token com o dedo e usa sua área de ações.
O notebook executa o servidor na rede local; futuramente, uma pessoa poderá
controlar o monstro pelo celular.

Este documento é a fonte principal do planejamento, das decisões e do progresso.
As orientações para agentes de programação ficam em [AGENTS.md](./AGENTS.md).
A proposta original está em [idéia.txt](./idéia.txt); as decisões consolidadas
aqui prevalecem sobre alternativas antigas dessa proposta.

## Estado atual e próxima etapa

- [x] Levantar a proposta de jogo.
- [x] Escolher arquitetura, infraestrutura e geometria do mapa.
- [x] Registrar requisitos, etapas e instruções para continuidade.
- [x] Implementar a base técnica e validar o acesso LAN no tablet real.
- [x] Implementar o fluxo local de seleção, calibração e tokens da etapa 2.
- [x] Implementar início, capítulo e pausa autoritativos sobre a geometria atual.
- [x] Usar `.env` como configuração prioritária e `.env.example` como fallback.
- [x] Validar acesso LAN no tablet real.
- [x] Corrigir falha de inicialização em HTTP da LAN e validar no navegador.
- [x] Ocultar menu de jogo e configurações após o início, preservando os controles da partida.
- [x] Compactar setores, fixar miniatura interna e reorganizar atributos horizontalmente.
- [x] Selecionar cor exclusiva para cada token durante a entrada do jogador.
- [x] Completar no tablet o aceite do fluxo de entrada, controles e dez contatos simultâneos.
- [x] Implementar limites de movimento, colisões, descoberta compartilhada e catálogo público filtrado (etapa 5).
- [x] Validar no tablet movimento, névoas e multitoque.
- [ ] Ampliar testes de colisão quando forem criados e combinados vários tipos
  de terreno.
- [ ] Definir regras dos objetivos antes de validar sua alcançabilidade.

**Estado:** etapas 2 e 3 tiveram o aceite físico confirmado pelo usuário.
Na configuração, `.env` prevalece e `.env.example` completa variáveis ausentes;
`POSTGRES_PASSWORD` precisa ser definido localmente.
A etapa 4 tem quatro módulos iniciais tipados e geração determinística por seed,
com encaixes conectados, rotações de 60° e dimensionamento pela área útil e
escala. O servidor mantém o mapa completo; clientes não recebem a seed nem
células ainda ocultas. A validação de objetivos (regras ainda não definidas) e
o aceite visual do mapa no tablet continuam pendentes. A etapa 5 foi
implementada: o servidor limita movimentos pela destreza e bloqueia paredes/
conectores incompatíveis; visão compartilhada revela células exploradas e envia
somente terreno já descoberto, com névoa densa persistente e névoa leve
temporária. No tablet, o usuário confirmou movimento, névoas e multitoque; o
teste também demonstrou que barreiras podem bloquear o token. O comportamento
observado em áreas marrons/verdes fica como protótipo, sem decisão de design.
Quando a criação de vários terrenos for retomada, ampliar os testes de colisão
entre tipos de terreno, conectores e suas combinações. A velocidade base é
configurável por
`BASE_MOVEMENT_CELLS_PER_SECOND` no `.env` (padrão 0,5 célula/s); o cliente
recebe a mesma taxa do servidor. O raio padrão é três células e pode ser
alterado por `PLAYER_VISION_RADIUS_CELLS` no `.env` (1–12). O catálogo público
já omite atributos e capacidades internas do monstro. O aceite físico de
movimento, névoas e multitoque foi confirmado, e o teste demonstrou bloqueio
por barreiras. A diferença observada entre áreas marrons e verdes não é uma
decisão de design. Testes ampliados entre múltiplos terrenos ficam para quando
a criação/combinação desses terrenos for retomada. Estados/visão próprios do
monstro e contribuição de 10% de jogadores dormindo dependem das mecânicas
ainda não implementadas. O servidor mantém participantes, atributos,
escala, posições, prontidão, contagem, capítulo, pausa e cores dos tokens em
memória, com contratos validados e comandos Socket.IO. A geração recusa iniciar
se o mapa não comportar todos os jogadores.
Fullscreen e áudio são autorizados por interação; quatro dicas orientadas ficam
fora da caixa central, uma em cada lado, sem ocupar os setores. Cada setor
ocupado tem nome/saída à esquerda e, somente na preparação, abas de token e
personagem à direita, com painel central compacto. O botão da aba “Jogo” não
ocupa espaço: seu painel é o padrão, e tocar novamente na configuração
selecionada volta à prontidão. Escape também retorna ao painel de jogo.
Após terminar a contagem inicial, as duas abas de configuração e sua coluna
desaparecem, inclusive durante a pausa; prontidão, pausa, retomada e saída
continuam disponíveis nos respectivos estados. A entrada escolhe
três letras (AAA inicialmente), sem duplicar nomes na mesma mesa; abre a aba
de jogo com “Estou pronto”, sem botão de menu para essa aba. Nome fica no extremo
superior da coluna esquerda e X no inferior. Em token/personagem, o X apenas
volta ao painel de jogo; estando no jogo, abre a confirmação de saída no setor.
O nome acessível do botão acompanha a ação: voltar ou sair.
Na entrada, as três letras ficam ao lado de um seletor de cor inicialmente
aleatória. Há 13 cores de alto contraste (vermelho, azul, verde, amarelo, roxo,
rosa, preto, cinza, branco, laranja, marrom, verde escuro e azul escuro); o
modal reutilizável destaca a atual,
fecha ao selecionar qualquer cor e desativa as escolhidas por outros jogadores.
O servidor rejeita atomicamente nomes e cores duplicados; o token e sua
miniatura usam o fundo escolhido, com texto contrastante.
Setores reservam 96 px CSS, independentemente da escala, em vez de 116–140 px.
A miniatura interna mede sempre 64 px; somente tokens externos e terrenos escalam.
Atributos usam
ícones com explicação provisória em modal interno, contador verde +3/+2/+1/+0 e
alerta vermelho na aba enquanto faltam pontos a distribuir. O painel de atributos
tem 8 px de padding à esquerda para afastar o contador da coluna de nome/saída. Cada propriedade
centraliza ícone, valor, − e + na mesma linha da sua coluna; quando o painel
tem até 320 px de largura, ícone/valor ficam acima de −/+ para preservar
alvos de toque, conforme alternativa aprovada pelo usuário. O jogador distribui
três pontos entre força, destreza e inteligência, partindo de 1 em cada atributo.
Os campos ingleses são `strength`, `dexterity` e `wisdom`.
Todos prontos iniciam dez segundos regressivos na central; desmarcar qualquer
prontidão cancela e uma nova confirmação coletiva reinicia em dez. Pontos
restantes não impedem iniciar, mas atributos/escala/entrada ficam bloqueados
ao terminar a contagem. Qualquer jogador pode pausar; todos os participantes
conectados precisam confirmar para iniciar dez segundos de retomada; desmarcar
cancela e uma nova confirmação coletiva reinicia em dez. A simulação continua
congelada durante essa contagem. Desconexão de cliente participante
pausa; reconectar recupera seus setores e exige nova confirmação coletiva.
Após um relato de falha com tokens grandes, a zona Phaser passou a atualizar
seu círculo de toque ao redimensionar. No reteste físico posterior, o usuário
confirmou que o fluxo funcionou. Enquanto o próprio token está pressionado, todo o setor fica bloqueado,
muda para a aba de jogo e mostra caminhada animada com explicação.
Tokens e calibração mostram o nome de três letras no centro, com três
marcadores por atributo: punho, pé em movimento e lâmpada. Nesta etapa ficam
vazios, pois o consumo real dos atributos ainda não está implementado; pontos
configurados não significam atributos em uso.
Os tokens dos setores 5 e 7 começam diante de seus próprios setores; os setores
laterais 4 e 8 foram girados em mais 180° para leitura por quem está fora da mesa.
As duas dicas verticais externas à central também receberam mais 180°,
acompanhando a orientação de leitura dos setores laterais.
O cabeçalho central mostra a conexão por uma bola: verde quando conectado,
amarela enquanto conecta/reconecta e vermelha em falhas de conexão/conteúdo.
O indicador mantém nome acessível; detalhes de erros continuam explícitos.
A revisão de conteúdo não aparece na central. O resumo de prévia só aparece
fora de produção. O botão de áudio/tela cheia é uma sobreposição central acima
da interface, independente da conexão; desaparece apenas com áudio em execução
e tela cheia ativa, reaparecendo se qualquer um deixar de estar ativo. A
instrução textual sobre arrastar e calibrar foi removida da preparação.
O relato posterior de tela preta no Chrome pela LAN foi reproduzido:
`crypto.randomUUID()` indisponível em HTTP derrubava a montagem React. A
identidade da aba agora usa UUID v4 gerado com `crypto.getRandomValues()`,
compatível com HTTP, e preserva a reconexão via `sessionStorage`. Falhas de
armazenamento/geração mostram alerta explícito sem desmontar a interface.
Correção publicada somente no jogo e validada no navegador; a abertura também
foi aprovada no aceite físico posterior.
O seletor de cores foi publicado somente no container do jogo, sem reiniciar
servidor ou PostgreSQL. Navegador recarregado confirmou o modal de entrada com
o botão de cor aleatória e o modal de cores, incluindo a cor atual destacada.
Depois, o usuário confirmou o aceite físico do checklist no tablet e informou
que tudo funcionou.

**Próxima etapa:** revisar no tablet o mapa modular. Movimento, névoas,
multitoque e bloqueio por barreiras já foram testados. Quando a criação de
vários terrenos for retomada, ampliar os testes de colisão cobrindo os tipos e
combinações gerados; a diferença observada entre áreas marrons e verdes não é
uma regra ou preferência de design. O movimento é livre durante a preparação e
limitado pela destreza somente durante a fase `running`.
Antes de validar a alcançabilidade, definir as regras do primeiro objetivo e
suas dependências; a exigência de força 2 para combustível continua sendo
proposta, não decisão.

**Primeiro marco jogável:** entrada dos jogadores, calibração compartilhada,
tokens com movimento simultâneo e obstáculos simples no tablet real.

### Como atualizar este planejamento

1. Marcar uma tarefa somente quando a entrega estiver implementada e validada.
2. Registrar, na etapa correspondente, a validação executada e suas limitações.
3. Atualizar o estado e a próxima etapa ao finalizar cada trabalho.
4. Manter tarefas parcialmente concluídas desmarcadas, descrevendo o que falta.
5. Registrar decisões novas e resolver pendências antes de implementar regras
   ambíguas; não transformar sugestões em decisões silenciosamente.

## Arquitetura decidida

| Parte | Responsabilidade |
|---|---|
| Jogo web: TypeScript + Phaser | Canvas do tabuleiro, tokens, névoa, animações e entrada multitoque. |
| React no jogo | Componentes leves de entrada e áreas de ações, onde fizer sentido; sem menus complexos. |
| Servidor: Node.js + TypeScript | Autoridade da partida, regras, relógio, posições, eventos, IA, API e Socket.IO. |
| PostgreSQL | Conteúdo e configurações persistentes, com volume Docker. |
| Admin React separado | Menus e CRUDs, acessando o banco exclusivamente pela API. |
| Futuro cliente do monstro | Página para celular no mesmo projeto, mapa próprio, joystick e ações. |

- Uso inicial exclusivamente na rede local da casa, sem hospedagem pública.
- Notebook como servidor; tablet e celulares como clientes de navegador.
- Docker Compose com identificação do projeto `terror`, sem interferir nos
  containers de outros projetos.
- Serviços separados para jogo web, servidor, PostgreSQL e admin.
- Admin em perfil opcional do Compose, iniciado apenas quando necessário.
- Não é necessário um container para o futuro celular: ele é um cliente web.
- Base escolhida: npm workspaces, Vite 7, React 19, Phaser 3, TypeScript 7,
  Node.js 22, Express 5, Socket.IO 4 e Zod 4. Resoluções exatas no lockfile.
- Imagens: Node 22 Bookworm slim, Nginx 1.28 Alpine e PostgreSQL 17 Alpine.
- Banco acessado por `pg`, SQL parametrizado e migrações SQL transacionais;
  nenhum ORM necessário nesta fase.
- Jogo publicado na porta 8080; admin na 8081, limitado ao notebook por padrão.
  API (3000) e PostgreSQL (5432) permanecem internos à rede Docker.
- Não criar uma conexão do navegador diretamente com o PostgreSQL.
- Configurações de infraestrutura e segredos ficam em variáveis de ambiente;
  conteúdo de personagens, monstros e regras fica no PostgreSQL.

### Estado, sincronização e desempenho

- A partida ativa permanece em memória no servidor.
- Reiniciar o servidor encerra a partida; não haverá snapshots de retomada
  inicialmente. Conteúdo e configurações do banco continuam preservados.
- Pausar congela movimento, IA, ações, contagem e demais temporizadores de jogo.
  Retomar continua do mesmo estado enquanto o servidor permanecer ativo.
- Reconexão recupera o estado autorizado da partida ainda ativa. As políticas
  para queda de conexão e controle abandonado precisam ser definidas.
- Carregar e validar uma cópia das configurações no início da partida. Edições
  administrativas só afetam partidas seguintes.
- Clientes enviam comandos; o servidor valida regras e calcula o estado válido.
- Planejar resposta visual imediata no tablet com reconciliação do servidor,
  sem permitir que o cliente ignore colisões ou requisitos.
- Separar renderização, atualização da simulação e transmissão de estado.
  Não atualizar o React ou escrever no banco a cada frame/movimento.
- Contratos TypeScript compartilhados precisam também de validação em runtime.
- Frequências de atualização e metas de latência serão medidas, não presumidas.

## Tabuleiro, entrada e calibração

- Tablet de referência: 1920 × 1200, com suporte físico a pelo menos 10 toques.
  Não assumir resolução fixa nem confundir pixels CSS com pixels físicos.
- Oito setores: três acima, três abaixo e um em cada lateral.
- O jogador entra pelo próprio setor, escolhe um nome de três letras maiúsculas
  de A a Z, começando em AAA. As rodas reutilizáveis aceitam botões, arrasto,
  roda do mouse e setas do teclado, com volta entre A/Z. Nomes duplicados são
  rejeitados atomicamente no servidor, inclusive em entradas simultâneas.
  O diálogo tem duas colunas: título alinhado ao topo e fechar abaixo na
  esquerda; letras e “Entrar” centralizados na direita, usando toda a altura.
  As rodas têm controles de 24 px e letras de 28 px, sem reservar uma faixa
  horizontal para o título. Outros diálogos preservam seu cabeçalho original.
- Após entrar, o painel de jogo abre com a confirmação “Estou pronto”, sem
  botão de menu próprio. Nome e saída ficam nas extremidades superior/inferior
  da coluna esquerda; calibração e atributos ficam à direita, em uma coluna
  vertical de botões de 32 px CSS somente durante a preparação.
  Tocar a configuração selecionada novamente ou Escape retorna ao jogo.
  O X tem o mesmo tamanho das abas: nas configurações volta ao jogo, sem
  solicitar saída; no painel de jogo abre a confirmação de saída.
  A confirmação para retomar a pausa reutiliza a estrutura de prontidão.
- Modais cobrem somente o próprio setor, com fechamento por botão ou Escape,
  foco de teclado contido e controles de fundo inativos. Erros de entrada/ação
  mudam apenas a borda para vermelho; detalhes são anunciados por `role=alert`
  sem texto visível adicional nem alteração do fundo.
- Uma miniatura de 64 px CSS, incluindo a borda de indicadores, acompanha
  os controles de calibração, sem aumentar/reduzir dentro do setor.
- O multiplicador é compartilhado: quando alguém ajusta, todos os tokens
  externos e elementos do terreno ajustam proporcionalmente. O tamanho para
  o dedo deve ser conferido no token externo, não na miniatura fixa.
- Trata-se da escala interna do jogo, não do zoom do navegador.
- Diâmetro máximo inicial do token: **64 pixels CSS**, incluindo todos os
  indicadores de status desenhados dentro da borda, sem aumentar sua dimensão.
- Folga: **8 pixels CSS por lado**. Para escala `s`, token = `64s`, folga = `8s`,
  distância entre lados opostos do hexágono = `80s`, raio até a ponta =
  `80s / sqrt(3)` e altura = `160s / sqrt(3)` (aproximadamente `92,38s`).
- Primeiro calcular a célula; depois encaixar componentes completos de sete
  células na área útil. Nunca reduzir células automaticamente para caber mais.
- A prévia usa uma malha de componentes sem células sobrepostas e apenas
  componentes inteiros. Os setores reservam profundidade fixa de `96`
  pixels CSS, limitada a 18% da largura nas laterais e 30% da altura acima/abaixo.
  A reserva não acompanha a escala nem reduz células; telas pequenas podem não
  comportar a prévia, com aviso explícito.
- O comprimento dos setores laterais é limitado a 480 px CSS, 54% da altura e
  ao vão entre setores superiores/inferiores menos 12 px, evitando sobreposição.
- A calibração mostra o token e botões +/−, sem exibir o valor do multiplicador.
- A escala da prévia vai de 0,5× a 2×, sem recriar o canvas. Esse intervalo ainda
  não é uma regra definitiva, mas agora está sincronizado com o servidor.
- Ao redimensionar o token, atualizar o círculo de toque existente, não apenas
  chamar `setInteractive` de novo: Phaser reativa a área antiga nesse caso.
  O círculo deve sempre ter centro e raio iguais à metade do diâmetro atual.
- Pressionar o token reserva um ponteiro por jogador e bloqueia todo o seu
  setor, incluindo abas, configuração, prontidão e saída. A aba de jogo mostra
  uma animação de caminhada e “Não é possível executar ação enquanto em
  movimento.” Soltar, cancelar o toque, perder foco, pausar ou desconectar libera
  a reserva. Outros jogadores continuam podendo usar seus próprios controles.
- Sobras são fundo do `body` com névoa decorativa, visto pelo canvas transparente.
  Não são transitáveis e não substituem a névoa de visibilidade da etapa 5.
- Calcular a área útil removendo os setores dos jogadores. Tokens, caminhos,
  portas e janelas devem manter dimensões compatíveis.
- Tokens maiores implicam módulos maiores e potencialmente menos módulos;
  não comprimir caminhos para encaixar um mapa fixo.
- Fullscreen e áudio precisam ser iniciados por uma interação permitida pelo
  navegador. Tratar fullscreen indisponível ou encerrado explicitamente.
- Impedir scroll, zoom e gestos nativos sobre a superfície de jogo, preservando
  entrada multitoque e a atribuição de cada ponteiro ao token correto.
- A interface durante o jogo prioriza ícones, não leitura de menus.
- Durante a preparação, exibir quatro dicas alternadas: acima, abaixo e nos
  dois lados da caixa central “Terror”, sempre fora dela, nunca dentro dos
  setores. Orientar cada apresentação para quem está naquele lado da mesa;
  todos compartilham as quatro apresentações. As dicas são uma exceção à
  interface de jogo por ícones e não devem aumentar a reserva dos setores.
- Dicas iniciais:
  - “Todos vocês possuem walkie-talkie e podem conversar entre si.” Começar a
    dica com um ícone próprio/licenciado de walkie-talkie.
  - “Caso você esteja no estado ‘dormindo’, poderá ser acordado por outro jogador.”
- A dica do walkie-talkie comunica uma regra temática de comunicação entre
  amigos; não exige implementar chat de voz.
- O SVG do walkie-talkie foi desenhado com base na silhueta anexada pelo usuário.
  Ícones de atributos são SVGs próprios. Marcadores do token compartilham os
  mesmos traçados no Phaser e na calibração: punho e lâmpada redesenhados das
  referências fornecidas, pé em movimento conforme SVG fornecido pelo usuário.
  Vazios têm contorno; destreza vazia não tem traços de movimento e inteligência
  vazia não tem raios. O estado em uso preenche o desenho e adiciona esses traços,
  mas só será ativado quando existir consumo autoritativo dos atributos.
  Controle de jogo e saída usam
  os traçados indicados do SVG Silh: [controle](https://svgsilh.com/image/2022084.html)
  e [saída](https://svgsilh.com/image/1152114.html), publicados sob
  [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Os traçados ficam
  incorporados em [Icons.tsx](./apps/game/src/Icons.tsx), sem requisições externas.
- O botão compartilhado aceita mouse iniciado no próprio botão, teclado e
  toque por ponteiro. Ignora cliques sintetizados que sejam redirecionados de
  um arrasto iniciado em outro controle, evitando avançar duas letras ao
  soltar a roda sobre uma seta.

## Executar a base técnica

### Estrutura

```text
apps/game/            React + canvas Phaser
apps/server/          API, Socket.IO, estado em memória e migrações
apps/admin/           painel React opcional
packages/contracts/   schemas Zod e contratos TypeScript compartilhados
docker/               imagens e proxy Nginx
scripts/              preparação local e verificações reproduzíveis
```

Cada workspace tem seu próprio `tsconfig.json`; as regras comuns estão em
`tsconfig.base.json`. O servidor compila ESM para Node; os clientes usam Vite.

### Primeira execução em Docker

Requisitos: Node.js >= 22.18, npm e Docker com Compose.

```sh
npm ci
./start-linux.sh
```

`start-linux.sh` cria `.env` com segredos aleatórios e permissões restritas se
ele ainda não existir, então recompila e inicia PostgreSQL, servidor e jogo,
aguardando os serviços ficarem saudáveis. O script não inicia o admin opcional.
Para comandos Compose manuais, use `npm run compose -- <argumentos>`; esse
comando carrega `.env.example` primeiro e `.env` depois, então os valores de
`.env` prevalecem e valores ausentes usam o exemplo. `docker compose` direto
não aplica essa combinação.
Para aplicar mudanças no `.env`, execute-o novamente; uma mudança que recrie o
servidor encerra a partida em memória. O arquivo `.env` é ignorado por Git e
pelo contexto Docker. `POSTGRES_PASSWORD` fica intencionalmente vazio no
exemplo e deve ser definido em `.env` com um segredo de ao menos 32 caracteres;
sem ele, o Compose recusa iniciar. Nunca versionar o arquivo real.

- Jogo no notebook: `http://localhost:8080`.
- Tablet: `http://<IP-LAN-do-notebook>:8080`, na mesma rede.
- Saúde da aplicação: `http://<IP-LAN-do-notebook>:8080/api/health`.
- Portas podem ser alteradas em `.env`; recriar os serviços para aplicá-las.
- Se estiver usando WSL/Docker Desktop, o IP do WSL não necessariamente é o IP
  acessível pelo tablet. Conferir encaminhamento de portas e firewall do Windows
  para a porta do jogo. Não expor API ou banco diretamente.
- Esta base usa HTTP apenas na LAN confiável; não publicar na internet.
- A identidade da aba não exige HTTPS: usa `crypto.getRandomValues()`, pois
  `crypto.randomUUID()` não está disponível no Chrome em HTTP pelo IP da LAN.
  Se a página ficar preta em uma versão antiga, recarregar para obter o jogo
  atualizado. Se o navegador bloquear armazenamento/geração da identidade,
  a versão atual mostra o erro na central em vez de apagar a interface.

### Ambiente de execução

- O `setup:env` cria `.env` com `NODE_ENV=development`; `.env.example` fornece
  valores de fallback e atualmente exemplifica `NODE_ENV=production`. O arquivo
  local prevalece sobre o exemplo; valores ausentes usam o exemplo.
- Compose manual deve ser executado por `npm run compose -- ...`; o servidor
  local carrega primeiro `.env.example` e depois `.env`. No Vite local, essa
  precedência se aplica a `NODE_ENV`. Variáveis definidas no shell prevalecem.
- `POSTGRES_PASSWORD` não tem fallback válido e precisa ser definido em `.env`;
  o placeholder vazio no exemplo faz o Compose falhar explicitamente.
- Decisões condicionais usam somente `NODE_ENV === "production"` ou sua
  negação; qualquer outro valor é não produção. Validar ambos os casos ao
  mudar comportamento condicionado ao ambiente.
- Compose passa o valor ao servidor e ao build do jogo. No Vite local, o jogo
  lê apenas `NODE_ENV` do arquivo na raiz; nenhum segredo é enviado ao cliente.
  O build continua otimizado mesmo no ambiente de jogo não produção.
- Somente fora de produção aparece “Prévia · X terrenos · token Y px”.
  Erros de conexão, configuração, ações e mapa continuam visíveis em produção.
- Após alterar o valor em `.env`, executar
  `npm run compose -- up --build -d --wait server game`; apenas reiniciar Nginx
  não altera o valor incorporado no JavaScript. Não recriar o servidor durante
  uma partida. Para Vite local, reiniciar o processo de desenvolvimento.
- Para verificar somente o jogo em produção sem reiniciar o servidor:
  `NODE_ENV=production npm run compose -- up --build --no-deps -d --wait game`.
  Depois restaurar o ambiente de `.env` com
  `npm run compose -- up --build --no-deps -d --wait game`.

### Admin opcional

```sh
npm run compose -- --profile admin up --build -d --wait admin
# Depois de usar:
npm run compose -- --profile admin stop admin
```

Abrir `http://localhost:8081`, sem login, senha de painel ou token.
O admin atual só consulta revisão e contagem do conteúdo pela API; formulários
de edição pertencem à etapa 9. A senha do PostgreSQL continua necessária e
permanece exclusivamente no servidor; ela não é um login do painel.

`ADMIN_BIND_ADDRESS=127.0.0.1` limita o painel ao notebook. Alterar para acesso
pela LAN somente de forma consciente. A API administrativa também pode ser
acessada pelo proxy do jogo por qualquer pessoa na LAN; desligar o painel não
desabilita suas rotas. Essa ausência de autenticação é uma decisão para uso
local entre amigos; não publicar o sistema na internet.
Desligar o container do admin não desliga jogo, API ou banco.

### Banco e migrações

- Volume: `terror_postgres-data`; não removê-lo para uma reinicialização comum.
- O servidor aplica migrações de `apps/server/migrations/` antes de aceitar
  conexões, em transação e com lock; migrações aplicadas não executam novamente.
- Conteúdo inicial: um sobrevivente e um monstro de pesadelo, ambos placeholders
  sem arte externa, além das constantes de geometria/entrada já decididas.
- Definições são JSONB validadas por Zod; IDs e metadados de migração são
  relacionais. Durações e regras ainda pendentes não foram inventadas.
- Não editar migrações já aplicadas: adicionar uma nova migração numerada.
- CRUDs futuros devem validar conteúdo e incrementar a revisão global na mesma
  transação. O servidor atual carrega sua cópia ao iniciar o lobby; carregar
  novamente ao iniciar cada nova partida será implementado com o ciclo de jogo.
- `npm run compose -- restart server` descarta o lobby em memória e carrega o
  conteúdo persistido, com nova identidade. Não existe salvamento de partida.
- Não trocar a senha em `.env` esperando alterar a senha de um banco já
  inicializado; a rotação exige alterar também o usuário PostgreSQL.

### Desenvolvimento fora dos containers de aplicação

O fluxo Docker acima é o caminho padrão. Para Vite/HMR e depuração local:

É necessário publicar explicitamente o banco para o host antes de iniciar o
servidor local. Criar `compose.local.yaml` (ignorado pelo Git) com:

```yaml
services:
  postgres:
    ports:
      - "127.0.0.1:5433:5432"
```

A porta fica limitada ao host; não publicar o PostgreSQL na LAN.

```sh
npm run compose -- --profile admin stop admin server game
npm run compose -- -f compose.yaml -f compose.local.yaml up -d --wait postgres
npm run build
POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5433 npm run dev:server
# Em outros terminais:
npm run watch -w @terror/server
npm run dev:game
# Opcional:
npm run dev:admin
```

Vite: jogo na 5173, admin na 5174; ambos fazem proxy `/api` para o servidor
local na 3000, e o jogo também faz proxy do Socket.IO. `dev:server` observa os
arquivos compilados; `watch` recompila ao editar TypeScript. Se editar contratos,
usar também `npm run watch -w @terror/contracts`.

Para voltar ao fluxo padrão, remover a publicação local do banco recriando-o
com o Compose base, preservando o volume, e subir novamente os serviços.
Encerrar primeiro os processos locais de desenvolvimento:

```sh
npm run compose -- up -d --force-recreate --wait postgres
npm run compose -- up --build -d --wait server game
```

Esse fluxo alternativo está documentado, mas o smoke test desta entrega usou
os containers de aplicação, não servidores locais com HMR.

### Verificações

```sh
npm run build
npm run typecheck
npm test
npm run check:stack
# Com admin ligado:
CHECK_ADMIN=1 npm run check:stack
# Banco isolado e temporário para integração:
npm run compose -- --profile test run --build --rm integration
npm run compose -- --profile test stop postgres-test
npm run compose -- --profile test rm -f postgres-test
```

`npm test` não exige PostgreSQL. A integração usa um banco de teste com tmpfs,
não o volume da partida; verifica API, admin sem login, migrações idempotentes,
cópia de configurações e WebSocket com reconexão. A execução local alternativa,
`npm run test:integration`, exige `TEST_DATABASE_URL` de um banco dedicado.
Os testes da identidade do cliente (UUID v4 em HTTP, persistência por aba e
falhas explícitas) também fazem parte de `npm test`; para executá-los
isoladamente, usar `npm run test -w @terror/game`.

```sh
# Somente sem partida em andamento: altera o ciclo de vida dos serviços!
npm run check:lifecycle
```

Essa verificação cria e remove um registro de teste próprio, recria o container
PostgreSQL preservando o volume, para o admin e reinicia o servidor. Confirma
persistência dos dados, independência do admin e descarte do estado em memória.
Ao terminar, o admin fica parado. Não usar durante uma partida.

Para inspeção operacional:

```sh
npm run compose -- ps
npm run compose -- logs --tail=50 server
npm run compose -- stop
```

### Resultados e limitações da etapa 1

- Build dos quatro workspaces, typecheck e dez testes unitários passaram.
- Uma integração com PostgreSQL real e isolado passou.
- Serviços Docker com healthchecks validados; HTTP funciona pelo localhost e
  pela interface de rede do notebook.
- WebSocket real através do Nginx, solicitação de estado e reconexão verificados.
- Recriação real do PostgreSQL preservou um registro de teste; reinício do
  servidor gerou novo lobby; desligar admin manteve jogo e servidor.
- Navegador integrado: canvas Phaser e estado conectado verificados.
  Admin sem autenticação verificado por API e integração.
- O bundle inicial inclui Phaser e recebe aviso de tamanho do Vite; Nginx usa
  gzip e cache para assets versionados. Fluidez e custo real no tablet ainda
  não foram medidos; não declarar metas de FPS/latência como atingidas.
- Acesso pelo tablet físico confirmado. Aceite anterior de controles/fullscreen/
  áudio foi informado pelo usuário, mas tokens grandes falharam; reteste físico
  da correção, bloqueio de setor e ciclo de partida permanece pendente.

## Início da partida

- Todos os participantes ativos prontos iniciam uma contagem de 10 segundos.
- “Estou pronto” é uma confirmação alternável no painel de jogo; a contagem
  aparece regressiva na central. Setores vazios desaparecem quando começa o
  capítulo/partida, mas continuam disponíveis durante a preparação/contagem.
- Cancelar prontidão/contagem cancela a contagem para todos.
- Os demais mantêm sua confirmação; quando todos voltam a estar prontos,
  reiniciar em dez segundos, nunca continuar o tempo cancelado.
- Editar atributos desmarca prontidão do jogador; alterar escala/tamanho da
  mesa desmarca todos e cancela a contagem. Entrar/sair também cancela a contagem.
- Não exigir gastar todos os pontos para confirmar prontidão. Ao fim dos dez
  segundos, atributos, escala e novas entradas ficam bloqueados, mesmo com
  pontos restantes, inclusive durante a pausa.
- Gerar e validar o mapa antes de começar; não iniciar um mapa incompleto caso
  a geração demore mais do que a contagem.
- Nesta entrega, escolher no servidor uma célula distinta da geometria atual
  por jogador, próxima ao seu setor. Não começar se faltarem células válidas.
  Conectividade, obstáculos e objetivos são escopo da etapa 4.
- Apresentar “Capítulo 1: O silêncio da noite” na central por dois segundos,
  esmaecer pelo tempo autoritativo e iniciar a simulação. Título é provisório
  próprio, sem arte/frases de personagens protegidos.
- Qualquer jogador pode pausar. Pausa congela posições, relógio de simulação e
  o tempo restante do capítulo; o painel de jogo mostra “Pronto para retomar”.
  Todos os participantes conectados devem confirmar para iniciar dez segundos
  regressivos na central. A partida continua pausada durante essa contagem,
  inclusive o tempo do capítulo. Desmarcar cancela para todos, preserva os
  outros votos e confirmar todos novamente reinicia em dez. Saída cancela a
  contagem; desconexão também invalida todos os votos. Ao completar os dez
  segundos, retomar a fase anterior sem descontar esse tempo da simulação.
- Saída confirmada remove apenas aquele jogador. O último encerra a partida
  e retorna ao lobby. Desconexão mantém jogadores/posições e pausa a partida;
  reconexão não retoma automaticamente. Desconectar observadores não pausa.
- Identidade de reconexão da aba fica em `sessionStorage`, sem login/token de
  autenticação. O servidor vincula setores a esse cliente e recusa comandos
  para setores alheios; isso não é autenticação segura para redes não confiáveis.
  Reabrir sem a identidade original não recupera setores órfãos automaticamente.
- Reiniciar o servidor encerra a partida; PostgreSQL continua apenas com
  conteúdo/configurações. Um novo servidor recebe outra identidade de partida.
- Arena/escala ficam fixas durante a partida. Resize ativo apenas reenquadra a
  câmera dentro da área útil, sem mudar posições canônicas. `ResizeObserver`
  sincroniza o canvas com o contêiner, incluindo fullscreen e alterações de
  tamanho que o polling de resize do Phaser não detecte. Movimento local é fluido no Phaser;
  comandos de posição são limitados a 20 Hz, sem React/banco por frame.
  O servidor valida movimentos no retângulo útil nesta etapa; colisões ainda
  não estão implementadas. Snapshot só contém a visão compartilhada atual
  dos jogadores, sem dados futuros do monstro.

## Mapa procedural modular

- Um componente de terreno (módulo) contém sete células hexagonais: uma central
  e seis ao redor. O mapa inteiro reúne vários desses componentes, não apenas
  sete células. A prévia da base técnica mostra somente um componente.
- Cada célula possui tipagem e capacidades próprias. Prever ao menos:
  - caminho: célula onde o personagem pode pisar/transitar;
  - célula com ações próprias: interação definida pelo terreno/objetivo;
  - célula receptora de objetos: permite colocar itens associados a outros
    terrenos/objetivos, como isqueiro, espelho/quadro M ou ossos.
- Todo componente deve ter pelo menos uma célula de caminho. A montagem também
  precisa garantir caminhos conectados entre componentes.
- Não assumir que ação e objeto impedem trânsito: definir transitabilidade,
  ações e pontos de objetos separadamente conforme as capacidades da célula.
- Definição autorada do componente, instância posicionada/rotacionada no mapa,
  célula interna e objeto colocado são conceitos distintos. Objetos podem ser
  distribuídos em células receptoras de outros componentes no início da partida.
- Rotações permitidas: 0°, 60°, 120°, 180°, 240° e 300°.
  A ideia original de rotações de 90° foi substituída.
- Módulos autorados com conexões de borda compatíveis e tipos de terreno.
- Gerar a disposição dinamicamente após seleção e calibração dos jogadores.
- Separar coordenadas lógicas hexagonais das coordenadas de renderização.
- Validar encaixes, colisões, entradas e caminhos até os objetivos.
- Validar também requisitos de itens e atributos: conectividade geométrica
  sozinha não garante que uma partida seja solucionável.
- Objetivos podem depender de módulos distantes e de objetos colocados em
  células auxiliares, como combustível longe do carro.
- Filtrar módulos pelas capacidades do monstro: hospital/cura só faz sentido
  quando a partida inclui ferimentos, por exemplo.
- Caminhos, portas, janelas, paredes, cercas, pedras e carros serão entidades
  reutilizáveis; não adicionar todos de uma vez ao primeiro protótipo.
- Phaser renderiza o mapa; o gerador de módulos será lógica própria testável.
  Nenhum plugin/template de geração foi selecionado.

## Personagens, movimento e ações

### Atributos e feedback

- Força, destreza e inteligência possuem níveis entre 1 e 3. Destreza substitui
  o antigo nome do atributo velocidade, inclusive na variável `dexterity` e
  nos contratos; “velocidade” continua designando a medida física do movimento.
- Em inglês, usar `strength`, `dexterity` e `wisdom`. A interface portuguesa
  mantém “Inteligência”; a migração 003 renomeia `intelligence` para `wisdom`
  no conteúdo persistido, preservando níveis e sem editar migrações aplicadas.
- Cada jogador entra com força 1, destreza 1 e inteligência 1, e três pontos
  disponíveis na aba de personagem. Cada “+” consome um ponto; “−” devolve um.
  Não baixar de 1, ultrapassar 3 ou gastar mais de três pontos. Exemplos de
  distribuição completa: 3/2/1 e 2/2/2. Pontos ainda livres ficam explicitamente
  indicados; pontos restantes não impedem prontidão, mas não poderão ser
  distribuídos após o início.
- O painel tem quatro colunas: contador +N verde grande e força, destreza,
  inteligência. Cada propriedade centraliza a linha `ícone valor − +`.
  Com painel de até 320 px, cada coluna usa ícone/valor acima e −/+ abaixo
  para evitar botões estreitos demais. Ícones substituem os textos;
  tocar no ícone abre título e lorem ipsum em modal interno fechável.
  Níveis 2/3 ficam verdes. O componente `TouchButton` oferece um indicador
  vermelho absoluto no canto superior direito, usado na aba de atributos
  enquanto houver pontos livres, sem depender de um texto visível.
- A distribuição é independente por jogador e atualiza o token de calibração
  e o token no tabuleiro. O servidor valida e mantém o estado em memória;
  não grava movimentos/atributos da partida ativa no PostgreSQL.
- A proposta associa força a sons emitidos, destreza a cansaço e inteligência
  a comportamento desastrado. Fórmulas e a direção dessas compensações ainda
  precisam ser esclarecidas antes de implementar o balanceamento.
- Força também influencia a representação de altura do personagem, sem romper
  a calibração compartilhada do token circular.
- Indicadores na borda interna do token mostram níveis exigidos e utilizados,
  sempre dentro do diâmetro máximo calibrado.
- Referência visual fornecida pelo usuário: disco central azul e faixas em arco
  na periferia para força, destreza, inteligência e demais status. As áreas
  vermelha, verde e roxa do exemplo representam regiões de indicadores; a
  associação definitiva entre cores e atributos ainda não foi escolhida.
- O diâmetro externo de toda a composição (centro mais faixas) é `64s` pixels
  CSS no tabuleiro e 64 px fixos na miniatura do setor. As faixas ocupam parte
  do disco, não um anel extra fora do token. Centro,
  espessura das faixas e ícones escalam proporcionalmente.
- Mostrar os níveis em uso com preenchimento/segmentos e ícones identificáveis,
  sem depender exclusivamente de cor. O desenho de referência define o formato,
  não implementa nem altera fórmulas de atributos.
- O arrasto mede a velocidade solicitada pelo dedo. Ao exceder a permitida,
  o token fica para trás/parado enquanto a solicitação permanecer acima do
  limite; não simplesmente acelerar o token para alcançar o dedo.
- Definir thresholds e recuperação do arrasto no protótipo, com testes reais.
- Obstáculos bloqueiam o token mesmo quando o dedo atravessa a barreira.
- Janelas/cercas podem exigir agilidade: requisitos não atendidos aparecem em
  vermelho, com indicação visual adicional.
- Jogadores possuem três pontos de vida visíveis; o monstro inicial usa sono
  em vez de dano à vida.

### Componentes de ação

- Botão de jogo reutilizável para ações, itens, consumíveis e futuras magias.
- O jogador precisa soltar seu próprio token para executar uma ação.
- Tocar token e ação simultaneamente rejeita a ação e mostra um símbolo vermelho
  de proibido. Centralizar o bloqueio e validar também no servidor.
- Não bloquear a ação de um jogador porque outro jogador está movendo seu token.
- Ações próximas aparecem no setor do jogador, com ícones identificáveis.
- Interações podem exigir atributos individuais ou cooperação: força total 3
  pode ser atendida por um personagem de força 3 ou por vários participantes.
- Definir distância, duração, cancelamento e contribuição simultânea por ação.
- Portas podem abrir, fechar ou quebrar; janelas/cercas podem ser atravessadas
  quando os requisitos permitirem; carros podem ser abastecidos/consertados.

### Medo e tempo

- Token não pressionado demonstra medo: tremor, linhas visuais e som moderado.
- O medo também gera eventos detectáveis pelo monstro. Definir exceções para
  pausa, sono, atordoamento e desconexão.
- “Turno” é o nome provisório de uma unidade de duração em jogo contínuo,
  não de alternância entre jogadores.
- Exemplos iniciais: atravessar uma célula pequena em uma unidade base,
  colocar/rearmar/recolher armadilha em um turno, sair dela em cinco turnos.
- Destreza não altera a duração de ações inicialmente; movimento tem suas
  próprias regras de velocidade e multiplicadores.
- Guardar durações base e multiplicadores configuráveis no conteúdo do banco.
  A duração em segundos de um turno ainda não foi escolhida.

## Visão, monstro e estados

### Névoa e detecção

- Jogadores do tablet compartilham a união das áreas de visão dos participantes.
- Névoa cinza sugere estruturas, mas esconde objetos importantes e o monstro.
- Lanterna amplia o raio de visão e também ajuda o monstro a detectar o jogador.
- Monstro possui mapa/campo de visão e névoa diferentes dos jogadores.
- Filtrar estado no servidor por papel; o futuro celular não deve receber
  posições ocultas apenas para escondê-las visualmente.
- Jogadores não veem os status do monstro, incluindo seus atributos e níveis
  em uso. Não desenhar esses indicadores no tablet nem transmiti-los na visão
  da partida destinada aos jogadores.
- No app do monstro, o controlador pode ver os status em uso dos jogadores,
  como níveis de força, destreza e inteligência utilizados naquele momento.
  Essa informação pertence à visão do monstro, não a um painel compartilhado.
- Indicadores de um jogador acompanham sua visibilidade/revelação para o monstro:
  não revelar posição ou status atuais de um jogador oculto pela névoa por meio
  dessa interface. Sono e revelações temporárias seguem suas regras específicas.
- O `/api/catalog` público expõe apenas ID/nome dos monstros; atributos,
  capacidades e estado do monstro não são enviados aos jogadores.
- Monstros recebem eventos detectáveis, como som e exposição de luz, conforme
  seus próprios critérios e alcance.
- A IA patrulha aleatoriamente e investiga pontos detectados usando rotas
  válidas do mapa, sem atravessar paredes.

### Monstro inicial: comportamento de pesadelo

A proposta usa Freddy Krueger como referência de comportamento. Não há arte
licenciada selecionada: não baixar/reproduzir automaticamente a imagem citada
na proposta nem assumir direitos de uso sobre personagem, imagens ou áudio.
Usar placeholders próprios ou assets com licença verificada no protótipo.

- Força 2, destreza 2, inteligência 2; multiplicador de movimento 1,2.
- Pode interagir com os terrenos conforme seus atributos.
- Contato coloca o jogador em sono/pesadelo, com névoa vermelha no token/setor.
- Se todos os participantes em jogo estiverem dormindo, o monstro vence.
- Jogador dormindo permanece visível para jogadores e monstro, e contribui com
  10% do raio normal de visão, usando modificadores configuráveis.
- Atordoamento é temporário; sono é uma especialização permanente até resgate.
- Um jogador próximo pode executar a ação de acordar o companheiro.
- Capítulos com títulos como “Hora do pesadelo” e “Pesadelo final”.

### Armadilhas

- Componente base compartilhado para armar, rearmar, ativar e recolher; variante
  do monstro especializa aparência/efeitos, sem duplicar regras de duração.
- Limite inicial: três armadilhas no total, contando carregadas e colocadas.
- Aparência proposta: círculo preto dentro de uma célula de caminho.
- Disparo prende/atordoa, gera grito e revela temporariamente o alvo ao monstro.
  A duração da revelação ainda precisa ser definida.
- Exibir animação estilizada de rasgo sobre o token, com assets apropriados.
- Após disparar, a armadilha permanece no local desativada.
- Rearmar ou recolher custa inicialmente um turno; colocar também custa um.
- Mostrar disponibilidade no inventário/ícone de ações do monstro.
- Prever saída/desativação pelo jogador, com requisitos ainda a definir.

### Objetivos e extensões

- Primeiro objetivo: encontrar combustível e chegar ao carro para fugir.
  Inicialmente qualquer personagem com combustível pode dirigir, sem requisito
  de inteligência. Manter explícita a possibilidade de exigir inteligência depois.
- Requisito de força 2 para carregar combustível é uma proposta a confirmar.
- Definir quem escapa, capacidade do carro e resultado dos demais participantes.
- Objetivo posterior: coletar quatro espelhos com letras M, E, D e O em células
  distintas e entregá-los a uma sala específica do capítulo.
- Objetivo posterior: levar ossos à igreja e usar um isqueiro para queimá-los.
- Monstros futuros podem ferir, matar ou transformar jogadores.
- Transformação poderá substituir o setor do jogador por QR code e transferi-lo
  ao cliente de monstro no celular; a regra pertence ao tipo de monstro.
- Futuro celular: joystick, réplica reduzida do mapa, névoa própria, inventário,
  ações e magias. IA e controle humano usam as mesmas regras e comandos.
- Definir associação segura do QR code, troca de controlador e reconexão.

## Etapas de implementação e critérios de conclusão

As etapas seguem a ordem abaixo. Não considerar uma etapa concluída apenas
porque o código compila: verificar a experiência ou regra correspondente.

### 1. Base técnica — entregue; acesso LAN validado no tablet

- [x] Workspace TypeScript com jogo, servidor, admin e contratos compartilhados.
- [x] Docker Compose `terror`: serviços separados e admin opcional.
- [x] PostgreSQL persistente, migrações e conteúdo mínimo de desenvolvimento.
- [x] API validada, conexão Socket.IO e lobby em memória.
- [x] Comandos de build, testes e execução documentados e validados.
- [x] Completar aceite de acesso pela LAN no tablet real.

**Aceite:** tablet alcança o cliente/servidor pela LAN; saúde dos serviços
verificada; dado de teste persiste após recriar o container; admin pode ser
desligado sem interromper jogo/servidor.

### 2. Mesa multitoque e calibração — implementada e aceita no tablet

- [x] Oito setores, entrada, seleção básica e círculo com borda de indicadores.
- [x] Fullscreen e áudio autorizados por gesto; liberar arrasto ao cancelar
  ponteiros ou perder foco.
- [x] Escala compartilhada e cálculo da área útil, inclusive em resize.
- [x] Arrasto com identificação independente de ponteiros.
- [x] Dicas de preparação nas quatro orientações, incluindo walkie-talkie.
- [x] Token com nome no disco central e marcadores internos por ícones,
  sem ultrapassar o diâmetro calibrado.
- [x] Setores com abas de token e personagem; controles ativados por ponteiro,
  sem depender de cliques sintetizados em gestos multitoque.
- [x] Distribuição de três pontos, base 1/1/1 e limites 1–3, com reembolso,
  contador individual. Tokens agora usam nomes e marcadores de uso por ícones,
  em vez dos antigos indicadores F/D/I de pontos configurados.
- [x] Quatro dicas externas à central e setores compactos; atributos em quatro
  colunas com ícones, contador +N e destaque verde dos níveis alocados.
- [x] Remover a instrução textual de arrasto/calibração da preparação.
- [x] Duas colunas verticais de navegação, jogo vazio inicial, calibração sem
  multiplicador e confirmação de saída no setor.
- [x] Rodas de três letras, nomes únicos locais, borda de erro e modais internos.
- [x] Indicador de alerta reutilizável no botão e SVG de walkie-talkie baseado
  na referência fornecida pelo usuário.
- [x] Paleta de 13 cores distintas para tokens, escolha aleatória inicial, seletor/modal
  reutilizável, cor exclusiva validada pelo servidor e renderização no token e
  na miniatura.

**Aceite:** pelo menos dez contatos simultâneos no dispositivo real, incluindo
tokens e controles, sem roubar gestos; ajustar um círculo escala todos; não há
scroll/zoom involuntário nem sobreposição que impeça jogar. O usuário confirmou
LAN, escala comum e arrasto de todos os tokens, mas identificou bloqueio do
seletor e de +/− durante o arrasto. Após substituir o seletor por abas e tratar
controles por ponteiro, Chromium/CDP validou oito tokens e dois controles
simultâneos, troca de aba, toque sem duplicação e cancelamento. Em 2026-11-01,
o usuário confirmou que concluiu o checklist físico no tablet — incluindo os
novos controles de atributos, nomes de três letras, cores, navegação, modais,
fullscreen, áudio e dez contatos — e informou que tudo funcionou.

### 3. Início, capítulo e pausa — implementada na geometria atual e aceita no tablet

- [x] Prontidão, contagem central de dez segundos e cancelamento coletivo.
- [x] Posições iniciais distintas na geometria atual, título do capítulo e
  início sincronizado; mapa procedural/objetivos permanecem na etapa 4.
- [x] Pausa/retomada coletiva e reconexão à partida ativa.
- [x] Contagem de dez segundos para retomada, cancelável e reiniciada do início,
  sem avançar a simulação ou o tempo do capítulo.
- [x] Configuração bloqueada após contagem, mesmo com pontos não distribuídos.
- [x] Bloqueio central de ações pelo próprio token pressionado, animação no
  setor e atualização da área de toque ao mudar escala.
- [x] Aceite físico do novo fluxo e da correção dos tokens grandes.

**Aceite:** posição e tempo restante das ações não mudam durante a pausa;
reiniciar o servidor não restaura a partida anterior. O usuário confirmou
fisicamente o fluxo de prontidão, contagem, cancelamento, pausa e retomada.

### 4. Tabuleiro modular

- [x] Catálogo inicial de componentes tipados de sete hexágonos, com caminhos,
  ações e células receptoras de objetos.
- [x] Contratos Zod para sete células únicas, capacidades separadas, caminhos
  internos conectados e conectores recíprocos; rotação testada em seis passos.
- [x] Mapa conectado com vários componentes, rotações de 60° e conectores compatíveis.
- [x] Geração dimensionada pela área útil e pelo multiplicador do token.
- [ ] Validação de objetivos alcançáveis e dependências de itens/atributos.
- [x] Geração reproduzível por seed para diagnóstico e testes.
- [ ] Ampliar testes de colisão ao criar/combinar vários tipos de terreno.

**Aceite:** testar rotações e conjuntos de seeds/tamanhos; não iniciar mapas
inválidos; comunicar claramente quando a tela/escala não comportar a partida.
Testes automatizados cobrem reprodutibilidade, encaixe, capacidade e rejeição
de mapa pequeno. Ampliar a cobertura de colisões quando mais terrenos forem
criados e combinados. O aceite visual completo no tablet continua pendente; a
alcançabilidade dos objetivos depende das regras ainda não decididas.

### 5. Movimento e visão

- [x] Movimento autoritativo com base configurável por
  `BASE_MOVEMENT_CELLS_PER_SECOND` (padrão 0,5 célula/s) e multiplicador
  `1 + (destreza - 1) × 0,1`; o cliente usa a mesma taxa do snapshot para
  limitar a previsão ao dedo.
- [x] Bloqueio de células não transitáveis e conectores incompatíveis, sem
  desvio automático; requisitos de ação/atributo aguardam regras definidas.
- [x] Visão compartilhada de três células por padrão; raio configurável em
  `PLAYER_VISION_RADIUS_CELLS` (1–12), névoa densa removida ao explorar e
  névoa leve restaurada fora da visão atual.
- [ ] Visão separada do monstro e contribuição de 10% do raio por jogadores
  dormindo; dependem do cliente/estado de sono ainda não implementados.
- [x] Catálogo público sem atributos/capacidades do monstro; não transmitir
  terreno oculto, estado do monstro nem status de atributos em uso.

**Aceite:** testes automatizados cobrem velocidade, destreza, colisões,
conectores, união da visão e sanitização do catálogo. No tablet, movimento,
névoas, multitoque e bloqueio por barreiras foram confirmados. Expandir os
testes de colisão para vários tipos e combinações de terreno quando essa
criação avançar. Visão do monstro e status em uso seguem pendentes até existir
essa perspectiva autorizada.

`BASE_MOVEMENT_CELLS_PER_SECOND` define a velocidade de movimento base em
células hexagonais por segundo; deve ser positivo e usa `0.5` por padrão. O
servidor valida a configuração e a inclui no snapshot para que o limite visual
do cliente permaneça sincronizado com o limite autoritativo. Para aplicar uma
mudança no Compose, recriar o servidor com
`npm run compose -- up --build -d --wait server`; isso encerra a partida em memória, então
não executar durante uma partida ativa.

### 6. Interações reutilizáveis

- [ ] Botão de jogo com bloqueio centralizado por token pressionado.
- [ ] Durações, multiplicadores, cancelamento e requisitos cooperativos.
- [ ] Portas, obstáculo simples, inventário e item básico.

**Aceite:** combinar gesto e ação rejeita apenas a ação daquele jogador;
cooperação válida funciona; pausa preserva a duração restante.

### 7. Monstro e estados

- [ ] IA por eventos com navegação válida.
- [ ] Medo, atordoamento, sono, resgate e três pontos de vida.
- [ ] Armadilhas compartilhadas e variante de pesadelo.

**Aceite:** testar alcance de detecção, limites das três armadilhas, duração
dos estados, revelação temporária e derrota por sono coletivo.

### 8. Capítulo jogável

- [ ] Fuga com combustível e carro.
- [ ] Vitória/derrota e encerramento da partida.
- [ ] Posteriormente: espelhos M/E/D/O.
- [ ] Posteriormente: ossos, igreja e isqueiro.

**Aceite:** completar uma partida real com vários jogadores; validar que mapa
e itens permitem concluir cada objetivo habilitado.

### 9. Administração completa

- [ ] CRUDs de personagens, monstros, itens, terrenos/módulos e configurações.
- [ ] Validação de referências, requisitos, durações e conteúdo incompleto.
- [ ] Edição de conexões de módulos; avaliar necessidade de editor visual.
- [ ] CRUD local sem autenticação, com tratamento explícito de erros.

**Aceite:** editar conteúdo pela API sem acesso direto ao banco; partida em
curso preserva suas configurações; a seguinte usa o conteúdo atualizado.
O scaffold do admin pertence à etapa 1; os CRUDs completos pertencem a esta.

### 10. Celular do monstro

- [ ] QR code e associação ao papel/controlador.
- [ ] Mapa filtrado, joystick e ações.
- [ ] Exibir status em uso dos jogadores visíveis/revelados ao monstro.
- [ ] Transferência IA/humano e reconexão.
- [ ] Posteriormente: múltiplos monstros e jogadores transformados.

**Aceite:** tablet e celular jogam simultaneamente na LAN com visões diferentes,
sem duplicar controladores ou expor informações ocultas.

## Pendências antes de implementar as regras correspondentes

- Modelo do tablet, navegador, orientação e limitações reais de multitoque.
- Limites mínimo/máximo da escala e comportamento se o mapa não couber.
- Fórmulas de atributos, compensações e fadiga; thresholds do arrasto.
- Duração do turno, resgate, desativação e revelação por armadilha.
- Reconexão após perder a identidade da aba e política para setores órfãos.
- Regras exatas da fuga e requisitos de combustível.
- Assets próprios/licenciados e identidade visual do primeiro monstro.
- Validação do acesso LAN no tablet, inclusive firewall/encaminhamento se WSL.

## Registro de progresso

| Data | Entrega | Verificação |
|---|---|---|
| 2026-11-02 | Aceite físico parcial da etapa 5: movimento, névoas e multitoque confirmados no tablet; teste demonstrou que barreiras podem bloquear o token. Os casos ampliados para múltiplos tipos/combinações de terreno ficam para quando sua criação for retomada. | Confirmação manual do usuário no tablet. Aceite visual completo do mapa modular e testes ampliados de terrenos ainda pendentes; sem alterações de código nesta atualização. |
| 2026-11-02 | Etapa 5 publicada no Compose `terror`; corrigido o contexto Docker para incluir `.env.example` no build do jogo sem incluir `.env`. Servidor e jogo recriados, PostgreSQL/volume preservados. | `npm run typecheck`, `npm test` (19 contratos + 15 servidor + 5 jogo), `npm run build`, `npm run check:stack` e `git diff --check` passaram; `postgres`, `server` e `game` saudáveis e a imagem ativa do jogo coincide com a publicada. Na publicação, aceite visual e físico ainda pendentes; o teste físico posterior está registrado acima. |
| 2026-11-02 | `.env` passou a prevalecer sobre `.env.example`, que completa variáveis ausentes; fallback aplicado ao Compose, servidor local, Vite e verificações de stack. Senha de exemplo vazia e obrigatória no arquivo local. | `npm run typecheck`, `npm run build -w @terror/game`, `npm test`, `npm run compose -- config --quiet` e verificação de precedência do Node sem imprimir valores passaram. `check:lifecycle` não foi executado para evitar reiniciar serviços. |
| 2026-10-31 | Arquitetura, requisitos e etapas consolidados; instruções para agentes criadas. | Revisão documental frente à proposta e às decisões da conversa; sem código executável nesta entrega. |
| 2026-10-31 | Base técnica: quatro workspaces, Compose, migração/conteúdo mínimo, API/Socket.IO e admin opcional. | Build/typecheck, sete testes unitários, uma integração PostgreSQL, verificação HTTP/WebSocket, ciclo de vida do volume/admin/servidor e canvas no navegador. Tablet físico ainda pendente. |
| 2026-10-31 | Token máximo 64 px, folga 8 px por lado, indicadores internos, prévia de vários terrenos proporcional e admin sem login. | Build/typecheck e dez testes unitários, incluindo encaixe sem sobreposição, contenção de células e redução de capacidade ao aumentar a escala. Calibração compartilhada e setores reais ainda pendentes. |
| 2026-11-01 | Regras de visibilidade de status, duas dicas nas quatro orientações e referência do token com faixas internas registradas. | Atualização documental; indicadores, dicas e filtragem do catálogo ainda não implementados. |
| 2026-11-01 | Etapa 2 no cliente: oito setores, seleção básica, escala compartilhada, área útil responsiva, tokens arrastáveis, dicas orientadas, fullscreen e autorização de áudio. | `npm run typecheck`, `npm test` (8 contratos e 3 testes do servidor), `npm run build`; navegador com mock efêmero confirmou seleção, escala comum, arrasto e ativação de fullscreen/áudio. Acesso LAN e dez toques simultâneos no tablet real continuam pendentes. |
| 2026-11-01 | Versão atual publicada para o aceite no tablet; QR code local entregue com o endereço LAN do notebook. | `docker compose up --build -d --wait postgres server game`, serviços saudáveis e `npm run check:stack` passaram; endpoint de saúde acessível pela interface Wi-Fi do Windows. Abertura no tablet e aceite dos dez toques ainda aguardam validação física. |
| 2026-11-01 | Usuário confirmou LAN, calibração compartilhada e arrasto de todos os tokens; relatou controles bloqueados durante arrasto. Setores reorganizados em abas de token/personagem, sem seletor nativo, com botão multitoque reutilizável. | Typecheck, 11 testes unitários, build local/Docker do jogo e `check:stack` passaram. Chromium/CDP confirmou oito tokens + dois controles, +/−, abas, continuidade do arrasto, toque sem duplicação, cancelamento, mouse e teclado. Somente o container game foi atualizado; reteste físico pendente no mesmo endereço/QR. |
| 2026-11-01 | Atributos base 1/1/1 e três pontos distribuíveis; velocidade renomeada para destreza nos contratos, variáveis e indicadores; migração 002 preserva níveis do conteúdo existente. Quatro dicas externas à central e menor reserva dos setores liberam mapa. | `npm run typecheck`, `npm test` (9 contratos + 3 servidor), `npm run build`, integração em PostgreSQL isolado pelo perfil `test` e `npm run check:stack` passaram. Servidor/jogo publicados com volume preservado. Navegador confirmou distribuição 3/2/1, reembolso para 2/2/2, independência entre setores, oito tokens + dois controles de atributos e continuidade do arrasto. Disputa simultânea pelo último ponto respeitou o orçamento. Em 1920×1200 CSS/escala 2 e 960×600 CSS/escala 1, controles e dicas não cortam nem sobrepõem os setores/central; ajuste lateral republicado. Aceite físico dos novos controles ainda pendente. |
| 2026-11-01 | Corrigida a inversão dos tokens iniciais dos setores 5/7 e acrescentados 180° à orientação dos setores 4/8. | `npm run build -w @terror/game` e publicação somente do jogo passaram. Navegador em 1920×1200 confirmou os centros renderizados dos tokens 5/7 em x≈475/1445, respectivamente, e as matrizes CSS de rotação dos setores laterais. Reteste físico pendente; próxima etapa continua sendo o aceite da mesa. |

| 2026-11-01 | Dicas verticais da central giradas em +180°, sem mudar posições ou dicas horizontais. | Build do jogo e publicação somente de `game` passaram; navegador confirmou as matrizes CSS de 90° à esquerda e 270° à direita. Reteste físico pendente; próxima etapa permanece o aceite da mesa. |

| 2026-11-01 | Texto de status da conexão substituído por indicador circular verde/amarelo/vermelho no cabeçalho central, com nome acessível e feedback de erro preservado. | Build do jogo e publicação somente de `game` passaram. Navegador confirmou conexão pendente (amarelo), falha simulada com alerta (vermelho) e recuperação (verde), sem texto visível no indicador. Próxima etapa permanece o aceite físico da mesa. |
| 2026-11-01 | Revisão removida da central; `NODE_ENV` ligado ao servidor/build do jogo e resumo de prévia restrito a não produção. Áudio/tela cheia em sobreposição central, visível somente enquanto algum deles não está ativo, com acompanhamento de mudanças do áudio. | Typecheck, build local e builds Docker nos dois ambientes passaram. Navegador confirmou presença/ausência da prévia em development/production, botão central acima da interface mesmo com conexão em erro e ocultação/reaparecimento com APIs simuladas de áudio/tela cheia. Teste nativo não concluiu na página compartilhada oculta; reteste físico pendente. Ambiente development restaurado, volume preservado e `check:stack` aprovado; próxima etapa permanece o aceite da mesa. |
| 2026-11-01 | Instrução textual de arrasto e calibração removida da preparação para reduzir texto na interface do jogo. | Validado build de `@terror/game` e busca confirmando que a frase não permanece no código. Próxima etapa continua sendo o aceite físico da mesa. |
| 2026-11-01 | Setores com duas colunas verticais e painel central; rodas de três letras com nomes únicos locais; jogo vazio ao entrar; confirmação de saída; atributos por ícones, +N verde, níveis alocados verdes, modais e alerta reutilizável. Calibração sem multiplicador, walkie-talkie baseado na referência e ícones CC0 de jogo/saída. Campo `wisdom` com migração 003 preservando conteúdo. | `npm run typecheck`, `npm test` (11 contratos + 3 servidor), `npm run build`, integração PostgreSQL isolada pelo perfil `test`, publicação de servidor/jogo e `npm run check:stack` passaram. Navegador confirmou duplicidade/reentrada, distribuição e reembolso, alerta, modais, cancelamento da saída, teclado/mouse e arrasto/toque das letras sem clique duplicado ao soltar sobre a seta. Em 1920×1200 e 960×600 CSS, escalas 1/2, oito setores não cortam controles nem se sobrepõem; abas e saída medem 32×32 px. Profundidade passou de 152/184 para 116/140 px, liberando 13%/17% de área útil em 1920×1200. Teste misto confirmou oito arrastos por eventos Phaser com dois controles por toque CDP; o ensaio inteiramente nativo não comprovou os arrastos e não substitui aceite físico. Volume preservado e PostgreSQL de teste parado. Próxima etapa permanece o aceite no tablet, especialmente alvos menores, dez contatos, fullscreen e áudio. |
| 2026-11-01 | Saída reposicionada abaixo do nome. Corrigido círculo de toque antigo ao aumentar tokens; setor bloqueado pelo próprio token pressionado, com troca para jogo e caminhada animada. Etapa 3 no servidor: participantes/posições/atributos/escala em memória, prontidão alternável, contagem central de dez segundos, cancelamento/reinício, posições distintas em células da prévia, capítulo próprio, configuração bloqueada mesmo com pontos livres, pausa e retomada coletiva, reconexão e saída individual/último encerra. | `npm run typecheck`, `npm test` (12 contratos + 8 servidor), `npm run build`, integração API/Socket.IO em PostgreSQL isolado, builds Docker e `npm run check:stack` passaram. Chromium/CDP confirmou arrasto nativo de oito tokens a 128 px, bloqueio dos oito setores e liberação ao cancelar; dez contatos nativos com seis tokens e quatro controles de dois jogadores parados distribuíram pontos sem bloquear os arrastos. Navegador confirmou 10→8, cancelamento e reinício em 10, capítulo e início com pontos sobrando, edição desabilitada, pausa congelando exatamente posições/relógio, retomada com todos, recarga pausando e recuperando setores, saída individual e retorno ao lobby pelo último. Resize ativo 1920×1200→960×600 preservou arena/posições e reenquadrou tokens dentro da área reservada do mapa. Usuário confirmou aceite anterior, mas relatou falha física com tokens grandes: reteste da correção e do novo fluxo permanece pendente; não marcar dez contatos físicos como concluídos. Volume preservado, banco de teste parado; próxima implementação será mapa procedural/objetivos da etapa 4 quando solicitada. |
| 2026-11-01 | Sincronização do canvas por `ResizeObserver` usando `setParentSize` do Phaser em modo RESIZE, corrigindo dimensões antigas após aumentar o contêiner. | Build Docker do jogo e `npm run check:stack` passaram; somente `game` foi republicado. Chromium/CDP confirmou canvas e viewport coincidentes em 960×600 e 1920×1200, arrasto nativo do token de 128 px com raio de toque 64 px, bloqueio/liberação do setor e resize durante partida sem alterar arena/posições canônicas. Mesa de teste devolvida ao lobby vazio, escala 1. Reteste físico continua pendente. |
| 2026-11-01 | Nome de três letras no token e na calibração; nove marcadores compartilhados de punho, pé em movimento e lâmpada, com estados vazio/preenchido. Conforme decisão do usuário, permanecem vazios até existir uso real dos atributos. Fechar modal usa X vetorial centrado. Retomada exige dez segundos canceláveis, com votos preservados ao desmarcar, reinício em dez e cancelamento por saída/desconexão. | Typecheck, `npm test` (12 contratos + 10 servidor), `npm run build`, integração API/Socket.IO em PostgreSQL isolado e `npm run check:stack` passaram. Servidor/jogo publicados com autorização para encerrar a partida anterior. Navegador verificou nove marcadores vazios nos dois renderizadores, variantes vazias/preenchidas, nome seguindo arrasto nativo a 128 px, X exatamente centrado no botão, retomada 10→8 com posições/relógio congelados, cancelamento preservando outros votos, reinício em dez, recarga invalidando contagem/votos e saída cancelando a contagem. Mesa de teste devolvida ao lobby vazio na escala 1; volume preservado e banco de teste parado. Reteste físico continua sendo a próxima etapa; mapa procedural permanece para quando solicitado. |

| 2026-11-01 | Corrigida tela preta no Chrome em HTTP pela LAN: UUID v4 via `getRandomValues`, identidade por aba preservada e falhas de inicialização exibidas na central. Cinco testes do jogo incluídos no runner principal. | `npm run test -w @terror/game`, `npm run build -w @terror/game`, `npm test` (12 contratos + 10 servidor + 5 jogo), publicação somente de `game` com `--no-deps` e `npm run check:stack` passaram. Navegador em `http://192.168.68.108:8080` confirmou contexto não seguro sem `randomUUID`, conexão, oito setores, mesma identidade após recarga e canvas/viewport/área de rolagem coincidentes em 1200×750 e 2400×1500 CSS, sem erros JavaScript. Armazenamento bloqueado simulado mostrou alerta e indicador vermelho, preservando canvas e setores. Servidor/banco não reiniciados; abertura no tablet físico e dez contatos continuam pendentes. |

| 2026-11-01 | Botão do menu “Jogo” removido; painel padrão preservado e retorno pela configuração selecionada ou Escape. Token/personagem e sua coluna ocultos após a contagem inicial, inclusive na pausa, sem alterar a reserva geométrica necessária à calibração/atributos. | `npm run build -w @terror/game`, cinco testes existentes do jogo, publicação somente de `game` com `--no-deps` e `npm run check:stack` passaram. Página isolada no navegador, com Socket.IO simulado e sem alterar a mesa ocupada, confirmou ausência de menu Jogo, abertura/retorno de token, atributos/Escape/setas, duas abas na contagem e nenhuma em capítulo/partida/pausa, painel de pausa/retomada disponível, duas colunas após início e retorno à prontidão/configurações no lobby, sem erros JavaScript. Reteste físico pendente; servidor e banco não reiniciados. |

| 2026-11-01 | Setores compactados para 96 px CSS fixos; nome no topo e saída no rodapé da coluna esquerda; miniatura interna fixa em 64 px, preservando escala externa. Atributos centralizados por coluna como ícone/valor/−/+; alternativa responsiva aprovada mantém ícone/valor acima de −/+ em painéis estreitos. Rodas de nome compactadas sem rolagem interna. Reserva compartilhada de mapa e teste de limites de movimento atualizados. | `npm run build`, `npm test` (12 contratos + 10 servidor + 5 jogo), integração API/Socket.IO em PostgreSQL isolado pelo perfil `test`, builds/publicação de servidor e jogo e `npm run check:stack` passaram. Servidor recriado com autorização do usuário; volume da partida preservado. Navegador real confirmou distribuição/reembolso, modal, nome/saída nas extremidades, miniatura ≈64 px antes/depois de escala 1→2 e token externo 128 px com menos terrenos. Layout final mediu atributos em linha com altura ≈32 px em 1920×1200 CSS e duas linhas ≈66 px em 960×600, com botões ≈27 px de largura nessa tela; entrada sem rolagem. Página isolada com oito jogadores confirmou setores de 96 px nas duas resoluções, nenhum controle cortado, miniaturas fixas em escala 2 e configurações ocultas em partida/pausa, sem erros JavaScript. Mesa de teste devolvida ao lobby vazio/escala 1 e PostgreSQL de teste parado; aceite físico de controles compactos, rodas menores e dez contatos permanece pendente. |

| 2026-11-01 | X contextual do setor: em configuração de token/personagem volta ao painel de jogo; somente nesse painel abre confirmação de saída. Nome acessível acompanha a ação. | Build local/Docker de `@terror/game`, publicação somente de `game` com `--no-deps` e `npm run check:stack` passaram. Página isolada com Socket.IO simulado confirmou ambas as configurações → X → prontidão sem diálogo/comando de saída, segundo X → confirmação, cancelamento e confirmação por teclado/clique emitindo exatamente um comando de saída, sem erros JavaScript. Mesa real não alterada; servidor/banco não reiniciados. Reteste físico continua pendente. |

| 2026-11-01 | Padding esquerdo de 8 px no painel de atributos para afastar o contador +N. | Build/typecheck Docker do jogo e publicação somente de `game` passaram; container saudável. Página isolada com CSS publicado confirmou padding computado de 8 px e painel de 204 px sem overflow horizontal. Servidor/banco e mesa real não alterados; reteste físico pendente. |

| 2026-11-01 | Escolha de nome em duas colunas: título no topo à esquerda e fechamento abaixo; letras/entrada usam toda a altura à direita. Controles das rodas restaurados para 24 px e letras para 28 px, sem afetar outros modais. | Build/typecheck Docker e publicação somente de `game` passaram; container saudável. Navegador isolado com Socket.IO simulado confirmou os oito setores em 1920×1200 e 960×600 CSS (16 diálogos), duas colunas, 86 px de altura útil sem rolagem horizontal/vertical, alteração de letra e fechamento por Escape. Mesa real e servidor/banco preservados; reteste físico pendente. |
| 2026-11-01 | Entrada com 16 cores de token de alto contraste, escolha aleatória inicial, seletor/modal reutilizável e exclusividade validada pelo servidor; token e miniatura recebem a cor escolhida. Base da etapa 4: schemas Zod para módulos de sete células, capacidades independentes, caminhos conectados, conectores recíprocos e seis rotações. | `npm run typecheck`, `npm test` (16 contratos + 11 servidor + 5 jogo), `npm run build` e integração API/Socket.IO no PostgreSQL isolado passaram; serviço de teste parado/removido. A página compartilhada indicou que outro cliente configura a mesa; não publiquei nem alterei essa sessão. Seletor, cores no tablet e multitoque ainda precisam de aceite físico. Módulos autorados, geração do mapa, integração e validação de objetivos continuam pendentes. |
| 2026-11-01 | Corrigida ausência do seletor no endereço LAN: a página ainda servia o bundle anterior. Publicada a build atual somente no container `game`; ajustado o modal da paleta para renderizar diretamente na área do setor e não ser recortado pelo modal do nome. | Build do jogo passou; container `game` saudável após `docker compose up --build -d --no-deps game`; servidor e PostgreSQL permaneceram sem reinício. Navegador em `http://192.168.68.108:8080` confirmou seleção aleatória no modal de nome, abertura da paleta com 16 cores e indicação da cor atual; ambos diálogos fechados sem entrar com jogador. Aceite no tablet continua pendente. |
| 2026-11-01 | Substituída a paleta por exatamente 13 cores nomeadas conforme pedido: vermelho, azul, verde, amarelo, roxo, rosa, preto, cinza, branco, laranja, marrom, verde escuro e azul escuro. | `npm run typecheck`, `npm test` (16 contratos + 11 servidor + 5 jogo), `npm run build -w @terror/game` e `git diff --check` passaram. Publicados `game` e `server` separadamente com `--no-deps`, sem tocar no PostgreSQL; antes de recriar o servidor, API confirmou lobby vazio. Após publicação, os containers `game`, `server` e `postgres` ficaram saudáveis, `/api/health` respondeu pronto e `/api/match` retornou lobby vazio. Navegador confirmou as 13 opções, amarelo selecionado inicialmente, clique em azul atualizando o botão e fechando a paleta; modal fechado sem entrar. Aceite físico no tablet segue pendente. |
| 2026-11-01 | Usuário confirmou que o checklist físico de entrada, cores, controles, pausa/retomada e dez contatos simultâneos funcionou no tablet. Etapa 4: catálogo com clareira, cabana e bosque; geração conectada por seed, encaixes recíprocos, rotação de 60°, dimensionamento pela área útil/escala, rejeição de capacidade insuficiente e desenho dos terrenos no tabuleiro. O snapshot envia apenas a seed para reconstrução determinística nos clientes. | `npm test` passou (17 contratos, 12 testes do servidor e 5 do jogo); `npm run typecheck`, `npm run build` e `git diff --check` passaram. Testes cobrem repetibilidade da seed, módulos/células sem sobreposição, rotações, ajuste pela escala e rejeição de tela pequena. A arena máxima suportada (7680×7680, escala 0,5) gerou 5615 módulos em ~288 ms no ambiente atual. Ainda não foi feito o aceite visual do mapa no tablet; validação de objetivos aguarda regras confirmadas. |
| 2026-11-01 | Etapa 5 implementada: movimento autoritativo a 0,5 célula/s com multiplicador por destreza, colisões por transitabilidade/conectores e limites também na previsão local; raio de visão padrão 3 configurável por `PLAYER_VISION_RADIUS_CELLS`; exploração compartilhada persistente e névoa leve dinâmica. Seed e células ocultas ficam no servidor; snapshots expõem apenas células exploradas/visíveis. `/api/catalog` omite atributos/capacidades do monstro. | `npm test` passou (19 contratos, 14 testes do servidor e 5 do jogo); `npm run typecheck`, `npm run build`, `git diff --check` e integração API/Socket.IO no PostgreSQL isolado (`docker compose --profile test run --build --rm integration`) passaram. Não executados aceite visual no tablet, visão separada do monstro ou integração de sono; aceite visual do mapa modular da etapa 4 também permanece pendente. |
| 2026-11-01 | Velocidade base de movimento exposta em `BASE_MOVEMENT_CELLS_PER_SECOND` no `.env`, padrão 0,5 célula/s; servidor valida e publica o valor no snapshot para sincronizar o limite de movimento do cliente. | `npm test` (19 contratos, 15 servidor, 5 jogo), `npm run typecheck`, `npm run build -w @terror/game` e `git diff --check` passaram. O aceite no tablet continua pendente; a próxima etapa permanece validar visualmente mapa, movimento, barreiras e névoa. |
| 2026-11-01 | Criado `start-linux.sh` para criar `.env` quando ausente, reconstruir e iniciar os serviços principais, aguardando a saúde do stack; admin permanece opcional. | Validado com `bash -n start-linux.sh` e `git diff --check`. Não executei o script, pois ele pode reiniciar serviços e encerrar a partida ativa. |

Adicionar novas linhas com entregas reais e evidências de validação. Não listar
como concluídos comportamentos ainda apenas planejados.
