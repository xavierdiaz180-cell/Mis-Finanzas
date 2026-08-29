# 📘 MIS FINANZAS V2 — ESPECIFICACIÓN OFICIAL DE MÉTRICAS FINANCIERAS (FASE 2B.1)

**Estado:** Especificación Maestro Aprobada  
**Fase:** 2B.1 — Cierre de Definiciones Financieras y Validación de Métricas  
**Motor Financiero:** PostgreSQL ACID + Single Source Domain Services (`financialMetricsService.js`)

---

## 📌 1. Principios Fundamentales
1. **Unicidad de Fuente de Verdad:** Toda métrica financiera se calcula en `server/services/financialMetricsService.js`. Ningún controlador ni componente React duplica fórmulas.
2. **Independencia de Liquidez e Inversiones:** El dinero líquido (`liquidMoney`) corresponde exclusivamente a saldos disponibles en efectivo o bancos. No se mezcla con el límite de tarjetas ni con inversiones a plazo.
3. **Liquidez de Inversiones (`is_liquid`):** Las inversiones pueden ser inmediatamente realizables (`LIQUIDA`) o no realizables de inmediato (`NO_LIQUIDA`).
4. **Dinero Gastable (`spendableMoney`):** Representa únicamente el dinero con disponibilidad inmediata (`liquidMoney + Inversiones Líquidas`). Las inversiones no líquidas forman parte del Patrimonio Neto, pero **NO** de `spendableMoney`.
5. **Reconciliación Patrimonial:** $\text{Patrimonio Neto} = \text{Activos Totales} - \text{Pasivos Totales}$.

---

## 🏛️ 2. LIQUIDEZ vs INVERSIONES vs DINERO DISPONIBLE vs PATRIMONIO

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           ACTIVOS TOTALES                               │
├─────────────────────────────────────────┬───────────────────────────────┤
│            LIQUIDEZ (Cuentas)           │          INVERSIONES          │
│   Nómina + Débito + Ahorro + Efectivo   │   Líquidas  │  No Líquidas    │
├─────────────────────────────────────────┴─────────────┼─────────────────┤
│               DINERO SPENDABLE                        │  PATRIMONIO     │
│       (Gastable de Forma Inmediata)                   │   SOLAMENTE     │
└───────────────────────────────────────────────────────┴─────────────────┘
```

### Tabla Comparativa de Ejemplo:

| Métrica | Componentes | Ejemplo con Inversión Líquida | Ejemplo con Inversión NO Líquida |
| :--- | :--- | :--- | :--- |
| **`liquidMoney`** | Cuentas de Nómina ($20k) + Débito ($5k) | **$25,000** | **$25,000** |
| **`investmentValue`** | CETES ($50k) | **$50,000** | **$50,000** |
| **`spendableMoney`** | `liquidMoney + Inversiones (is_liquid=true)` | **$75,000** | **$25,000** *(Excluye CETES a plazo)* |
| **`availableMoney`** | `liquidMoney + investmentValue` | **$75,000** | **$75,000** |
| **`totalDebt`** | Tarjeta de Crédito ($10k) | **$10,000** | **$10,000** |
| **`netWorth`** | $\text{Activos} - \text{Pasivos}$ | **$65,000** | **$65,000** |

---

## 📊 3. Catálogo Oficial de Métricas (METRIC-001 a METRIC-023)

- **`METRIC-001 liquidMoney`:** Suma de cuentas de tipo `payroll`, `bank`, `cash`. Excluye crédito y deudas.
- **`METRIC-002 investmentValue`:** Valor actual documentado de todas las inversiones en la tabla `investments`.
- **`METRIC-003 spendableMoney`:** Dinero inmediatamente gastable = `liquidMoney` + Inversiones con `is_liquid = true`.
- **`METRIC-004 totalDebt`:** Suma de saldos utilizados en tarjetas de crédito + préstamos corrientes.
- **`METRIC-005 netWorth`:** Patrimonio Neto = $\text{Activos Totales} - \text{Pasivos Totales}$.
- **`METRIC-006 income`:** Flujo entrante de fuentes externas (`income`). Excluye transferencias y retiros.
- **`METRIC-007 expenses`:** Gastos directos de contado (`expense`) + compras con tarjeta (`card_purchase`).
- **`METRIC-008 transfers`:** Movimiento interno entre cuentas propias. Delta Ingreso = $0, Delta Gasto = $0.
- **`METRIC-009 investmentContribution`:** Movimiento de cuenta líquida a inversión. Reduce liquidez, incrementa inversión. Gasto = $0, Pérdida = $0.
- **`METRIC-010 investmentWithdrawal`:** Movimiento de inversión a cuenta líquida. Reduce inversión, incrementa liquidez. Ingreso = $0, Ganancia = $0, Pérdida = $0.
- **`METRIC-011 investmentLoss`:** Disminución en la valuación de mercado de una inversión. Reduce patrimonio sin tocar la cuenta líquida.
- **`METRIC-012 investmentGain`:** Incremento en la valuación de mercado de una inversión. Aumenta patrimonio sin tocar la cuenta líquida.
- **`METRIC-013 partialWithdrawal`:** Secuencia de retiro parcial ($30k de $100k) seguido de pérdida por valuación ($10k). El retiro genera Pérdida = $0. La revaluación posterior genera Pérdida = $10k (no $40k).
- **`METRIC-014 MSI existing`:** Registro de mensualidades y saldos pendientes de un MSI ya contratado sin generar gasto histórico repetido.
- **`METRIC-015 MSI new`:** Compra a plazos nueva que ajusta la deuda y el crédito disponible inmediatamente.
- **`METRIC-016 creditAvailable`:** $\text{Crédito Disponible} = \text{Límite} - \text{Utilizado}$. Excluido de `spendableMoney`.
- **`METRIC-017 dailyBudget`:** Presupuesto móvil de 24 horas consumido únicamente por `expense` y `card_purchase`.
- **`METRIC-018 cashFlow`:** Flujo neto de efectivo = $\text{Ingresos Líquidos} - \text{Gastos Líquidos} - \text{Aportaciones} + \text{Retiros}$.
- **`METRIC-019 availableMoneyTimeline`:** Reconstrucción de la evolución del dinero disponible sin inventar saldos históricos.
- **`METRIC-020 netWorthTimeline`:** Evolución cronológica de Activos - Pasivos.
- **`METRIC-021 debtTimeline`:** Evolución cronológica del saldo de deudas consolidadas.
- **`METRIC-022 investmentTimeline`:** Historial de capital aportado, retiros acumulados, valor actual y ganancia/pérdida.
- **`METRIC-023 expensesByCategory`:** Agregación de gastos categorizados contabilizados exactamente una vez (sin duplicar pago de tarjeta).
