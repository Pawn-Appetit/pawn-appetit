use shakmaty::Chess;
use specta::Type;

use std::path::PathBuf;
use crate::engine::EngineState;

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),

    #[error(transparent)]
    BincodeEncode(#[from] bincode::error::EncodeError),

    #[error(transparent)]
    BincodeDecode(#[from] bincode::error::DecodeError),

    #[error(transparent)]
    XmlDeserialize(#[from] quick_xml::de::DeError),

    #[error(transparent)]
    ParseInt(#[from] std::num::ParseIntError),

    #[error(transparent)]
    Tauri(#[from] tauri::Error),

    #[error(transparent)]
    TauriShell(#[from] tauri_plugin_shell::Error),

    #[error(transparent)]
    TauriOpener(#[from] tauri_plugin_opener::Error),

    #[error(transparent)]
    Reqwest(#[from] reqwest::Error),

    #[error(transparent)]
    ChessPosition(#[from] shakmaty::PositionError<Chess>),

    #[error(transparent)]
    IllegalUciMove(#[from] shakmaty::uci::IllegalUciMoveError),

    #[error(transparent)]
    ParseUciMove(#[from] shakmaty::uci::ParseUciMoveError),

    #[error(transparent)]
    Fen(#[from] shakmaty::fen::ParseFenError),

    #[error(transparent)]
    ParseSan(#[from] shakmaty::san::ParseSanError),

    #[error(transparent)]
    IllegalSan(#[from] shakmaty::san::SanError),

    #[error(transparent)]
    Diesel(#[from] diesel::result::Error),

    #[error(transparent)]
    DieselConnection(#[from] diesel::ConnectionError),

    #[error(transparent)]
    R2d2(#[from] diesel::r2d2::PoolError),

    #[error(transparent)]
    SystemTime(#[from] std::time::SystemTimeError),

    #[error(transparent)]
    FromUtf8Error(#[from] std::string::FromUtf8Error),

    #[error(transparent)]
    FormatError(#[from] std::fmt::Error),

    #[error("No stdin")]
    NoStdin,

    #[error("No stdout")]
    NoStdout,

    #[error("No moves found")]
    NoMovesFound,

    #[error("Search stopped")]
    SearchStopped,

    #[error("Missing reference database")]
    MissingReferenceDatabase,

    #[error("No opening found")]
    NoOpeningFound,

    #[error("No match found")]
    NoMatchFound,

    #[error("No puzzles")]
    NoPuzzles,

    #[error("Cannot merge players: they are distinct players who have played against each other")]
    NotDistinctPlayers,

    #[error("Invalid binary data")]
    InvalidBinaryData,

    #[error("Failed to acquire mutex lock: {0}")]
    MutexLockFailed(String),

    #[error("Package manager error: {0}")]
    PackageManager(String),

    #[error("Engine timeout")]
    EngineTimeout,

    #[error("Invalid state transition from {from:?} to {to:?}")]
    InvalidStateTransition {
        from: EngineState,
        to: EngineState,
    },

    #[error("Unexpected engine state - expected {expected:?}, got {actual:?}")]
    UnexpectedState {
        expected: EngineState,
        actual: EngineState,
    },

    #[error("Engine stop timeout")]
    EngineStopTimeout,

    #[error("Event emission failed")]
    EventEmissionFailed,

    #[error("FEN parsing error: {0}")]
    FenError(String),

    #[error("Position setup error: {0}")]
    PositionError(String),

    #[error("UCI move parsing error: {0}")]
    UciMoveError(String),

    #[error("Illegal move error: {0}")]
    IllegalMoveError(String),
}

impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

impl Type for Error {
    fn inline(
        _type_map: &mut specta::TypeMap,
        _generics: specta::Generics,
    ) -> specta::datatype::DataType {
        specta::datatype::DataType::Primitive(specta::datatype::PrimitiveType::String)
    }
}

pub type Result<T> = std::result::Result<T, Error>;