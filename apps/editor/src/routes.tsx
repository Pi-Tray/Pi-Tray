import {GridEditorPage} from "./pages/GridEditorPage.tsx";
import {PluginManagerPage} from "./pages/PluginManagerPage.tsx";
import {AssetManagerPage} from "./pages/AssetManagerPage.tsx";
import {SettingsPage} from "./pages/SettingsPage.tsx";
import {DevicesPage} from "./pages/DevicesPage.tsx";
import {DevToolsPage} from "./pages/DevToolsPage";
import {DevToolsWebsocketPage} from "./pages/DevToolsPage/DevToolsWebsocketPage.tsx";
import {DevToolsPluginsPage} from "./pages/DevToolsPage/DevToolsPluginsPage.tsx";
import {DevToolsLogsLandingPage, DevToolsLogsPage} from "./pages/DevToolsPage/DevToolsLogPages.tsx";
import {DevicePairingPage} from "./pages/DevicePairingPage.tsx";
import {ServerPage} from "./pages/ServerPage.tsx";

export const routes = {
    "/": <GridEditorPage/>,
    "/plugins": <PluginManagerPage/>,
    "/assets": <AssetManagerPage/>,
    "/settings": <SettingsPage/>,
    "/devices": <DevicesPage />,
    "/devices/pair": <DevicePairingPage />,
    "/server": <ServerPage />,
    "/devtools": <DevToolsPage />,
    "/devtools/websocket": <DevToolsWebsocketPage />,
    "/devtools/plugins": <DevToolsPluginsPage />,
    "/devtools/logs": <DevToolsLogsLandingPage />,
    "/devtools/logs/:source": <DevToolsLogsPage />,
};
