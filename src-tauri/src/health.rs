use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

fn http_status_ok(response: &str) -> bool {
    response
        .lines()
        .next()
        .map(|line| {
            let upper = line.trim().to_ascii_uppercase();
            if !upper.starts_with("HTTP/") {
                return false;
            }
            upper.contains(" 200 ")
                || upper.ends_with(" 200")
                || upper.contains(" 204 ")
                || upper.ends_with(" 204")
                || upper.contains(" 301 ")
                || upper.contains(" 302 ")
                || upper.contains(" 303 ")
                || upper.contains(" 307 ")
                || upper.contains(" 308 ")
        })
        .unwrap_or(false)
}

fn probe_http(host: &str, port: u16, path: &str) -> Result<String, String> {
    let socket_addr = (host, port)
        .to_socket_addrs()
        .map_err(|_| "Invalid address".to_string())?
        .next()
        .ok_or_else(|| "Invalid address".to_string())?;

    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_millis(800))
        .map_err(|_| "not reachable".to_string())?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));

    let request =
        format!("GET {path} HTTP/1.0\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .map_err(|_| "not reachable".to_string())?;

    let mut response = String::new();
    let mut buf = [0u8; 1024];
    if let Ok(n) = stream.read(&mut buf) {
        response.push_str(&String::from_utf8_lossy(&buf[..n]));
    }

    if http_status_ok(&response) {
        Ok(response)
    } else if response.to_ascii_uppercase().contains("HTTP/") {
        // Connected, but not a success/redirect — treat as unreachable for UI health.
        Err("not healthy".into())
    } else {
        Err("not reachable".into())
    }
}

#[tauri::command]
pub async fn check_open_webui_health(host: String, port: u16) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        probe_http(&host, port, "/").map(|_| "running".into())
    })
    .await
    .map_err(|e| format!("Health check failed: {e}"))?
}

#[tauri::command]
pub async fn check_server_health(host: String, port: u16) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match probe_http(&host, port, "/health") {
            Ok(body) => {
                if body.to_ascii_lowercase().contains("ok") || http_status_ok(&body) {
                    Ok("healthy".into())
                } else {
                    Ok("running".into())
                }
            }
            Err(_) => {
                // Fallback: some builds respond on root.
                probe_http(&host, port, "/")
                    .map(|_| "running".into())
                    .map_err(|_| "not reachable".into())
            }
        }
    })
    .await
    .map_err(|e| format!("Health check failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::http_status_ok;

    #[test]
    fn accepts_success_status_lines() {
        assert!(http_status_ok("HTTP/1.1 200 OK\r\n"));
        assert!(http_status_ok("HTTP/1.0 302 Found\r\n"));
        assert!(!http_status_ok("HTTP/1.1 500 Internal Server Error\r\n"));
        assert!(!http_status_ok("Garbage containing 200 without status"));
    }
}
