module I18n where

import Prelude
import Data.Maybe (Maybe(..))
import Foreign.Object (Object)
import Foreign.Object as Object

-- | Idiomas soportados
data Language = Spanish | English

derive instance eqLanguage :: Eq Language

-- | Traducciones en español
spanishTranslations :: Object String
spanishTranslations = Object.fromFoldable
  [ "app.title" /\ "Cube Composer"
  , "app.subtitle" /\ "Un juego de puzzles inspirado en programación funcional"
  
  -- Menú principal
  , "menu.play" /\ "▶ Jugar"
  , "menu.settings" /\ "⚙ Configuración"
  , "menu.exit" /\ "✕ Salir"
  
  -- Selector de niveles
  , "levels.title" /\ "Seleccionar Nivel"
  , "levels.subtitle" /\ "Completa niveles para desbloquear nuevos desafíos"
  , "levels.back" /\ "← Volver al Menú"
  , "levels.chapter" /\ "Capítulo"
  
  -- Configuración
  , "settings.title" /\ "Configuración"
  , "settings.language" /\ "Idioma"
  , "settings.darkTheme" /\ "Tema Oscuro"
  , "settings.save" /\ "Guardar y Cerrar"
  
  -- Tutorial
  , "tutorial.title" /\ "Nueva Función"
  , "tutorial.subtitle" /\ "Aprende a usar esta transformación"
  , "tutorial.description" /\ "Esta función transforma los cubos. Pruébala en el ejemplo."
  , "tutorial.apply" /\ "Aplicar Función"
  , "tutorial.start" /\ "Comenzar Nivel"
  
  -- Éxito
  , "success.title" /\ "¡Nivel Completado!"
  , "success.retry" /\ "↺ Reintentar"
  , "success.next" /\ "Siguiente →"
  , "success.moves" /\ "Movimientos"
  , "success.ideal" /\ "Ideal"
  
  -- Juego
  , "game.backLevels" /\ "← Niveles"
  , "game.toggleTheme" /\ "Cambiar tema"
  , "game.resetCamera" /\ "Reset Cámara"
  , "game.level" /\ "Nivel"
  , "game.moves" /\ "Movimientos"
  , "game.ideal" /\ "Ideal"
  , "game.goal" /\ "Objetivo"
  , "game.availableFunctions" /\ "Funciones Disponibles"
  , "game.yourProgram" /\ "Tu Programa"
  , "game.reset" /\ "↺ Reset"
  , "game.run" /\ "▶ Ejecutar"
  , "game.engineActive" /\ "Motor 3D activo"
  ]

-- | Traducciones en inglés
englishTranslations :: Object String
englishTranslations = Object.fromFoldable
  [ "app.title" /\ "Cube Composer"
  , "app.subtitle" /\ "A puzzle game inspired by functional programming"
  
  -- Main menu
  , "menu.play" /\ "▶ Play"
  , "menu.settings" /\ "⚙ Settings"
  , "menu.exit" /\ "✕ Exit"
  
  -- Level selector
  , "levels.title" /\ "Select Level"
  , "levels.subtitle" /\ "Complete levels to unlock new challenges"
  , "levels.back" /\ "← Back to Menu"
  , "levels.chapter" /\ "Chapter"
  
  -- Settings
  , "settings.title" /\ "Settings"
  , "settings.language" /\ "Language"
  , "settings.darkTheme" /\ "Dark Theme"
  , "settings.save" /\ "Save and Close"
  
  -- Tutorial
  , "tutorial.title" /\ "New Function"
  , "tutorial.subtitle" /\ "Learn to use this transformation"
  , "tutorial.description" /\ "This function transforms cubes. Try it in the example."
  , "tutorial.apply" /\ "Apply Function"
  , "tutorial.start" /\ "Start Level"
  
  -- Success
  , "success.title" /\ "Level Complete!"
  , "success.retry" /\ "↺ Retry"
  , "success.next" /\ "Next →"
  , "success.moves" /\ "Moves"
  , "success.ideal" /\ "Ideal"
  
  -- Game
  , "game.backLevels" /\ "← Levels"
  , "game.toggleTheme" /\ "Toggle theme"
  , "game.resetCamera" /\ "Reset Camera"
  , "game.level" /\ "Level"
  , "game.moves" /\ "Moves"
  , "game.ideal" /\ "Ideal"
  , "game.goal" /\ "Goal"
  , "game.availableFunctions" /\ "Available Functions"
  , "game.yourProgram" /\ "Your Program"
  , "game.reset" /\ "↺ Reset"
  , "game.run" /\ "▶ Run"
  , "game.engineActive" /\ "3D Engine active"
  ]

-- | Obtener traducción por clave
translate :: Language -> String -> String
translate lang key = 
  case Object.lookup key translations of
    Just text -> text
    Nothing -> key
  where
    translations = case lang of
      Spanish -> spanishTranslations
      English -> englishTranslations

-- | Obtener todas las traducciones para un idioma
getTranslations :: Language -> Object String
getTranslations Spanish = spanishTranslations
getTranslations English = englishTranslations

-- | Convertir string a Language
parseLanguage :: String -> Language
parseLanguage "en" = English
parseLanguage _ = Spanish

-- | Convertir Language a string
languageCode :: Language -> String
languageCode Spanish = "es"
languageCode English = "en"
