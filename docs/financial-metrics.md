# 📘 MIS FINANZAS V2 — ESPECIFICACIÓN OFICIAL DE MÉTRICAS FINANCIERAS

**Estado:** Documento Maestro Aprobado  
**Fase:** 2B — Modelo Financiero Visible y Arquitectura de Métricas  
**Motor Financiero:** PostgreSQL ACID + Domain Services V2

---

## 📌 1. Principios Fundamentales
1. **Unicidad de Cálculo:** Toda métrica financiera posee una **única fuente de verdad** implementada en `server/services/financialMetricsService.js`. Ningún controlador, vista o dashboard duplica lógica o fórmulas.
2. **Coherencia Transaccional:** Las transferencias entre cuentas propias no representan ingresos ni gastos.
3. **Tarjeta de Crédito como Pasivo Operativo:** Las compras con tarjeta aumentan la deuda y reducen el crédito disponible. Los pagos de tarjeta reducen la cuenta de origen y la deuda de tarjeta; no constituyen un gasto.
4. **Inversiones como Activo Financiero:** Aportar a inversión reduce liquidez y aumenta inversión (gasto = $0, ingreso = $0). Retirar de inversión reduce inversión y aumenta liquidez (gasto = $0, ingreso = $0). La revaluación modifica el patrimonio sin alterar la liquidez.
5. **Independencia entre Disponible y Patrimonio:** El **Dinero Disponible** refleja liquidez operativa real + valor de inversiones. El **Patrimonio Neto** deduce la totalidad de los pasivos (deudas y tarjetas).

---

## 📊 2. Catálogo Oficial de Métricas

### METRIC-001: Dinero Disponible (`availableMoney`)
- **Definición:** Monto total de activos de disponibilidad inmediata más activos de inversión documentados.
- **Fórmula:**
  $$\text{Dinero Disponible} = \sum \text{Saldos de Cuentas Líquidas} + \sum \text{Valor Actual de Inversiones}$$
- **Incluye:** Cuentas de Nómina, Débito, Efectivo, Ahorro, Cajas e Inversiones (Cetes, FONDOS, Acciones).
- **Excluye:** Crédito disponible de tarjetas, préstamos por cobrar, límite de crédito.
- **Ejemplo:**
  - Nómina: $20,000 | Débito: $5,000 | Efectivo: $2,000 | Inversiones: $50,000
  - **Dinero Disponible = $77,000**

---

### METRIC-002: Patrimonio Neto (`netWorth`)
- **Definición:** Valor neto resultante de deducir todos los pasivos consolidados a la totalidad de los activos financieros.
- **Fórmula:**
  $$\text{Patrimonio Neto} = \text{Activos Totales} - \text{Pasivos Totales}$$
  $$\text{Activos Totales} = \text{Cuentas Líquidas} + \text{Valor Actual de Inversiones}$$
  $$\text{Pasivos Totales} = \text{Saldo Deuda Tarjetas} + \text{Préstamos} + \text{Otras Deudas}$$
- **Incluye:** Cuentas líquidas, inversiones, deudas corrientes de tarjetas y préstamos.
- **Excluye:** Doble contabilización de planes MSI (el capital pendiente MSI se incluye en el saldo consolidado de la tarjeta sin duplicar).

---

### METRIC-003: Ingresos Totales (`totalIncome`)
- **Definición:** Sumatoria de flujos de dinero entrante al patrimonio provenientes de fuentes externas.
- **Fórmula:**
  $$\text{Ingresos} = \sum \text{Transacciones de tipo } 'income'$$
- **Incluye:** Nómina, ingresos extraordinarios, ventas, rendimientos cobrados fuera de inversión.
- **Excluye:** Transferencias entre cuentas propias (`transfer`), retiros de inversión (`investment_withdrawal`), reembolsos de tarjeta (`card_payment`).

---

### METRIC-004: Gastos Totales (`totalExpense`)
- **Definición:** Sumatoria del consumo financiero realizado mediante cuentas líquidas o tarjetas de crédito.
- **Fórmula:**
  $$\text{Gastos} = \sum \text{Transacciones } 'expense' + \sum \text{Transacciones } 'card\_purchase'$$
- **Incluye:** Compras directas de contado y compras realizadas a crédito / MSI en el momento del consumo.
- **Excluye:** Pagos abonados a la tarjeta de crédito (`card_payment`), transferencias internas (`transfer`), aportaciones a inversión (`investment_contribution`).

---

### METRIC-005: Transferencias Internas (`transfers`)
- **Definición:** Reorganización o movimiento de liquidez entre entidades propias del usuario.
- **Regla:** Delta Ingresos = $0, Delta Gastos = $0, Delta Patrimonio = $0.

---

### METRIC-006 & METRIC-007: Aportes y Retiros de Inversión (`investmentContributions` / `investmentWithdrawals`)
- **Aporte (`investment_contribution`):**
  - Cuenta Líquida: $-\text{Monto}$ | Inversión: $+\text{Monto}$ | Gasto: $0 | Ingreso: $0.
- **Retiro (`investment_withdrawal`):**
  - Inversión: $-\text{Monto}$ | Cuenta Líquida: $+\text{Monto}$ | Pérdida: $0 | Ganancia: $0 | Ingreso: $0.

---

### METRIC-008 & METRIC-009: Valuación de Inversión (Pérdida / Ganancia)
- **Definición:** Ajuste contable por fluctuación de mercado registrado en la entidad de inversión.
- **Regla:**
  - Si $\text{Nuevo Valor} < \text{Valor Anterior} \rightarrow \text{Pérdida} = \text{Valor Anterior} - \text{Nuevo Valor}$.
  - Si $\text{Nuevo Valor} > \text{Valor Anterior} \rightarrow \text{Ganancia} = \text{Nuevo Valor} - \text{Valor Anterior}$.
  - **No altera saldos de cuentas líquidas.**

---

### METRIC-010 & METRIC-011: Tarjetas de Crédito y Meses Sin Intereses (MSI)
- **Crédito Disponible:**
  $$\text{Crédito Disponible} = \max(0, \text{Límite de Crédito} - \text{Deuda Utilizada})$$
- **MSI Existente:** Registro referencial para mensualidades y capital pendiente que **NO** genera un nuevo gasto histórico ni duplica la deuda de la tarjeta.
- **MSI Nuevo:** Compra corriente a plazos que incrementa el saldo de tarjeta en el monto total comprometido y ajusta el crédito disponible inmediatamente.

---

### METRIC-012: Presupuesto Diario de 24 Horas (`dailyBudget`)
- **Fórmula:**
  $$\text{Disponible Diario} = \text{Presupuesto Diario Configurado} - \text{Gastos en el periodo de 24h}$$
- **Evaluación de Estado:**
  - `LESS_THAN_BUDGET`: $\text{Gastos} < \text{Presupuesto Configurado}$
  - `ON_BUDGET`: $\text{Gastos} = \text{Presupuesto Configurado}$
  - `OVER_BUDGET`: $\text{Gastos} > \text{Presupuesto Configurado}$
- **Consumen Presupuesto:** `expense`, `card_purchase`.
- **Excluyen Presupuesto:** `income`, `transfer`, `card_payment`, `investment_contribution`, `investment_withdrawal`.

---

### METRIC-013: Flujo de Caja Real (`cashFlow`)
- **Definición:** Medición neta del movimiento de dinero líquido durante el periodo.
- **Fórmula:**
  $$\text{Flujo de Caja} = \text{Ingresos Líquidos} - \text{Gastos Líquidos} - \text{Aportes Inversión} + \text{Retiros Inversión}$$

---

### METRIC-014 a METRIC-016: Líneas de Tiempo de Evolución
- **`availableMoneyTimeline`:** Reconstrucción cronológica de `Liquidez + Inversiones` basada en eventos transaccionales históricos.
- **`netWorthTimeline`:** Evolución de `Activos - Pasivos`.
- **`debtTimeline`:** Historial de saldo consolidado de deudas y tarjetas sin duplicar MSI.

---

### METRIC-017: Gastos por Categoría (`expensesByCategory`)
- **Definición:** Agregación de consumos reales por categoría en los últimos 12 meses o periodo seleccionado, considerando compras a crédito e ignorando los pagos de tarjeta.

---

## 📌 3. Tabla Resumen de Reglas de Inclusión / Exclusión

| Métrica | Fuente Principal | Incluye | Excluye |
| :--- | :--- | :--- | :--- |
| **Dinero Disponible** | `accounts` + `investments` | Liquidez + Valor Inversiones | Límite de Crédito, Deudas |
| **Patrimonio Neto** | `accounts` + `investments` - `debts` | Todos los Activos - Todos los Pasivos | Duplicación de MSI |
| **Ingresos** | `transactions` | `income` | `transfer`, `investment_withdrawal` |
| **Gastos** | `transactions` | `expense`, `card_purchase` | `card_payment`, `transfer`, `investment_contribution` |
| **Presupuesto Diario** | `transactions` (24h) | `expense`, `card_purchase` | `income`, `transfer`, `card_payment`, `investment_*` |
| **Flujo de Caja** | `transactions` | Movimientos líquidos reales | Revaluaciones de mercado, MSI |
