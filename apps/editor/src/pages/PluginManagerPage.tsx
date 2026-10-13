import {useState} from "react";

import {install_package} from "../util/plugins";
import {PluginTable} from "../components/PluginTable.tsx";

export const PluginManagerPage = () => {
    const [pkg_name_input, setPkgNameInput] = useState("");
    const [installing, setInstalling] = useState(false);

    return (
        <>
            <h1 className="text-2xl font-bold">Manage plugins</h1>

            <h2 className="text-lg font-semibold mt-8">Install a plugin package</h2>
            <p className="text-xs opacity-60">Tip: use the <i>Express Install</i> button online to automatically open the editor and install the package!</p>

            <div className="flex gap-2 mt-4 mb-10">
                <input type="text" disabled={installing} value={pkg_name_input} onChange={(e) => setPkgNameInput(e.target.value)} placeholder="Package name or git URL" className="border p-2 rounded w-full" />
                <button className="btn btn-primary" disabled={installing} onClick={async () => {
                    // TODO: make this proper and secure, this is just a test

                    if (pkg_name_input.trim() === "") {
                        alert("Please enter a package name or git URL.");
                        return;
                    }

                    if (!confirm("This is a test, and if you don't know what this is, you should cancel now.")) {
                        return;
                    }

                    setInstalling(true);

                    try {
                        await install_package(pkg_name_input.trim());
                        alert("Package installed successfully.");
                    } catch (error) {
                        console.error("Error installing package:", error);
                        alert("Failed to install package. Check the console for details.");
                    }

                    setInstalling(false);
                }}>
                    {installing ? "..." : "Install"}
                </button>
            </div>

            <PluginTable />
        </>
    );
}
