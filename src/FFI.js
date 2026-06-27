// FFI.js - Archivo de referencia para el puente PureScript <-> JavaScript
// NOTA: El archivo FFI principal está en src/Engine/FFI.js
// Este archivo se mantiene como documentación y punto de referencia.

/**
 * ARQUITECTURA FFI:
 * 
 * PureScript (Engine.FFI.purs) --> FFI --> JavaScript (Engine/FFI.js)
 *                                              |
 *                                              v
 *                                    Three.js (index.js)
 * 
 * Las funciones exportadas desde Engine/FFI.js son:
 * - renderWallImpl: Recibe datos de cubos y los envía al motor 3D
 * - initFFIImpl: Inicializa la conexión FFI
 * - sendGameStateImpl: Envía el estado completo del juego
 * 
 * La comunicación usa eventos personalizados:
 * - 'purs-render-wall': Para actualizar la visualización de cubos
 * - 'purs-game-state': Para sincronizar el estado del juego
 */

console.log("[FFI] Archivo de referencia cargado. Ver src/Engine/FFI.js para implementación.");
