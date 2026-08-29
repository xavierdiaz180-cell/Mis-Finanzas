# MIS FINANZAS V2 — MEJORAS FUTURAS

Este documento recopila las oportunidades de optimización y características recomendadas para fases posteriores (V3), habiendo consolidado el core financiero de V2.

---

## 1. Optimización de Performance y Chunking (Vite / React)
- **Code-Splitting en Frontend**: Dividir el bundle principal (`1,060 kB`) mediante `React.lazy` e `import()` dinámico para pantallas secundarias (Configuración, Ayuda, Reportes Avanzados).
- **Cierre de Chunks**: Configurar `manualChunks` en `vite.config.js` para separar bibliotecas de gráficos (Lucide, Recharts/Chart.js).

## 2. Autenticación y Seguridad Multi-Usuario (Fase Futura V4)
- **Módulos de Auth**: Implementación limpia de usuarios, hashing seguro de contraseñas (Argon2 / bcrypt) y sesiones JWT/OAuth2.
- **Aislamiento por Tenant (`user_id`)**: Indexación estricta por usuario en PostgreSQL Supabase.

## 3. Integración Bancaria Automática (Open Banking)
- **Conectores de API Bancaria**: Integración con estándares Open Banking (Plaid / Belvo) para sincronización automática de estados de cuenta sin alteración de la arquitectura de servicios V2.

## 4. Notificaciones Inteligentes y Recordatorios
- **Alertas Proactivas**: Envió de recordatorios vía Push/Email sobre fechas de corte (`cutoff_date`), fechas límite de pago (`due_date`) de tarjetas de crédito y renovaciones de inversiones.

## 5. Experiencia UI/UX Avanzada
- **Modo Oscuro Avanzado**: Personalización de temas visuales manteniendo accesibilidad de contraste.
- **Exportación de Datos**: Descarga de reportes en PDF / Excel de Timelines, Gastos por Categoría y Reconciliaciones Financieras.
