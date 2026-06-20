# language: pt
Funcionalidade: Portal Exeq Admin — regressão homolog
  Como operador fiscal
  Quero emitir NFS-e e gerenciar cobranças no piloto
  Para garantir continuidade pós-release

  Contexto:
    Dado a API em "http://127.0.0.1:3002" está saudável
    E o admin em "http://127.0.0.1:5173" está acessível
    E existem credenciais válidas "admin@piloto.local" / "changeme"

  # --- Smoke ---
  @smoke @auth
  Cenário: SMOKE-02 Login e dashboard
    Quando o usuário informa credenciais válidas e confirma login
    Então a página dashboard operação é exibida
    E não há erros no console do browser

  @smoke @navigation
  Cenário: SMOKE-03 Navegação menu principal
    Dado o usuário está autenticado
    Quando navega por Dashboard, Emissões, Cobranças, Webhooks e Catálogos
    Então cada módulo exibe listagem ou painel principal
    E não há erros no console

  @smoke @api @pilot
  Cenário: SMOKE-04 API retorna 4 municípios piloto
    Quando consulto GET /v1/nf/issues/stats autenticado
    Então a resposta contém exatamente IBGE 3504107, 3507605, 3528502, 3547809

  # --- Auth ---
  @regression @auth
  Cenário: REG-AUTH-01 Login inválido
    Quando o usuário informa senha incorreta
    Então é exibida mensagem "Falha no login"
    E permanece na tela de login

  @regression @session
  Cenário: REG-AUTH-02 Sessão após reload
    Dado o usuário autenticado no dashboard
    Quando recarrega a página
    Então o dashboard continua visível

  # --- Issues ---
  @regression @pilot
  Cenário: REG-ISS-01 Filtro município 4 pilotos sem Barueri
    Dado o usuário autenticado na lista de emissões
    Então o filtro município possui Atibaia, Bragança Paulista, Mairiporã e Santo André
    E não possui opção Barueri

  @regression @sprint15
  Cenário: REG-ISS-03 Emissão Santo André autorizada no portal
    Dado uma emissão autorizada IBGE 3547809 criada via API
    Quando o usuário abre o detalhe da emissão
    Então o município exibido contém "Santo André"

  # --- Charges ---
  @regression @gateway
  Cenário: REG-CHG-02 Cobrança registrada com gateway mock
    Dado uma cobrança registrada criada via API
    Quando o usuário abre o detalhe da cobrança
    Então o status é Registrada
    E o bloco gateway exibe modo Mock
    E o link sandbox homolog está visível

  @regression
  Cenário: REG-CHG-03 Criar cobrança vinculada na emissão
    Dado emissão autorizada aberta no portal
    Quando o usuário aciona criar cobrança na emissão
    Então abre detalhe de cobrança com status Registrada

  # --- Deep ---
  @regression @security
  Cenário: REG-DEEP-02 Rota protegida sem sessão
    Dado usuário não autenticado
    Quando acessa "/issues"
    Então é redirecionado para "/login"
