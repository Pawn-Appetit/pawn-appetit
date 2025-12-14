use crate::db::models::{Event, NewEvent, NewPlayer, NewSite, Player, Site};
use diesel::prelude::*;

/// Creates a new player in the database, and returns the player's ID.
/// If the player already exists, returns the ID of the existing player.
/// OPTIMIZED: Uses INSERT...ON CONFLICT to avoid separate SELECT query
pub fn create_player(
    conn: &mut SqliteConnection,
    name: &str,
) -> Result<Player, diesel::result::Error> {
    use crate::db::schema::players;

    let new_player = NewPlayer { name, elo: None };

    // Try insert first (most common case for unique players)
    match diesel::insert_into(players::table)
        .values(&new_player)
        .get_result::<Player>(conn)
    {
        Ok(player) => Ok(player),
        Err(diesel::result::Error::DatabaseError(
            diesel::result::DatabaseErrorKind::UniqueViolation,
            _,
        )) => {
            // Player already exists, fetch it
            players::table
            .filter(players::name.eq(name))
                .first::<Player>(conn)
        }
        Err(e) => Err(e),
    }
}

/// OPTIMIZED: Uses INSERT to avoid separate SELECT query
pub fn create_event(
    conn: &mut SqliteConnection,
    name: &str,
) -> Result<Event, diesel::result::Error> {
    use crate::db::schema::events;

    let new_event = NewEvent { name };

    // Try insert first (most common case for unique events)
    match diesel::insert_into(events::table)
        .values(&new_event)
        .get_result::<Event>(conn)
    {
        Ok(event) => Ok(event),
        Err(diesel::result::Error::DatabaseError(
            diesel::result::DatabaseErrorKind::UniqueViolation,
            _,
        )) => {
            // Event already exists, fetch it
            events::table
            .filter(events::name.eq(name))
                .first::<Event>(conn)
        }
        Err(e) => Err(e),
    }
}

/// OPTIMIZED: Uses INSERT to avoid separate SELECT query
pub fn create_site(conn: &mut SqliteConnection, name: &str) -> Result<Site, diesel::result::Error> {
    use crate::db::schema::sites;

    let new_site = NewSite { name };

    // Try insert first (most common case for unique sites)
    match diesel::insert_into(sites::table)
        .values(&new_site)
        .get_result::<Site>(conn)
    {
        Ok(site) => Ok(site),
        Err(diesel::result::Error::DatabaseError(
            diesel::result::DatabaseErrorKind::UniqueViolation,
            _,
        )) => {
            // Site already exists, fetch it
            sites::table
            .filter(sites::name.eq(name))
                .first::<Site>(conn)
        }
        Err(e) => Err(e),
    }
}
