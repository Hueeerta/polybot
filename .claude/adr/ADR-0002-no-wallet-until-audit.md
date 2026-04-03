# ADR-0002: No wallet integration until explicit audit

## Status
Accepted

## Context
El proyecto podría eventualmente usar repos externos, MCPs o librerías que permitan conectarse a Polymarket y ejecutar órdenes. Cualquier componente capaz de manejar credenciales, firmar mensajes o mover fondos introduce riesgo crítico.

## Decision
No se conectará ninguna wallet real ni se implementará signing real hasta completar una auditoría explícita de seguridad.

## Scope of the rule
La regla aplica a:
- private keys
- wallet connectors
- signing code
- trading SDKs
- MCPs con capacidad de ejecutar operaciones
- repos externos con features de trading

## Rationale
Open source no equivale a código seguro.
La velocidad de desarrollo no justifica el riesgo de comprometer fondos reales.

## Consequences
### Positive
- reduce riesgo catastrófico
- fuerza disciplina de seguridad
- obliga a separar readonly/paper/live

### Negative
- retrasa experimentación live
- añade trabajo de revisión

## Audit requirements before any live step
- revisión de dependencias
- revisión del flujo de firma
- revisión de manejo de secretos
- checklist de live completada
- aprobación explícita en documentación

## Follow-up
Crear una checklist formal de seguridad antes de abrir cualquier camino hacia live trading.