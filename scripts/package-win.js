const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { packager } = require("@electron/packager");

const root = path.join(__dirname, "..");

function zipAppFolder(appPath) {
  const zipPath = path.join(path.dirname(appPath), "TransWords-win32-x64.zip");
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  const stage = path.join(path.dirname(appPath), "_zipstage");
  if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  fs.cpSync(appPath, path.join(stage, path.basename(appPath)), {
    recursive: true,
    filter: (src) => {
      const name = path.basename(src);
      return !/[^\x00-\x7f]/.test(name);
    },
  });
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${path.join(stage, "*")}' -DestinationPath '${zipPath}' -Force`,
    ],
    { stdio: "inherit" }
  );
  fs.rmSync(stage, { recursive: true, force: true });
  console.log(`Wrote zip to: ${zipPath}`);
}

packager({
  dir: root,
  name: "TransWords",
  platform: "win32",
  arch: "x64",
  out: path.join(root, "dist"),
  overwrite: true,
  asar: true,
  icon: path.join(root, "media", "applogo.ico"),
  ignore: /[^\x00-\x7f]/
})
  .then((appPaths) => {
    for (const appPath of appPaths) {
      console.log(`Wrote app to: ${appPath}`);
      zipAppFolder(appPath);
    }
  })
  .catch((error) => {
    console.error("Could not package TransWords:", error);
    process.exitCode = 1;
  });
