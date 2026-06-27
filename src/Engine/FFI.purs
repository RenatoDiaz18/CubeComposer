-- | FFI Module - Puente para comunicación con JavaScript/Three.js
-- | Proporciona funciones para renderizar el juego en 3D usando Three.js
module Engine.FFI
  ( renderWall
  , initFFI
  , sendGameState
  , clearWall
  , setTheme
  , Theme(..)
  , WallData
  , CubeData
  ) where

import Prelude
import Effect (Effect)
import Data.List (List, toUnfoldable)
import Data.Array (fromFoldable)
import Types (Wall, Cube(..), Stack)

-- | Tipo para representar un cubo como datos JSON-serializable
type CubeData = { color :: String, index :: Int }

-- | Tipo para representar una pared como datos JSON-serializable  
type WallData = Array (Array CubeData)

-- | Convierte un Cube a su representación de datos
cubeToData :: Int -> Cube -> CubeData
cubeToData idx cube = { color: show cube, index: idx }

-- | Convierte un Stack a un array de datos de cubos
stackToData :: Stack -> Array CubeData
stackToData stack = 
  let cubes = fromFoldable stack
      indexed = zipWithIndex cubes
  in map (\{cube, idx} -> cubeToData idx cube) indexed
  where
    zipWithIndex :: Array Cube -> Array {cube :: Cube, idx :: Int}
    zipWithIndex arr = 
      let indices = 0 .. (length arr - 1)
      in zipWith (\c i -> {cube: c, idx: i}) arr indices
    
    length :: forall a. Array a -> Int
    length = arrayLength
    
    zipWith :: forall a b c. (a -> b -> c) -> Array a -> Array b -> Array c
    zipWith = arrayZipWith

-- | FFI helpers
foreign import arrayLength :: forall a. Array a -> Int
foreign import arrayZipWith :: forall a b c. (a -> b -> c) -> Array a -> Array b -> Array c

-- | Convierte un Wall a datos serializables
wallToData :: Wall -> WallData
wallToData wall = map stackToData (fromFoldable wall)

-- | Importación FFI para renderizar la pared
foreign import renderWallImpl :: WallData -> Effect Unit

-- | Renderiza una pared de cubos enviando los datos a JavaScript
renderWall :: Wall -> Effect Unit
renderWall wall = renderWallImpl (wallToData wall)

-- | Importación FFI para inicializar la conexión
foreign import initFFIImpl :: Effect Unit

-- | Inicializa el puente FFI
initFFI :: Effect Unit
initFFI = initFFIImpl

-- | Tipo para el estado del juego simplificado
type GameStateData = 
  { currentWall :: WallData
  , targetWall :: WallData
  , levelId :: String
  }

-- | Importación FFI para enviar estado del juego
foreign import sendGameStateImpl :: GameStateData -> Effect Unit

-- | Envía el estado completo del juego al motor de renderizado
sendGameState :: { current :: Wall, target :: Wall, levelId :: String } -> Effect Unit
sendGameState state = sendGameStateImpl 
  { currentWall: wallToData state.current
  , targetWall: wallToData state.target
  , levelId: state.levelId
  }

-- | Tipo para representar temas visuales
data Theme = DarkTheme | LightTheme

instance showTheme :: Show Theme where
  show DarkTheme = "dark"
  show LightTheme = "light"

-- | Importación FFI para limpiar la pared
foreign import clearWallImpl :: Effect Unit

-- | Limpia la pared actual del renderizado
clearWall :: Effect Unit
clearWall = clearWallImpl

-- | Importación FFI para cambiar el tema
foreign import setThemeImpl :: String -> Effect Unit

-- | Cambia el tema visual del juego
setTheme :: Theme -> Effect Unit
setTheme theme = setThemeImpl (show theme)
