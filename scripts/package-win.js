const path = require("node:path");
const { packager } = require("@electron/packager");

const root = path.join(__dirname, "..");

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
}).then((appPaths) => {
  for (const appPath of appPaths) console.log(`Wrote app to: ${appPath}`);
}).catch((error) => {
  console.error("Could not package TransWords:", error);
  process.exitCode = 1;
});
