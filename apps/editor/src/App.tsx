import "./App.css";

import {useEffect, useCallback} from "react";

import {useLocation} from "wouter";

import {WSProvider} from "./contexts/WSProvider";
import {useConfigValue} from "./util/config";

import {AnimatedRouter} from "./components/AnimatedRouter";
import {LeftNav} from "./components/LeftNav";
import {StatusToast} from "./components/StatusToast";

import {routes} from "./routes";
import {NotFound} from "./pages/NotFound";

import {onOpenUrl} from "@tauri-apps/plugin-deep-link";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {AutostartPrompt} from "./components/AutostartPrompt";
import {confirm_and_install} from "./util/install_flow";
import {parse_spec} from "@pi-tray/package-spec";

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
                case "install": {
                    // pi-tray://install?spec=<encoded spec>. links from websites get the same confirmation as installing by hand, and can never install a file from this computer, e.g. one a site has just downloaded
                    const spec = url.searchParams.get("spec");
                    const parsed = spec ? parse_spec(spec) : null;

                    if (!spec || !parsed || !parsed.ok) {
                        alert(`This link doesn't say what to install${parsed && !parsed.ok ? `: ${parsed.error}` : ""}`);
                        break;
                    }

                    if (parsed.source.kind === "file") {
                        alert("Links can't install files from your computer, install it from the plugin manager instead.");
                        break;
                    }

                    // TODO: use proper toasts
                    try {
                        if (await confirm_and_install(spec)) {
                            alert("Package installed.");
                        }
                    } catch (error) {
                        alert(`Couldn't install the package: ${error instanceof Error ? error.message : String(error)}`);
                    }

                    break;
                }
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
            <AutostartPrompt />
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
