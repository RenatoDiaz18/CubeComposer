// I18n.js - Sistema de internacionalización
// Sincronizado con I18n.purs

// ============================================================================
// TRADUCCIONES
// ============================================================================

const translations = {
    es: {
        // App
        'app.title': 'Cube Composer',
        'app.subtitle': 'Un juego de puzzles inspirado en programación funcional',
        
        // Menú principal
        'menu.play': '▶ Jugar',
        'menu.settings': '⚙ Configuración',
        'menu.exit': '✕ Salir',
        
        // Selector de niveles
        'levels.title': 'Seleccionar Nivel',
        'levels.subtitle': 'Completa niveles para desbloquear nuevos desafíos',
        'levels.back': '← Volver al Menú',
        'levels.chapter': 'Capítulo',
        
        // Configuración
        'settings.title': 'Configuración',
        'settings.language': 'Idioma',
        'settings.darkTheme': 'Tema Oscuro',
        'settings.save': 'Guardar y Cerrar',
        
        // Tutorial
        'tutorial.title': 'Nueva Función',
        'tutorial.subtitle': 'Aprende a usar esta transformación',
        'tutorial.description': 'Esta función transforma los cubos. Pruébala en el ejemplo.',
        'tutorial.apply': 'Aplicar Función',
        'tutorial.start': 'Comenzar Nivel',
        
        // Éxito
        'success.title': '¡Nivel Completado!',
        'success.retry': '↺ Reintentar',
        'success.next': 'Siguiente →',
        'success.moves': 'Movimientos',
        'success.ideal': 'Ideal',
        
        // Juego
        'game.backLevels': '← Niveles',
        'game.toggleTheme': 'Cambiar tema',
        'game.resetCamera': 'Reset Cámara',
        'game.level': 'Nivel',
        'game.moves': 'Movimientos',
        'game.ideal': 'Ideal',
        'game.goal': 'Objetivo',
        'game.availableFunctions': 'Funciones Disponibles',
        'game.yourProgram': 'Tu Programa',
        'game.reset': '↺ Reset',
        'game.run': '▶ Ejecutar',
        'game.engineActive': 'Motor 3D activo'
    },
    
    en: {
        // App
        'app.title': 'Cube Composer',
        'app.subtitle': 'A puzzle game inspired by functional programming',
        
        // Main menu
        'menu.play': '▶ Play',
        'menu.settings': '⚙ Settings',
        'menu.exit': '✕ Exit',
        
        // Level selector
        'levels.title': 'Select Level',
        'levels.subtitle': 'Complete levels to unlock new challenges',
        'levels.back': '← Back to Menu',
        'levels.chapter': 'Chapter',
        
        // Settings
        'settings.title': 'Settings',
        'settings.language': 'Language',
        'settings.darkTheme': 'Dark Theme',
        'settings.save': 'Save and Close',
        
        // Tutorial
        'tutorial.title': 'New Function',
        'tutorial.subtitle': 'Learn to use this transformation',
        'tutorial.description': 'This function transforms cubes. Try it in the example.',
        'tutorial.apply': 'Apply Function',
        'tutorial.start': 'Start Level',
        
        // Success
        'success.title': 'Level Complete!',
        'success.retry': '↺ Retry',
        'success.next': 'Next →',
        'success.moves': 'Moves',
        'success.ideal': 'Ideal',
        
        // Game
        'game.backLevels': '← Levels',
        'game.toggleTheme': 'Toggle theme',
        'game.resetCamera': 'Reset Camera',
        'game.level': 'Level',
        'game.moves': 'Moves',
        'game.ideal': 'Ideal',
        'game.goal': 'Goal',
        'game.availableFunctions': 'Available Functions',
        'game.yourProgram': 'Your Program',
        'game.reset': '↺ Reset',
        'game.run': '▶ Run',
        'game.engineActive': '3D Engine active'
    }
};

// ============================================================================
// CLASE I18N
// ============================================================================

class I18n {
    constructor() {
        this.currentLanguage = 'es';
        this.listeners = new Set();
    }

    /**
     * Obtener traducción por clave
     */
    t(key) {
        const langTranslations = translations[this.currentLanguage] || translations.es;
        return langTranslations[key] || key;
    }

    /**
     * Cambiar idioma y actualizar toda la UI
     */
    setLanguage(langCode) {
        console.log(`[I18n] setLanguage llamado con: ${langCode}, actual: ${this.currentLanguage}`);
        
        // Permitir forzar actualización incluso si es el mismo idioma (para carga inicial)
        if (!translations[langCode]) {
            console.warn(`[I18n] Idioma '${langCode}' no soportado, usando 'es'`);
            langCode = 'es';
        }
        
        const wasChanged = langCode !== this.currentLanguage;
        this.currentLanguage = langCode;
        this.updateAllTexts();
        
        if (wasChanged) {
            this.notifyListeners();
        }
        
        console.log(`[I18n] Idioma establecido: ${langCode}, textos actualizados`);
    }

    /**
     * Obtener idioma actual
     */
    getLanguage() {
        return this.currentLanguage;
    }

    /**
     * Actualizar todos los textos con data-i18n en el DOM
     */
    updateAllTexts() {
        // Actualizar contenido de texto
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const text = this.t(key);
            el.textContent = text;
        });

        // Actualizar atributos title
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const text = this.t(key);
            el.setAttribute('title', text);
        });

        // Actualizar placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const text = this.t(key);
            el.setAttribute('placeholder', text);
        });
    }

    /**
     * Registrar listener para cambios de idioma
     */
    onLanguageChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Notificar a todos los listeners
     */
    notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentLanguage));
    }

    /**
     * Obtener todas las traducciones del idioma actual
     */
    getAllTranslations() {
        return translations[this.currentLanguage] || translations.es;
    }
}

// Singleton
const i18n = new I18n();

// Exportar para uso global
window.__I18N__ = i18n;

export default i18n;
export { translations };
