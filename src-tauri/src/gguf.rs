use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Minimal GGUF metadata reader used for mmproj compatibility checks.
#[derive(Debug, Default)]
pub struct GgufInfo {
    pub architecture: Option<String>,
    pub embedding_length: Option<u64>,
    pub vision_projection_dim: Option<u64>,
}

pub fn read_gguf_info(path: &Path) -> Result<GgufInfo, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open {}: {e}", path.display()))?;
    let mut magic = [0u8; 4];
    file.read_exact(&mut magic)
        .map_err(|e| format!("Failed to read GGUF magic: {e}"))?;
    if &magic != b"GGUF" {
        return Err(format!("{} is not a GGUF file", path.display()));
    }

    let version = read_u32(&mut file)?;
    if !(2..=3).contains(&version) {
        return Err(format!("Unsupported GGUF version {version} in {}", path.display()));
    }

    let _tensor_count = read_u64(&mut file)?;
    let kv_count = read_u64(&mut file)?;

    let mut info = GgufInfo::default();
    for _ in 0..kv_count {
        let key = read_string(&mut file)?;
        let value_type = read_u32(&mut file)?;
        let value = read_value(&mut file, value_type)?;

        match key.as_str() {
            "general.architecture" => {
                if let GgufValue::String(arch) = value {
                    info.architecture = Some(arch);
                }
            }
            "clip.vision.projection_dim" => {
                if let Some(n) = value.as_u64() {
                    info.vision_projection_dim = Some(n);
                }
            }
            other => {
                if other.ends_with(".embedding_length") {
                    if let Some(n) = value.as_u64() {
                        // Prefer architecture-specific embedding length over clip.*.
                        if other.starts_with("clip.") {
                            let _ = info.embedding_length.get_or_insert(n);
                        } else {
                            info.embedding_length = Some(n);
                        }
                    }
                }
            }
        }
    }

    Ok(info)
}

/// Compare text-model embedding length with mmproj projection dim when both exist.
pub fn mmproj_compatible(model: &GgufInfo, mmproj: &GgufInfo) -> Result<(), String> {
    let Some(model_embd) = model.embedding_length else {
        return Ok(());
    };
    let mmproj_embd = mmproj
        .vision_projection_dim
        .or(mmproj.embedding_length);
    let Some(mmproj_embd) = mmproj_embd else {
        return Ok(());
    };

    if model_embd == mmproj_embd {
        return Ok(());
    }

    Err(format!(
        "Vision projector does not match this model (text n_embd={model_embd}, mmproj n_embd={mmproj_embd}). \
Unsloth Gemma packs all use mmproj-F16.gguf — download the projector from the same Hugging Face repo as the model \
(for example gemma-4-E4B-it-GGUF, not the 12B repo). Re-download with auto-mmproj enabled so files are saved with distinct names."
    ))
}

#[derive(Debug)]
enum GgufValue {
    String(String),
    U64(u64),
    Other,
}

impl GgufValue {
    fn as_u64(&self) -> Option<u64> {
        match self {
            GgufValue::U64(v) => Some(*v),
            _ => None,
        }
    }
}

fn read_u32(file: &mut File) -> Result<u32, String> {
    let mut buf = [0u8; 4];
    file.read_exact(&mut buf)
        .map_err(|e| format!("Failed to read u32 from GGUF: {e}"))?;
    Ok(u32::from_le_bytes(buf))
}

fn read_u64(file: &mut File) -> Result<u64, String> {
    let mut buf = [0u8; 8];
    file.read_exact(&mut buf)
        .map_err(|e| format!("Failed to read u64 from GGUF: {e}"))?;
    Ok(u64::from_le_bytes(buf))
}

fn read_i32(file: &mut File) -> Result<i32, String> {
    Ok(read_u32(file)? as i32)
}

fn read_i64(file: &mut File) -> Result<i64, String> {
    Ok(read_u64(file)? as i64)
}

fn read_f32(file: &mut File) -> Result<f32, String> {
    let mut buf = [0u8; 4];
    file.read_exact(&mut buf)
        .map_err(|e| format!("Failed to read f32 from GGUF: {e}"))?;
    Ok(f32::from_le_bytes(buf))
}

fn read_f64(file: &mut File) -> Result<f64, String> {
    let mut buf = [0u8; 8];
    file.read_exact(&mut buf)
        .map_err(|e| format!("Failed to read f64 from GGUF: {e}"))?;
    Ok(f64::from_le_bytes(buf))
}

fn read_bool(file: &mut File) -> Result<bool, String> {
    let mut buf = [0u8; 1];
    file.read_exact(&mut buf)
        .map_err(|e| format!("Failed to read bool from GGUF: {e}"))?;
    Ok(buf[0] != 0)
}

fn read_string(file: &mut File) -> Result<String, String> {
    let len = read_u64(file)? as usize;
    // Keys/values in GGUF metadata are tiny; a huge length means the stream is misaligned.
    if len > 1024 * 1024 {
        return Err(format!("GGUF string length too large ({len})"));
    }
    let mut buf = vec![0u8; len];
    if len > 0 {
        file.read_exact(&mut buf)
            .map_err(|e| format!("Failed to read GGUF string: {e}"))?;
    }
    String::from_utf8(buf).map_err(|e| format!("Invalid UTF-8 in GGUF string: {e}"))
}

fn skip_bytes(file: &mut File, count: u64) -> Result<(), String> {
    if count > isize::MAX as u64 {
        return Err(format!("GGUF skip length too large ({count})"));
    }
    file.seek(SeekFrom::Current(count as i64))
        .map_err(|e| format!("Failed to skip GGUF bytes: {e}"))?;
    Ok(())
}

fn value_type_size(value_type: u32) -> Option<u64> {
    match value_type {
        0 => Some(1),  // UINT8
        1 => Some(1),  // INT8
        2 => Some(2),  // UINT16
        3 => Some(2),  // INT16
        4 => Some(4),  // UINT32
        5 => Some(4),  // INT32
        6 => Some(4),  // FLOAT32
        7 => Some(1),  // BOOL
        10 => Some(8), // UINT64
        11 => Some(8), // INT64
        12 => Some(8), // FLOAT64
        _ => None,     // STRING / ARRAY need special handling
    }
}

fn read_value(file: &mut File, value_type: u32) -> Result<GgufValue, String> {
    match value_type {
        0 => {
            let mut buf = [0u8; 1];
            file.read_exact(&mut buf).map_err(|e| e.to_string())?;
            Ok(GgufValue::U64(u64::from(buf[0])))
        }
        1 => {
            let mut buf = [0u8; 1];
            file.read_exact(&mut buf).map_err(|e| e.to_string())?;
            Ok(GgufValue::U64(i8::from_le_bytes(buf) as u64))
        }
        2 => {
            let mut buf = [0u8; 2];
            file.read_exact(&mut buf).map_err(|e| e.to_string())?;
            Ok(GgufValue::U64(u64::from(u16::from_le_bytes(buf))))
        }
        3 => {
            let mut buf = [0u8; 2];
            file.read_exact(&mut buf).map_err(|e| e.to_string())?;
            Ok(GgufValue::U64(i16::from_le_bytes(buf) as u64))
        }
        4 => Ok(GgufValue::U64(u64::from(read_u32(file)?))),
        5 => Ok(GgufValue::U64(read_i32(file)? as u64)),
        6 => {
            let _ = read_f32(file)?;
            Ok(GgufValue::Other)
        }
        7 => {
            let _ = read_bool(file)?;
            Ok(GgufValue::Other)
        }
        8 => Ok(GgufValue::String(read_string(file)?)),
        // GGUF_TYPE_ARRAY = 9
        9 => {
            let elem_type = read_u32(file)?;
            let count = read_u64(file)?;
            if count > 10_000_000 {
                return Err(format!("GGUF array count too large ({count})"));
            }
            if elem_type == 8 {
                for _ in 0..count {
                    let _ = read_string(file)?;
                }
            } else if let Some(size) = value_type_size(elem_type) {
                skip_bytes(file, size.saturating_mul(count))?;
            } else {
                return Err(format!("Unsupported GGUF array element type {elem_type}"));
            }
            Ok(GgufValue::Other)
        }
        10 => Ok(GgufValue::U64(read_u64(file)?)),
        11 => Ok(GgufValue::U64(read_i64(file)? as u64)),
        12 => {
            let _ = read_f64(file)?;
            Ok(GgufValue::Other)
        }
        other => Err(format!("Unsupported GGUF value type {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_mmproj_mismatch() {
        let model = GgufInfo {
            architecture: Some("gemma4".into()),
            embedding_length: Some(2560),
            vision_projection_dim: None,
        };
        let mmproj = GgufInfo {
            architecture: Some("clip".into()),
            embedding_length: Some(1152),
            vision_projection_dim: Some(3840),
        };
        let err = mmproj_compatible(&model, &mmproj).unwrap_err();
        assert!(err.contains("2560"));
        assert!(err.contains("3840"));
    }

    #[test]
    fn accepts_matching_dims() {
        let model = GgufInfo {
            architecture: None,
            embedding_length: Some(2560),
            vision_projection_dim: None,
        };
        let mmproj = GgufInfo {
            architecture: None,
            embedding_length: None,
            vision_projection_dim: Some(2560),
        };
        assert!(mmproj_compatible(&model, &mmproj).is_ok());
    }
}
