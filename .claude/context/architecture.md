# Architecture Context

## Architectural strategy
La arquitectura debe separar con nitidez tres capas futuras:
- readonly
- paper
- live

La etapa actual implementa solo la primera capa, pero debe dejar boundaries claros para las siguientes.

## Core design rule
No mezclar:
- adquisición de datos
- evaluación de señales
- simulación de órdenes
- ejecución real
- manejo de secretos

## Stack
TypeScript on Node.js (see ADR-0003).

## Proposed top-level modules
- `src/polybot/config/`
- `src/polybot/api/`
- `src/polybot/transport/`
- `src/polybot/models/`
- `src/polybot/recorder/`
- `src/polybot/replay/`
- `src/polybot/research/`
- `src/polybot/ui/`
- `src/polybot/runtime/`
- `src/polybot/logging/`

## Responsibilities by layer

### config
- settings
- env loading
- typed config
- feature flags

### api
- wrappers read-only para Gamma / Data / CLOB / otros endpoints públicos

### transport
- websocket probes
- stream lifecycle
- reconnect logic
- health metrics
- heartbeat / keepalive handling when needed

### models
- typed domain entities
- market
- outcome
- orderbook snapshot
- event
- signal candidate

### recorder
- persistencia local de snapshots y eventos
- formatos aptos para replay

### replay
- reproducir sesiones y secuencias de mercado

### research
- análisis offline
- evaluación de señales
- estrategia en modo investigación, no ejecución

### ui
- dashboard terminal
- session summary
- health status

### runtime
- orchestration
- task lifecycle
- graceful shutdown
- session state

## Future boundaries

### Paper
La futura capa paper debe:
- consumir señales desde research/runtime
- usar portfolio ficticio
- tener fills simulados
- no compartir código de signing con live

### Live
La futura capa live debe:
- vivir aislada
- tener secrets handling separado
- tener ejecución y signing desacoplados
- poder deshabilitarse por completo por config

## Logging and observability
Todo componente relevante debe exponer:
- estado
- errores
- counters
- timings
- contexto suficiente para debug

## Persistence
Persistencia mínima obligatoria:
- logs
- snapshots
- eventos
- config usada por sesión
- metadata de versión/commit

## Versioning assumptions
Cada sesión debe poder relacionarse con:
- commit git
- tag si aplica
- config
- fecha/hora
- modo de operación