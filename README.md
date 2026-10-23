# 🚗 ContaGiro — Gestão Financeira Veicular & Previsão Inteligente

> Aplicativo moderno em **React Native** e **Expo** para controle completo de abastecimentos, médias de consumo, manutenções preventivas e projeções inteligentes de custos para carros e motos.

---

## 🎯 1. Finalidades do Aplicativo

O **ContaGiro** foi idealizado para substituir e expandir um aplicativo anterior feito em Ionic (já publicado na Google Play Store), trazendo uma experiência 100% nativa, interface refinada e um motor de inteligência preditiva para o motorista.

### Principais Módulos:

### ⛽ 1.1. Controle de Abastecimentos & Médias
* **Registro Completo:** Odômetro atual (km), tipo de combustível (Gasolina, Etanol, Diesel, GNV), preço por litro, litros abastecidos, valor total e nome do posto.
* **Cálculo de Consumo Real (km/L):** Utiliza o método homologado de "tanque cheio" para calcular exatamente quantos quilômetros o veículo rodou por cada litro consumido.
* **Custo por Quilômetro Rodado (R$/km):** Revela ao motorista o custo exato de cada quilômetro percorrido com base nos preços atuais.
* **Histórico Detalhado:** Listagem cronológica com status de cada abastecimento e opção de exclusão.

### 🔧 1.2. Oficina & Manutenções Preventivas
* **Histórico de Manutenções:** Registro de revisões, oficinas atendidas, peças trocadas, quilometragem e custos.
* **Alertas Preventivos por Odômetro:** Monitoramento automático de componentes com base no km atual do veículo:
  * Troca de Óleo e Filtros (a cada 10.000 km)
  * Pastilhas de Freio (a cada 25.000 km)
  * Alinhamento e Balanceamento (a cada 10.000 km)
  * Higienização de Ar Condicionado (a cada 15.000 km)
  * Rodízio de Pneus e Revisão Geral
* **Status em Tempo Real:** Identificação visual imediata de itens **Em dia**, em **Atenção** (faltando menos de 1.000 km) ou **Vencidos** (atrasados).

### 📈 1.3. Motor de Previsão Inteligente (Forecast)
* **Ritmo de Rodagem:** O sistema analisa os intervalos de datas e quilometragens para determinar a média diária de uso do veículo (`km/dia`).
* **Projeção de Custos Futuros:**
  * Estimativa de gastos com combustível para **30, 60 e 90 dias**.
  * Previsão de revisões programadas que devem vencer dentro do período.
  * Custo total estimado de propriedade veicular para o próximo mês.

### ⚡ 1.4. Calculadora Flex Inteligente
* **Paridade Real:** Compara os preços do Etanol e da Gasolina no posto e calcula a relação percentual exata.
* **Eficiência Personalizada:** Aplica a regra clássica dos 70% ou a proporção personalizada de acordo com o consumo real do veículo.
* **Economia em Reais (R$):** Informa ao usuário qual combustível compensa mais e quantos reais ele economizará enchendo o tanque.

### 🚘 1.5. Garagem Multi-Veículo
* Suporte a múltiplos veículos cadastrados (carros e motos).
* Troca instantânea de veículo ativo com recálculo automático de todo o painel, histórico e alertas.
* Atualização rápida de odômetro com 1 toque direto na tela inicial.

---

## 🛠️ 2. Tecnologias Utilizadas

* **Framework:** [React Native 0.88](https://reactnative.dev/) com [Expo SDK 58](https://expo.dev/)
* **Navegação:** [Expo Router](https://docs.expo.dev/router/introduction/) (Navegação baseada em arquivos com Tabs nativas)
* **Linguagem:** [TypeScript](https://www.typescriptlang.org/) (Tipagem estrita de dados)
* **Persistência Local:** [@react-native-async-storage/async-storage](https://react-native-async-storage.github.io/async-storage/) (Offline-first)
* **Ícones:** [@expo/vector-icons](https://icons.expo.fyi/) (Ionicons vetorizados)
* **Estilização:** StyleSheet nativo com suporte automático a tema Claro (*Light*) e Escuro (*Dark*)

---

## 📁 3. Estrutura do Projeto

```text
contagiro/
├── src/
│   ├── app/                    # Rotas e telas do Expo Router
│   │   ├── _layout.tsx         # Layout principal com barra de abas (Tabs)
│   │   ├── index.tsx           # Painel / Dashboard principal
│   │   ├── abastecimentos.tsx  # Tela de histórico e novo abastecimento
│   │   ├── manutencoes.tsx     # Tela de alertas de peças e oficina
│   │   ├── previsao.tsx        # Previsão inteligente & Calculadora Flex
│   │   └── garagem.tsx         # Gerenciamento de múltiplos veículos
│   ├── services/
│   │   ├── calculations.ts     # Motor de cálculos de médias, previsões e alertas
│   │   └── storage.ts          # Camada de persistência local AsyncStorage
│   ├── types/
│   │   ├── vehicle.ts          # Interfaces de Veículos, Abastecimentos e Manutenções
│   │   └── declarations.d.ts   # Declarações globais de módulos TypeScript
│   └── constants/
│       └── theme.ts            # Cores, espaçamentos e fontes
├── package.json
└── README.md
```

---

## 🚀 4. Como Executar o Projeto

### Pré-requisitos
* **Node.js LTS** (v20+ ou v24+)
* **Git**
* Celular com o app **Expo Go** instalado (Google Play Store)

### Executando em desenvolvimento:
```powershell
# 1. Entrar na pasta do projeto
cd contagiro

# 2. Iniciar o servidor Expo com o Expo Go
npx expo start --go
```

Basta abrir o aplicativo **Expo Go** no celular, escanear o **QR Code** exibido no terminal e testar o app em tempo real.

---

## 📋 5. Próximos Passos & Roadmap de Desenvolvimento

Para dar continuidade e levar o **ContaGiro** do estágio de desenvolvimento até a publicação na Google Play Store, definimos o seguinte plano de execução:

### Fase 1: Importação dos Dados do App Antigo (Ionic) 🔄
- [ ] Mapear o formato de dados exportado pelo app Ionic anterior (SQLite / JSON / CSV).
- [ ] Criar função de importação/backup em `src/services/storage.ts` para que os usuários atuais possam migrar seus históricos sem perder nada.

### Fase 2: Gráficos e Relatórios Visuais 📊
- [ ] Integrar biblioteca de gráficos (como `react-native-gifted-charts` ou `victory-native`).
- [ ] Gráfico de evolução do consumo médio ao longo dos meses.
- [ ] Gráfico de divisão de despesas (Combustível vs Oficina vs Impostos/Seguro).

### Fase 3: Notificações e Lembretes Locais 🔔
- [ ] Adicionar `expo-notifications` para disparar lembretes periódicos no celular.
- [ ] Notificar o usuário quando uma manutenção atingir o status **"Atenção"** ou **"Vencida"**.
- [ ] Lembrete semanal para o usuário atualizar o odômetro do carro.

### Fase 4: Exportação de Relatórios em PDF / Excel 📑
- [ ] Gerar relatório consolidado com o histórico do veículo para venda ou declaração de custos.
- [ ] Exportação em formato CSV e compartilhamento direto pelo WhatsApp ou e-mail.

### Fase 5: Anexo de Comprovantes e Fotos 📸
- [ ] Adicionar suporte a `expo-image-picker` para anexar foto da nota fiscal do posto ou da ordem de serviço da oficina.
- [ ] Permitir foto personalizada do veículo na garagem.

### Fase 6: Preparação para Publicação na Google Play Store 🚀
- [ ] Configuração do `app.json` (Package Name único, versão, ícone oficial e tela de splash).
- [ ] Configuração do **EAS Build** (`eas-cli`) para geração do bundle de produção Android (`.aab`).
- [ ] Atualização do cadastro na Google Play Console para substituir o aplicativo antigo pelo novo ContaGiro React Native.
