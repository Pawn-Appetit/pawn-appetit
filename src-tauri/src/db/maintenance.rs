use std::{fs::remove_file, path::PathBuf, sync::Arc};

use diesel::{connection::SimpleConnection, prelude::*};

use crate::{
    db::{
        connection::{get_db_or_create, ConnectionOptions},
        schema::games,
    },
    error::Result,
    AppState,
};

const GAMES_DELETE_DUPLICATES: &str =
    include_str!("../../../database/queries/games/delete_duplicates.sql");

#[tauri::command]
#[specta::specta]
pub async fn delete_database(file: PathBuf, state: tauri::State<'_, AppState>) -> Result<()> {
    let pool = &state.connection_pool;
    let path_str = file.to_str().unwrap();
    pool.remove(path_str);

    remove_file(path_str)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_duplicated_games(
    file: PathBuf,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    db.batch_execute(GAMES_DELETE_DUPLICATES)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_empty_games(file: PathBuf, state: tauri::State<'_, AppState>) -> Result<()> {
    let db = &mut get_db_or_create(&state, file.to_str().unwrap(), ConnectionOptions::default())?;

    diesel::delete(games::table.filter(games::ply_count.eq(0))).execute(db)?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn clear_games(state: tauri::State<'_, AppState>) {
    let mut state = state.db_cache.lock().unwrap();
    *state = Arc::new(Vec::new());
}
