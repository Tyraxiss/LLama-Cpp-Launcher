use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

fn http_status_code(response: &str) -> Option<u16> {
    let mut parts = response.lines().next()?.split_whitespace();
    parts.next()?;
    parts.next()?.parse().ok()
}

fn http_status_ok(response: &str) -> bool {
    matches!(
        http_status_code(response),
        Some(200 | 204 | 301 | 302 | 303 | 307 | 308)
    )
}

fn probe_http_response(host: &str, port: u16, path: &str) -> Result<String, String> {
    // 0.0.0.0 is a bind address, not a connectable destination. Probe its local listener.
    let probe_host = if host == "0.0.0.0" { "127.0.0.1" } else { host };
    let socket_addr = (probe_host, port)
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
    Ok(response)
}

fn probe_http(host: &str, port: u16, path: &str) -> Result<String, String> {
    let response = probe_http_response(host, port, path)?;
    if http_status_ok(&response) {
        Ok(response)
    } else {
        Err("not healthy".into())
    }
}

/// Match llama.cpp's documented /health payload rather than treating any HTTP
/// success from a different service on the configured port as llama-server.
fn llama_health_status(response: &str) -> Option<&'static str> {
    let status_code = http_status_code(response)?;
    let (_, body) = response.split_once("\r\n\r\n")?;
    let payload: serde_json::Value = serde_json::from_str(body).ok()?;

    if status_code == 200 && payload.get("status")?.as_str()? == "ok" {
        return Some("healthy");
    }

    let error = payload.get("error")?;
    let is_loading = status_code == 503
        && error.get("code")?.as_u64() == Some(503)
        && error.get("type")?.as_str()? == "unavailable_error"
        && error
            .get("message")?
            .as_str()?
            .eq_ignore_ascii_case("loading model");
    is_loading.then_some("running")
}

#[tauri::command]
pub async fn check_open_webui_health(host: String, port: u16) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        probe_http(&host, port, "/").map(|_| "running".into())
    })
    .await
    .map_err(|error| format!("Health check failed: {error}"))?
}

#[tauri::command]
pub async fn check_server_health(host: String, port: u16) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        for path in ["/health", "/v1/health"] {
            if let Ok(response) = probe_http_response(&host, port, path) {
                if let Some(status) = llama_health_status(&response) {
                    return Ok(status.to_string());
                }
            }
        }
        // Do not infer a llama-server from a generic HTTP response on its port.
        Err("No llama-server health response found".into())
    })
    .await
    .map_err(|error| format!("Health check failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{http_status_ok, llama_health_status};

    #[test]
    fn accepts_success_status_lines() {
        assert!(http_status_ok("HTTP/1.1 200 OK\r\n"));
        assert!(http_status_ok("HTTP/1.0 302 Found\r\n"));
        assert!(!http_status_ok("HTTP/1.1 500 Internal Server Error\r\n"));
        assert!(!http_status_ok("Garbage containing 200 without status"));
    }

    #[test]
    fn llama_health_requires_a_recognized_health_payload() {
        assert_eq!(
            llama_health_status(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"ok\"}"
            ),
            Some("healthy")
        );
        assert_eq!(
            llama_health_status(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html>OK</html>"
            ),
            None
        );
        assert_eq!(
            llama_health_status(
                "HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\n\r\n{\"error\":{\"code\":503,\"message\":\"Loading model\",\"type\":\"unavailable_error\"}}"
            ),
            Some("running")
        );
        assert_eq!(
            llama_health_status(
                "HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\n\r\n{\"error\":{\"code\":503,\"message\":\"Unavailable\",\"type\":\"unavailable_error\"}}"
            ),
            None
        );
    }
}
