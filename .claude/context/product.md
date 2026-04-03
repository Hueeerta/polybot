# Product Context

## Product vision
Construir un sistema confiable para identificar, evaluar y eventualmente ejecutar oportunidades en Polymarket.

## Final objective
Objetivo final:
- operar rentablemente en Polymarket con una wallet real

Pero ese no es el objetivo de la primera etapa.

## Current stage
Etapa actual:
- MVP read-only
- sin signing
- sin wallet real
- sin ejecución live
- sin paper fills todavía, salvo interfaces preparadas para el futuro

## Why this stage exists
Las iteraciones anteriores mostraron dos riesgos serios:
1. confundir problemas de transporte / infraestructura con problemas de estrategia
2. avanzar hacia paper/live sin una base confiable de datos, trazabilidad y rollback

Por eso el objetivo actual no es “hacer trades”.
Es:
- probar transporte
- observar mercados
- registrar datos
- construir herramientas de diagnóstico
- dejar la arquitectura lista para escalar

## Success criteria for the current stage
El MVP read-only será exitoso si:
- puede descubrir mercados de forma confiable
- puede conectarse de forma estable a los feeds necesarios
- puede mostrar el estado en terminal
- puede registrar eventos y snapshots para replay posterior
- deja logs y métricas suficientes para diagnosticar problemas
- permite evaluar futuras estrategias sin tocar fondos reales

## Non-goals for the current stage
No son objetivos de esta etapa:
- conectar wallet real
- firmar órdenes
- operar con dinero real
- perseguir una tasa de acierto específica
- optimizar alpha
- prometer rentabilidad

## Product principles
- primero evidencia, luego optimización
- primero confiabilidad, luego velocidad
- primero diseño auditable, luego complejidad
- primero read-only, luego paper, luego live
- nada de live sin auditoría de seguridad explícita

## Planned roadmap
1. Read-only transport and observability
2. Market recorder + replay harness
3. Strategy research harness
4. Paper trading simulation
5. Risk engine and shutdown discipline
6. Live-readiness gate
7. Live trading in guarded mode

## External references
El repo `polymarket-mcp-server` se considerará:
- referencia de arquitectura
- referencia de herramientas
- posible MCP read-only

No se considerará:
- base confiable para live trading
- código aprobado para wallet real sin auditoría