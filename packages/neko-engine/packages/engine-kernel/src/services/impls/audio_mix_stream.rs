//! Mix stream — multi-track audio mixing stream loop.
//!
//! Spawns a blocking thread that runs `AudioMixdown::mix_buffer()` in a loop,
//! packing output as PCM f32le frames and broadcasting via the stream infrastructure.

use crate::domain::FrameData;
use crate::error::Result;
use crate::services::audio_mixdown::{AudioMixdown, MixdownConfig};
use crate::services::impls::stream_loop::{
    create_stream_channels, pack_pcm_f32le_stream_frame, ActiveStreams, MixdownUpdateAck,
    StreamLoopHandle, WallClockPacer, EOF_IDLE_TIMEOUT,
};
use neko_engine_audio::dsp::speed_resampler::SpeedResampler;
use neko_engine_types::StreamId;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, watch};
use tokio_util::sync::CancellationToken;

enum MixStreamIdleWake {
    Seek(f64),
    MixdownUpdate,
}

/// Start a multi-track mix stream.
///
/// Creates an `AudioMixdown` from `config`, spawns a blocking decode/mix loop,
/// and returns `(StreamId, Receiver)` for registration in the `StreamRegistry`.
pub async fn start_mix_stream(
    config: MixdownConfig,
    session_id: &str,
    active_streams: Arc<ActiveStreams>,
) -> Result<(StreamId, broadcast::Receiver<FrameData>)> {
    let (stream_id, tx, rx, cancel, _state_tx, state_rx) = create_stream_channels(session_id, 64);

    let cancel_clone = cancel.clone();
    let streams_clone = active_streams.clone();
    let stream_id_clone = stream_id.clone();

    let join_handle = tokio::task::spawn_blocking(move || {
        let mut mixdown = AudioMixdown::new(config);
        for warning in mixdown.take_warnings() {
            tracing::warn!("Mix stream warning: {}", warning);
        }
        if let Err(e) = mixdown.initialize() {
            tracing::error!("Mix stream: failed to initialize mixdown: {}", e);
            return;
        }

        let mut total_duration = mixdown.total_duration();
        let mut sample_rate = mixdown.sample_rate();
        let mut channels = mixdown.channels();
        let mut buffer_size = mixdown.buffer_size();
        let mut buf_duration = buffer_size as f64 / sample_rate as f64;

        let mut pacer =
            WallClockPacer::new((sample_rate as f64 / buffer_size as f64).min(120.0), 1.0);
        let mut resampler = SpeedResampler::new(channels as usize);
        let mut current_speed = 1.0;
        let mut current_time = 0.0;
        let mut last_seen_paused = false;
        let mut last_seek_seq: u64 = 0;
        let mut last_mixdown_seq: u64 = 0;

        loop {
            if cancel_clone.is_cancelled() {
                break;
            }

            let state = state_rx.borrow().clone();

            // Handle mixdown config hot-update.
            if state.mixdown_seq != last_mixdown_seq {
                last_mixdown_seq = state.mixdown_seq;
                if let Some(config) = state.mixdown_update {
                    tracing::info!(
                        "Mix stream: applying mixdown update seq {}",
                        last_mixdown_seq
                    );
                    let warnings = mixdown.update_config(config.as_ref().clone());
                    for warning in &warnings {
                        tracing::warn!("Mix stream warning: {}", warning);
                    }
                    send_mixdown_update_ack(state.mixdown_update_ack, warnings);
                    mixdown.reset();
                    total_duration = mixdown.total_duration();
                    sample_rate = mixdown.sample_rate();
                    channels = mixdown.channels();
                    buffer_size = mixdown.buffer_size();
                    buf_duration = buffer_size as f64 / sample_rate as f64;
                    resampler = SpeedResampler::new(channels as usize);
                    pacer = WallClockPacer::new(
                        (sample_rate as f64 / buffer_size as f64).min(120.0),
                        current_speed,
                    );
                } else {
                    send_mixdown_update_ack(state.mixdown_update_ack, Vec::new());
                }
            }

            // Handle seek
            if let Some(time) = state.seek_to {
                if state.seek_seq != last_seek_seq {
                    last_seek_seq = state.seek_seq;
                    current_time = time;
                    mixdown.reset();
                    pacer.reset();
                }
            }

            // Pause→resume: reset pacer
            if last_seen_paused && !state.paused {
                pacer.reset();
            }
            last_seen_paused = state.paused;

            if state.paused {
                std::thread::sleep(std::time::Duration::from_millis(16));
                continue;
            }

            // Speed change
            if (state.speed - current_speed).abs() > 0.001 {
                current_speed = state.speed;
                pacer.update_speed(current_speed);
            }

            // Mix at current time with speed-aware resampling
            let speed_is_unity = (current_speed - 1.0).abs() < 0.001;
            if speed_is_unity {
                match mixdown.mix_buffer(current_time) {
                    Ok(buf) => {
                        let pcm_bytes: &[u8] = bytemuck::cast_slice(&buf.data);
                        let packed = pack_pcm_f32le_stream_frame(
                            pcm_bytes,
                            current_time,
                            buf_duration,
                            sample_rate,
                            channels,
                        );
                        let _ = tx.send(packed);
                        current_time += buf_duration;
                    }
                    Err(e) => {
                        tracing::warn!("Mix stream buffer error: {}", e);
                        break;
                    }
                }
            } else {
                let source_duration = buf_duration * current_speed;
                let source_frames_needed = (buffer_size as f64 * current_speed).ceil() as usize;
                let ch = channels as usize;
                let mut accumulated = Vec::with_capacity(source_frames_needed * ch);
                let mut mix_time = current_time;
                let mut mix_error = false;

                while accumulated.len() < source_frames_needed * ch {
                    match mixdown.mix_buffer(mix_time) {
                        Ok(buf) => {
                            let remaining = source_frames_needed * ch - accumulated.len();
                            let take = remaining.min(buf.data.len());
                            accumulated.extend_from_slice(&buf.data[..take]);
                            mix_time += buf_duration;
                        }
                        Err(e) => {
                            tracing::warn!("Mix stream buffer error: {}", e);
                            mix_error = true;
                            break;
                        }
                    }
                }
                if mix_error {
                    break;
                }

                let resampled = resampler.resample(&accumulated, buffer_size);
                let pcm_bytes: &[u8] = bytemuck::cast_slice(&resampled);
                let packed = pack_pcm_f32le_stream_frame(
                    pcm_bytes,
                    current_time,
                    buf_duration,
                    sample_rate,
                    channels,
                );
                let _ = tx.send(packed);
                current_time += source_duration;
            }

            // EOF check
            if current_time >= total_duration {
                let state = state_rx.borrow().clone();
                if let Some(ref region) = state.loop_region {
                    current_time = region.in_point;
                    mixdown.reset();
                    pacer.reset();
                } else {
                    match mix_stream_eof_idle_wait(
                        &cancel_clone,
                        &state_rx,
                        last_seek_seq,
                        last_mixdown_seq,
                        EOF_IDLE_TIMEOUT,
                    ) {
                        Some(MixStreamIdleWake::Seek(time)) => {
                            current_time = time;
                            mixdown.reset();
                            pacer.reset();
                        }
                        Some(MixStreamIdleWake::MixdownUpdate) => {
                            pacer.reset();
                            continue;
                        }
                        None => break,
                    }
                }
            }

            pacer.wait_for_next_frame();
        }

        mixdown.close();

        let rt = tokio::runtime::Handle::current();
        rt.block_on(streams_clone.remove(stream_id_clone.as_str()));
    });

    let handle = StreamLoopHandle {
        stream_id: stream_id.clone(),
        cancel,
        state_tx: _state_tx,
        join_handle,
        linked_stream_id: None,
    };
    active_streams.insert(handle).await;

    Ok((stream_id, rx))
}

fn send_mixdown_update_ack(ack: Option<MixdownUpdateAck>, warnings: Vec<String>) {
    if let Some(ack) = ack {
        if let Some(sender) = ack.lock().ok().and_then(|mut guard| guard.take()) {
            let _ = sender.send(warnings);
        }
    }
}

fn mix_stream_eof_idle_wait(
    cancel: &CancellationToken,
    state_rx: &watch::Receiver<crate::services::impls::stream_loop::PlaybackState>,
    last_seek_seq: u64,
    last_mixdown_seq: u64,
    timeout: Duration,
) -> Option<MixStreamIdleWake> {
    let eof_start = std::time::Instant::now();
    tracing::info!(
        "Mix stream reached EOF, waiting for seek or config update (timeout: {:?})",
        timeout
    );

    loop {
        if cancel.is_cancelled() || eof_start.elapsed() > timeout {
            return None;
        }

        let state = state_rx.borrow().clone();
        if state.mixdown_seq != last_mixdown_seq {
            return Some(MixStreamIdleWake::MixdownUpdate);
        }
        if state.seek_seq != last_seek_seq {
            if let Some(time) = state.seek_to {
                tracing::info!("Mix stream EOF idle: received seek to {:.3}s", time);
                return Some(MixStreamIdleWake::Seek(time));
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::impls::stream_loop::PlaybackState;
    use std::sync::Mutex;
    use tokio::sync::oneshot;

    #[test]
    fn test_mix_stream_eof_idle_wakes_on_mixdown_update() {
        let cancel = CancellationToken::new();
        let (state_tx, state_rx) = watch::channel(PlaybackState::default());
        state_tx.send_modify(|state| {
            state.mixdown_seq = 1;
        });

        match mix_stream_eof_idle_wait(&cancel, &state_rx, 0, 0, Duration::from_secs(1)) {
            Some(MixStreamIdleWake::MixdownUpdate) => {}
            _ => panic!("expected mixdown update wake"),
        }
    }

    #[test]
    fn test_mix_stream_eof_idle_wakes_on_seek() {
        let cancel = CancellationToken::new();
        let (state_tx, state_rx) = watch::channel(PlaybackState::default());
        state_tx.send_modify(|state| {
            state.seek_to = Some(1.25);
            state.seek_seq = 1;
        });

        match mix_stream_eof_idle_wait(&cancel, &state_rx, 0, 0, Duration::from_secs(1)) {
            Some(MixStreamIdleWake::Seek(time)) => {
                assert!((time - 1.25).abs() < f64::EPSILON);
            }
            _ => panic!("expected seek wake"),
        }
    }

    #[test]
    fn test_send_mixdown_update_ack_consumes_sender_without_config() {
        let (tx, mut rx) = oneshot::channel();
        let ack = std::sync::Arc::new(Mutex::new(Some(tx)));

        send_mixdown_update_ack(Some(ack.clone()), Vec::new());

        assert!(ack.lock().unwrap().is_none());
        assert_eq!(rx.try_recv().unwrap(), Vec::<String>::new());
    }
}
