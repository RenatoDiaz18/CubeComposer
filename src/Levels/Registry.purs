module Levels.Registry where

import Prelude

import Data.Array (concat)
import Data.Maybe (Maybe(..))
import Types (Cube(..), Stack, Wall, Transformer)

-- | Datos completos de un nivel
type LevelData =
  { id :: String
  , name :: String
  , chapter :: Int
  , difficulty :: Int
  , initialWall :: Wall
  , targetWall :: Wall
  , idealSteps :: Int
  , availableTransformers :: Array String
  , hint :: Maybe String
  }

-- | Progreso de un nivel guardado
type LevelProgress =
  { completed :: Boolean
  , stars :: Int
  , bestSteps :: Int
  }

-- | Estado del juego completo
type GameProgress =
  { version :: Int
  , levels :: Array { id :: String, progress :: LevelProgress }
  , totalStars :: Int
  , completedLevels :: Int
  }

-- ============================================================================
-- NIVELES DEL CAPÍTULO 0: INTRODUCCIÓN
-- ============================================================================

chapter0Levels :: Array LevelData
chapter0Levels =
  [ { id: "0.1"
    , name: "Transformation"
    , chapter: 0
    , difficulty: 1
    , initialWall: [[Yellow], [Yellow]]
    , targetWall: [[Red], [Red]]
    , idealSteps: 1
    , availableTransformers: ["mapYellowToRed"]
    , hint: Just "Usa map para cambiar todos los cubos amarillos a rojos"
    }
  , { id: "0.2"
    , name: "Stack It"
    , chapter: 0
    , difficulty: 1
    , initialWall: [[Yellow], [Cyan]]
    , targetWall: [[Yellow, Cyan]]
    , idealSteps: 1
    , availableTransformers: ["stackAll"]
    , hint: Just "Usa stack para apilar todas las columnas"
    }
  , { id: "0.3"
    , name: "Filter Basics"
    , chapter: 0
    , difficulty: 1
    , initialWall: [[Yellow], [Cyan], [Yellow]]
    , targetWall: [[Yellow], [Yellow]]
    , idealSteps: 1
    , availableTransformers: ["rejectCyan"]
    , hint: Just "Elimina los cubos cyan con reject"
    }
  , { id: "0.4"
    , name: "Combine"
    , chapter: 0
    , difficulty: 2
    , initialWall: [[Yellow], [Cyan], [Yellow]]
    , targetWall: [[Red], [Red]]
    , idealSteps: 2
    , availableTransformers: ["rejectCyan", "mapYellowToRed"]
    , hint: Just "Primero filtra, luego transforma"
    }
  ]

-- ============================================================================
-- NIVELES DEL CAPÍTULO 1: BÁSICOS
-- ============================================================================

chapter1Levels :: Array LevelData
chapter1Levels =
  [ { id: "1.1"
    , name: "Double Stack"
    , chapter: 1
    , difficulty: 2
    , initialWall: [[Yellow], [Cyan], [Red], [Orange]]
    , targetWall: [[Yellow, Cyan], [Red, Orange]]
    , idealSteps: 1
    , availableTransformers: ["stackPairs"]
    , hint: Nothing
    }
  , { id: "1.2"
    , name: "Color Sort"
    , chapter: 1
    , difficulty: 2
    , initialWall: [[Cyan], [Yellow], [Cyan], [Yellow]]
    , targetWall: [[Yellow], [Yellow], [Cyan], [Cyan]]
    , idealSteps: 2
    , availableTransformers: ["sortByColor", "groupByColor"]
    , hint: Nothing
    }
  , { id: "1.3"
    , name: "Tower Build"
    , chapter: 1
    , difficulty: 3
    , initialWall: [[Yellow], [Yellow], [Cyan]]
    , targetWall: [[Yellow, Yellow, Cyan]]
    , idealSteps: 2
    , availableTransformers: ["stackAll", "stackPairs"]
    , hint: Nothing
    }
  , { id: "1.4"
    , name: "Mixed Transform"
    , chapter: 1
    , difficulty: 3
    , initialWall: [[Yellow, Cyan], [Red]]
    , targetWall: [[Red, Cyan], [Red]]
    , idealSteps: 1
    , availableTransformers: ["mapYellowToRed"]
    , hint: Nothing
    }
  ]

-- ============================================================================
-- NIVELES DEL CAPÍTULO 2: AVANZADOS
-- ============================================================================

chapter2Levels :: Array LevelData
chapter2Levels =
  [ { id: "2.1"
    , name: "Deep Filter"
    , chapter: 2
    , difficulty: 3
    , initialWall: [[Yellow, Cyan], [Cyan, Yellow], [Yellow]]
    , targetWall: [[Yellow], [Yellow], [Yellow]]
    , idealSteps: 1
    , availableTransformers: ["filterCyanFromStacks"]
    , hint: Nothing
    }
  , { id: "2.2"
    , name: "Reverse Order"
    , chapter: 2
    , difficulty: 3
    , initialWall: [[Yellow], [Cyan], [Red]]
    , targetWall: [[Red], [Cyan], [Yellow]]
    , idealSteps: 1
    , availableTransformers: ["reverseWall"]
    , hint: Nothing
    }
  , { id: "2.3"
    , name: "Complex Stack"
    , chapter: 2
    , difficulty: 4
    , initialWall: [[Yellow], [Cyan], [Red], [Orange], [Brown]]
    , targetWall: [[Yellow, Cyan, Red], [Orange, Brown]]
    , idealSteps: 2
    , availableTransformers: ["stackTriples", "stackPairs"]
    , hint: Nothing
    }
  , { id: "2.4"
    , name: "Master Challenge"
    , chapter: 2
    , difficulty: 5
    , initialWall: [[Yellow, Cyan], [Red], [Yellow], [Cyan, Red]]
    , targetWall: [[Red, Red], [Red, Red]]
    , idealSteps: 3
    , availableTransformers: ["mapYellowToRed", "mapCyanToRed", "stackPairs"]
    , hint: Nothing
    }
  ]

-- ============================================================================
-- REGISTRO CENTRAL
-- ============================================================================

allLevels :: Array LevelData
allLevels = concat [chapter0Levels, chapter1Levels, chapter2Levels]

-- | Obtener nivel por ID
getLevelById :: String -> Maybe LevelData
getLevelById targetId = findLevel allLevels
  where
    findLevel [] = Nothing
    findLevel (l : rest)
      | l.id == targetId = Just l
      | otherwise = findLevel rest

-- | Obtener niveles de un capítulo específico
getLevelsByChapter :: Int -> Array LevelData
getLevelsByChapter chapter = filterByChapter allLevels []
  where
    filterByChapter [] acc = acc
    filterByChapter (l : rest) acc
      | l.chapter == chapter = filterByChapter rest (acc <> [l])
      | otherwise = filterByChapter rest acc

-- | Número total de niveles
totalLevelCount :: Int
totalLevelCount = 12

-- | Nombres de capítulos
chapterNames :: Array String
chapterNames = ["Introduction", "Basics", "Advanced"]

-- | Calcular estrellas basado en pasos
calculateStars :: Int -> Int -> Int
calculateStars steps idealSteps
  | steps <= idealSteps = 3
  | steps <= idealSteps + 2 = 2
  | otherwise = 1

-- | Verificar si un nivel está desbloqueado
isLevelUnlocked :: String -> Array { id :: String, progress :: LevelProgress } -> Boolean
isLevelUnlocked "0.1" _ = true -- Primer nivel siempre desbloqueado
isLevelUnlocked levelId progressArray = checkPrevious levelId
  where
    checkPrevious "0.2" = isCompleted "0.1"
    checkPrevious "0.3" = isCompleted "0.2"
    checkPrevious "0.4" = isCompleted "0.3"
    checkPrevious "1.1" = isCompleted "0.4"
    checkPrevious "1.2" = isCompleted "1.1"
    checkPrevious "1.3" = isCompleted "1.2"
    checkPrevious "1.4" = isCompleted "1.3"
    checkPrevious "2.1" = isCompleted "1.4"
    checkPrevious "2.2" = isCompleted "2.1"
    checkPrevious "2.3" = isCompleted "2.2"
    checkPrevious "2.4" = isCompleted "2.3"
    checkPrevious _ = false
    
    isCompleted targetId = findCompleted progressArray
      where
        findCompleted [] = false
        findCompleted (p : rest)
          | p.id == targetId = p.progress.completed
          | otherwise = findCompleted rest
