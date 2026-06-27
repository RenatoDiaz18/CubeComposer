use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const SAVE_FILE_NAME: &str = "cube_composer_save.json";
const DEFAULT_SAVE: &str = r#"{"version":1,"levels":[],"totalStars":0,"completedLevels":0}"#;

/// Obtiene la ruta del archivo de guardado en el directorio de datos de la app
fn get_save_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Error obteniendo directorio de datos: {}", e))?;
    
    // Crear directorio si no existe
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Error creando directorio: {}", e))?;
    }
    
    Ok(app_data_dir.join(SAVE_FILE_NAME))
}

/// Guarda el estado del juego en un archivo JSON
#[tauri::command]
fn save_game(app_handle: tauri::AppHandle, data: String) -> Result<String, String> {
    let save_path = get_save_path(&app_handle)?;
    
    // Validar que es JSON válido
    if serde_json::from_str::<serde_json::Value>(&data).is_err() {
        return Err("Datos JSON inválidos".to_string());
    }
    
    fs::write(&save_path, &data)
        .map_err(|e| format!("Error guardando archivo: {}", e))?;
    
    println!("[Tauri] Juego guardado en: {:?}", save_path);
    Ok("Guardado exitoso".to_string())
}

/// Carga el estado del juego desde el archivo JSON
#[tauri::command]
fn load_game(app_handle: tauri::AppHandle) -> Result<String, String> {
    let save_path = get_save_path(&app_handle)?;
    
    if !save_path.exists() {
        println!("[Tauri] Archivo de guardado no existe, retornando estado inicial");
        return Ok(DEFAULT_SAVE.to_string());
    }
    
    let content = fs::read_to_string(&save_path)
        .map_err(|e| format!("Error leyendo archivo: {}", e))?;
    
    // Validar JSON
    if serde_json::from_str::<serde_json::Value>(&content).is_err() {
        println!("[Tauri] Archivo corrupto, retornando estado inicial");
        return Ok(DEFAULT_SAVE.to_string());
    }
    
    println!("[Tauri] Juego cargado desde: {:?}", save_path);
    Ok(content)
}

/// Elimina el archivo de guardado (para reset completo)
#[tauri::command]
fn reset_game(app_handle: tauri::AppHandle) -> Result<String, String> {
    let save_path = get_save_path(&app_handle)?;
    
    if save_path.exists() {
        fs::remove_file(&save_path)
            .map_err(|e| format!("Error eliminando archivo: {}", e))?;
        println!("[Tauri] Guardado eliminado");
    }
    
    Ok("Reset exitoso".to_string())
}

/// Obtiene información del sistema para debug
#[tauri::command]
fn get_system_info(app_handle: tauri::AppHandle) -> Result<String, String> {
    let save_path = get_save_path(&app_handle)?;
    let save_exists = save_path.exists();
    
    let info = serde_json::json!({
        "savePath": save_path.to_string_lossy(),
        "saveExists": save_exists,
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH
    });
    
    Ok(info.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_game,
            load_game,
            reset_game,
            get_system_info
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
