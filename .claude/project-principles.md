# Project Principles

## 1. Read-only first
Nada de paper ni live hasta tener:
- transporte WS estable
- datos verificables
- logs útiles
- pruebas mínimas reproducibles

## 2. Security before convenience
Ningún secreto real entra al repo.
Ninguna wallet real se conecta a código no auditado.

## 3. Git discipline
Todo avance relevante se versiona.
Cada etapa estable se etiqueta.

## 4. Small, testable increments
Preferir pasos pequeños con validación clara.
Evitar reescrituras masivas sin necesidad.

## 5. Evidence over optimism
No declarar “resuelto” sin:
- evidencia runtime
- logs
- tests
- o comparación antes/después

## 6. Separate concerns
Read-only, paper y live deben vivir en capas distintas.

## 7. Reproducibility
Todo bug importante debe tener:
- contexto
- plan
- fix
- validación
- rollback posible

## 8. Honest diagnosis
Si algo falla por red, transporte, protocolo o seguridad, decirlo.
No disfrazarlo como problema de estrategia.

## 9. Cost-aware use of models
- Opus para arquitectura, investigación, seguridad y decisiones críticas.
- Sonnet para implementación del día a día.
- Subagentes read-only siempre que sea posible.

## 10. Documentation is part of the product
Si no quedó documentado, no quedó listo.