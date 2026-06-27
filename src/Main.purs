-- | Main.purs - Módulo principal refactorizado para arquitectura FFI
-- | La UI se maneja externamente via index.js y Three.js
-- | Este módulo expone funciones de estado al entorno JavaScript

module Main 
  ( App
  , main
  , resetLevel
  , nextLevel
  , prevLevel
  , setLevel
  , getGameState
  , applyTransformers
  , getCurrentProgram
  , addTransformer
  , removeTransformer
  , checkSolution
  , getLevelData
  , getAvailableTransformers
  ) where

import Prelude
import Control.Monad.Eff (Eff)
import Control.Monad.Eff.Console (CONSOLE, log)
import Data.Array as A
import Data.Foldable (foldl)
import Data.List (List(..), fromFoldable, filter, snoc, dropWhile, tail, head, (:), last, mapMaybe)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.StrMap as SM
import Data.Tuple (Tuple(..))

import Levels (firstLevel, getLevel, getChapter, allLevelIds, getTransformer, getTransformerRecord)
import Storage (STORAGE, saveGameState, loadGameState)
import Transformer (allSteps)
import Types (GameState, LevelId, TransformerId, Wall)

-- ============================================================================
-- TIPOS
-- ============================================================================
-- | Tipo principal de la aplicación
type App = forall eff. Eff (console :: CONSOLE, storage :: STORAGE | eff) Unit

-- | Estado inicial del juego para visitantes nuevos
initialGS :: GameState
initialGS = { currentLevel: firstLevel, levelState: SM.empty }

-- ============================================================================
-- FFI - IMPORTS DE JAVASCRIPT
-- ============================================================================
-- | Notifica a JavaScript que el estado del juego ha cambiado
foreign import notifyGameStateChanged :: forall eff. GameState -> Eff eff Unit
-- | Notifica a JavaScript el resultado de aplicar transformadores
foreign import notifyWallUpdate :: forall eff. 
  { steps :: Array (Array (Array String))
  , solved :: Boolean 
  , targetWall :: Array (Array String)
  } -> Eff eff Unit
-- | Registra las funciones de PureScript en el objeto global window
foreign import registerPureFunctions :: forall eff a b.
  { resetLevel :: Eff eff Unit
  , nextLevel :: Eff eff Unit
  , prevLevel :: Eff eff Unit
  , setLevel :: String -> Eff eff Unit
  , addTransformer :: String -> Eff eff Unit
  , removeTransformer :: String -> Eff eff Unit
  , checkSolution :: Eff eff Boolean
  , getLevelData :: Eff eff a
  , getAvailableTransformers :: Eff eff b
  } -> Eff eff Unit

-- ============================================================================
-- UTILIDADES DE ESTADO
-- ============================================================================
-- | Obtener el programa actual (lista de IDs de transformadores) del nivel activo
getCurrentIds :: GameState -> List TransformerId
getCurrentIds gs = case SM.lookup gs.currentLevel gs.levelState of
  Just ids -> ids
  Nothing -> Nil

-- | Modificar y guardar el estado del juego
modifyAndSave :: (GameState -> GameState) -> App
modifyAndSave modifyGS = do
  mgs <- loadGameState
  let gs = fromMaybe initialGS mgs
      gs' = modifyGS gs
  saveGameState gs'
  notifyGameStateChanged gs'

-- | Convertir Wall (List de List de Cube) a Array serializable para JS
wallToArray :: Wall -> Array (Array String)
wallToArray wall = A.fromFoldable $ map stackToArray wall
  where
    stackToArray stack = A.fromFoldable $ map show stack

-- ============================================================================
-- API PÚBLICA - Funciones expuestas a JavaScript
-- ============================================================================
-- | Obtener el estado actual del juego
getGameState :: forall eff. Eff (storage :: STORAGE | eff) GameState
getGameState = do
  mgs <- loadGameState
  pure $ fromMaybe initialGS mgs

-- | Limpiar el programa del nivel actual
resetLevel :: App
resetLevel = modifyAndSave $ \gs ->
  gs { levelState = SM.insert gs.currentLevel Nil gs.levelState }

-- | Ir al nivel anterior
prevLevel :: App
prevLevel = modifyAndSave $ \gs ->
  gs { currentLevel = prev gs.currentLevel }
  where
    prev cur = fromMaybe cur $ before cur allLevelIds
    before _ Nil = Nothing
    before _ (Cons _ Nil) = Nothing
    before x (Cons b (Cons x' xs)) = 
      if x == x' then Just b else before x (x' : xs)

-- | Ir al siguiente nivel
nextLevel :: App
nextLevel = modifyAndSave $ \gs ->
  gs { currentLevel = next gs.currentLevel }
  where
    next cur = fromMaybe cur $ head =<< (tail $ dropWhile (_ /= cur) allLevelIds)

-- | Ir a un nivel específico
setLevel :: LevelId -> App
setLevel levelId = modifyAndSave $ \gs ->
  gs { currentLevel = levelId }

-- | Obtener el programa actual del nivel
getCurrentProgram :: forall eff. Eff (storage :: STORAGE | eff) (Array TransformerId)
getCurrentProgram = do
  gs <- getGameState
  pure $ A.fromFoldable $ getCurrentIds gs

-- | Agregar un transformador al programa actual
addTransformer :: TransformerId -> App
addTransformer tid = modifyAndSave $ \gs ->
  let program = getCurrentIds gs
      program' = program `snoc` tid
  in gs { levelState = SM.insert gs.currentLevel program' gs.levelState }

-- | Eliminar un transformador del programa actual
removeTransformer :: TransformerId -> App
removeTransformer tid = modifyAndSave $ \gs ->
  let program = getCurrentIds gs
      program' = filter (_ /= tid) program
  in gs { levelState = SM.insert gs.currentLevel program' gs.levelState }

-- | Aplicar los transformadores y obtener los pasos intermedios
applyTransformers :: forall eff. Eff (storage :: STORAGE | eff) 
  { steps :: Array (Array (Array String))
  , solved :: Boolean
  , currentLevel :: LevelId
  }
applyTransformers = do
  gs <- getGameState
  let level = getLevel gs.currentLevel
      chapter = getChapter gs.currentLevel
      tids = getCurrentIds gs
      transformers = mapMaybe (getTransformer chapter) tids
      steps = allSteps transformers level.initial
      solved = case last steps of
        Just finalWall -> finalWall == level.target
        Nothing -> false
      stepsArray = A.fromFoldable $ map wallToArray steps
  pure { steps: stepsArray, solved, currentLevel: gs.currentLevel }

-- | Verificar si la solución actual es correcta
checkSolution :: forall eff. Eff (storage :: STORAGE | eff) Boolean
checkSolution = do
  result <- applyTransformers
  pure result.solved

-- | Obtener datos completos del nivel actual
getLevelData :: forall eff. Eff (storage :: STORAGE | eff) 
  { levelId :: LevelId
  , name :: String
  , help :: String
  , difficulty :: String
  , initial :: Array (Array String)
  , target :: Array (Array String)
  }
getLevelData = do
  gs <- getGameState
  let level = getLevel gs.currentLevel
      helpText = fromMaybe "" level.help
  pure 
    { levelId: gs.currentLevel
    , name: level.name
    , help: helpText
    , difficulty: show level.difficulty
    , initial: wallToArray level.initial
    , target: wallToArray level.target
    }

-- | Obtener transformadores disponibles para el nivel actual
getAvailableTransformers :: forall eff. Eff (storage :: STORAGE | eff) 
  (Array { id :: TransformerId, name :: String })
getAvailableTransformers = do
  gs <- getGameState
  let chapter = getChapter gs.currentLevel
      transformerIds = A.fromFoldable $ SM.keys chapter.transformers
      transformersWithNames = A.mapMaybe (getTransformerWithName chapter) transformerIds
  pure transformersWithNames
  where
    getTransformerWithName ch tid = do
      record <- getTransformerRecord ch tid
      pure { id: tid, name: record.name }

-- ============================================================================
-- PUNTO DE ENTRADA PRINCIPAL
-- ============================================================================
main :: App
main = do
  log "[PureScript] Inicializando Cube Composer..."
  
  -- Cargar estado guardado o usar el inicial
  mgs <- loadGameState
  let gs = fromMaybe initialGS mgs
  
  -- Guardar estado (por si es la primera vez)
  saveGameState gs
  
  -- Registrar funciones en window para que JS pueda llamarlas
  registerPureFunctions
    { resetLevel
    , nextLevel
    , prevLevel
    , setLevel
    , addTransformer
    , removeTransformer
    , checkSolution
    , getLevelData
    , getAvailableTransformers
    }
  
  -- Notificar a JS que el estado está listo
  notifyGameStateChanged gs
  
  log "[PureScript] Inicialización completa. Funciones expuestas en window.__PURE_FUNCTIONS__"
