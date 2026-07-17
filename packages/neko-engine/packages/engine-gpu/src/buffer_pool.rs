//! Buffer pool for efficient GPU memory management

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use wgpu::{Buffer, BufferUsages, Device};

/// A pooled buffer that returns to the pool when dropped
pub struct PooledBuffer {
    buffer: Option<Buffer>,
    pool: Arc<Mutex<BufferPoolInner>>,
    size: u64,
}

impl PooledBuffer {
    /// Get reference to the underlying buffer
    pub fn buffer(&self) -> &Buffer {
        self.buffer.as_ref().unwrap()
    }

    /// Get buffer size
    #[allow(dead_code)]
    pub fn size(&self) -> u64 {
        self.size
    }
}

impl Drop for PooledBuffer {
    fn drop(&mut self) {
        if let Some(buffer) = self.buffer.take() {
            if let Ok(mut pool) = self.pool.lock() {
                pool.return_buffer(buffer, self.size);
            }
        }
    }
}

/// Inner pool state
struct BufferPoolInner {
    available: VecDeque<(Buffer, u64)>,
    max_buffers: usize,
}

impl BufferPoolInner {
    fn return_buffer(&mut self, buffer: Buffer, size: u64) {
        if self.available.len() < self.max_buffers {
            self.available.push_back((buffer, size));
        }
        // If pool is full, buffer is dropped
    }
}

/// Buffer pool for reusing GPU buffers
pub struct BufferPool {
    device: Arc<Device>,
    inner: Arc<Mutex<BufferPoolInner>>,
    usage: BufferUsages,
}

impl BufferPool {
    /// Create a new buffer pool
    pub fn new(device: Arc<Device>, usage: BufferUsages, max_buffers: usize) -> Self {
        Self {
            device,
            inner: Arc::new(Mutex::new(BufferPoolInner {
                available: VecDeque::with_capacity(max_buffers),
                max_buffers,
            })),
            usage,
        }
    }

    /// Acquire a buffer of at least the given size
    pub fn acquire(&self, min_size: u64) -> PooledBuffer {
        // Try to find a suitable buffer in the pool
        {
            let mut inner = self.inner.lock().unwrap();

            let mut found_idx = None;
            for (idx, (_, size)) in inner.available.iter().enumerate() {
                if *size >= min_size {
                    found_idx = Some(idx);
                    break;
                }
            }

            if let Some(idx) = found_idx {
                let (buffer, size) = inner.available.remove(idx).unwrap();
                return PooledBuffer {
                    buffer: Some(buffer),
                    pool: self.inner.clone(),
                    size,
                };
            }
        }

        // No suitable buffer found, create a new one
        // Note: MAP_READ can only be combined with COPY_DST
        //       MAP_WRITE can only be combined with COPY_SRC
        let final_usage = if self.usage.contains(BufferUsages::MAP_READ) {
            // MAP_READ buffers can only have COPY_DST, not COPY_SRC
            self.usage | BufferUsages::COPY_DST
        } else if self.usage.contains(BufferUsages::MAP_WRITE) {
            // MAP_WRITE buffers can only have COPY_SRC, not COPY_DST
            self.usage | BufferUsages::COPY_SRC
        } else {
            // Non-mapped buffers can have both
            self.usage | BufferUsages::COPY_DST | BufferUsages::COPY_SRC
        };

        let new_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Pooled Buffer"),
            size: min_size,
            usage: final_usage,
            mapped_at_creation: false,
        });

        PooledBuffer {
            buffer: Some(new_buffer),
            pool: self.inner.clone(),
            size: min_size,
        }
    }
}

#[cfg(test)]
mod tests {
    // Buffer pool tests would require GPU context
    // Skipped in unit tests, covered in integration tests
}
