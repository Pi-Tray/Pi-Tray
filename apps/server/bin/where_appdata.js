const path = require("path");

// thanks https://stackoverflow.com/a/26227660/19678893
const appdata_root = process.env.APPDATA || (process.platform === "darwin" ? process.env.HOME + "/Library/Application Support" : process.env.HOME + "/.config");

// returns the path relative to the appdata root directory
const appdata = (in_path) => {
    return path.join(appdata_root, in_path);
}

const subdir = process.argv[2];
if (!subdir) {
    console.log(appdata_root);
    return;
}

console.log(appdata(subdir));
