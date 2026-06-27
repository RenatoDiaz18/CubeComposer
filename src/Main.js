// Main.js - FFI Bridge para Main.purs
// Implementa las funciones foreign import del módulo PureScript

"use strict";

// ============================================================================
// NOTIFICACIONES A JAVASCRIPT
// ============================================================================

/**
 * Notifica a JavaScript que el estado del juego ha cambiado
 * Dispara un CustomEvent con el nuevo estado
 */
exports.notifyGameStateChanged = function(gameState) {
    return function() {
        // Convertir el estado de PureScript a formato JS
        const jsState = {
            currentLevel: gameState.currentLevel,
            levelState: {}
        };
        
        // Convertir StrMap a objeto JS
        if (gameState.levelState) {
            // StrMap es un objeto con métodos específicos de PS
            // Intentar extraer las claves/valores
            const levelStateObj = gameState.levelState;
            if (typeof levelStateObj === 'object') {
                Object.keys(levelStateObj).forEach(key => {
                    const val = levelStateObj[key];
                    // Convertir List a Array si es necesario
                    jsState.levelState[key] = Array.isArray(val) ? val : [];
                });
            }
        }
        
        // Almacenar en window para acceso global
        window.__PURE_GAME_STATE__ = jsState;
        
        // Disparar evento para que index.js pueda reaccionar
        const event = new CustomEvent('pureGameStateChanged', {
            detail: jsState,
            bubbles: true
        });
        document.dispatchEvent(event);
        
        console.log('[Main.js] Estado del juego actualizado:', jsState.currentLevel);
    };
};

/**
 * Notifica a JavaScript el resultado de aplicar transformadores
 */
exports.notifyWallUpdate = function(result) {
    return function() {
        window.__PURE_WALL_RESULT__ = result;
        
        const event = new CustomEvent('pureWallUpdate', {
            detail: result,
            bubbles: true
        });
        document.dispatchEvent(event);
        
        console.log('[Main.js] Wall actualizado. Resuelto:', result.solved);
    };
};

// ============================================================================
// REGISTRO DE FUNCIONES PURESCRIPT
// ============================================================================

/**
 * Registra las funciones de PureScript en window para acceso desde JS
 */
exports.registerPureFunctions = function(funcs) {
    return function() {
        // Crear contenedor global
        window.__PURE_FUNCTIONS__ = {
            // Envolver cada función para que sea callable directamente
            resetLevel: function() {
                return funcs.resetLevel();
            },
            nextLevel: function() {
                return funcs.nextLevel();
            },
            prevLevel: function() {
                return funcs.prevLevel();
            },
            setLevel: function(levelId) {
                return funcs.setLevel(levelId)();
            },
            addTransformer: function(transformerId) {
                return funcs.addTransformer(transformerId)();
            },
            removeTransformer: function(transformerId) {
                return funcs.removeTransformer(transformerId)();
            },
            checkSolution: function() {
                return funcs.checkSolution();
            },
            // Funciones de datos (retornan información)
            getLevelData: function() {
                return funcs.getLevelData();
            },
            getAvailableTransformers: function() {
                return funcs.getAvailableTransformers();
            }
        };
        
        // Disparar evento indicando que PureScript está listo
        const event = new CustomEvent('pureScriptReady', {
            detail: { functions: Object.keys(window.__PURE_FUNCTIONS__) },
            bubbles: true
        });
        document.dispatchEvent(event);
        
        console.log('[Main.js] Funciones PureScript registradas:', Object.keys(window.__PURE_FUNCTIONS__));
    };
};

// ============================================================================
// UTILIDADES ADICIONALES
// ============================================================================

/**
 * Convierte una List de PureScript a Array de JS
 * Las listas de PS son estructuras { head, tail } anidadas
 */
function pureListToArray(list) {
    const result = [];
    let current = list;
    
    while (current && current.value0 !== undefined) {
        result.push(current.value0);
        current = current.value1;
    }
    
    return result;
}

/**
 * Convierte un StrMap de PureScript a objeto JS
 */
function pureStrMapToObject(strMap) {
    if (!strMap) return {};
    
    // StrMap internamente es un objeto JS
    const result = {};
    for (const key in strMap) {
        if (strMap.hasOwnProperty(key)) {
            const value = strMap[key];
            // Si el valor es una List, convertirla
            if (value && value.value0 !== undefined) {
                result[key] = pureListToArray(value);
            } else if (Array.isArray(value)) {
                result[key] = value;
            } else {
                result[key] = value;
            }
        }
    }
    return result;
}

// Exponer utilidades globalmente
window.__PURE_UTILS__ = {
    listToArray: pureListToArray,
    strMapToObject: pureStrMapToObject
};
