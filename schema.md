# 🗄️ Esquema do Banco de Dados — Cloud Firestore (ContaGiro)

> Documentação oficial da arquitetura de dados do **ContaGiro** no **Cloud Firestore** (`mediacombustivel-e76d9`).
> Atualizado com a **estrutura hierárquica otimizada** de abastecimentos (`veiculos/{id}/abastecimentos`) e totalizadores agregados de alta performance.

---

## 📌 1. Visão Geral da Arquitetura

O banco de dados é modelado no Cloud Firestore adotando uma estrutura hierárquica baseada no usuário (`userEmail`), particionando os abastecimentos sob cada veículo específico.

```text
Firestore Root
│
├── users/ (Coleção Raiz de Usuários)
│   └── {userEmail}/  (ID do Documento = Email do Usuário, ex: "motorista@email.com")
│       │
│       ├── veiculos/ (Subcoleção de Veículos do Usuário)
│       │   └── {veiculoId} (Auto-ID do Firestore)
│       │       │
│       │       └── abastecimentos/ (⚡ NOVA Subcoleção Hierárquica de Abastecimentos)
│       │           └── {abastecimentoId} (ID do Abastecimento)
│       │
│       ├── medias/ (Coleção Legada de Abastecimentos — Migrada Automaticamente)
│       │   └── {mediaId}
│       │
│       ├── manutencoes/ (Subcoleção de Serviços e Oficina)
│       │   └── {manutencaoId}
│       │
│       └── configuracoes/ (Subcoleção de Configurações e Preferências Globais)
│           └── precosCombustivel (Documento com os Últimos Preços Praticados)
│
├── marcas-carros/ (Catálogo Global de Fabricantes de Carros)
│   └── {marcaId}/
│       └── modelos/ (Subcoleção de Modelos)
│           └── {modeloId}
│
└── marcas-motos/ (Catálogo Global de Fabricantes de Motos)
    └── {marcaId}/
        └── modelos/ (Subcoleção de Modelos)
            └── {modeloId}
```

> [!NOTE]
> **Identificador do Usuário:** O nó raiz de cada conta utiliza o **`user.email`** como ID do documento (`users/${user.email}`), e não o `user.uid`. Toda consulta aos dados do motorista utiliza o e-mail autenticado no Firebase Auth.

---

## 🚗 2. Subcoleção: `veiculos`

* **Caminho:** `users/{userEmail}/veiculos/{veiculoId}`
* **Finalidade:** Armazena os dados cadastrais do automóvel ou moto, quilometragem atual, configurações do ciclo de manutenção e **métricas agregadas (totalizadores)** para carregamento instantâneo.

### 📋 Campos do Documento

| Campo | Tipo | Obrigatório | Descrição / Exemplo |
| :--- | :--- | :---: | :--- |
| `tipoVeiculo` | `string` | Sim | `'carro'` ou `'moto'` |
| `placa` | `string` | Sim | Placa do veículo com máscara e maiúsculas (Ex: `"ABC-1234"` ou `"BRA-2E19"`) |
| `marca` | `string` | Sim | Nome da montadora (Ex: `"Toyota"`, `"Volkswagen"`, `"Honda"`) |
| `modelo` | `string` | Sim | Nome do modelo ou apelido (Ex: `"Fielder"`, `"Gol 1.0"`, `"Civic"`) |
| `ano` | `number` | Sim | Ano de fabricação/modelo (Ex: `2005`, `2023`) |
| `cilindrada` | `number` | Não | Cilindrada do motor em cc (obrigatório para motos, ex: `160`) |
| `kmAtual` | `number` | Sim | Odômetro atual do veículo em km (Ex: `165279`) |
| `ultimoKm` | `number` | Sim | Último km registrado no abastecimento ou revisão mais recente |
| `ultimoComb` | `string` | Não | Último combustível abastecido: `'Gasolina'`, `'Etanol'`, `'Diesel'` ou `'GNV'` |
| `capacidadeTanque` | `number` | Não | Capacidade volumétrica do tanque em litros (padrão: 50 para carros, 14 para motos) |
| `combustiveisAceitos` | `string[]` | Não | Lista de combustíveis aceitos pelo motor (Ex: `['gasolina', 'etanol']`) |
| `gastoManutencao`| `number` | Não | Somatório acumulado em R$ de todas as manutenções cadastradas (Ex: `16800`) |

#### ⚡ Totalizadores Agregados de Abastecimento (Performance O(1)):

Armazenados diretamente no documento do veículo para evitar a necessidade de ler e somar dezenas ou centenas de abastecimentos a cada abertura do app:

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `totalGastoAbast` | `number` | Somatório em R$ gasto em todos os abastecimentos do veículo |
| `totalLitrosAbast` | `number` | Volume total em litros já abastecidos no veículo |
| `mediaGeralKmPorLitro` | `number` | Consumo médio geral ponderado do veículo em km/L |
| `qtdAbastecimentos` | `number` | Quantidade total de abastecimentos registrados para o veículo |

#### 🔧 Campos de Manutenção Preventiva Periódica (quando `cadManPeriodica == true`):

| Campo | Tipo | Descrição / Exemplo |
| :--- | :--- | :--- |
| `cadManPeriodica` | `boolean` | Indica se o ciclo de revisões periódicas está ativado |
| `revisaoKm` | `number` | Intervalo em km para revisão geral (Ex: `10000`) |
| `revisaoMes` | `number` | Intervalo em meses para revisão geral (Ex: `12`) |
| `ultimaRevisaoKm` | `number` | Quilometragem na qual foi realizada a última revisão |
| `proxRevKm` | `number` | Próxima quilometragem prevista para revisão geral |
| `trocaOleoKm` | `number` | Intervalo em km para troca de óleo (Ex: `5000` ou `10000`) |
| `trocaOleoMeses` | `number` | Intervalo em meses para troca de óleo (Ex: `6` ou `12`) |
| `ultimaTrocaOleoKm` | `number` | Quilometragem da última troca de óleo |
| `proxTrocaOleoKm` | `number` | Próxima quilometragem prevista para troca de óleo |
| `lubrificarCorrenteKm` | `number` | Intervalo em km para lubrificação da corrente (Motos, ex: `500`) |
| `ultimaLubCorrenteKm` | `number` | Quilometragem da última lubrificação da corrente (Motos) |
| `proxLubCorrenteKm` | `number` | Próxima quilometragem prevista para lubrificar a corrente |
| `esticarCorrenteKm` | `number` | Intervalo em km para ajuste/tensão da corrente (Motos, ex: `1500`) |
| `ultimaEsticarCorrenteKm` | `number` | Quilometragem do último ajuste de tensão da corrente (Motos) |
| `proxEsticarCorrenteKm` | `number` | Próxima quilometragem prevista para tensionar a corrente |

---

## ⛽ 3. Subcoleção Hierárquica: `abastecimentos`

* **Caminho:** `users/{userEmail}/veiculos/{veiculoId}/abastecimentos/{abastecimentoId}`
* **Finalidade:** Histórico detalhado de abastecimentos particionado por veículo.
* **Vantagens de Desempenho:**
  1. **Leitura Escopada:** Ao abrir a tela do veículo selecionado, busca apenas os abastecimentos daquele veículo específico, reduzindo custos de leitura no Firestore.
  2. **Gravação Atômica (`writeBatch`):** Ao cadastrar um novo abastecimento, o registro na subcoleção e a atualização de `kmAtual`, `ultimoKm`, `ultimoComb` e os totalizadores do veículo são gravados em lote de forma transacional.
  3. **Isolamento de Dados:** Cada veículo possui sua própria coleção, evitando vazamento ou confusão de odômetros entre veículos diferentes.

### 📋 Campos do Documento

| Campo | Tipo | Obrigatório | Descrição / Exemplo |
| :--- | :--- | :---: | :--- |
| `idVeiculo` | `string` | Sim | ID do documento do veículo pai (`veiculos/{veiculoId}`) |
| `placa` | `string` | Sim | Placa do veículo associado (Ex: `"ABC-1234"`) |
| `data` | `string` | Sim | Data do abastecimento no padrão ISO (`"YYYY-MM-DD"`) |
| `combustivel` | `string` | Sim | Tipo: `'Gasolina'`, `'Etanol'`, `'Diesel'` ou `'GNV'` |
| `kmAntigo` | `number` | Sim | Odômetro do abastecimento imediatamente anterior |
| `kmAtual` | `number` | Sim | Odômetro no momento deste abastecimento |
| `qdtAbastecida` | `number` | Sim | Volume em litros abastecidos |
| `valorLitro` | `number` | Sim | Preço pago por litro em R$ (Ex: `5.89`) |
| `totalAmount` | `number` | Sim | Valor total pago no abastecimento em R$ (Ex: `235.60`) |
| `media` | `number` | Sim | Consumo médio calculado: `(kmAtual - kmAntigo) / qdtAbastecida` |
| `seTanqueCheio` | `boolean` | Sim | Se o tanque foi completado (indica medição confiável de consumo) |
| `seAditivado` | `boolean` | Sim | Se o combustível possui aditivos de limpeza/desempenho |
| `observacao` | `string` | Não | Observações livres opcionais (nome do posto, trecho, cidade, etc.) |

---

## 📦 4. Migração Transparente da Coleção Legada `medias`

Para garantir retrocompatibilidade com dados inseridos pelo app legado (onde os abastecimentos ficavam na coleção plana `users/{userEmail}/medias`), o ContaGiro implementa uma rotina automática e transparente:

### Como Funciona a Migração:
1. No momento em que o usuário autenticado acessa a tela de abastecimentos, a função `StorageService.migrateLegacyMedias(userEmail)` é executada.
2. A rotina verifica se existem documentos na coleção `users/{userEmail}/medias`.
3. Para cada documento encontrado:
   * Localiza o veículo correspondente pelo `idVeiculo` ou pela `placa`.
   * Cria o documento idêntico no caminho hierárquico: `users/{userEmail}/veiculos/{targetVeh.id}/abastecimentos/{legacyDoc.id}`.
   * Exclui o documento legado de `medias` dentro da mesma transação (`writeBatch`).
4. Ao final, dispara `recalculateVehicleStats(userEmail, vehId)` para consolidar os totalizadores no veículo pai.
5. Toda a operação é transparente para o usuário, com **zero perda de dados**.

---

## 🛠️ 5. Subcoleção: `manutencoes`

* **Caminho:** `users/{userEmail}/manutencoes/{manutencaoId}`
* **Finalidade:** Registro de despesas com oficina, peças, trocas de óleo, pneus e revisões.

### 📋 Campos do Documento

| Campo | Tipo | Obrigatório | Descrição / Exemplo |
| :--- | :--- | :---: | :--- |
| `veiculoId` | `string` | Sim | ID do veículo (`doc.id` em `veiculos`) |
| `veiculo` | `string` | Sim | Placa do veículo (Ex: `"ABC-1234"`) |
| `dataCadastro` | `string` | Sim | Data do serviço no padrão ISO (`"YYYY-MM-DD"`) |
| `kmManutencao` | `number` | Sim | Km do veículo no ato da manutenção (Ex: `180000`) |
| `tipoManutencaoVal` | `string` | Sim | Código do serviço (ver tabela abaixo) |
| `tipoManutencao` | `string` | Sim | Descrição legível do serviço |
| `ladoManutencao` | `string` | Não | Posição da peça: `'DIREITA'`, `'ESQUERDA'`, `'DIANTEIRA'`, `'TRASEIRA'` ou vazio |
| `descricaoManutencao` | `string` | Não | Detalhes adicionais (marca da peça, oficina, garantia) |
| `valorManutencao` | `number` | Sim | Valor total pago pelo serviço em R$ |

### 🏷️ Valores Válidos para `tipoManutencaoVal`:

| `tipoManutencaoVal` | `tipoManutencao` | Exige Lado? | Atualiza Ciclo do Veículo? |
| :--- | :--- | :---: | :--- |
| `TROLEO` | Troca de �---

## ⚙️ 6. Documento de Configuração: `configuracoes/precosCombustivel`

* **Caminho:** `users/{userEmail}/configuracoes/precosCombustivel`
* **Finalidade:** Armazena os últimos preços de combustíveis praticados pelo usuário, **de forma global e desacoplada de veículos individuais**. 
* **Comportamento:**
  1. **Atualização Automática:** Sempre que o usuário cadastra um novo abastecimento com determinado combustível (Gasolina, Etanol, Diesel ou GNV), o preço praticado é automaticamente gravado neste documento.
  2. **Atualização Manual:** Ajustes efetuados diretamente na calculadora flex da tela de Previsões são persistidos imediatamente neste documento.
  3. **Compartilhamento Global:** A tela de Previsão Financeira, a calculadora Flex e o formulário de novos abastecimentos utilizam essa referência única como valor padrão, independente de qual veículo esteja selecionado na garagem.

### 📋 Campos do Documento

| Campo | Tipo | Obrigatório | Descrição / Exemplo |
| :--- | :--- | :---: | :--- |
| `gasolina` | `number` | Não | Último preço praticado por litro da gasolina em R$ (Ex: `5.89`) |
| `etanol` | `number` | Não | Último preço praticado por litro do etanol em R$ (Ex: `3.99`) |
| `diesel` | `number` | Não | Último preço praticado por litro do diesel em R$ (Ex: `6.15`) |
| `gnv` | `number` | Não | Último preço praticado por m³ de GNV em R$ (Ex: `4.50`) |
| `updatedAt` | `string` | Sim | Data e hora ISO da última atualização |

---

## 🌐 7. Coleções Globais: Catálogo de Veículos

Utilizadas para preenchimento de marcas e modelos no cadastro de novos veículos.

### 7.1. Carros: `marcas-carros`
* **Coleção:** `marcas-carros/{marcaId}`
  * `nomeMarca`: `string` (Ex: `"Chevrolet"`, `"Fiat"`, `"Volkswagen"`)
  * `valor`: `string` (Slug para busca de modelos, ex: `"chevrolet"`)
* **Subcoleção:** `marcas-carros/{marcaId}/modelos/{modeloId}`
  * `nomeModelo`: `string` (Ex: `"Onix 1.0"`, `"Cruze Turbo"`)
  * `valor`: `string`

### 7.2. Motos: `marcas-motos`
* **Coleção:** `marcas-motos/{marcaId}`
  * `nomeMarca`: `string` (Ex: `"Honda"`, `"Yamaha"`)
  * `valor`: `string`
* **Subcoleção:** `marcas-motos/{marcaId}/modelos/{modeloId}`
  * `nomeModelo`: `string` (Ex: `"CG 160 Titan"`)
  * `cilindrada`: `number` (Ex: `160`)
  * `valor`: `string`

---

## ⚡ 8. Regras de Negócio e Atualizações Cruzadas

### 8.1. Ao Cadastrar um Abastecimento:
1. Grava o documento em `users/${email}/veiculos/${veiculoId}/abastecimentos/${novoId}`.
2. Atualiza atomicamente o veículo em `users/${email}/veiculos/${veiculoId}` com:
   * `kmAtual = novoKm`
   * `ultimoKm = novoKm`
   * `ultimoComb = combustivelAbastecido`
3. Atualiza os preços globais em `users/${email}/configuracoes/precosCombustivel` com o `valorLitro` do combustível abastecido.
4. Recalcula os totalizadores do veículo (`totalGastoAbast`, `totalLitrosAbast`, `mediaGeralKmPorLitro`, `qtdAbastecimentos`).
5. **Verificação de Alertas Preventivos**:
   * Se `(novoKm + 1000) >= veiculo.proxRevKm` ➔ Alerta de **Revisão Próxima**.
   * Se `(novoKm + 500) >= veiculo.proxTrocaOleoKm` ➔ Alerta de **Troca de Óleo Próxima**.

### 8.2. Ao Cadastrar uma Manutenção (`manutencoes`):
1. Grava o documento em `users/${email}/manutencoes`.
2. Atualiza o documento do veículo de acordo com o tipo:
   * **Se `TROLEO`:**
     * `ultimaTrocaOleoKm = kmManutencao`
     * `proxTrocaOleoKm = kmManutencao + veiculo.trocaOleoKm`
     * `gastoManutencao = veiculo.gastoManutencao + valorManutencao`
   * **Se `REVISAO`:**
     * `ultimaTrocaOleoKm = kmManutencao`
     * `ultimaRevisaoKm = kmManutencao`
     * `proxTrocaOleoKm = kmManutencao + veiculo.trocaOleoKm`
     * `proxRevKm = kmManutencao + veiculo.revisaoKm`
     * `gastoManutencao = veiculo.gastoManutencao + valorManutencao`
   * **Demais Tipos (`MANMOTOR`, `PNEUS`, etc.):**
     * `gastoManutencao = veiculo.gastoManutencao + valorManutencao`

---

## 🔄 9. De-Para: App Novo (React Native) ⟷ Firestore

| Propriedade no App (`src/types/vehicle.ts`) | Caminho / Campo no Firestore | Observações |
| :--- | :--- | :--- |
| `Vehicle.id` | `veiculos/{id}` | ID do documento do veículo |
| `Vehicle.name` / `model` | `doc.modelo` e `doc.marca` | Nome e marca do veículo |
| `Vehicle.plate` | `doc.placa` | Formato `"ABC-1234"` |
| `Vehicle.tankCapacity` | `doc.capacidadeTanque` / `tanque` | Capacidade do tanque em litros |
| `Vehicle.currentOdometer` | `doc.kmAtual` | Quilometragem atual |
| `Vehicle.totalGastoAbast` | `doc.totalGastoAbast` | Totalizador acumulado de abastecimentos |
| `Vehicle.mediaGeralKmPorLitro` | `doc.mediaGeralKmPorLitro` | Consumo médio geral do veículo |
| `Refueling.id` | `veiculos/{vehId}/abastecimentos/{id}` | Subcoleção hierárquica por veículo |
| `Refueling.vehicleId` | `doc.idVeiculo` | Chave estrangeira do veículo pai |
| `Refueling.liters` | `doc.qdtAbastecida` | Litros abastecidos |
| `Refueling.pricePerLiter` | `doc.valorLitro` | Preço por litro |
| `Refueling.totalAmount` | `doc.totalAmount` | Valor total pago |
| `Refueling.odometer` | `doc.kmAtual` | Odômetro no abastecimento |
| `Refueling.previousOdometer` | `doc.kmAntigo` | Odômetro anterior |
| `Refueling.consumptionKmPerLiter` | `doc.media` | Consumo médio (km/L) |
| `Refueling.isFullTank` | `doc.seTanqueCheio` | Tanque cheio (boolean) |
| `Refueling.isAdditivated` | `doc.seAditivado` | Combustível aditivado (boolean) |
| `Refueling.notes` | `doc.observacao` | Observações opcionais |
| `MaintenanceItem.id` | `manutencoes/{id}` | ID do documento em `manutencoes` |
| `MaintenanceItem.vehicleId` | `doc.veiculoId` | Chave estrangeira do veículo |
| `MaintenanceItem.cost` | `doc.valorManutencao` | Custo em R$ |
| `MaintenanceItem.odometer` | `doc.kmManutencao` | Km do serviço |
| `MaintenanceItem.category` | `doc.tipoManutencaoVal` | Código do serviço (`TROLEO`, `REVISAO`, etc.) |
| `FuelPrices` | `configuracoes/precosCombustivel` | Preços globais vigentes (`gasolina`, `etanol`, `diesel`, `gnv`) |
.seAditivado` | Combustível aditivado (boolean) |
| `Refueling.notes` | `doc.observacao` | Observações opcionais |
| `MaintenanceItem.id` | `manutencoes/{id}` | ID do documento em `manutencoes` |
| `MaintenanceItem.vehicleId` | `doc.veiculoId` | Chave estrangeira do veículo |
| `MaintenanceItem.cost` | `doc.valorManutencao` | Custo em R$ |
| `MaintenanceItem.odometer` | `doc.kmManutencao` | Km do serviço |
| `MaintenanceItem.category` | `doc.tipoManutencaoVal` | Código do serviço (`TROLEO`, `REVISAO`, etc.) |
