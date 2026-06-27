// index.js - Motor de Renderizado 3D para Cube Composer
// Three.js + Sistema de Temas + FFI con PureScript

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './TauriBridge.js'; // Inicializa el puente con Tauri
import gameState, { LEVEL_DATA, CHAPTER_TRANSFORMERS } from './GameState.js';
import i18n from './I18n.js';

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

    /**
     * Renderiza un muro desde datos de PureScript.
     * @param {Array} pureWall - Array de stacks, cada stack es array de strings de colores
     * Ejemplo: [['Yellow', 'Red'], ['Red'], ['Yellow', 'Yellow', 'Red']]
     */
    renderWall(pureWall) {
        if (!pureWall || !Array.isArray(pureWall)) {
            console.warn('[Engine] pureWall inválido');
            this.demoWall();
            return;
        }

        // Convertir formato PureScript a formato del engine
        const wallData = pureWall.map(stack => {
            if (!Array.isArray(stack)) return [];
            return stack.map((color, index) => ({ color, index }));
        });

        this.drawWall(wallData);
        console.log(`[Engine] Muro PS renderizado: ${pureWall.length} stacks`);
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
        console.log('[UIManager] Iniciando init()...');
        console.log('[UIManager] LEVEL_DATA disponible:', LEVEL_DATA);
        console.log('[UIManager] Número de niveles:', Object.keys(LEVEL_DATA).length);
        
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
        
        // Pre-popular selector de niveles para que esté listo
        this.populateLevelSelector();
        
        console.log('[UIManager] Inicializado completamente');
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
        console.log('[UIManager] populateLevelSelector - container:', container);
        console.log('[UIManager] LEVEL_DATA:', LEVEL_DATA);
        
        if (!container) {
            console.error('[UIManager] chapters-container no encontrado');
            return;
        }

        // Agrupar niveles por capítulo
        const chapters = {};
        const levelEntries = Object.entries(LEVEL_DATA);
        console.log('[UIManager] Niveles encontrados:', levelEntries.length);
        
        levelEntries.forEach(([id, data]) => {
            const chapterNum = data.chapter ?? 0;
            if (!chapters[chapterNum]) {
                chapters[chapterNum] = [];
            }
            chapters[chapterNum].push({ id, ...data });
        });
        
        console.log('[UIManager] Capítulos agrupados:', chapters);

        // Generar HTML con traducción para "Capítulo"
        const chapterLabel = i18n.t('levels.chapter');
        
        container.innerHTML = Object.entries(chapters)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([chapterNum, levels]) => `
                <div class="chapter-section">
                    <h3 class="chapter-title">${chapterLabel} ${chapterNum}</h3>
                    <div class="levels-grid">
                        ${levels.map(level => {
                            const progress = gameState.getLevelProgress(level.id);
                            const unlocked = gameState.isLevelUnlocked(level.id);
                            return `
                                <div class="level-card ${unlocked ? '' : 'locked'}" 
                                     data-level-id="${level.id}"
                                     ${unlocked ? '' : 'disabled'}>
                                    <div class="level-number">${level.id}</div>
                                    <div class="level-name">${level.name}</div>
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
        const languageSelect = document.getElementById('language-select');
        const closeBtn = document.getElementById('btn-close-settings');

        // Binding: Toggle de tema oscuro
        themeToggle?.addEventListener('click', () => {
            themeToggle.classList.toggle('active');
            const isDark = themeToggle.classList.contains('active');
            
            // Alternar clase dark-mode en body
            document.body.classList.remove('light-mode', 'dark-mode');
            document.body.classList.add(isDark ? 'dark-mode' : 'light-mode');
            
            // Actualizar motor 3D y persistir
            gameState.setTheme(isDark ? 'dark' : 'light');
            this.engine.setTheme(isDark ? 'dark' : 'light');
        });

        // Binding: Selector de idiomas
        languageSelect?.addEventListener('change', (e) => {
            const langCode = e.target.value;
            
            // Actualizar i18n y todos los textos del DOM
            i18n.setLanguage(langCode);
            
            // Persistir preferencia
            gameState.setLanguage(langCode);
            
            // Re-popular selector de niveles si está visible
            if (this.currentScreen === 'levelSelector') {
                this.populateLevelSelector();
            }
        });

        closeBtn?.addEventListener('click', () => {
            this.showScreen('menu');
        });
    }

    applySettings() {
        const settings = gameState.settings;
        console.log('[UIManager] Aplicando configuración:', settings);
        
        // Aplicar tema
        const theme = settings.theme || 'dark';
        document.body.classList.remove('light-mode', 'dark-mode');
        document.body.classList.add(`${theme}-mode`);
        if (this.engine) {
            this.engine.setTheme(theme);
        }
        
        // Actualizar toggle de tema - sincronizar con el estado actual
        const themeToggle = document.getElementById('theme-toggle-settings');
        if (themeToggle) {
            if (theme === 'dark') {
                themeToggle.classList.add('active');
            } else {
                themeToggle.classList.remove('active');
            }
        }
        
        // Aplicar idioma
        const language = settings.language || 'es';
        const languageSelect = document.getElementById('language-select');
        if (languageSelect) {
            languageSelect.value = language;
        }
        i18n.setLanguage(language);
        
        console.log('[UIManager] Configuración aplicada - Tema:', theme, 'Idioma:', language);
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
            // Toggle de tema desde el header del juego
            const isDark = document.body.classList.contains('dark-mode');
            const newTheme = isDark ? 'light' : 'dark';
            
            document.body.classList.remove('light-mode', 'dark-mode');
            document.body.classList.add(`${newTheme}-mode`);
            
            this.engine.setTheme(newTheme);
            gameState.setTheme(newTheme);
            
            // Sincronizar toggle en settings si existe
            const settingsToggle = document.getElementById('theme-toggle-settings');
            if (settingsToggle) {
                settingsToggle.classList.toggle('active', newTheme === 'dark');
            }
        });

        document.getElementById('game-reset-camera')?.addEventListener('click', () => {
            this.engine.resetCamera();
        });

        document.getElementById('btn-reset-program')?.addEventListener('click', () => {
            this.resetProgram();
        });
    }

    startLevel(levelId) {
        const levelData = LEVEL_DATA[levelId];
        if (!levelData) {
            console.error('[UIManager] Nivel no encontrado:', levelId);
            return;
        }

        // Cambiar nivel en PureScript
        if (window.__PURE_FUNCTIONS__?.setLevel) {
            window.__PURE_FUNCTIONS__.setLevel(levelId);
        }

        gameState.startLevel(levelId, levelData);
        
        // Actualizar HUD
        document.getElementById('hud-level-id').textContent = levelId;
        document.getElementById('hud-level-name').textContent = levelData.name;
        document.getElementById('hud-ideal').textContent = levelData.idealSteps;
        document.getElementById('hud-steps').textContent = '0';

        // Cargar datos del nivel y poblar UI
        this.loadLevelUI(levelId, levelData);

        this.showScreen('gameUI');
        console.log('[UIManager] Nivel iniciado:', levelId);
    }

    // Cargar datos del nivel y poblar UI
    loadLevelUI(levelId, levelData) {
        if (!levelData) {
            console.warn('[UIManager] Datos del nivel no encontrados:', levelId);
            this.engine.demoWall();
            return;
        }

        console.log('[UIManager] Cargando nivel:', levelId, levelData);

        // Renderizar el muro inicial
        if (levelData.initial && this.engine) {
            this.engine.renderWall(levelData.initial);
        } else {
            this.engine.demoWall();
        }
        
        // Guardar target para verificación
        this.currentTarget = levelData.target;
        this.currentLevelId = levelId;
        this.currentProgram = [];

        // Renderizar el objetivo en la vista previa
        console.log('[UIManager] Renderizando objetivo:', levelData.target);
        this.renderGoalPreview(levelData.target);

        // Obtener transformadores disponibles del capítulo
        const chapterNum = levelData.chapter ?? 0;
        const transformers = CHAPTER_TRANSFORMERS[chapterNum] || [];
        console.log('[UIManager] Transformadores del capítulo', chapterNum, ':', transformers);
        this.populateAvailableFunctions(transformers);
        
        // Limpiar programa anterior
        this.updateProgramList();
    }

    // Renderizar vista previa del objetivo
    renderGoalPreview(targetWall) {
        const container = document.getElementById('goal-preview');
        console.log('[UIManager] renderGoalPreview - container:', container, 'target:', targetWall);
        
        if (!container) {
            console.error('[UIManager] Contenedor goal-preview no encontrado');
            return;
        }
        
        if (!targetWall || !Array.isArray(targetWall)) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Sin objetivo</p>';
            return;
        }

        container.innerHTML = '';
        
        // Crear contenedor flex para los stacks
        const wallDiv = document.createElement('div');
        wallDiv.style.cssText = 'display: flex; gap: 4px; justify-content: center; align-items: flex-end; height: 100%; padding: 8px;';

        // Color map
        const colorMap = {
            'Yellow': '#ffeb3b',
            'Red': '#f44336',
            'Cyan': '#00bcd4',
            'Brown': '#795548',
            'Orange': '#ff9800'
        };

        targetWall.forEach(stack => {
            const stackDiv = document.createElement('div');
            stackDiv.style.cssText = 'display: flex; flex-direction: column-reverse; gap: 2px;';
            
            if (Array.isArray(stack)) {
                stack.forEach(color => {
                    const cube = document.createElement('div');
                    cube.style.cssText = `
                        width: 16px;
                        height: 16px;
                        background: ${colorMap[color] || '#888'};
                        border-radius: 2px;
                        box-shadow: inset 1px 1px 0 rgba(255,255,255,0.3), inset -1px -1px 0 rgba(0,0,0,0.2);
                    `;
                    stackDiv.appendChild(cube);
                });
            }
            
            wallDiv.appendChild(stackDiv);
        });

        container.appendChild(wallDiv);
        console.log('[UIManager] Objetivo renderizado con', targetWall.length, 'stacks');
    }

    // Poblar la lista de funciones disponibles
    populateAvailableFunctions(transformers) {
        const container = document.getElementById('available-functions');
        if (!container) return;

        container.innerHTML = '';

        if (!transformers || transformers.length === 0) {
            container.innerHTML = '<p class="no-functions">No hay funciones disponibles</p>';
            return;
        }

        transformers.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'function-btn';
            btn.dataset.transformerId = t.id;
            btn.innerHTML = this.formatTransformerName(t.name);
            btn.onclick = () => this.addTransformerToProgram(t.id, t.name);
            container.appendChild(btn);
        });
    }

    // Formatear nombre del transformador (convierte {Color} a spans coloreados)
    formatTransformerName(name) {
        return name
            .replace(/\{Yellow\}/g, '<span class="cube-yellow">■</span>')
            .replace(/\{Red\}/g, '<span class="cube-red">■</span>')
            .replace(/\{Cyan\}/g, '<span class="cube-cyan">■</span>')
            .replace(/\{Brown\}/g, '<span class="cube-brown">■</span>')
            .replace(/\{Orange\}/g, '<span class="cube-orange">■</span>');
    }

    // Agregar transformador al programa
    addTransformerToProgram(id, name) {
        if (!this.currentProgram) this.currentProgram = [];
        
        // Cada función solo se puede usar una vez
        if (this.currentProgram.some(t => t.id === id)) {
            console.log('[UIManager] Función ya usada:', id);
            return;
        }
        
        this.currentProgram.push({ id, name });
        this.updateProgramList();
        this.runProgram();
        gameState.incrementSteps();
        
        // Deshabilitar el botón de la función usada
        this.disableFunctionButton(id);
    }

    // Remover transformador del programa
    removeTransformerFromProgram(index) {
        if (!this.currentProgram) return;
        const removed = this.currentProgram.splice(index, 1)[0];
        this.updateProgramList();
        this.runProgram();
        
        // Habilitar de nuevo el botón de la función removida
        if (removed) {
            this.enableFunctionButton(removed.id);
        }
    }
    
    // Deshabilitar botón de función
    disableFunctionButton(id) {
        const btn = document.querySelector(`.function-btn[data-transformer-id="${id}"]`);
        if (btn) {
            btn.disabled = true;
            btn.classList.add('used');
        }
    }
    
    // Habilitar botón de función
    enableFunctionButton(id) {
        const btn = document.querySelector(`.function-btn[data-transformer-id="${id}"]`);
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('used');
        }
    }
    
    // Habilitar todos los botones de función
    enableAllFunctionButtons() {
        document.querySelectorAll('.function-btn').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('used');
        });
    }

    // Actualizar lista del programa actual
    updateProgramList() {
        const container = document.getElementById('program-list');
        if (!container) return;

        container.innerHTML = '';

        if (!this.currentProgram || this.currentProgram.length === 0) {
            container.innerHTML = '<p class="no-functions" style="color: var(--text-secondary); font-size: 0.8rem;">Arrastra funciones aquí</p>';
            return;
        }

        this.currentProgram.forEach((t, index) => {
            const item = document.createElement('div');
            item.className = 'program-item';
            item.innerHTML = `
                <span>${this.formatTransformerName(t.name)}</span>
                <button class="remove-btn" title="Quitar">×</button>
            `;
            item.querySelector('.remove-btn').onclick = () => this.removeTransformerFromProgram(index);
            container.appendChild(item);
        });
    }

    // Ejecutar el programa y actualizar el muro
    runProgram() {
        const levelId = this.currentLevelId;
        const levelData = LEVEL_DATA[levelId];
        if (!levelData || !levelData.initial) return;

        // Aplicar transformadores en secuencia
        let currentWall = JSON.parse(JSON.stringify(levelData.initial)); // Clonar

        if (this.currentProgram) {
            for (const t of this.currentProgram) {
                currentWall = this.applyTransformer(currentWall, t.id);
            }
        }

        // Renderizar el resultado
        this.engine.renderWall(currentWall);

        // Verificar si es la solución
        if (this.checkWallsEqual(currentWall, levelData.target)) {
            console.log('[UIManager] ¡Nivel completado!');
            const steps = this.currentProgram?.length || 0;
            setTimeout(() => {
                gameState.completeLevel(levelId, steps, levelData.idealSteps);
            }, 500);
        }
    }

    // Aplicar un transformador a un muro
    applyTransformer(wall, transformerId) {
        // Transformadores que operan sobre todo el muro (no por stack)
        switch (transformerId) {
            case 'filterContainsR':
                return wall.filter(stack => stack.includes('Red'));
            case 'filterEven':
                return wall.filter(stack => this.stackToInt(stack) % 2 === 0);
            case 'stackEqualColumns':
                return this.stackEqualColumns(wall);
            case 'partitionContainsC':
                return this.partitionContains(wall, 'Cyan');
            case 'partitionContainsR':
                return this.partitionContains(wall, 'Red');
        }
        
        // Transformadores que operan por stack
        const newWall = wall.map(stack => {
            switch (transformerId) {
                // === Chapter 0: Reemplazos simples ===
                case 'replaceYbyR':
                    return stack.map(c => c === 'Yellow' ? 'Red' : c);
                
                // === Chapter 1 ===
                case 'mapYtoYR':
                    return stack.flatMap(c => c === 'Yellow' ? ['Yellow', 'Red'] : [c]);
                case 'mapCtoRC':
                    return stack.flatMap(c => c === 'Cyan' ? ['Red', 'Cyan'] : [c]);
                case 'mapReverse':
                    return [...stack].reverse();
                
                // === Chapter 2 ===
                case 'replaceYbyB':
                    return stack.map(c => c === 'Yellow' ? 'Brown' : c);
                case 'replaceYbyBY':
                    return stack.flatMap(c => c === 'Yellow' ? ['Brown', 'Yellow'] : [c]);
                case 'replaceBbyOO':
                    return stack.flatMap(c => c === 'Brown' ? ['Orange', 'Orange'] : [c]);
                
                // === Chapter 3: Wildcards ===
                case 'mapXtoOX':
                    return stack.flatMap(c => ['Orange', c]);
                case 'mapCXtoX':
                    return this.mapCXtoX(stack);
                case 'mapOOtoC':
                    return this.mapOOtoC(stack);
                case 'mapCtoO':
                    return stack.map(c => c === 'Cyan' ? 'Orange' : c);
                
                // === Chapter 4 ===
                case 'replaceRbyC':
                    return stack.map(c => c === 'Red' ? 'Cyan' : c);
                case 'replaceCbyY':
                    return stack.map(c => c === 'Cyan' ? 'Yellow' : c);
                
                // === Chapter 5: Binary arithmetic ===
                case 'mapAdd1':
                    return this.intToStack((this.stackToInt(stack) + 1) % 8);
                case 'mapSub1':
                    return this.intToStack((this.stackToInt(stack) - 1 + 8) % 8);
                case 'mapMul2':
                    return this.intToStack((this.stackToInt(stack) * 2) % 8);
                case 'mapPow2':
                    return this.intToStack((this.stackToInt(stack) ** 2) % 8);
                
                // === Reemplazos múltiples originales ===
                case 'replaceYbyYR':
                    return stack.flatMap(c => c === 'Yellow' ? ['Yellow', 'Red'] : [c]);
                
                // === Stacks (agregar cubo arriba) ===
                case 'stackY':
                    return [...stack, 'Yellow'];
                case 'stackO':
                    return [...stack, 'Orange'];
                case 'stackR':
                    return [...stack, 'Red'];
                case 'stackC':
                    return [...stack, 'Cyan'];
                case 'stackB':
                    return [...stack, 'Brown'];
                
                // === Rechazos (filtrar color) ===
                case 'rejectY':
                    return stack.filter(c => c !== 'Yellow');
                case 'rejectO':
                    return stack.filter(c => c !== 'Orange');
                case 'rejectR':
                    return stack.filter(c => c !== 'Red');
                case 'rejectC':
                    return stack.filter(c => c !== 'Cyan');
                case 'rejectB':
                    return stack.filter(c => c !== 'Brown');
                
                default:
                    console.warn('[UIManager] Transformador desconocido:', transformerId);
                    return stack;
            }
        });
        return newWall;
    }
    
    // Helper: Chapter 3 - map [{X}{Cyan}]↦{X} (remover Cyan después de cualquier color)
    mapCXtoX(stack) {
        const result = [];
        for (let i = 0; i < stack.length; i++) {
            if (stack[i] === 'Cyan' && i > 0) {
                // Skip Cyan that comes after another color
                continue;
            }
            if (i < stack.length - 1 && stack[i + 1] === 'Cyan') {
                result.push(stack[i]);
                i++; // Skip next Cyan
            } else {
                result.push(stack[i]);
            }
        }
        return result;
    }
    
    // Helper: Chapter 3 - map [{Orange}{Orange}]↦{Cyan}
    mapOOtoC(stack) {
        const result = [];
        for (let i = 0; i < stack.length; i++) {
            if (stack[i] === 'Orange' && stack[i + 1] === 'Orange') {
                result.push('Cyan');
                i++; // Skip next Orange
            } else {
                result.push(stack[i]);
            }
        }
        return result;
    }
    
    // Helper: Chapter 2 - stackEqualColumns (apila columnas adyacentes iguales)
    stackEqualColumns(wall) {
        if (wall.length === 0) return wall;
        const result = [];
        let current = [...wall[0]];
        
        for (let i = 1; i < wall.length; i++) {
            if (this.arraysEqual(wall[i], wall[i - 1])) {
                // Columnas iguales: apilar
                current = [...current, ...wall[i]];
            } else {
                result.push(current);
                current = [...wall[i]];
            }
        }
        result.push(current);
        return result;
    }
    
    // Helper: Chapter 4 - partition (contains color)
    partitionContains(wall, color) {
        const withColor = wall.filter(stack => stack.includes(color));
        const withoutColor = wall.filter(stack => !stack.includes(color));
        return [...withoutColor, ...withColor];
    }
    
    // Helper: Chapter 5 - Binary conversion (Orange=0, Brown=1)
    stackToInt(stack) {
        let value = 0;
        if (stack[0] === 'Brown') value += 1;
        if (stack[1] === 'Brown') value += 2;
        if (stack[2] === 'Brown') value += 4;
        return value;
    }
    
    intToStack(n) {
        return [
            (n & 1) ? 'Brown' : 'Orange',
            (n & 2) ? 'Brown' : 'Orange',
            (n & 4) ? 'Brown' : 'Orange'
        ];
    }
    
    arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    // Comparar dos muros
    checkWallsEqual(wall1, wall2) {
        if (!wall1 || !wall2) return false;
        if (wall1.length !== wall2.length) return false;
        
        for (let i = 0; i < wall1.length; i++) {
            if (wall1[i].length !== wall2[i].length) return false;
            for (let j = 0; j < wall1[i].length; j++) {
                if (wall1[i][j] !== wall2[i][j]) return false;
            }
        }
        return true;
    }

    // Resetear el programa del nivel actual
    resetProgram() {
        this.currentProgram = [];
        gameState.resetSteps();
        this.updateProgramList();
        
        // Habilitar todos los botones de función
        this.enableAllFunctionButtons();
        
        // Volver a renderizar el muro inicial
        const levelData = LEVEL_DATA[this.currentLevelId];
        if (levelData?.initial) {
            this.engine.renderWall(levelData.initial);
        }
        
        console.log('[UIManager] Programa reseteado');
    }

    updateStepsDisplay(steps) {
        const el = document.getElementById('hud-steps');
        if (el) el.textContent = steps;
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
