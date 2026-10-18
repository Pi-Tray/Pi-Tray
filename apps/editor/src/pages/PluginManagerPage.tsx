import {useState} from "react";

import {confirm_and_install} from "../util/install_flow";
import {PluginTable} from "../components/PluginTable";
import {parse_spec} from "@pi-tray/package-spec";

export const PluginManagerPage = () => {
    const [pkg_name_input, setPkgNameInput] = useState("");
    const [installing, setInstalling] = useState(false);

    const spec_check = pkg_name_input.trim() ? parse_spec(pkg_name_input) : null;

    return (
        <>
            <h1 className="text-2xl font-bold">Manage plugins</h1>

            <h2 className="text-lg font-semibold mt-8">Install a plugin package</h2>
            <p className="text-xs opacity-60">Tip: use the <i>Express Install</i> button online to automatically open the editor and install the package!</p>

            <div className="flex gap-2 mt-4 mb-10">
                <input type="text" disabled={installing} value={pkg_name_input} onChange={(e) => setPkgNameInput(e.target.value)} placeholder="owner/repo, a link, or a path to a .tgz" className="border p-2 rounded w-full" />
                <button className="btn btn-primary" disabled={installing} onClick={async () => {
                    const spec = pkg_name_input.trim();
                    const parsed = parse_spec(spec);

                    if (!parsed.ok) {
                        alert(parsed.error);
                        return;
                    }

                    setInstalling(true);

                    try {
                        if (await confirm_and_install(spec)) {
                            alert("Package installed.");
                        }
                    } catch (error) {
                        alert(`Couldn't install the package: ${error instanceof Error ? error.message : String(error)}`);
                    }

                    setInstalling(false);
                }}>
                    {installing ? "..." : "Install"}
                </button>
            </div>
            {spec_check && !spec_check.ok && <p className="text-xs text-warning -mt-8 mb-10">{spec_check.error}</p>}

            <PluginTable />
        </>
    );
}
