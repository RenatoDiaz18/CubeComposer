// FFI para Game.purs
import { saveGameNative, loadGameNative, resetGameNative, isTauriEnvironment } from './TauriBridge.js';

// ============================================================================
// PERSISTENCIA
// ============================================================================

export function loadGameImpl() {
    return function() {
        return loadGameNative().then(data => JSON.stringify(data));
    };
}

export function saveGameImpl(jsonStr) {
    return function() {
        try {
            const data = JSON.parse(jsonStr);
            return saveGameNative(data);
        } catch (e) {
            console.error('[Game.js] Error parseando JSON para guardar:', e);
            return Promise.resolve(false);
        }
    };
}

export function resetGameImpl() {
    return function() {
        return resetGameNative();
    };
}

export const isTauriImpl = isTauriEnvironment();

// ============================================================================
// EVENTOS
// ============================================================================

export function emitEventImpl(eventName) {
    return function(dataJson) {
        return function() {
            const event = new CustomEvent(eventName, {
                detail: JSON.parse(dataJson)
            });
            window.dispatchEvent(event);
            console.log(`[Game.js] Evento emitido: ${eventName}`);
        };
    };
}

// ============================================================================
// SERIALIZACIÓN JSON
// ============================================================================

export function parseProgressImpl(jsonStr) {
    return function() {
        try {
            const data = JSON.parse(jsonStr);
            // Validar estructura básica
            if (typeof data.version !== 'number' || !Array.isArray(data.levels)) {
                return null;
            }
            return data;
        } catch (e) {
            console.error('[Game.js] Error parseando progreso:', e);
            return null;
        }
    };
}

export function stringifyProgressImpl(progress) {
    return JSON.stringify(progress);
}

// ============================================================================
// REGISTRO DE HANDLERS
// ============================================================================

export function registerHandlersImpl(handleLevelComplete) {
    return function() {
        // Registrar handler global para completación de niveles
        window.__GAME_HANDLERS__ = {
            onLevelComplete: function(levelId, steps) {
                handleLevelComplete(levelId)(steps)();
            }
        };
        
        // Escuchar eventos del UI
        window.addEventListener('levelCompleted', function(e) {
            const { levelId, steps } = e.detail;
            window.__GAME_HANDLERS__.onLevelComplete(levelId, steps);
        });
        
        console.log('[Game.js] Handlers registrados');
    };
}

// ============================================================================
// UTILIDADES PARA UI
// ============================================================================

/**
 * Obtiene los datos de niveles formateados para el selector de niveles
 * Usado directamente por JavaScript sin pasar por PureScript
 */
export function getLevelDataForUI(progress) {
    const LEVEL_DATA = {
        '0.1': { name: 'Transformation', chapter: 'Introduction', idealSteps: 1 },
        '0.2': { name: 'Stack It', chapter: 'Introduction', idealSteps: 1 },
        '0.3': { name: 'Filter Basics', chapter: 'Introduction', idealSteps: 1 },
        '0.4': { name: 'Combine', chapter: 'Introduction', idealSteps: 2 },
        '1.1': { name: 'Double Stack', chapter: 'Basics', idealSteps: 1 },
        '1.2': { name: 'Color Sort', chapter: 'Basics', idealSteps: 2 },
        '1.3': { name: 'Tower Build', chapter: 'Basics', idealSteps: 2 },
        '1.4': { name: 'Mixed Transform', chapter: 'Basics', idealSteps: 1 },
        '2.1': { name: 'Deep Filter', chapter: 'Advanced', idealSteps: 1 },
        '2.2': { name: 'Reverse Order', chapter: 'Advanced', idealSteps: 1 },
        '2.3': { name: 'Complex Stack', chapter: 'Advanced', idealSteps: 2 },
        '2.4': { name: 'Master Challenge', chapter: 'Advanced', idealSteps: 3 }
    };
    
    const levelOrder = ['0.1', '0.2', '0.3', '0.4', '1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '2.3', '2.4'];
    
    // Convertir progreso a mapa para búsqueda rápida
    const progressMap = {};
    if (progress && progress.levels) {
        progress.levels.forEach(lp => {
            progressMap[lp.id] = lp.progress;
        });
    }
    
    // Determinar qué niveles están desbloqueados
    const isUnlocked = (levelId) => {
        if (levelId === '0.1') return true;
        const idx = levelOrder.indexOf(levelId);
        if (idx <= 0) return false;
        const prevId = levelOrder[idx - 1];
        return progressMap[prevId]?.completed === true;
    };
    
    // Construir datos para UI
    return levelOrder.map(id => {
        const data = LEVEL_DATA[id];
        const prog = progressMap[id];
        return {
            id,
            name: data.name,
            chapter: data.chapter,
            idealSteps: data.idealSteps,
            unlocked: isUnlocked(id),
            completed: prog?.completed || false,
            stars: prog?.stars || 0,
            bestSteps: prog?.bestSteps || null
        };
    });
}

// Exportar al scope global
window.__GAME_FFI__ = {
    getLevelDataForUI
};
