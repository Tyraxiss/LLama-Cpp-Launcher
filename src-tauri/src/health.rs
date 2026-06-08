use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

#[tauri::command]
pub fn check_open_webui_health(host: String, port: u16) -> Result<String, String> {
    let socket_addr = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|_| "Invalid address".to_string())?
        .next()
        .ok_or_else(|| "Invalid address".to_string())?;

    match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(2)) {
        Ok(mut stream) => {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            let request = format!(
                "GET / HTTP/1.0\r\nHost: {}:{}\r\nConnection: close\r\n\r\n",
                host, port
            );
            let _ = stream.write_all(request.as_bytes());
            let mut response = String::new();
            let _ = stream.read_to_string(&mut response);
            if response.contains("200") || response.contains("HTTP/") {
                Ok("running".into())
            } else {
                Err("not reachable".into())
            }
        }
        Err(_) => Err("not reachable".into()),
    }
}

#[tauri::command]
pub fn check_server_health(host: String, port: u16) -> Result<String, String> {
    let addr = format!("{}:{}", host, port);
    let socket_addr = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|_| "Invalid address".to_string())?
        .next()
        .ok_or_else(|| "Invalid address".to_string())?;

    match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(2)) {
        Ok(mut stream) => {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            let request = format!(
                "GET /health HTTP/1.0\r\nHost: {}\r\nConnection: close\r\n\r\n",
                addr
            );
            let _ = stream.write_all(request.as_bytes());
            let mut response = String::new();
            let _ = stream.read_to_string(&mut response);
            if response.contains("ok") || response.contains("200") {
                Ok("healthy".into())
            } else {
                Ok("running".into())
            }
        }
        Err(_) => Err("not reachable".into()),
    }
}
