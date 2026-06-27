// ============================================================================
// PUENTE TAURI - Comunicación entre Frontend y Backend Rust
// ============================================================================

/**
 * Detecta si estamos ejecutando dentro de Tauri o en navegador
 */
export function isTauriEnvironment() {
    return typeof window !== 'undefined' && 
           window.__TAURI__ !== undefined &&
           window.__TAURI__.core !== undefined;
}

/**
 * Invoca un comando de Tauri de forma segura
 * @param {string} command - Nombre del comando
 * @param {object} args - Argumentos del comando
 * @returns {Promise<any>} - Resultado del comando
 */
async function invokeCommand(command, args = {}) {
    if (!isTauriEnvironment()) {
        console.warn(`[TauriBridge] Tauri no disponible, comando '${command}' ignorado`);
        return null;
    }
    
    try {
        const result = await window.__TAURI__.core.invoke(command, args);
        return result;
    } catch (error) {
        console.error(`[TauriBridge] Error en '${command}':`, error);
        throw error;
    }
}

// ============================================================================
// API DE PERSISTENCIA NATIVA
// ============================================================================

/**
 * Guarda el progreso del juego en el sistema de archivos nativo
 * @param {object} gameProgress - Estado del juego a guardar
 * @returns {Promise<boolean>} - true si se guardó correctamente
 */
export async function saveGameNative(gameProgress) {
    if (!isTauriEnvironment()) {
        // Fallback a localStorage en navegador
        localStorage.setItem('cube_composer_progress', JSON.stringify(gameProgress));
        console.log('[TauriBridge] Guardado en localStorage (modo navegador)');
        return true;
    }
    
    try {
        const jsonData = JSON.stringify(gameProgress);
        await invokeCommand('save_game', { data: jsonData });
        console.log('[TauriBridge] Guardado en archivo nativo');
        return true;
    } catch (error) {
        console.error('[TauriBridge] Error guardando:', error);
        // Fallback a localStorage
        localStorage.setItem('cube_composer_progress', JSON.stringify(gameProgress));
        return false;
    }
}

/**
 * Carga el progreso del juego desde el sistema de archivos nativo
 * @returns {Promise<object>} - Estado del juego cargado
 */
export async function loadGameNative() {
    const defaultProgress = {
        version: 1,
        levels: [],
        totalStars: 0,
        completedLevels: 0
    };
    
    if (!isTauriEnvironment()) {
        // Fallback a localStorage en navegador
        const stored = localStorage.getItem('cube_composer_progress');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                console.log('[TauriBridge] Cargado desde localStorage (modo navegador)');
                return parsed;
            } catch {
                return defaultProgress;
            }
        }
        return defaultProgress;
    }
    
    try {
        const jsonData = await invokeCommand('load_game');
        if (jsonData) {
            const parsed = JSON.parse(jsonData);
            console.log('[TauriBridge] Cargado desde archivo nativo');
            return parsed;
        }
        return defaultProgress;
    } catch (error) {
        console.error('[TauriBridge] Error cargando:', error);
        // Fallback a localStorage
        const stored = localStorage.getItem('cube_composer_progress');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch {
                return defaultProgress;
            }
        }
        return defaultProgress;
    }
}

/**
 * Resetea todo el progreso del juego
 * @returns {Promise<boolean>} - true si se reseteó correctamente
 */
export async function resetGameNative() {
    if (!isTauriEnvironment()) {
        localStorage.removeItem('cube_composer_progress');
        console.log('[TauriBridge] Progreso reseteado (localStorage)');
        return true;
    }
    
    try {
        await invokeCommand('reset_game');
        localStorage.removeItem('cube_composer_progress'); // También limpiar localStorage
        console.log('[TauriBridge] Progreso reseteado (nativo)');
        return true;
    } catch (error) {
        console.error('[TauriBridge] Error reseteando:', error);
        return false;
    }
}

/**
 * Obtiene información del sistema (solo en Tauri)
 * @returns {Promise<object|null>} - Info del sistema o null
 */
export async function getSystemInfo() {
    if (!isTauriEnvironment()) {
        return {
            savePath: 'localStorage',
            saveExists: localStorage.getItem('cube_composer_progress') !== null,
            platform: 'browser',
            arch: navigator.platform
        };
    }
    
    try {
        const jsonData = await invokeCommand('get_system_info');
        return JSON.parse(jsonData);
    } catch (error) {
        console.error('[TauriBridge] Error obteniendo info:', error);
        return null;
    }
}

// ============================================================================
// FFI PARA PURESCRIPT
// ============================================================================

/**
 * Wrapper para PureScript - guarda el juego
 * Retorna un Effect (función sin argumentos)
 */
export function saveGameImpl(progressJson) {
    return function() {
        return saveGameNative(JSON.parse(progressJson));
    };
}

/**
 * Wrapper para PureScript - carga el juego
 * Retorna un Effect que produce un Aff
 */
export function loadGameImpl() {
    return function() {
        return loadGameNative().then(data => JSON.stringify(data));
    };
}

/**
 * Wrapper para PureScript - resetea el juego
 */
export function resetGameImpl() {
    return function() {
        return resetGameNative();
    };
}

/**
 * Wrapper para PureScript - verifica si Tauri está disponible
 */
export function isTauriImpl() {
    return isTauriEnvironment();
}

// ============================================================================
// EXPORTAR AL SCOPE GLOBAL PARA FFI
// ============================================================================

window.__TAURI_BRIDGE__ = {
    saveGame: saveGameNative,
    loadGame: loadGameNative,
    resetGame: resetGameNative,
    getSystemInfo,
    isTauri: isTauriEnvironment
};

console.log('[TauriBridge] Módulo inicializado, Tauri:', isTauriEnvironment() ? 'disponible' : 'no disponible');
