use std::time::Instant;

use governor::{Quota, RateLimiter};
use log::{debug, error, info, warn};
use nonzero_ext::*;
use tauri::AppHandle;
use tauri_specta::Event;

use super::{
    communication::EventQueue,
    types::{BestMovesPayload, EngineError, EngineResult, ReportProgress, EVENTS_PER_SECOND},
};

/// Manages event emission with rate limiting and backpressure control
/// 
/// This manager handles:
/// - Rate limiting to prevent overwhelming the frontend
/// - Event queuing and batching
/// - Different event types (analysis updates, progress reports)
/// - Error handling for failed emissions
#[derive(Debug)]
pub struct EventManager {
    rate_limiter: RateLimiter<
        governor::state::direct::NotKeyed,
        governor::state::InMemoryState,
        governor::clock::DefaultClock,
        governor::middleware::NoOpMiddleware,
    >,
    best_moves_queue: EventQueue<BestMovesPayload>,
    progress_queue: EventQueue<ReportProgress>,
    first_result_sent: bool,
}

impl EventManager {
    /// Create a new event manager with rate limiting
    pub fn new() -> Self {
        let rate_limiter = RateLimiter::direct(Quota::per_second(nonzero!(EVENTS_PER_SECOND)));
        
        Self {
            rate_limiter,
            best_moves_queue: EventQueue::new(),
            progress_queue: EventQueue::new(),
            first_result_sent: false,
        }
    }

    /// Reset for new analysis session
    pub fn reset(&mut self) {
        self.first_result_sent = false;
        // Note: We keep queues as they may have pending events
    }

    /// Emit a best moves event, handling rate limiting and queuing
    pub async fn emit_best_moves(
        &mut self,
        payload: BestMovesPayload,
        app: &AppHandle,
        force_immediate: bool,
    ) -> EngineResult<bool> {
        let should_emit_immediately = force_immediate 
            || !self.first_result_sent 
            || self.rate_limiter.check().is_ok();

        if should_emit_immediately {
            debug!("Emitting best moves immediately: depth={}, progress={:.2}%", 
                   payload.best_lines.first().map_or(0, |m| m.depth), payload.progress);
            
            match payload.emit(app) {
                Ok(()) => {
                    self.first_result_sent = true;
                    return Ok(true);
                }
                Err(e) => {
                    error!("Failed to emit best moves event: {:?}", e);
                    // Queue the event for later retry
                    self.best_moves_queue.queue_event(payload);
                    return Err(EngineError::EventEmissionFailed);
                }
            }
        } else {
            debug!("Queueing best moves event for later emission");
            self.best_moves_queue.queue_event(payload);
        }

        Ok(false)
    }

    /// Emit a progress event
    pub async fn emit_progress(
        &mut self,
        payload: ReportProgress,
        app: &AppHandle,
    ) -> EngineResult<()> {
        match payload.emit(app) {
            Ok(()) => {
                debug!("Progress event emitted: {:.2}%", payload.progress);
                Ok(())
            }
            Err(e) => {
                error!("Failed to emit progress event: {:?}", e);
                // Queue for retry
                self.progress_queue.queue_event(payload);
                Err(EngineError::EventEmissionFailed)
            }
        }
    }

    /// Try to send any pending events
    pub async fn flush_pending_events(&mut self, app: &AppHandle) -> EngineResult<usize> {
        let mut sent_count = 0;

        // Try to send pending best moves events
        while let Some(payload) = self.best_moves_queue.try_get_next() {
            if self.rate_limiter.check().is_ok() {
                match payload.emit(app) {
                    Ok(()) => {
                        debug!("Sent queued best moves event");
                        sent_count += 1;
                    }
                    Err(e) => {
                        warn!("Failed to send queued best moves event: {:?}", e);
                        // Put it back in queue for later
                        self.best_moves_queue.queue_event(payload);
                        break;
                    }
                }
            } else {
                // Rate limit hit, put back and break
                self.best_moves_queue.queue_event(payload);
                break;
            }
        }

        // Try to send pending progress events
        while let Some(payload) = self.progress_queue.try_get_next() {
            match payload.emit(app) {
                Ok(()) => {
                    debug!("Sent queued progress event");
                    sent_count += 1;
                }
                Err(e) => {
                    warn!("Failed to send queued progress event: {:?}", e);
                    // Put it back in queue for later
                    self.progress_queue.queue_event(payload);
                    break;
                }
            }
        }

        if sent_count > 0 {
            debug!("Flushed {} pending events", sent_count);
        }

        Ok(sent_count)
    }

    /// Check if there are any pending events
    pub fn has_pending_events(&self) -> bool {
        self.best_moves_queue.has_pending() || self.progress_queue.has_pending()
    }

    /// Get count of pending events for monitoring
    pub fn pending_event_count(&self) -> (usize, usize) {
        // This is a simplified count - actual queue sizes may vary
        let best_moves_pending = if self.best_moves_queue.has_pending() { 1 } else { 0 };
        let progress_pending = if self.progress_queue.has_pending() { 1 } else { 0 };
        (best_moves_pending, progress_pending)
    }
}

impl Default for EventManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Event emission strategies for different scenarios
#[derive(Debug, Clone, Copy)]
pub enum EmissionStrategy {
    /// Always emit immediately, ignoring rate limits
    Immediate,
    /// Use rate limiting and queuing
    RateLimited,
    /// Batch events and emit periodically
    Batched,
}

/// Event priority levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum EventPriority {
    Low,
    Normal,
    High,
    Critical,
}

/// Extended event manager with priority handling
#[derive(Debug)]
pub struct PriorityEventManager {
    base_manager: EventManager,
    last_emit_time: Option<Instant>,
    strategy: EmissionStrategy,
}

impl PriorityEventManager {
    /// Create new priority event manager
    pub fn new(strategy: EmissionStrategy) -> Self {
        Self {
            base_manager: EventManager::new(),
            last_emit_time: None,
            strategy,
        }
    }

    /// Emit event with priority consideration
    pub async fn emit_with_priority<T>(
        &mut self,
        event: T,
        priority: EventPriority,
        app: &AppHandle,
    ) -> EngineResult<bool>
    where
        T: EmittableEvent,
    {
        let force_immediate = match (self.strategy, priority) {
            (EmissionStrategy::Immediate, _) => true,
            (_, EventPriority::Critical) => true,
            (EmissionStrategy::RateLimited, EventPriority::High) => {
                // Allow high priority to bypass some rate limiting
                self.last_emit_time
                    .map_or(true, |t| t.elapsed().as_millis() > 25)
            }
            _ => false,
        };

        if force_immediate {
            self.last_emit_time = Some(Instant::now());
        }

        event.emit_with_manager(&mut self.base_manager, app, force_immediate).await
    }

    /// Flush all pending events
    pub async fn flush_all(&mut self, app: &AppHandle) -> EngineResult<usize> {
        self.base_manager.flush_pending_events(app).await
    }

    /// Reset manager state
    pub fn reset(&mut self) {
        self.base_manager.reset();
        self.last_emit_time = None;
    }
}

/// Trait for events that can be emitted through the event manager
pub trait EmittableEvent {
    async fn emit_with_manager(
        self,
        manager: &mut EventManager,
        app: &AppHandle,
        force_immediate: bool,
    ) -> EngineResult<bool>;
}

impl EmittableEvent for BestMovesPayload {
    async fn emit_with_manager(
        self,
        manager: &mut EventManager,
        app: &AppHandle,
        force_immediate: bool,
    ) -> EngineResult<bool> {
        manager.emit_best_moves(self, app, force_immediate).await
    }
}

impl EmittableEvent for ReportProgress {
    async fn emit_with_manager(
        self,
        manager: &mut EventManager,
        app: &AppHandle,
        force_immediate: bool,
    ) -> EngineResult<bool> {
        let _ = force_immediate; // Progress events typically don't queue
        manager.emit_progress(self, app).await.map(|_| true)
    }
}

/// Helper function to create standardized best moves payload
pub fn create_best_moves_payload(
    best_lines: Vec<super::types::BestMoves>,
    engine: String,
    tab: String,
    fen: String,
    moves: Vec<String>,
    progress: f64,
) -> BestMovesPayload {
    BestMovesPayload {
        best_lines,
        engine,
        tab,
        fen,
        moves,
        progress,
    }
}

/// Helper function to create standardized progress payload  
pub fn create_progress_payload(
    progress: f64,
    id: String,
    finished: bool,
) -> ReportProgress {
    ReportProgress {
        progress,
        id,
        finished,
    }
}

/// Emit progress update with error handling
pub async fn emit_progress_update(
    app: &AppHandle,
    progress: f64,
    id: &str,
    finished: bool,
) -> EngineResult<()> {
    let payload = create_progress_payload(progress, id.to_string(), finished);
    
    match payload.emit(app) {
        Ok(()) => {
            if finished {
                info!("Final progress update emitted: {:.1}% for {}", progress, id);
            } else {
                debug!("Progress update emitted: {:.1}% for {}", progress, id);
            }
            Ok(())
        }
        Err(e) => {
            error!("Failed to emit progress update for {}: {:?}", id, e);
            Err(EngineError::EventEmissionFailed)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_manager_creation() {
        let manager = EventManager::new();
        assert!(!manager.has_pending_events());
        assert!(!manager.first_result_sent);
    }

    #[test]
    fn test_priority_event_manager() {
        let manager = PriorityEventManager::new(EmissionStrategy::RateLimited);
        assert!(matches!(manager.strategy, EmissionStrategy::RateLimited));
        assert!(manager.last_emit_time.is_none());
    }

    #[test]
    fn test_event_priority_ordering() {
        assert!(EventPriority::Critical > EventPriority::High);
        assert!(EventPriority::High > EventPriority::Normal);
        assert!(EventPriority::Normal > EventPriority::Low);
    }
}
