import "./App.css";

import {useEffect, useCallback} from "react";

import {useLocation} from "wouter";

import {WSProvider} from "./contexts/WSProvider";
import {useConfigValue} from "./util/config";

import {AnimatedRouter} from "./components/AnimatedRouter";
import {LeftNav} from "./components/LeftNav";
import {StatusToast} from "./components/StatusToast";

import {routes} from "./routes.tsx";
import {NotFound} from "./pages/NotFound";

import {onOpenUrl} from "@tauri-apps/plugin-deep-link";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {install_package} from "./util/plugins.ts";

/**
 * A wrapper component that conditionally renders the WebSocket provider based on the provided URL.<br>
 * If the URL is `null`, it will not render the provider and simply return the children.<br>
 * This signals to children components using `WSProvider` hooks that no URL has been configured by the user yet.
 * @param children the children to render inside the provider
 * @param url the WebSocket URL to connect to, or `null` if no URL is configured
 * @returns the wsprovider around the children if a url is provided, otherwise the children themselves
 */
const ConditionalWSProvider = ({children, url}: { children: React.ReactNode, url: string | null }) => {
    if (url === null) {
        // if no WS_URL is provided, don't render the provider
        return <>{children}</>;
    }

    // use key to prevent leftover state from previous connections
    // TODO: make the state in WSProvider stable so this isn't needed as this causes a full rerender of the page
    return (
        <WSProvider url={url} key={`ws-provider-${url}`}>
            {children}
        </WSProvider>
    );
}

const App = () => {
    const [_location, navigate] = useLocation();
    const [ws_url] = useConfigValue("ws_url");

    const handle_deep_link = useCallback(
        async (url_str: string) => {
            console.log("Handling deep link:", url_str);

            // bring window to the front
            await getCurrentWindow().setFocus();

            const url = new URL(url_str);

            // command is first part of path (which is actually treated as the host)
            const command = url.hostname;

            // arguments are split path segments
            const fragments = url.pathname.split("/").filter(Boolean);

            console.log(`Command: ${command}, Fragments: ${fragments}`);

            switch (command) {
                case "page":
                    // navigate to the page specified in the deep link
                    const page = fragments.join("");
                    console.log(`Navigating to page: ${page}`);
                    navigate(`/${page}`);
                    break;
                case "express":
                    // lookup the plugin name from the express install list
                    // if its not present, dont attempt to install it for security reasons
                    // other plugins should be installed through the plugin manager instead to make it more intentional

                    const name = fragments.join("/");
                    const express_list = await fetch("https://raw.githubusercontent.com/Pi-Tray/express-list/refs/heads/main/express.json");

                    if (!express_list.ok) {
                        console.error("Failed to fetch express list:", express_list.statusText);
                        return;
                    }

                    const express_data = await express_list.json();
                    if (!express_data[name]) {
                        console.error(`Plugin "${name}" not found in express list.`);
                        return;
                    }

                    // TODO: show user that this is happening

                    // install the plugin
                    // TODO: use proper toasts
                    try {
                        const package_ref = express_data[name];
                        console.log(`Installing plugin from express list: ${name} (${package_ref})`);
                        await install_package(package_ref);
                        alert(`Plugin "${name}" installed successfully!`);
                    } catch (error) {
                        console.error("Failed to install plugin from express list:", error);
                        alert(`Failed to install plugin "${name}". Check the console for details.`);
                    }

                    break;
            }
        },
        [navigate]
    );

    // listen for deep links and handle accordingly
    useEffect(() => {
        const unlisten = onOpenUrl(urls => {
            handle_deep_link(urls[0]);
        });

        return () => {
            // unwrap promise and call the unlisten function
            unlisten.then(call => call());
        };
    }, [handle_deep_link]);

    return (
        <ConditionalWSProvider url={ws_url}>
            <div className="font-dm-sans flex h-screen max-h-screen w-screen max-w-screen bg-base-100 select-none overflow-hidden">
                <LeftNav/>
                <main className="w-full max-w-full h-full max-h-full">
                    <AnimatedRouter
                        routes={routes}

                        not_found={<NotFound/>}

                        animation_props={{
                            initial: {opacity: 0},
                            animate: {opacity: 1},
                            exit: {opacity: 0},
                            transition: {duration: 0.25, ease: "easeInOut"},

                            className: "h-full w-full max-h-full max-w-full overflow-y-auto py-4 px-6",
                        }}
                    />
                </main>

                {/* use a key to force remounting the component when the websocket url changes to reset its internal state */}
                <StatusToast key={`status-${ws_url}`} />
            </div>
        </ConditionalWSProvider>
    );
}

export default App;
