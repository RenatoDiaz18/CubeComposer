// index.js - Motor de Renderizado 3D para Cube Composer
// Three.js + Sistema de Temas + FFI con PureScript

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './TauriBridge.js'; // Inicializa el puente con Tauri
import gameState, { LEVEL_DATA } from './GameState.js';

// ============================================================================
// CONFIGURACIÓN DE COLORES DE CUBOS
// ============================================================================

const CUBE_COLORS = {
    Cyan:   0x00bcd4,
    Brown:  0x795548,
    Red:    0xf44336,
    Orange: 0xff9800,
    Yellow: 0xffeb3b
};

const THEME_BACKGROUNDS = {
    dark: 0x1a1a2e,
    light: 0xf0f0f0
};

// ============================================================================
// CLASE PRINCIPAL DEL MOTOR 3D
// ============================================================================

class CubeComposerEngine {
    constructor() {
        // Three.js core
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.container = null;
        
        // Gestión de cubos (object pooling para eficiencia)
        this.cubePool = [];
        this.activeCubes = [];
        this.cubeGroup = null;
        
        // Geometría y materiales compartidos (optimización)
        this.sharedGeometry = null;
        this.materials = {};
        
        // Estado
        this.currentTheme = 'dark';
        this.isAnimating = true;
        this.lastWallData = null;
        
        // Configuración de cubos
        this.cubeSize = 1;
        this.cubeGap = 0.1;
        
        this.init();
        this.setupUI();
        this.setupFFIListeners();
        this.animate();
    }

    // ========================================================================
    // INICIALIZACIÓN
    // ========================================================================

    init() {
        this.container = document.getElementById('game-canvas');
        if (!this.container) {
            console.error('[Engine] No se encontró #game-canvas');
            return;
        }

        // Escena
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(THEME_BACKGROUNDS[this.currentTheme]);

        // Cámara con vista isométrica
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
        this.camera.position.set(8, 6, 8);

        // Renderer con sombras
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // OrbitControls para navegación de cámara
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 30;
        this.controls.maxPolarAngle = Math.PI / 2.1;
        this.controls.target.set(0, 1, 0);
        this.controls.update();

        // Iluminación
        this.setupLighting();

        // Crear recursos compartidos
        this.createSharedResources();

        // Grupo para contener cubos
        this.cubeGroup = new THREE.Group();
        this.scene.add(this.cubeGroup);

        // Grid de referencia
        this.createGrid();

        // Eventos
        window.addEventListener('resize', () => this.onWindowResize());

        console.log('[Engine] Three.js inicializado con OrbitControls');
    }

    setupLighting() {
        // Luz ambiental suave
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Luz direccional principal (sol)
        const mainLight = new THREE.DirectionalLight(0xffffff, 1);
        mainLight.position.set(10, 20, 10);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 50;
        mainLight.shadow.camera.left = -10;
        mainLight.shadow.camera.right = 10;
        mainLight.shadow.camera.top = 10;
        mainLight.shadow.camera.bottom = -10;
        this.scene.add(mainLight);

        // Luz de relleno
        const fillLight = new THREE.DirectionalLight(0x88ccff, 0.3);
        fillLight.position.set(-5, 5, -5);
        this.scene.add(fillLight);

        // Luz desde abajo para suavizar sombras
        const bounceLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
        this.scene.add(bounceLight);
    }

    createSharedResources() {
        // Geometría compartida para todos los cubos
        this.sharedGeometry = new THREE.BoxGeometry(
            this.cubeSize, 
            this.cubeSize, 
            this.cubeSize
        );

        // Materiales pre-creados por color
        Object.entries(CUBE_COLORS).forEach(([name, color]) => {
            this.materials[name] = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.3,
                metalness: 0.1
            });
        });
    }

    createGrid() {
        // Plano base
        const planeGeometry = new THREE.PlaneGeometry(20, 20);
        const planeMaterial = new THREE.MeshStandardMaterial({ 
            color: this.currentTheme === 'dark' ? 0x222244 : 0xe0e0e0,
            roughness: 0.8
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.01;
        plane.receiveShadow = true;
        plane.name = 'ground';
        this.scene.add(plane);

        // Grid helper
        const gridHelper = new THREE.GridHelper(20, 20, 0x444466, 0x333344);
        gridHelper.name = 'grid';
        this.scene.add(gridHelper);
    }

    // ========================================================================
    // RENDERIZADO DE PAREDES (CORE DEL JUEGO)
    // ========================================================================

    /**
     * Dibuja una pared de cubos basada en los datos de PureScript.
     * Optimizado para actualizar solo lo necesario.
     * @param {Array} wallData - Array de stacks, cada stack es array de {color, index}
     */
    drawWall(wallData) {
        if (!wallData || !Array.isArray(wallData)) {
            console.warn('[Engine] wallData inválido');
            return;
        }

        // Comparar con datos anteriores para optimización
        const dataChanged = JSON.stringify(wallData) !== JSON.stringify(this.lastWallData);
        if (!dataChanged) {
            return; // No hay cambios, no redibujar
        }
        this.lastWallData = wallData;

        // Devolver cubos activos al pool
        this.returnCubesToPool();

        // Calcular offset para centrar la pared
        const wallWidth = wallData.length;
        const offsetX = -(wallWidth - 1) * (this.cubeSize + this.cubeGap) / 2;

        // Iterar sobre stacks (columnas)
        wallData.forEach((stack, stackIndex) => {
            if (!Array.isArray(stack)) return;

            // Iterar sobre cubos en el stack (de abajo hacia arriba)
            stack.forEach((cubeData, cubeIndex) => {
                const cube = this.getCubeFromPool(cubeData.color);
                
                // Posicionar el cubo
                const x = offsetX + stackIndex * (this.cubeSize + this.cubeGap);
                const y = (this.cubeSize / 2) + cubeIndex * (this.cubeSize + this.cubeGap);
                const z = 0;
                
                cube.position.set(x, y, z);
                cube.visible = true;
                this.activeCubes.push(cube);
            });
        });

        console.log(`[Engine] Pared renderizada: ${wallData.length} stacks, ${this.activeCubes.length} cubos`);
    }

    /**
     * Obtiene un cubo del pool o crea uno nuevo.
     */
    getCubeFromPool(colorName) {
        let cube = this.cubePool.pop();
        
        if (!cube) {
            // Crear nuevo cubo
            cube = new THREE.Mesh(this.sharedGeometry);
            cube.castShadow = true;
            cube.receiveShadow = true;
            this.cubeGroup.add(cube);
        }

        // Asignar material según color
        const material = this.materials[colorName] || this.materials['Cyan'];
        cube.material = material;
        
        return cube;
    }

    /**
     * Devuelve todos los cubos activos al pool.
     */
    returnCubesToPool() {
        this.activeCubes.forEach(cube => {
            cube.visible = false;
            this.cubePool.push(cube);
        });
        this.activeCubes = [];
    }

    /**
     * Limpia completamente la escena de cubos.
     */
    clearWall() {
        this.returnCubesToPool();
        this.lastWallData = null;
    }

    // ========================================================================
    // SISTEMA DE TEMAS
    // ========================================================================

    setTheme(theme) {
        this.currentTheme = theme;
        
        // Actualizar fondo de escena
        this.scene.background = new THREE.Color(THEME_BACKGROUNDS[theme]);
        
        // Actualizar plano base
        const ground = this.scene.getObjectByName('ground');
        if (ground) {
            ground.material.color.setHex(theme === 'dark' ? 0x222244 : 0xe0e0e0);
        }

        // Actualizar clase del body
        document.body.classList.remove('light-mode', 'dark-mode');
        document.body.classList.add(`${theme}-mode`);

        console.log(`[Engine] Tema cambiado a: ${theme}`);
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
        return newTheme;
    }

    // ========================================================================
    // UI SETUP
    // ========================================================================

    setupUI() {
        // Toggle de tema
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Reset de cámara
        const resetCamera = document.getElementById('reset-camera');
        if (resetCamera) {
            resetCamera.addEventListener('click', () => this.resetCamera());
        }

        // Selector de nivel (placeholder)
        const levelSelect = document.getElementById('level-select');
        if (levelSelect) {
            levelSelect.addEventListener('change', (e) => {
                console.log('[UI] Nivel seleccionado:', e.target.value);
                // Aquí se conectará con PureScript
            });
        }
    }

    resetCamera() {
        // Animar reset de cámara
        const targetPosition = new THREE.Vector3(8, 6, 8);
        const targetLookAt = new THREE.Vector3(0, 1, 0);
        
        this.camera.position.copy(targetPosition);
        this.controls.target.copy(targetLookAt);
        this.controls.update();
        
        console.log('[Engine] Cámara reseteada');
    }

    // ========================================================================
    // FFI - COMUNICACIÓN CON PURESCRIPT
    // ========================================================================

    setupFFIListeners() {
        // Escuchar renderizado de pared
        window.addEventListener('purs-render-wall', (event) => {
            const { wallData } = event.detail;
            this.drawWall(wallData);
        });

        // Escuchar estado del juego completo
        window.addEventListener('purs-game-state', (event) => {
            const { gameState } = event.detail;
            this.handleGameState(gameState);
        });

        // Exportar funciones para FFI directo
        window.__CUBE_ENGINE__ = {
            drawWall: (data) => this.drawWall(data),
            clearWall: () => this.clearWall(),
            setTheme: (theme) => this.setTheme(theme),
            testConnection: () => this.testConnection()
        };

        window.__THREE_ENGINE_READY__ = true;
        window.dispatchEvent(new CustomEvent('three-engine-ready'));
        
        console.log('[Engine] FFI listeners configurados');
    }

    handleGameState(gameState) {
        if (gameState.currentWall) {
            this.drawWall(gameState.currentWall);
        }
        // TODO: Renderizar targetWall en una posición separada
    }

    testConnection() {
        const status = {
            threeReady: true,
            ffiReady: window.__PURS_FFI_READY__ || false,
            activeCubes: this.activeCubes.length,
            poolSize: this.cubePool.length,
            theme: this.currentTheme
        };
        console.log('[Engine] Estado:', status);
        return status;
    }

    // ========================================================================
    // DEMO - Para probar sin PureScript
    // ========================================================================

    /**
     * Renderiza una pared de demostración.
     */
    demoWall() {
        const demoData = [
            [{ color: 'Cyan', index: 0 }, { color: 'Brown', index: 1 }],
            [{ color: 'Red', index: 0 }],
            [{ color: 'Orange', index: 0 }, { color: 'Yellow', index: 1 }, { color: 'Cyan', index: 2 }],
            [{ color: 'Brown', index: 0 }, { color: 'Red', index: 1 }],
            [{ color: 'Yellow', index: 0 }]
        ];
        this.drawWall(demoData);
        console.log('[Engine] Demo wall renderizada');
    }

    // ========================================================================
    // LOOP DE ANIMACIÓN
    // ========================================================================

    animate() {
        if (!this.isAnimating) return;
        requestAnimationFrame(() => this.animate());

        // Actualizar controles (damping)
        this.controls.update();

        // Renderizar escena
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    dispose() {
        this.isAnimating = false;
        this.renderer.dispose();
        this.sharedGeometry.dispose();
        Object.values(this.materials).forEach(m => m.dispose());
    }
}

// ============================================================================
// GESTOR DE UI Y NAVEGACIÓN
// ============================================================================

class UIManager {
    constructor(engine) {
        this.engine = engine;
        this.currentScreen = 'menu';
        this.tutorialCompleted = false;
        
        this.screens = {
            menu: document.getElementById('main-menu'),
            levelSelector: document.getElementById('level-selector'),
            settings: document.getElementById('settings-modal'),
            tutorial: document.getElementById('tutorial-modal'),
            success: document.getElementById('success-modal'),
            gameUI: document.getElementById('game-ui')
        };
        
        this.init();
    }

    init() {
        this.setupMenuListeners();
        this.setupLevelSelectorListeners();
        this.setupSettingsListeners();
        this.setupTutorialListeners();
        this.setupSuccessListeners();
        this.setupGameUIListeners();
        this.applySettings();
        
        // Escuchar cambios de estado
        gameState.on('levelCompleted', (data) => this.showSuccessModal(data));
        gameState.on('stepsChanged', (steps) => this.updateStepsDisplay(steps));
        
        console.log('[UIManager] Inicializado');
    }

    // ========================================================================
    // NAVEGACIÓN ENTRE PANTALLAS
    // ========================================================================

    showScreen(screenName) {
        // Ocultar todas las pantallas
        Object.entries(this.screens).forEach(([name, el]) => {
            if (el) {
                if (name === 'gameUI') {
                    el.classList.add('hidden');
                } else {
                    el.classList.remove('show');
                }
            }
        });

        // Mostrar la pantalla solicitada
        const screen = this.screens[screenName];
        if (screen) {
            if (screenName === 'gameUI') {
                screen.classList.remove('hidden');
            } else {
                screen.classList.add('show');
            }
        }

        this.currentScreen = screenName;
        console.log('[UIManager] Pantalla:', screenName);
    }

    // ========================================================================
    // MENÚ PRINCIPAL
    // ========================================================================

    setupMenuListeners() {
        document.getElementById('btn-play')?.addEventListener('click', () => {
            this.showLevelSelector();
        });

        document.getElementById('btn-settings')?.addEventListener('click', () => {
            this.showScreen('settings');
        });

        document.getElementById('btn-exit')?.addEventListener('click', () => {
            // En Tauri esto cerrará la app, por ahora solo mensaje
            if (confirm('¿Seguro que quieres salir?')) {
                window.close();
            }
        });
    }

    // ========================================================================
    // SELECTOR DE NIVELES
    // ========================================================================

    showLevelSelector() {
        this.populateLevelSelector();
        this.showScreen('levelSelector');
    }

    populateLevelSelector() {
        const container = document.getElementById('chapters-container');
        if (!container) return;

        // Agrupar niveles por capítulo
        const chapters = {};
        Object.entries(LEVEL_DATA).forEach(([id, data]) => {
            if (!chapters[data.chapter]) {
                chapters[data.chapter] = [];
            }
            chapters[data.chapter].push({ id, ...data });
        });

        // Generar HTML
        container.innerHTML = Object.entries(chapters).map(([chapterName, levels]) => `
            <div class="chapter-section">
                <h3 class="chapter-title">${chapterName}</h3>
                <div class="levels-grid">
                    ${levels.map(level => {
                        const progress = gameState.getLevelProgress(level.id);
                        const unlocked = gameState.isLevelUnlocked(level.id);
                        return `
                            <div class="level-card ${unlocked ? '' : 'locked'}" 
                                 data-level-id="${level.id}"
                                 ${unlocked ? '' : 'disabled'}>
                                <div class="level-number">${level.id}</div>
                                <div class="level-stars">
                                    ${[1, 2, 3].map(i => `
                                        <span class="star ${progress.stars >= i ? 'filled' : ''}">★</span>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `).join('');

        // Añadir listeners a las tarjetas de nivel
        container.querySelectorAll('.level-card:not(.locked)').forEach(card => {
            card.addEventListener('click', () => {
                const levelId = card.dataset.levelId;
                this.startLevel(levelId);
            });
        });
    }

    setupLevelSelectorListeners() {
        document.getElementById('btn-back-menu')?.addEventListener('click', () => {
            this.showScreen('menu');
        });
    }

    // ========================================================================
    // CONFIGURACIÓN
    // ========================================================================

    setupSettingsListeners() {
        const themeToggle = document.getElementById('theme-toggle-settings');
        const soundToggle = document.getElementById('sound-toggle');
        const languageSelect = document.getElementById('language-select');
        const closeBtn = document.getElementById('btn-close-settings');

        themeToggle?.addEventListener('click', () => {
            themeToggle.classList.toggle('active');
            const isDark = themeToggle.classList.contains('active');
            gameState.setTheme(isDark ? 'dark' : 'light');
            this.engine.setTheme(isDark ? 'dark' : 'light');
        });

        soundToggle?.addEventListener('click', () => {
            soundToggle.classList.toggle('active');
            gameState.setSound(soundToggle.classList.contains('active'));
        });

        languageSelect?.addEventListener('change', (e) => {
            gameState.setLanguage(e.target.value);
        });

        closeBtn?.addEventListener('click', () => {
            this.showScreen('menu');
        });
    }

    applySettings() {
        const settings = gameState.settings;
        
        // Aplicar tema
        document.body.classList.remove('light-mode', 'dark-mode');
        document.body.classList.add(`${settings.theme}-mode`);
        this.engine.setTheme(settings.theme);
        
        // Actualizar toggles
        const themeToggle = document.getElementById('theme-toggle-settings');
        if (themeToggle) {
            themeToggle.classList.toggle('active', settings.theme === 'dark');
        }
        
        const soundToggle = document.getElementById('sound-toggle');
        if (soundToggle) {
            soundToggle.classList.toggle('active', settings.sound);
        }
        
        const languageSelect = document.getElementById('language-select');
        if (languageSelect) {
            languageSelect.value = settings.language;
        }
    }

    // ========================================================================
    // TUTORIAL
    // ========================================================================

    setupTutorialListeners() {
        document.getElementById('btn-apply-tutorial')?.addEventListener('click', () => {
            this.applyTutorialFunction();
        });

        document.getElementById('btn-start-level')?.addEventListener('click', () => {
            this.showScreen('gameUI');
            this.engine.demoWall(); // Temporal - aquí iría el nivel real
        });
    }

    showTutorial(functionData) {
        const titleEl = document.getElementById('tutorial-title');
        const subtitleEl = document.getElementById('tutorial-subtitle');
        const funcNameEl = document.getElementById('tutorial-function-name');
        const descEl = document.getElementById('tutorial-description');
        const startBtn = document.getElementById('btn-start-level');

        if (titleEl) titleEl.textContent = 'Nueva Función';
        if (subtitleEl) subtitleEl.textContent = 'Aprende a usar esta transformación';
        if (funcNameEl) funcNameEl.textContent = functionData?.name || 'map {Yellow}↦{Red}';
        if (descEl) descEl.textContent = functionData?.description || 'Esta función transforma cubos.';
        if (startBtn) startBtn.disabled = true;

        this.tutorialCompleted = false;
        this.showScreen('tutorial');
    }

    applyTutorialFunction() {
        // Simular aplicación de función
        this.tutorialCompleted = true;
        const startBtn = document.getElementById('btn-start-level');
        if (startBtn) startBtn.disabled = false;
        console.log('[Tutorial] Función aplicada');
    }

    // ========================================================================
    // MODAL DE ÉXITO
    // ========================================================================

    setupSuccessListeners() {
        document.getElementById('btn-replay')?.addEventListener('click', () => {
            this.replayLevel();
        });

        document.getElementById('btn-next-level')?.addEventListener('click', () => {
            this.nextLevel();
        });
    }

    showSuccessModal({ levelId, steps, stars, idealSteps }) {
        const levelData = LEVEL_DATA[levelId] || { name: 'Nivel' };
        
        document.getElementById('success-level-name').textContent = levelData.name;
        document.getElementById('success-stats').textContent = 
            `Movimientos: ${steps} / Ideal: ${idealSteps}`;

        // Animar estrellas
        [1, 2, 3].forEach((i, index) => {
            const star = document.getElementById(`star-${i}`);
            if (star) {
                star.classList.remove('earned');
                if (stars >= i) {
                    setTimeout(() => star.classList.add('earned'), index * 200);
                }
            }
        });

        this.showScreen('success');
    }

    replayLevel() {
        gameState.resetSteps();
        this.showScreen('gameUI');
        // TODO: Reiniciar el nivel actual
    }

    nextLevel() {
        // TODO: Calcular siguiente nivel
        this.showLevelSelector();
    }

    // ========================================================================
    // UI DEL JUEGO
    // ========================================================================

    setupGameUIListeners() {
        document.getElementById('btn-back-levels')?.addEventListener('click', () => {
            this.showLevelSelector();
        });

        document.getElementById('game-theme-toggle')?.addEventListener('click', () => {
            const newTheme = this.engine.toggleTheme();
            gameState.setTheme(newTheme);
            this.applySettings();
        });

        document.getElementById('game-reset-camera')?.addEventListener('click', () => {
            this.engine.resetCamera();
        });

        document.getElementById('btn-reset-program')?.addEventListener('click', () => {
            gameState.resetSteps();
            // TODO: Limpiar programa
        });

        document.getElementById('btn-run-program')?.addEventListener('click', () => {
            // TODO: Ejecutar programa
            // Simulación de completar nivel
            this.simulateCompleteLevel();
        });
    }

    startLevel(levelId) {
        const levelData = LEVEL_DATA[levelId];
        if (!levelData) {
            console.error('[UIManager] Nivel no encontrado:', levelId);
            return;
        }

        gameState.startLevel(levelId, levelData);
        
        // Actualizar HUD
        document.getElementById('hud-level-id').textContent = levelId;
        document.getElementById('hud-level-name').textContent = levelData.name;
        document.getElementById('hud-ideal').textContent = levelData.idealSteps;
        document.getElementById('hud-steps').textContent = '0';

        // Mostrar tutorial para niveles nuevos (opcional)
        // if (!gameState.isLevelCompleted(levelId)) {
        //     this.showTutorial(levelData);
        // } else {
        this.showScreen('gameUI');
        this.engine.demoWall(); // TODO: Cargar nivel real
        // }

        console.log('[UIManager] Nivel iniciado:', levelId);
    }

    updateStepsDisplay(steps) {
        const el = document.getElementById('hud-steps');
        if (el) el.textContent = steps;
    }

    // Simulación temporal para demostración
    simulateCompleteLevel() {
        const levelId = gameState.currentLevel?.id || '0.1';
        const levelData = LEVEL_DATA[levelId] || { idealSteps: 2 };
        const steps = gameState.incrementSteps(); // Simular 1 paso
        
        // Simular varios pasos
        for (let i = 0; i < Math.floor(Math.random() * 3); i++) {
            gameState.incrementSteps();
        }
        
        const finalSteps = gameState.getCurrentSteps();
        gameState.completeLevel(levelId, finalSteps, levelData.idealSteps);
    }
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Main] Iniciando Cube Composer 3D Engine...');
    
    try {
        // Inicializar motor 3D
        window.cubeComposerEngine = new CubeComposerEngine();
        
        // Inicializar GameState (carga progreso desde Tauri o localStorage)
        try {
            await gameState.init();
        } catch (e) {
            console.warn('[Main] Error inicializando GameState, usando valores por defecto:', e);
        }
        
        // Inicializar gestor de UI
        window.uiManager = new UIManager(window.cubeComposerEngine);
        
        // Refrescar selector de niveles con datos cargados
        gameState.on('progressLoaded', () => {
            if (window.uiManager.currentScreen === 'levelSelector') {
                window.uiManager.populateLevelSelector();
            }
        });
        
        console.log('[Main] Motor y UI inicializados.');
        console.log('[Main] Entorno:', gameState.isTauri() ? 'Tauri (Nativo)' : 'Navegador');
        
    } catch (error) {
        console.error('[Main] Error crítico durante inicialización:', error);
        // Mostrar menú de todas formas
        const menu = document.getElementById('main-menu');
        if (menu) menu.classList.add('show');
    }
});

export { CubeComposerEngine, UIManager };
