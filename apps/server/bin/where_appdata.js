const {appdata_root, in_appdata} = require("@pi-tray/paths");

const subdir = process.argv[2];
if (!subdir) {
    console.log(appdata_root);
    return;
}

console.log(in_appdata(subdir));
