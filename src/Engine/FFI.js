// Engine/FFI.js - Puente FFI entre PureScript y JavaScript (Three.js)
// Este archivo acompaña a Engine/FFI.purs
// Proporciona comunicación reactiva con el motor 3D

/**
 * Cola de comandos para cuando el motor aún no está listo.
 */
const commandQueue = [];
let engineReady = false;

// Escuchar cuando el motor esté listo
if (typeof window !== 'undefined') {
    window.addEventListener('three-engine-ready', () => {
        engineReady = true;
        console.log('[FFI] Motor 3D detectado, procesando cola...');
        processQueue();
    });
    
    // Verificar si ya está listo
    if (window.__THREE_ENGINE_READY__) {
        engineReady = true;
    }
}

/**
 * Procesa la cola de comandos pendientes.
 */
function processQueue() {
    while (commandQueue.length > 0) {
        const { fn, args } = commandQueue.shift();
        fn(...args);
    }
}

/**
 * Ejecuta un comando inmediatamente o lo encola.
 */
function executeOrQueue(fn, ...args) {
    if (engineReady && window.__CUBE_ENGINE__) {
        fn(...args);
    } else {
        commandQueue.push({ fn, args });
    }
}

/**
 * Renderiza una pared de cubos.
 * Llama directamente al motor 3D si está disponible.
 * @param {Array} wallData - Matriz de estados de los cubos desde PureScript
 * @returns {Function} - Función que ejecuta el efecto (Effect Unit)
 */
export const renderWallImpl = (wallData) => () => {
    executeOrQueue((data) => {
        // Intentar llamada directa al motor (más eficiente)
        if (window.__CUBE_ENGINE__ && window.__CUBE_ENGINE__.drawWall) {
            window.__CUBE_ENGINE__.drawWall(data);
        } else {
            // Fallback a eventos
            const event = new CustomEvent('purs-render-wall', { 
                detail: { wallData: data } 
            });
            window.dispatchEvent(event);
        }
    }, wallData);
    
    return {};
};

/**
 * Inicializa la conexión FFI y registra que está lista.
 * @returns {Function} - Función que ejecuta el efecto
 */
export const initFFIImpl = () => {
    console.log("[FFI] Puente PureScript <-> JavaScript inicializado");
    window.__PURS_FFI_READY__ = true;
    
    // Notificar al motor que PureScript está listo
    window.dispatchEvent(new CustomEvent('purs-ffi-ready'));
    
    return {};
};

/**
 * Envía el estado completo del juego al motor de renderizado.
 * @param {Object} gameState - Estado completo del juego
 * @returns {Function} - Función que ejecuta el efecto
 */
export const sendGameStateImpl = (gameState) => () => {
    executeOrQueue((state) => {
        // Renderizar pared actual
        if (window.__CUBE_ENGINE__ && state.currentWall) {
            window.__CUBE_ENGINE__.drawWall(state.currentWall);
        }
        
        // También emitir evento para otros listeners
        const event = new CustomEvent('purs-game-state', { 
            detail: { gameState: state } 
        });
        window.dispatchEvent(event);
    }, gameState);
    
    return {};
};

/**
 * Limpia la pared actual.
 * @returns {Function} - Función que ejecuta el efecto
 */
export const clearWallImpl = () => {
    if (window.__CUBE_ENGINE__ && window.__CUBE_ENGINE__.clearWall) {
        window.__CUBE_ENGINE__.clearWall();
    }
    return {};
};

/**
 * Cambia el tema visual.
 * @param {string} theme - 'light' o 'dark'
 * @returns {Function} - Función que ejecuta el efecto
 */
export const setThemeImpl = (theme) => () => {
    if (window.__CUBE_ENGINE__ && window.__CUBE_ENGINE__.setTheme) {
        window.__CUBE_ENGINE__.setTheme(theme);
    }
    return {};
};

// ============================================================================
// HELPERS PARA ARRAYS (usados por PureScript)
// ============================================================================

export const arrayLength = (arr) => arr.length;

export const arrayZipWith = (f) => (arr1) => (arr2) => {
    const result = [];
    const len = Math.min(arr1.length, arr2.length);
    for (let i = 0; i < len; i++) {
        result.push(f(arr1[i])(arr2[i]));
    }
    return result;
};

// ============================================================================
// UTILIDADES DE DEBUG
// ============================================================================

/**
 * Verifica el estado de la conexión FFI.
 */
export const checkConnectionImpl = () => {
    const status = {
        ffiReady: window.__PURS_FFI_READY__ || false,
        engineReady: engineReady,
        threeReady: window.__THREE_ENGINE_READY__ || false,
        queueLength: commandQueue.length
    };
    console.log('[FFI] Estado de conexión:', status);
    return status;
};
