import path from "path";

// kept free of side effects, so logging can find the data directory before anything else loads

// thanks https://stackoverflow.com/a/26227660/19678893
const appdata_root = process.env.APPDATA || (process.platform === "darwin" ? process.env.HOME + "/Library/Application Support" : process.env.HOME + "/.config");

export const data_dir = path.join(appdata_root, "pi-tray");

export const in_data_dir = (in_path: string): string => {
    return path.join(data_dir, in_path);
}
