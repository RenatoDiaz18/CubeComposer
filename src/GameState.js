// GameState.js - Sistema de persistencia y gestión de estado del juego
// Integrado con TauriBridge para persistencia nativa (Tauri) o localStorage (navegador)

import { saveGameNative, loadGameNative, isTauriEnvironment } from './TauriBridge.js';

const STORAGE_KEY = 'cube_composer_progress';
const SETTINGS_KEY = 'cube_composer_settings';

// ============================================================================
// ESTRUCTURA DE DATOS POR DEFECTO
// ============================================================================

const DEFAULT_PROGRESS = {
    version: 1,
    levels: {},  // { "0.1": { completed: true, stars: 3, bestSteps: 2 } }
    currentChapter: 0,
    totalStars: 0,
    completedLevels: 0
};

const DEFAULT_SETTINGS = {
    theme: 'dark',
    language: 'es',
    sound: true
};

// ============================================================================
// CLASE GAMESTATE
// ============================================================================

class GameState {
    constructor() {
        this.progress = this.loadProgress();
        this.settings = this.loadSettings();
        this.currentLevel = null;
        this.currentSteps = 0;
        this.listeners = new Map();
    }

    // ========================================================================
    // PERSISTENCIA
    // ========================================================================

    loadProgress() {
        // Carga inicial sincrónica desde localStorage
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...DEFAULT_PROGRESS, ...parsed };
            }
        } catch (e) {
            console.warn('[GameState] Error cargando progreso (localStorage):', e);
        }
        return { ...DEFAULT_PROGRESS };
    }

    /**
     * Carga progreso de forma asíncrona (Tauri o localStorage).
     * Usar al inicio de la app para obtener el estado más reciente.
     */
    async loadProgressAsync() {
        try {
            const data = await loadGameNative();
            // Convertir formato de array a objeto si es necesario
            if (Array.isArray(data.levels)) {
                // Formato nuevo (array) - convertir a objeto
                const levelsObj = {};
                data.levels.forEach(lp => {
                    levelsObj[lp.id] = lp.progress;
                });
                this.progress = {
                    ...DEFAULT_PROGRESS,
                    ...data,
                    levels: levelsObj
                };
            } else {
                this.progress = { ...DEFAULT_PROGRESS, ...data };
            }
            console.log('[GameState] Progreso cargado (async):', this.progress.completedLevels, 'niveles');
            this.emit('progressLoaded', this.progress);
            return this.progress;
        } catch (e) {
            console.error('[GameState] Error cargando progreso (async):', e);
            return this.progress;
        }
    }

    saveProgress() {
        // Guardar sincrónicamente en localStorage como respaldo
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
        } catch (e) {
            console.error('[GameState] Error guardando en localStorage:', e);
        }
        
        // Guardar asincrónicamente en Tauri
        this.saveProgressAsync();
    }

    async saveProgressAsync() {
        try {
            // Convertir formato de objeto a array para compatibilidad con PureScript
            const progressForSave = {
                ...this.progress,
                levels: Object.entries(this.progress.levels).map(([id, progress]) => ({
                    id,
                    progress
                }))
            };
            await saveGameNative(progressForSave);
            console.log('[GameState] Progreso guardado (async)');
        } catch (e) {
            console.error('[GameState] Error guardando progreso (async):', e);
        }
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn('[GameState] Error cargando configuración:', e);
        }
        return { ...DEFAULT_SETTINGS };
    }

    saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
            console.log('[GameState] Configuración guardada');
            this.emit('settingsChanged', this.settings);
        } catch (e) {
            console.error('[GameState] Error guardando configuración:', e);
        }
    }

    // ========================================================================
    // GESTIÓN DE NIVELES
    // ========================================================================

    /**
     * Verifica si un nivel está desbloqueado.
     * El primer nivel de cada capítulo está desbloqueado si el capítulo anterior está completo.
     */
    isLevelUnlocked(levelId) {
        // Primer nivel siempre desbloqueado
        if (levelId === '0.1') return true;

        // Parsear el ID del nivel
        const [chapter, levelNum] = levelId.split('.').map(Number);
        
        // Si es el primer nivel de un capítulo, verificar que el capítulo anterior esté completo
        if (levelNum === 1 && chapter > 0) {
            const prevChapter = chapter - 1;
            // Verificar que al menos 3 niveles del capítulo anterior estén completos
            const prevLevelIds = this.getLevelIdsForChapter(prevChapter);
            const completedInPrev = prevLevelIds.filter(id => this.isLevelCompleted(id)).length;
            return completedInPrev >= 3;
        }

        // Para otros niveles, el nivel anterior debe estar completo
        const prevLevelId = `${chapter}.${levelNum - 1}`;
        return this.isLevelCompleted(prevLevelId);
    }

    getLevelIdsForChapter(chapter) {
        // Devuelve IDs de niveles para un capítulo (asumiendo 4 niveles por capítulo)
        return [1, 2, 3, 4].map(n => `${chapter}.${n}`);
    }

    isLevelCompleted(levelId) {
        return this.progress.levels[levelId]?.completed || false;
    }

    getLevelProgress(levelId) {
        return this.progress.levels[levelId] || { completed: false, stars: 0, bestSteps: Infinity };
    }

    /**
     * Completa un nivel y calcula las estrellas.
     */
    completeLevel(levelId, steps, idealSteps) {
        const stars = this.calculateStars(steps, idealSteps);
        const existing = this.progress.levels[levelId] || { completed: false, stars: 0, bestSteps: Infinity };
        
        // Solo actualizar si es mejor resultado o primera vez
        const isNewBest = steps < existing.bestSteps;
        const isFirstComplete = !existing.completed;

        this.progress.levels[levelId] = {
            completed: true,
            stars: Math.max(existing.stars, stars),
            bestSteps: Math.min(existing.bestSteps, steps)
        };

        // Actualizar totales
        if (isFirstComplete) {
            this.progress.completedLevels++;
        }
        this.progress.totalStars = this.calculateTotalStars();

        this.saveProgress();
        this.emit('levelCompleted', { levelId, steps, stars, idealSteps, isNewBest });

        return { stars, isNewBest };
    }

    /**
     * Calcula las estrellas basado en los pasos.
     * 3 estrellas: steps <= idealSteps
     * 2 estrellas: steps <= idealSteps + 2
     * 1 estrella: steps > idealSteps + 2
     */
    calculateStars(steps, idealSteps) {
        if (steps <= idealSteps) return 3;
        if (steps <= idealSteps + 2) return 2;
        return 1;
    }

    calculateTotalStars() {
        return Object.values(this.progress.levels)
            .reduce((sum, level) => sum + (level.stars || 0), 0);
    }

    // ========================================================================
    // ESTADO DEL JUEGO ACTUAL
    // ========================================================================

    startLevel(levelId, levelData) {
        this.currentLevel = {
            id: levelId,
            data: levelData,
            steps: 0,
            startTime: Date.now()
        };
        this.currentSteps = 0;
        this.emit('levelStarted', { levelId, levelData });
    }

    incrementSteps() {
        this.currentSteps++;
        this.emit('stepsChanged', this.currentSteps);
        return this.currentSteps;
    }

    resetSteps() {
        this.currentSteps = 0;
        this.emit('stepsChanged', this.currentSteps);
    }

    getCurrentSteps() {
        return this.currentSteps;
    }

    // ========================================================================
    // CONFIGURACIÓN
    // ========================================================================

    setTheme(theme) {
        this.settings.theme = theme;
        this.saveSettings();
    }

    getTheme() {
        return this.settings.theme;
    }

    setLanguage(language) {
        this.settings.language = language;
        this.saveSettings();
    }

    setSound(enabled) {
        this.settings.sound = enabled;
        this.saveSettings();
    }

    // ========================================================================
    // SISTEMA DE EVENTOS
    // ========================================================================

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(data));
        }
    }

    // ========================================================================
    // EXPORTAR/IMPORTAR PROGRESO
    // ========================================================================

    exportProgress() {
        return JSON.stringify({
            progress: this.progress,
            settings: this.settings,
            exportDate: new Date().toISOString()
        }, null, 2);
    }

    importProgress(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.progress) {
                this.progress = { ...DEFAULT_PROGRESS, ...data.progress };
                this.saveProgress();
            }
            if (data.settings) {
                this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
                this.saveSettings();
            }
            return true;
        } catch (e) {
            console.error('[GameState] Error importando progreso:', e);
            return false;
        }
    }

    resetProgress() {
        this.progress = { ...DEFAULT_PROGRESS };
        this.saveProgress();
        this.emit('progressReset');
    }

    // ========================================================================
    // DEBUG
    // ========================================================================

    getDebugInfo() {
        return {
            progress: this.progress,
            settings: this.settings,
            currentLevel: this.currentLevel,
            currentSteps: this.currentSteps,
            isTauri: isTauriEnvironment()
        };
    }

    /**
     * Inicialización asíncrona del GameState.
     * Carga progreso desde Tauri (nativo) si disponible.
     */
    async init() {
        console.log('[GameState] Inicializando...');
        console.log('[GameState] Entorno Tauri:', isTauriEnvironment());
        await this.loadProgressAsync();
        this.emit('initialized', this.getDebugInfo());
        return this;
    }

    /**
     * Verifica si estamos en entorno Tauri (nativo)
     */
    isTauri() {
        return isTauriEnvironment();
    }
}

// ============================================================================
// TRANSFORMADORES POR CAPÍTULO (Originales de PureScript)
// ============================================================================

export const CHAPTER_TRANSFORMERS = {
    0: [ // Introduction
        { id: 'replaceYbyR', name: 'map {Yellow}↦{Red}' },
        { id: 'stackY', name: 'map (stack {Yellow})' },
        { id: 'replaceYbyYR', name: 'map {Yellow}↦[{Red}{Yellow}]' },
        { id: 'rejectY', name: 'map (reject {Yellow})' }
    ],
    1: [ // Chapter 1
        { id: 'mapYtoYR', name: 'map {Yellow}↦[{Red}{Yellow}]' },
        { id: 'mapCtoRC', name: 'map {Cyan}↦[{Cyan}{Red}]' },
        { id: 'rejectY', name: 'map (reject {Yellow})' },
        { id: 'rejectC', name: 'map (reject {Cyan})' },
        { id: 'filterContainsR', name: 'filter (contains {Red})' },
        { id: 'stackR', name: 'map (stack {Red})' },
        { id: 'mapReverse', name: 'map reverse' }
    ],
    2: [ // Chapter 2
        { id: 'replaceYbyB', name: 'map {Yellow}↦{Brown}' },
        { id: 'replaceYbyBY', name: 'map {Yellow}↦[{Yellow}{Brown}]' },
        { id: 'replaceBbyOO', name: 'map {Brown}↦[{Orange}{Orange}]' },
        { id: 'rejectO', name: 'map (reject {Orange})' },
        { id: 'stackY', name: 'map (stack {Yellow})' },
        { id: 'stackEqualColumns', name: 'stackEqualColumns' }
    ],
    3: [ // Chapter 3
        { id: 'mapXtoOX', name: 'map {X}↦[{X}{Orange}]' },
        { id: 'mapCXtoX', name: 'map [{X}{Cyan}]↦{X}' },
        { id: 'mapOOtoC', name: 'map [{Orange}{Orange}]↦{Cyan}' },
        { id: 'mapCtoO', name: 'map {Cyan}↦{Orange}' }
    ],
    4: [ // Chapter 4
        { id: 'replaceYbyR', name: 'map {Yellow}↦{Red}' },
        { id: 'replaceRbyC', name: 'map {Red}↦{Cyan}' },
        { id: 'replaceCbyY', name: 'map {Cyan}↦{Yellow}' },
        { id: 'partitionContainsC', name: 'partition (contains {Cyan})' },
        { id: 'partitionContainsR', name: 'partition (contains {Red})' }
    ],
    5: [ // Chapter 5 - Binary
        { id: 'mapAdd1', name: 'map (+1)' },
        { id: 'mapSub1', name: 'map (-1)' },
        { id: 'mapMul2', name: 'map (×2)' },
        { id: 'mapPow2', name: 'map (^2)' },
        { id: 'filterEven', name: 'filter even' }
    ]
};

// ============================================================================
// DATOS DE NIVELES COMPLETOS (Originales de PureScript)
// ============================================================================

export const LEVEL_DATA = {
    // ========== Chapter 0 - Introduction ==========
    '0.1': { 
        name: 'Transformation', 
        idealSteps: 1, 
        chapter: 0,
        help: 'En este juego, tu objetivo es crear una secuencia de funciones que transforme los cubos de colores en el patrón deseado. Para cambiar cubos amarillos a rojos, agrega la función replaceYbyR a tu programa.',
        initial: [['Yellow', 'Yellow', 'Red'], ['Yellow', 'Red'], ['Red'], ['Red'], ['Yellow', 'Red'], ['Yellow', 'Yellow', 'Red']],
        target: [['Red', 'Red', 'Red'], ['Red', 'Red'], ['Red'], ['Red'], ['Red', 'Red'], ['Red', 'Red', 'Red']]
    },
    '0.2': { 
        name: 'Rejection', 
        idealSteps: 1, 
        chapter: 0,
        help: 'Para remover todos los cubos de un color específico, usa la función reject.',
        initial: [['Yellow', 'Yellow', 'Red'], ['Yellow', 'Red'], ['Red'], ['Red'], ['Yellow', 'Red'], ['Yellow', 'Yellow', 'Red']],
        target: [['Red'], ['Red'], ['Red'], ['Red'], ['Red'], ['Red']]
    },
    '0.3': { 
        name: 'Composition', 
        idealSteps: 2, 
        chapter: 0,
        help: 'La mayoría de niveles requieren una combinación de dos o más funciones. Intenta agregar las funciones stackY y rejectY a tu programa.',
        initial: [['Yellow', 'Yellow', 'Red'], ['Yellow', 'Red'], ['Red'], ['Red'], ['Yellow', 'Red'], ['Yellow', 'Yellow', 'Red']],
        target: [['Red', 'Yellow'], ['Red', 'Yellow'], ['Red', 'Yellow'], ['Red', 'Yellow'], ['Red', 'Yellow'], ['Red', 'Yellow']]
    },
    '0.4': { 
        name: 'Spanish flag', 
        idealSteps: 3, 
        chapter: 0,
        help: 'Intenta esto por tu cuenta. Necesitas componer tres funciones.',
        initial: [['Yellow', 'Yellow', 'Red'], ['Yellow', 'Red'], ['Red'], ['Red'], ['Yellow', 'Red'], ['Yellow', 'Yellow', 'Red']],
        target: [['Red', 'Yellow', 'Red'], ['Red', 'Yellow', 'Red'], ['Red', 'Yellow', 'Red'], ['Red', 'Yellow', 'Red'], ['Red', 'Yellow', 'Red'], ['Red', 'Yellow', 'Red']]
    },
    
    // ========== Chapter 1 ==========
    '1.1': { 
        name: 'Mercury', 
        idealSteps: 2, 
        chapter: 1,
        help: 'Hay algunos nuevos tipos de funciones en este capítulo. Los introduciremos cuando sean necesarios.',
        initial: [['Red', 'Red'], ['Red', 'Yellow'], ['Cyan', 'Yellow'], ['Cyan', 'Cyan']],
        target: [['Red', 'Red', 'Red'], ['Red', 'Yellow', 'Red'], ['Red', 'Yellow', 'Red'], ['Red', 'Red', 'Red']]
    },
    '1.2': { 
        name: 'Venus', 
        idealSteps: 2, 
        chapter: 1,
        help: 'La función filterContainsR elimina columnas sin un cubo rojo.',
        initial: [['Red', 'Red'], ['Red', 'Yellow'], ['Cyan', 'Yellow'], ['Cyan', 'Cyan']],
        target: [['Red', 'Red'], ['Red', 'Red']]
    },
    '1.3': { 
        name: 'Earth', 
        idealSteps: 2, 
        chapter: 1,
        help: 'Puedes voltear cada columna verticalmente con mapReverse.',
        initial: [['Cyan', 'Cyan', 'Yellow'], ['Cyan', 'Red'], ['Cyan', 'Red'], ['Cyan', 'Cyan', 'Yellow']],
        target: [['Red', 'Cyan', 'Cyan'], ['Red', 'Cyan'], ['Red', 'Cyan'], ['Red', 'Cyan', 'Cyan']]
    },
    '1.4': { 
        name: 'Mars', 
        idealSteps: 3, 
        chapter: 1,
        help: 'Por si te lo preguntabas: los nombres de los niveles tienen un significado filosófico profundo... o son elegidos al azar.',
        initial: [['Red', 'Red'], ['Red', 'Yellow'], ['Cyan', 'Yellow'], ['Cyan', 'Cyan']],
        target: [['Red', 'Red'], ['Red', 'Red'], ['Red', 'Red'], ['Red', 'Red']]
    },
    
    // ========== Chapter 2 ==========
    '2.1': { 
        name: 'Bricklayer', 
        idealSteps: 2, 
        chapter: 2,
        help: 'Este capítulo introduce una nueva función stackEqualColumns. Toma columnas adyacentes iguales y las apila una sobre otra. ¡Pruébalo!',
        initial: [['Brown'], ['Orange'], ['Orange'], ['Yellow'], ['Yellow'], ['Yellow'], ['Orange'], ['Orange'], ['Brown']],
        target: [['Brown'], ['Orange', 'Orange'], ['Brown', 'Brown', 'Brown'], ['Orange', 'Orange'], ['Brown']]
    },
    '2.2': { 
        name: 'Gizeh', 
        idealSteps: 3, 
        chapter: 2,
        help: 'Ahora estás solo...',
        initial: [['Brown'], ['Orange'], ['Orange'], ['Yellow'], ['Yellow'], ['Yellow'], ['Orange'], ['Orange'], ['Brown']],
        target: [['Brown', 'Brown'], ['Orange', 'Brown', 'Orange', 'Brown'], ['Brown', 'Brown', 'Brown', 'Brown', 'Brown', 'Brown'], ['Orange', 'Brown', 'Orange', 'Brown'], ['Brown', 'Brown']]
    },
    '2.3': { 
        name: 'Poseidon', 
        idealSteps: 4, 
        chapter: 2,
        initial: [['Brown'], ['Orange'], ['Orange'], ['Yellow'], ['Yellow'], ['Yellow'], ['Orange'], ['Orange'], ['Brown']],
        target: [['Brown', 'Brown'], ['Brown'], ['Brown', 'Brown', 'Brown', 'Brown'], ['Brown'], ['Brown', 'Brown']]
    },
    '2.4': { 
        name: 'Bowl', 
        idealSteps: 4, 
        chapter: 2,
        initial: [['Brown'], ['Orange'], ['Orange'], ['Brown']],
        target: [['Orange', 'Orange', 'Orange', 'Orange'], ['Orange', 'Orange'], ['Orange', 'Orange'], ['Orange', 'Orange', 'Orange', 'Orange']]
    },
    '2.5': { 
        name: 'Stamp', 
        idealSteps: 4, 
        chapter: 2,
        initial: [['Brown'], ['Orange'], ['Orange'], ['Yellow'], ['Yellow'], ['Yellow'], ['Orange'], ['Orange'], ['Brown']],
        target: [['Yellow'], ['Yellow'], ['Yellow', 'Yellow', 'Yellow', 'Yellow'], ['Yellow'], ['Yellow']]
    },
    
    // ========== Chapter 3 ==========
    '3.1': { 
        name: 'Brick', 
        idealSteps: 2, 
        chapter: 3,
        help: 'Este capítulo introduce cubos comodín: {X}.',
        initial: [['Cyan', 'Orange'], ['Cyan', 'Cyan', 'Orange'], ['Orange', 'Orange'], ['Cyan', 'Cyan', 'Orange'], ['Cyan', 'Orange']],
        target: [['Cyan'], ['Cyan', 'Orange'], ['Cyan'], ['Cyan', 'Orange'], ['Cyan']]
    },
    '3.2': { 
        name: 'Fort', 
        idealSteps: 3, 
        chapter: 3,
        initial: [['Cyan', 'Orange'], ['Cyan', 'Cyan', 'Orange'], ['Orange', 'Orange'], ['Cyan', 'Cyan', 'Orange'], ['Cyan', 'Orange']],
        target: [['Orange', 'Cyan'], ['Orange', 'Orange'], ['Orange', 'Cyan'], ['Orange', 'Orange'], ['Orange', 'Cyan']]
    },
    '3.3': { 
        name: 'Castle', 
        idealSteps: 3, 
        chapter: 3,
        initial: [['Orange'], ['Orange', 'Orange'], ['Orange', 'Orange', 'Orange'], ['Orange', 'Orange', 'Orange', 'Orange'], ['Orange', 'Orange', 'Orange'], ['Orange', 'Orange'], ['Orange']],
        target: [['Orange', 'Orange'], ['Orange', 'Cyan'], ['Orange', 'Orange'], ['Orange', 'Cyan'], ['Orange', 'Orange'], ['Orange', 'Cyan'], ['Orange', 'Orange']]
    },
    
    // ========== Chapter 4 ==========
    '4.1': { 
        name: 'Take sides!', 
        idealSteps: 1, 
        chapter: 4,
        help: 'Este capítulo introduce la partición. La función partitionContainsR reordena las columnas para que las que no contienen un cubo rojo queden a la izquierda.',
        initial: [['Cyan', 'Red'], ['Cyan', 'Cyan'], ['Red', 'Red'], ['Cyan', 'Cyan'], ['Cyan', 'Red']],
        target: [['Cyan', 'Cyan'], ['Cyan', 'Cyan'], ['Cyan', 'Red'], ['Red', 'Red'], ['Cyan', 'Red']]
    },
    '4.2': { 
        name: 'Take sides – again!', 
        idealSteps: 2, 
        chapter: 4,
        help: 'Nota que dentro de cada partición, el orden permanece igual que antes de particionar.',
        initial: [['Cyan', 'Red'], ['Cyan', 'Cyan'], ['Red', 'Red'], ['Cyan', 'Cyan'], ['Cyan', 'Red']],
        target: [['Cyan', 'Cyan'], ['Cyan', 'Cyan'], ['Red', 'Red'], ['Cyan', 'Red'], ['Cyan', 'Red']]
    },
    '4.3': { 
        name: 'Shift', 
        idealSteps: 2, 
        chapter: 4,
        help: '¿Puedes particionar esto?',
        initial: [['Cyan', 'Red'], ['Red', 'Cyan'], ['Cyan', 'Red'], ['Red', 'Cyan'], ['Cyan', 'Red']],
        target: [['Red', 'Cyan'], ['Cyan', 'Red'], ['Red', 'Cyan'], ['Cyan', 'Red'], ['Red', 'Cyan']]
    },
    '4.4': { 
        name: 'Robot eyes', 
        idealSteps: 3, 
        chapter: 4,
        initial: [['Brown', 'Brown', 'Brown'], ['Brown', 'Yellow', 'Brown'], ['Brown', 'Brown', 'Brown'], ['Brown', 'Yellow', 'Brown'], ['Brown', 'Brown', 'Brown']],
        target: [['Brown', 'Brown', 'Brown'], ['Brown', 'Brown', 'Brown'], ['Brown', 'Brown', 'Brown'], ['Brown', 'Yellow', 'Brown'], ['Brown', 'Yellow', 'Brown']]
    },
    '4.5': { 
        name: 'Mountains', 
        idealSteps: 4, 
        chapter: 4,
        initial: [['Brown', 'Brown', 'Red', 'Red'], ['Brown', 'Brown', 'Brown', 'Cyan'], ['Brown', 'Yellow', 'Yellow', 'Yellow'], ['Brown', 'Brown', 'Brown', 'Red'], ['Brown', 'Brown', 'Cyan', 'Cyan'], ['Brown', 'Brown', 'Yellow', 'Yellow']],
        target: [['Brown', 'Cyan', 'Cyan', 'Cyan'], ['Brown', 'Brown', 'Cyan', 'Cyan'], ['Brown', 'Brown', 'Cyan', 'Cyan'], ['Brown', 'Brown', 'Brown', 'Cyan'], ['Brown', 'Brown', 'Brown', 'Cyan'], ['Brown', 'Brown', 'Cyan', 'Cyan']]
    },
    
    // ========== Chapter 5 - Binary ==========
    // Binary representation: Orange=0, Brown=1
    // 0=[O,O,O], 1=[B,O,O], 2=[O,B,O], 3=[B,B,O], 4=[O,O,B], 5=[B,O,B], 6=[O,B,B], 7=[B,B,B]
    '5.1': { 
        name: '0b0 .. 0b111', 
        idealSteps: 2, 
        chapter: 5,
        help: '¿Cuál podría ser el significado del título? Lee de arriba a abajo. Calcula módulo ocho.',
        initial: [
            ['Orange', 'Orange', 'Orange'], ['Brown', 'Orange', 'Orange'], 
            ['Orange', 'Brown', 'Orange'], ['Brown', 'Brown', 'Orange'], 
            ['Orange', 'Orange', 'Brown'], ['Brown', 'Orange', 'Brown'], 
            ['Orange', 'Brown', 'Brown'], ['Brown', 'Brown', 'Brown']
        ],
        target: [
            ['Brown', 'Orange', 'Orange'], ['Brown', 'Brown', 'Orange'], 
            ['Brown', 'Orange', 'Brown'], ['Brown', 'Brown', 'Brown'], 
            ['Brown', 'Orange', 'Orange'], ['Brown', 'Brown', 'Orange'], 
            ['Brown', 'Orange', 'Brown'], ['Brown', 'Brown', 'Brown']
        ]
    },
    '5.2': { 
        name: 'Odd..', 
        idealSteps: 2, 
        chapter: 5,
        initial: [
            ['Orange', 'Orange', 'Orange'], ['Brown', 'Orange', 'Orange'], 
            ['Orange', 'Brown', 'Orange'], ['Brown', 'Brown', 'Orange'], 
            ['Orange', 'Orange', 'Brown'], ['Brown', 'Orange', 'Brown'], 
            ['Orange', 'Brown', 'Brown'], ['Brown', 'Brown', 'Brown']
        ],
        target: [
            ['Brown', 'Orange', 'Orange'], ['Brown', 'Brown', 'Orange'], 
            ['Brown', 'Orange', 'Brown'], ['Brown', 'Brown', 'Brown']
        ]
    },
    '5.3': { 
        name: 'Zero', 
        idealSteps: 3, 
        chapter: 5,
        initial: [
            ['Orange', 'Orange', 'Orange'], ['Brown', 'Orange', 'Orange'], 
            ['Orange', 'Brown', 'Orange'], ['Brown', 'Brown', 'Orange'], 
            ['Orange', 'Orange', 'Brown'], ['Brown', 'Orange', 'Brown'], 
            ['Orange', 'Brown', 'Brown'], ['Brown', 'Brown', 'Brown']
        ],
        target: [
            ['Orange', 'Orange', 'Orange'], ['Orange', 'Orange', 'Orange'], 
            ['Orange', 'Orange', 'Orange'], ['Orange', 'Orange', 'Orange'], 
            ['Orange', 'Orange', 'Orange'], ['Orange', 'Orange', 'Orange'], 
            ['Orange', 'Orange', 'Orange'], ['Orange', 'Orange', 'Orange']
        ]
    },
    '5.4': { 
        name: "Don't panic", 
        idealSteps: 4, 
        chapter: 5,
        help: 'Este es el último nivel... por ahora. ¡Espero que hayas disfrutado el juego!',
        initial: [
            ['Orange', 'Orange', 'Orange'], ['Brown', 'Orange', 'Orange'], 
            ['Orange', 'Brown', 'Orange'], ['Brown', 'Brown', 'Orange'], 
            ['Orange', 'Orange', 'Brown'], ['Brown', 'Orange', 'Brown'], 
            ['Orange', 'Brown', 'Brown'], ['Brown', 'Brown', 'Brown']
        ],
        target: [
            ['Orange', 'Orange', 'Brown'], ['Orange', 'Brown', 'Orange'], 
            ['Orange', 'Orange', 'Brown'], ['Orange', 'Brown', 'Orange'], 
            ['Orange', 'Orange', 'Brown'], ['Orange', 'Brown', 'Orange'], 
            ['Orange', 'Orange', 'Brown'], ['Orange', 'Brown', 'Orange']
        ]
    }
};

// Singleton
const gameState = new GameState();

// Exportar para uso global
window.__GAME_STATE__ = gameState;

export default gameState;
