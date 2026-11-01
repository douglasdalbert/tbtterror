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
- [ ] Implementar a base técnica.
- [ ] Validar multitoque, escala e movimento no tablet real.

**Estado:** planejamento documentado; aplicação e infraestrutura ainda não
implementadas. Nenhum comando de instalação ou execução foi validado.

**Próxima etapa:** etapa 1, base técnica. Preparar o workspace TypeScript,
separar jogo/servidor/admin/contratos e criar o Docker Compose. Entregar primeiro
uma conexão cliente-servidor verificável, persistência do PostgreSQL e ativação
opcional do admin. Não começar pela IA ou pelos puzzles.

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
- Definir portas, imagens, ferramentas de build, ORM e versões na etapa 1.
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
- O jogador entra pelo próprio setor, escolhe personagem e confirma prontidão.
- Um círculo de calibração, incluindo a borda de indicadores, permite ajustar
  o tamanho para o dedo e a visualização.
- O multiplicador é compartilhado: quando alguém ajusta, todos os tokens e
  elementos do terreno ajustam proporcionalmente.
- Trata-se da escala interna do jogo, não do zoom do navegador.
- Calcular a área útil removendo os setores dos jogadores. Tokens, caminhos,
  portas e janelas devem manter dimensões compatíveis.
- Tokens maiores implicam módulos maiores e potencialmente menos módulos;
  não comprimir caminhos para encaixar um mapa fixo.
- Fullscreen e áudio precisam ser iniciados por uma interação permitida pelo
  navegador. Tratar fullscreen indisponível ou encerrado explicitamente.
- Impedir scroll, zoom e gestos nativos sobre a superfície de jogo, preservando
  entrada multitoque e a atribuição de cada ponteiro ao token correto.
- A interface durante o jogo prioriza ícones, não leitura de menus.

### Início

- Todos os participantes ativos prontos iniciam uma contagem de 10 segundos.
- Exibir a contagem em seus setores; setores vazios ficam invisíveis nessa fase.
- Cancelar prontidão/contagem cancela a contagem para todos.
- Gerar e validar o mapa antes de começar; não iniciar um mapa incompleto caso
  a geração demore mais do que a contagem.
- O círculo de calibração define o ponto inicial do jogador, conciliado com
  uma posição válida de entrada no mapa.
- Apresentar o capítulo no centro, esmaecer o título e iniciar a simulação.
- Prever desistência e pausa com controles simples. Regras de quem pode pausar
  e como sair de uma partida ativa ainda precisam ser definidas.

## Mapa procedural modular

- Módulos de sete células hexagonais: uma central e seis ao redor.
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

- Força, velocidade e inteligência possuem níveis entre 1 e 3.
- A proposta associa força a sons emitidos, velocidade a cansaço e inteligência
  a comportamento desastrado. Fórmulas e a direção dessas compensações ainda
  precisam ser esclarecidas antes de implementar o balanceamento.
- Força também influencia a representação de altura do personagem, sem romper
  a calibração compartilhada do token circular.
- Indicadores ao redor do token mostram níveis exigidos e utilizados.
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
- Velocidade não altera a duração de ações inicialmente; movimento tem suas
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
- Monstros recebem eventos detectáveis, como som e exposição de luz, conforme
  seus próprios critérios e alcance.
- A IA patrulha aleatoriamente e investiga pontos detectados usando rotas
  válidas do mapa, sem atravessar paredes.

### Monstro inicial: comportamento de pesadelo

A proposta usa Freddy Krueger como referência de comportamento. Não há arte
licenciada selecionada: não baixar/reproduzir automaticamente a imagem citada
na proposta nem assumir direitos de uso sobre personagem, imagens ou áudio.
Usar placeholders próprios ou assets com licença verificada no protótipo.

- Força 2, velocidade 2, inteligência 2; multiplicador de movimento 1,2.
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

### 1. Base técnica — próxima

- [ ] Workspace TypeScript com jogo, servidor, admin e contratos compartilhados.
- [ ] Docker Compose `terror`: serviços separados e admin opcional.
- [ ] PostgreSQL persistente, migrações e conteúdo mínimo de desenvolvimento.
- [ ] API validada, conexão Socket.IO e estado de partida em memória.
- [ ] Comandos reais de desenvolvimento, build, testes e execução documentados.

**Aceite:** tablet alcança o cliente/servidor pela LAN; saúde dos serviços
verificada; dado de teste persiste após recriar o container; admin pode ser
desligado sem interromper jogo/servidor.

### 2. Mesa multitoque e calibração

- [ ] Oito setores, entrada, seleção básica e círculo com borda de indicadores.
- [ ] Fullscreen, áudio autorizado e tratamento de cancelamento de ponteiros.
- [ ] Escala compartilhada e cálculo da área útil, inclusive em resize.
- [ ] Arrasto simultâneo com identificação independente de ponteiros.

**Aceite:** pelo menos dez contatos simultâneos no dispositivo real, incluindo
tokens e controles, sem roubar gestos; ajustar um círculo escala todos; não há
scroll/zoom involuntário nem sobreposição que impeça jogar. Registrar se o
navegador/hardware não atingir o requisito.

### 3. Início, capítulo e pausa

- [ ] Prontidão, contagem de dez segundos e cancelamento coletivo.
- [ ] Posições iniciais válidas, título do capítulo e início sincronizado.
- [ ] Pausa/retomada e reconexão à partida ativa.

**Aceite:** posição e tempo restante das ações não mudam durante a pausa;
reiniciar o servidor não restaura a partida anterior.

### 4. Tabuleiro modular

- [ ] Módulos de sete hexágonos com seis rotações e conectores compatíveis.
- [ ] Geração dimensionada pela área útil e pelo multiplicador do token.
- [ ] Validação de objetivos alcançáveis e dependências de itens/atributos.
- [ ] Geração reproduzível por seed para diagnóstico e testes.

**Aceite:** testar rotações e conjuntos de seeds/tamanhos; não iniciar mapas
inválidos; comunicar claramente quando a tela/escala não comportar a partida.

### 5. Movimento e visão

- [ ] Velocidade solicitada pelo dedo, limites e indicadores.
- [ ] Colisões e travessias por requisitos.
- [ ] Névoa compartilhada, visão própria do monstro e modificadores de raio.

**Aceite:** testar excesso de velocidade, barreiras e atributos insuficientes;
o cliente do monstro não recebe posições ocultas; validar fluidez no tablet.

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
- [ ] Controle de acesso administrativo e tratamento explícito de erros.

**Aceite:** editar conteúdo pela API sem acesso direto ao banco; partida em
curso preserva suas configurações; a seguinte usa o conteúdo atualizado.
O scaffold do admin pertence à etapa 1; os CRUDs completos pertencem a esta.

### 10. Celular do monstro

- [ ] QR code e associação ao papel/controlador.
- [ ] Mapa filtrado, joystick e ações.
- [ ] Transferência IA/humano e reconexão.
- [ ] Posteriormente: múltiplos monstros e jogadores transformados.

**Aceite:** tablet e celular jogam simultaneamente na LAN com visões diferentes,
sem duplicar controladores ou expor informações ocultas.

## Pendências antes de implementar as regras correspondentes

- Modelo do tablet, navegador, orientação e limitações reais de multitoque.
- Limites mínimo/máximo da escala e comportamento se o mapa não couber.
- Fórmulas de atributos, compensações e fadiga; thresholds do arrasto.
- Duração do turno, resgate, desativação e revelação por armadilha.
- Política de desconexão, pausa, desistência e alterações de participantes.
- Regras exatas da fuga e requisitos de combustível.
- Assets próprios/licenciados e identidade visual do primeiro monstro.
- Portas LAN, acesso administrativo e ferramentas da base técnica.

## Registro de progresso

| Data | Entrega | Verificação |
|---|---|---|
| 2026-10-31 | Arquitetura, requisitos e etapas consolidados; instruções para agentes criadas. | Revisão documental frente à proposta e às decisões da conversa; sem código executável nesta entrega. |

Adicionar novas linhas com entregas reais e evidências de validação. Não listar
como concluídos comportamentos ainda apenas planejados.
