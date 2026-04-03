# ADR-0001: Read-only first

## Status
Accepted

## Context
El objetivo final del proyecto es operar rentablemente en Polymarket, pero las iteraciones previas mostraron que avanzar demasiado rápido hacia paper/live sin un transporte estable y sin trazabilidad produce pérdida de control técnico y dificulta el diagnóstico.

## Decision
La primera etapa del proyecto será estrictamente read-only.

Eso implica:
- no wallet real
- no signing
- no live execution
- no paper fills todavía, salvo interfaces si resultan necesarias
- foco total en datos, transporte, observabilidad y replay

## Rationale
Este enfoque:
- reduce riesgo técnico
- reduce riesgo de seguridad
- mejora capacidad de diagnóstico
- facilita versionado y rollback
- permite separar claramente causas de infraestructura versus estrategia

## Consequences
### Positive
- base más auditable
- menor riesgo
- mejores diagnósticos
- permite escalar con orden

### Negative
- retrasa paper/live
- genera menos sensación de “progreso visible”
- obliga a ser disciplinado con la arquitectura

## Follow-up
No pasar a paper hasta cumplir criterios de estabilidad y observabilidad.