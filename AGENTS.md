# Orientações para agentes

## Continuidade do trabalho

- Leia [README.md](./README.md) antes de planejar ou implementar. Ele contém as
  decisões, os requisitos, as pendências, o progresso e a próxima etapa.
- Consulte [idéia.txt](./idéia.txt) como proposta original; decisões consolidadas
  no README prevalecem. Preserve esse arquivo como referência.
- Inspecione o estado atual do repositório: não presuma que tudo documentado
  já foi implementado nem sobrescreva alterações de outros trabalhos.
- Execute a próxima entrega pedida pelo usuário; não avance todas as etapas
  automaticamente. Esclareça pendências quando afetarem a implementação.
- Ao concluir, atualize checkboxes, estado, próxima etapa e registro de
  progresso no README, com validações e limitações. Não marque trabalho parcial
  ou não verificado como concluído.
- Mantenha estas instruções concisas; planejamento detalhado pertence ao README.

## Invariantes do projeto

- TypeScript; Phaser para o tabuleiro multitoque, React leve para a interface
  do jogo e app React administrativo em container separado e opcional.
- Node.js é autoridade da partida; API e Socket.IO na LAN. PostgreSQL persiste
  conteúdo/configurações, não o estado da partida ativa inicialmente.
- Pausa congela a simulação e seus temporizadores; reiniciar o servidor encerra
  a partida. Edição de conteúdo não altera partidas em andamento.
- Visão compartilhada dos jogadores e visão própria do monstro, filtradas no
  servidor. Não transmitir dados ocultos só para escondê-los no cliente.
- Pelo menos dez toques simultâneos; escala interna compartilhada para tokens
  e terrenos. Não usar zoom do navegador nem assumir resolução CSS fixa.
- Módulos com sete hexágonos e rotações de 60°. Validar encaixes e possibilidade
  de completar os objetivos.
- Centralizar bloqueio de ação enquanto o próprio token estiver pressionado;
  reutilizar regras de ação, duração, atributos e armadilhas.
- Não atualizar React nem persistir movimentos no PostgreSQL a cada frame.
- Docker Compose deve identificar este projeto como `terror`; não alterar,
  parar ou remover serviços, volumes ou redes de outros projetos.
- Navegadores nunca acessam diretamente o banco. Não versionar credenciais;
  usar exemplos sem segredos e volumes persistentes para dados.
- Usar assets próprios ou com licença verificada. A referência a um personagem
  na proposta não autoriza baixar/reproduzir arte, áudio ou imagens protegidas.

## Implementação e validação

- Prefira entregas incrementais jogáveis, componentes reutilizáveis e contratos
  compartilhados com validação em runtime, sem abstrações antecipadas.
- Siga os padrões e ferramentas que forem estabelecidos no repositório.
- Erros de conexão, geração, validação e ações inválidas precisam de feedback
  explícito; não mascarar falhas com estados de sucesso.
- Teste regras e geometria isoladamente; teste integrações cliente/servidor e
  banco quando envolvidas. Multitoque e fluidez exigem validação no tablet real.
- Rode os comandos existentes mais específicos que cubram a mudança; documente
  comandos reais quando forem criados, sem afirmar validações não executadas.
- Nesta fase, ainda não existem comandos de build/testes/execução estabelecidos.
- Não adicionar dependências ou infraestrutura para uma tarefa só documental.
- Não criar novas instruções duplicadas ou arquivos de planejamento paralelos
  sem necessidade; mantenha o README como fonte única do progresso.
