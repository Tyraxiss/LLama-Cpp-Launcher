use tauri_plugin_dialog::DialogExt;

fn redact_diagnostic_json(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(object) => {
            object.retain(|key, _| {
                !key.to_ascii_lowercase()
                    .replace(['-', '_'], "")
                    .contains("token")
                    && !["secret", "password", "credential", "apikey"]
                        .iter()
                        .any(|sensitive| {
                            key.to_ascii_lowercase()
                                .replace(['-', '_'], "")
                                .contains(sensitive)
                        })
            });
            for (key, value) in object.iter_mut() {
                if key.to_ascii_lowercase().contains("path")
                    || key.to_ascii_lowercase().contains("directory")
                {
                    *value = serde_json::Value::String("<path>".into());
                } else {
                    redact_diagnostic_json(value);
                }
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                redact_diagnostic_json(value);
            }
        }
        serde_json::Value::String(text) => {
            let redacted = text
                .split('\n')
                .map(redact_diagnostic_line)
                .collect::<Vec<_>>()
                .join("\n");
            *text = redacted;
        }
        _ => {}
    }
}

fn redact_diagnostic_line(line: &str) -> String {
    let mut redacted = line.to_string();
    let lower = redacted.to_ascii_lowercase();
    for marker in [
        "authorization: bearer ",
        "authorization=bearer ",
        "authorization:",
        "authorization=",
        "bearer ",
        "hf_token=",
        "token=",
        "token:",
    ] {
        if let Some(index) = lower.find(marker) {
            let value_start = index + marker.len();
            let value_end = redacted[value_start..]
                .find([' ', ',', ';', '\"', '\''])
                .map(|offset| value_start + offset)
                .unwrap_or(redacted.len());
            redacted.replace_range(value_start..value_end, "<redacted>");
            break;
        }
    }
    if let Some(index) = redacted.char_indices().find_map(|(index, character)| {
        (character.is_ascii_alphabetic()
            && redacted.as_bytes().get(index + 1) == Some(&b':')
            && redacted.as_bytes().get(index + 2) == Some(&92))
        .then_some(index)
    }) {
        redacted.truncate(index);
        redacted.push_str("<path>");
        return redacted;
    }
    for root in ["/Users/", "/home/", "/root/", "/Volumes/", "/mnt/", "/tmp/"] {
        if let Some(index) = redacted.find(root) {
            redacted.truncate(index);
            redacted.push_str("<path>");
            return redacted;
        }
    }
    redacted
}

#[cfg(test)]
mod tests {
    use super::redact_diagnostic_json;
    use serde_json::json;

    #[test]
    fn diagnostics_redaction_removes_secret_fields_and_paths() {
        let mut value = json!({
            "token": "secret",
            "hardware": { "model_path": "C:\\\\Users\\\\Alice\\\\model.gguf" },
            "logs": ["Loaded C:\\\\Users\\\\Alice\\\\model.gguf", "Authorization: Bearer abc"]
        });
        redact_diagnostic_json(&mut value);
        assert!(value.get("token").is_none());
        assert_eq!(value["hardware"]["model_path"], "<path>");
        assert!(!value.to_string().contains("Alice"));
        assert!(!value.to_string().contains("abc"));
    }
}

#[tauri::command]
pub async fn save_diagnostics(app: tauri::AppHandle, contents: String) -> Result<bool, String> {
    if contents.len() > 1024 * 1024 {
        return Err("Diagnostics export exceeds the 1 MiB size limit.".into());
    }

    let app_handle = app.clone();
    let path = tauri::async_runtime::spawn_blocking(move || {
        app_handle
            .dialog()
            .file()
            .set_title("Save redacted diagnostics")
            .set_file_name("llama-launcher-diagnostics.json")
            .add_filter("JSON", &["json"])
            .blocking_save_file()
    })
    .await
    .map_err(|error| format!("Diagnostics save dialog failed: {error}"))?;
    let Some(path) = path else {
        return Ok(false);
    };
    let path = path
        .into_path()
        .map_err(|error| format!("Invalid diagnostics export path: {error}"))?;
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return Err("Diagnostics export must use a .json file extension.".into());
    }
    let mut safe_contents = serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|error| format!("Invalid diagnostics JSON: {error}"))?;
    redact_diagnostic_json(&mut safe_contents);
    let contents = serde_json::to_vec_pretty(&safe_contents)
        .map_err(|error| format!("Failed to serialize diagnostics: {error}"))?;
    if contents.len() > 1024 * 1024 {
        return Err("Redacted diagnostics export exceeds the 1 MiB size limit.".into());
    }
    std::fs::write(&path, contents)
        .map_err(|error| format!("Failed to save diagnostics: {error}"))?;
    Ok(true)
}
