# Constraints Context

## Hard constraints
1. No wallet real en esta etapa
2. No signing real en esta etapa
3. No operar con fondos reales
4. No confiar en repos externos sin auditoría
5. Todo cambio importante debe quedar documentado y versionado

## Engineering constraints
- el proyecto debe correr localmente desde terminal
- el monitoreo principal debe ser terminal-first
- debe ser posible apagar limpiamente
- debe ser posible reproducir o inspeccionar sesiones
- debe ser posible rollback vía git/tags

## Product constraints
- no perseguir alpha antes de validar transporte
- no mezclar investigación con ejecución real
- no declarar estabilidad sin evidencia runtime

## Security constraints
- secretos fuera del repo
- no guardar private keys en texto plano
- nada de live trading sin checklist de seguridad
- dependencias externas deben revisarse antes de usar en flujos sensibles

## Process constraints
- commits pequeños y frecuentes
- ramas separadas por tipo de trabajo
- changelog actualizado
- ADR para decisiones de arquitectura o seguridad

## Current external dependency posture
`polymarket-mcp-server` se considera dependencia de estudio, no dependencia confiable de producción.

## Definition of “ready to move to paper”
Solo se puede pasar a paper cuando existan:
- transporte estable
- recorder/replay mínimo
- logs suficientes
- criterios de aceptación para calidad de datos
- rollback simple a una versión estable

## Definition of “ready to move to live”
Solo se puede pasar a live cuando existan:
- auditoría de seguridad
- estrategia paper validada
- límites de riesgo definidos
- flujo de secretos definido
- checklist live aprobada
- runbook de rollback y emergency stop