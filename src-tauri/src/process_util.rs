use std::path::Path;
use std::process::{Command, Output};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn hidden_command<P: AsRef<Path>>(program: P) -> Command {
    let mut command = Command::new(program.as_ref());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

pub fn run_hidden_command_in<P: AsRef<Path>>(
    program: P,
    args: &[&str],
    working_dir: &Path,
) -> Result<Output, String> {
    let program_path = program.as_ref().to_path_buf();
    hidden_command(&program_path)
        .args(args)
        .current_dir(working_dir)
        .output()
        .map_err(|error| format!("Failed to run {}: {error}", program_path.display()))
}
