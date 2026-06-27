module Game where

import Prelude

import Data.Array (filter, find, length)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff, launchAff_)
import Effect.Class (liftEffect)
import Effect.Console (log)
import Levels.Registry (LevelData, LevelProgress, GameProgress, allLevels, calculateStars, isLevelUnlocked, getLevelById)

-- ============================================================================
-- FFI - Importaciones de JavaScript
-- ============================================================================

foreign import loadGameImpl :: Effect (Aff String)
foreign import saveGameImpl :: String -> Effect (Aff Boolean)
foreign import resetGameImpl :: Effect (Aff Boolean)
foreign import isTauriImpl :: Boolean
foreign import emitEventImpl :: String -> String -> Effect Unit

-- ============================================================================
-- TIPOS DE ESTADO DEL JUEGO
-- ============================================================================

type GameState =
  { progress :: GameProgress
  , currentLevel :: Maybe LevelData
  , currentSteps :: Int
  , isPlaying :: Boolean
  , menuState :: MenuState
  }

data MenuState
  = MainMenu
  | LevelSelector
  | Playing
  | Settings
  | Tutorial
  | Success

derive instance eqMenuState :: Eq MenuState

-- ============================================================================
-- ESTADO INICIAL
-- ============================================================================

initialGameState :: GameState
initialGameState =
  { progress: emptyProgress
  , currentLevel: Nothing
  , currentSteps: 0
  , isPlaying: false
  , menuState: MainMenu
  }

emptyProgress :: GameProgress
emptyProgress =
  { version: 1
  , levels: []
  , totalStars: 0
  , completedLevels: 0
  }

-- ============================================================================
-- FUNCIONES DE PERSISTENCIA
-- ============================================================================

-- | Cargar progreso del juego (desde Tauri o localStorage)
loadGameProgress :: Aff GameProgress
loadGameProgress = do
  liftEffect $ log "[Game] Cargando progreso..."
  jsonAff <- liftEffect loadGameImpl
  jsonStr <- jsonAff
  case parseProgress jsonStr of
    Just progress -> do
      liftEffect $ log "[Game] Progreso cargado"
      pure progress
    Nothing -> do
      liftEffect $ log "[Game] No se pudo parsear, usando progreso vacío"
      pure emptyProgress

-- | Guardar progreso del juego
saveGameProgress :: GameProgress -> Aff Boolean
saveGameProgress progress = do
  liftEffect $ log "[Game] Guardando progreso..."
  let jsonStr = stringifyProgress progress
  saveAff <- liftEffect $ saveGameImpl jsonStr
  result <- saveAff
  liftEffect $ log "[Game] Guardado completado"
  pure result

-- | Resetear todo el progreso
resetProgress :: Aff Boolean
resetProgress = do
  liftEffect $ log "[Game] Reseteando progreso..."
  resetAff <- liftEffect resetGameImpl
  resetAff

-- ============================================================================
-- LÓGICA DE NIVELES
-- ============================================================================

-- | Obtener todos los niveles con su estado de bloqueo
getLevelsWithStatus :: GameProgress -> Array { level :: LevelData, unlocked :: Boolean, progress :: Maybe LevelProgress }
getLevelsWithStatus gameProgress = map addStatus allLevels
  where
    addStatus level =
      { level
      , unlocked: isLevelUnlocked level.id gameProgress.levels
      , progress: findProgress level.id
      }
    
    findProgress levelId = 
      case find (\lp -> lp.id == levelId) gameProgress.levels of
        Just lp -> Just lp.progress
        Nothing -> Nothing

-- | Obtener niveles agrupados por capítulo
getLevelsByChapter :: GameProgress -> Array { chapter :: String, levels :: Array { level :: LevelData, unlocked :: Boolean, progress :: Maybe LevelProgress } }
getLevelsByChapter gameProgress = 
  [ { chapter: "Introduction", levels: filterByChapter 0 }
  , { chapter: "Basics", levels: filterByChapter 1 }
  , { chapter: "Advanced", levels: filterByChapter 2 }
  ]
  where
    allWithStatus = getLevelsWithStatus gameProgress
    filterByChapter c = filter (\l -> l.level.chapter == c) allWithStatus

-- | Completar un nivel y actualizar progreso
completeLevel :: String -> Int -> GameProgress -> GameProgress
completeLevel levelId steps oldProgress = 
  case getLevelById levelId of
    Nothing -> oldProgress
    Just levelData ->
      let
        newStars = calculateStars steps levelData.idealSteps
        existingProgress = find (\lp -> lp.id == levelId) oldProgress.levels
        
        newLevelProgress = case existingProgress of
          Nothing ->
            { id: levelId
            , progress: { completed: true, stars: newStars, bestSteps: steps }
            }
          Just existing ->
            { id: levelId
            , progress: 
                { completed: true
                , stars: max newStars existing.progress.stars
                , bestSteps: min steps existing.progress.bestSteps
                }
            }
        
        -- Actualizar o añadir el progreso del nivel
        updatedLevels = case existingProgress of
          Nothing -> oldProgress.levels <> [newLevelProgress]
          Just _ -> map (\lp -> if lp.id == levelId then newLevelProgress else lp) oldProgress.levels
        
        -- Recalcular totales
        totalStars = sumStars updatedLevels
        completedCount = length $ filter (\lp -> lp.progress.completed) updatedLevels
      in
        { version: oldProgress.version
        , levels: updatedLevels
        , totalStars
        , completedLevels: completedCount
        }
  where
    sumStars [] = 0
    sumStars (l : rest) = l.progress.stars + sumStars rest

-- | Verificar si un nivel está completado
isLevelCompleted :: String -> GameProgress -> Boolean
isLevelCompleted levelId progress =
  case find (\lp -> lp.id == levelId) progress.levels of
    Just lp -> lp.progress.completed
    Nothing -> false

-- | Obtener siguiente nivel desbloqueado
getNextLevel :: String -> GameProgress -> Maybe LevelData
getNextLevel currentId progress =
  let
    levelOrder = ["0.1", "0.2", "0.3", "0.4", "1.1", "1.2", "1.3", "1.4", "2.1", "2.2", "2.3", "2.4"]
    findNext [] = Nothing
    findNext [_] = Nothing
    findNext (a : b : rest)
      | a == currentId = 
          if isLevelUnlocked b progress.levels
            then getLevelById b
            else Nothing
      | otherwise = findNext (b : rest)
  in
    findNext levelOrder

-- ============================================================================
-- SERIALIZACIÓN JSON (Simple)
-- ============================================================================

foreign import parseProgressImpl :: String -> Maybe GameProgress
foreign import stringifyProgressImpl :: GameProgress -> String

parseProgress :: String -> Maybe GameProgress
parseProgress = parseProgressImpl

stringifyProgress :: GameProgress -> String
stringifyProgress = stringifyProgressImpl

-- ============================================================================
-- INICIALIZACIÓN DEL JUEGO
-- ============================================================================

-- | Inicializar el juego cargando el progreso y configurando la UI
initGame :: Effect Unit
initGame = launchAff_ do
  -- Cargar progreso guardado
  progress <- loadGameProgress
  
  -- Emitir evento para que JavaScript actualice la UI
  liftEffect $ emitEventImpl "gameLoaded" (stringifyProgress progress)
  
  liftEffect $ log "[Game] Juego inicializado"

-- | Manejar completación de nivel desde JavaScript
handleLevelComplete :: String -> Int -> Effect Unit
handleLevelComplete levelId steps = launchAff_ do
  -- Cargar progreso actual
  currentProgress <- loadGameProgress
  
  -- Actualizar con el nivel completado
  let newProgress = completeLevel levelId steps currentProgress
  
  -- Guardar
  _ <- saveGameProgress newProgress
  
  -- Emitir evento con el nuevo estado
  liftEffect $ emitEventImpl "progressUpdated" (stringifyProgress newProgress)
  
  liftEffect $ log $ "[Game] Nivel " <> levelId <> " completado"

-- ============================================================================
-- EXPORTACIONES PARA FFI
-- ============================================================================

-- Estas funciones serán llamadas desde JavaScript
foreign import registerHandlersImpl :: (String -> Int -> Effect Unit) -> Effect Unit

registerGameHandlers :: Effect Unit
registerGameHandlers = registerHandlersImpl handleLevelComplete
