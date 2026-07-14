use std::sync::{Mutex, OnceLock};

use nvml_wrapper::enums::device::UsedGpuMemory;
use regex::Regex;
use sysinfo::{MemoryRefreshKind, Pid, ProcessRefreshKind, RefreshKind, System};
use tauri::State;

use crate::bindings::{
    GpuMemoryStats, ModelMemoryBreakdown, ProcessMemoryStats, ResourceStats, SystemMemoryStats,
};
use crate::state::AppState;

fn device_breakdown_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"llama_memory_breakdown_print:\s*\|\s*-\s*(.+?)\s*\|\s*(\d+)\s*=\s*(\d+)\s*\+\s*\(\s*(\d+)\s*=\s*(\d+)\s*\+\s*(\d+)\s*\+\s*(\d+)\s*\)",
        )
        .expect("valid device breakdown regex")
    })
}

fn host_breakdown_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"llama_memory_breakdown_print:\s*\|\s*-\s*Host\s*\|\s*(\d+)\s*=\s*(\d+)\s*\+\s*(\d+)\s*\+\s*(\d+)",
        )
        .expect("valid host breakdown regex")
    })
}

#[tauri::command]
pub async fn get_resource_stats(state: State<'_, AppState>) -> Result<ResourceStats, String> {
    let server_pid = *state.server_pid.lock().map_err(|e| e.to_string())?;
    let log = state.stderr_log.lock().map_err(|e| e.to_string())?.clone();

    tauri::async_runtime::spawn_blocking(move || collect_resource_stats(server_pid, &log))
        .await
        .map_err(|e| format!("Resource stats failed: {e}"))
}

pub fn collect_resource_stats(server_pid: Option<u32>, stderr_log: &[String]) -> ResourceStats {
    let system = read_system_memory();
    let (gpus, gpu_available) = read_gpu_memory();
    let server_process = server_pid.and_then(|pid| read_process_memory(pid, gpus.is_empty()));
    let model_breakdown = parse_model_memory_breakdown(stderr_log);

    ResourceStats {
        system,
        gpus,
        server_process,
        model_breakdown,
        gpu_available,
    }
}

fn read_system_memory() -> SystemMemoryStats {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing().with_memory(MemoryRefreshKind::everything()),
    );
    sys.refresh_memory();

    SystemMemoryStats {
        total_bytes: sys.total_memory(),
        used_bytes: sys.used_memory(),
        available_bytes: sys.available_memory(),
    }
}

fn read_gpu_memory() -> (Vec<GpuMemoryStats>, bool) {
    let nvml = match nvml_wrapper::Nvml::init() {
        Ok(nvml) => nvml,
        Err(_) => return (Vec::new(), false),
    };

    let count = match nvml.device_count() {
        Ok(count) => count,
        Err(_) => return (Vec::new(), false),
    };

    let mut gpus = Vec::with_capacity(count as usize);
    for index in 0..count {
        let Ok(device) = nvml.device_by_index(index) else {
            continue;
        };
        let Ok(info) = device.memory_info() else {
            continue;
        };
        let name = device.name().unwrap_or_else(|_| format!("GPU {index}"));

        gpus.push(GpuMemoryStats {
            index,
            name,
            total_bytes: info.total,
            used_bytes: info.used,
            free_bytes: info.free,
        });
    }

    let gpu_available = !gpus.is_empty();
    (gpus, gpu_available)
}

fn read_process_memory(pid: u32, skip_gpu: bool) -> Option<ProcessMemoryStats> {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing().with_processes(ProcessRefreshKind::nothing().with_memory()),
    );
    let pid = Pid::from_u32(pid);
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);

    let process = sys.process(pid)?;
    let ram_bytes = process.memory();

    let gpu_bytes = if skip_gpu {
        None
    } else {
        read_process_gpu_memory(pid.as_u32())
    };

    Some(ProcessMemoryStats {
        pid: pid.as_u32(),
        ram_bytes,
        gpu_bytes,
    })
}

fn read_process_gpu_memory(pid: u32) -> Option<u64> {
    let nvml = nvml_wrapper::Nvml::init().ok()?;
    let count = nvml.device_count().ok()?;
    let mut total = 0u64;

    for index in 0..count {
        let device = nvml.device_by_index(index).ok()?;
        if let Ok(procs) = device.running_compute_processes() {
            for proc in procs {
                if proc.pid == pid {
                    if let UsedGpuMemory::Used(bytes) = proc.used_gpu_memory {
                        total += bytes;
                    }
                }
            }
        }
        if let Ok(procs) = device.running_graphics_processes() {
            for proc in procs {
                if proc.pid == pid {
                    if let UsedGpuMemory::Used(bytes) = proc.used_gpu_memory {
                        total += bytes;
                    }
                }
            }
        }
    }

    if total > 0 {
        Some(total)
    } else {
        None
    }
}

pub fn parse_model_memory_breakdown(stderr_log: &[String]) -> Vec<ModelMemoryBreakdown> {
    let device_re = device_breakdown_re();
    let host_re = host_breakdown_re();

    let mut breakdowns = Vec::new();
    // Only scan the newest part of the log; full clones are already bounded to ~200 lines.
    let start = stderr_log.len().saturating_sub(80);
    for line in &stderr_log[start..] {
        if let Some(caps) = device_re.captures(line) {
            breakdowns.push(ModelMemoryBreakdown {
                device: caps[1].trim().to_string(),
                total_mib: caps[2].parse().unwrap_or(0.0),
                free_mib: caps[3].parse().unwrap_or(0.0),
                self_mib: caps[4].parse().unwrap_or(0.0),
                model_mib: caps[5].parse().unwrap_or(0.0),
                context_mib: caps[6].parse().unwrap_or(0.0),
                compute_mib: caps[7].parse().unwrap_or(0.0),
            });
            continue;
        }

        if let Some(caps) = host_re.captures(line) {
            breakdowns.push(ModelMemoryBreakdown {
                device: "Host (RAM)".to_string(),
                total_mib: 0.0,
                free_mib: 0.0,
                self_mib: caps[1].parse().unwrap_or(0.0),
                model_mib: caps[2].parse().unwrap_or(0.0),
                context_mib: caps[3].parse().unwrap_or(0.0),
                compute_mib: caps[4].parse().unwrap_or(0.0),
            });
        }
    }

    breakdowns
}

pub fn set_server_pid(state: &Mutex<Option<u32>>, pid: Option<u32>) {
    if let Ok(mut lock) = state.lock() {
        *lock = pid;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_cuda_memory_breakdown_line() {
        let log = vec![
            "llama_memory_breakdown_print: | memory breakdown [MiB] | total   free     self   model   context   compute    unaccounted |".into(),
            "llama_memory_breakdown_print: |   - CUDA0 (GTX 1080 Ti) | 11165 = 8702 + (10001 =  9814 +     134 +      51) + 999 |".into(),
        ];

        let parsed = parse_model_memory_breakdown(&log);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].device, "CUDA0 (GTX 1080 Ti)");
        assert_eq!(parsed[0].total_mib, 11165.0);
        assert_eq!(parsed[0].free_mib, 8702.0);
        assert_eq!(parsed[0].self_mib, 10001.0);
        assert_eq!(parsed[0].model_mib, 9814.0);
        assert_eq!(parsed[0].context_mib, 134.0);
        assert_eq!(parsed[0].compute_mib, 51.0);
    }

    #[test]
    fn parse_host_memory_breakdown_line() {
        let log = vec![
            "llama_memory_breakdown_print: |   - Host                |                   197 =   166 +       0 +      30                   |".into(),
        ];

        let parsed = parse_model_memory_breakdown(&log);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].device, "Host (RAM)");
        assert_eq!(parsed[0].self_mib, 197.0);
        assert_eq!(parsed[0].model_mib, 166.0);
    }
}
