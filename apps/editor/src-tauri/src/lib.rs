#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // a packaged pi-tray that started the editor, e.g. through a plugin, gives everything it starts its own path here,
    // which would make the editor's pi-tray sidecar start as plain node and fail to find its commands
    std::env::remove_var("PKG_EXECPATH");

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {
            // NOOP
        }))
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                // use dynamic registration as a backup to allow testing deep links without installing
                // (not supported on mac)
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
