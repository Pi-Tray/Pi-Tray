import {GridEditorPage} from "./pages/GridEditorPage.tsx";
import {PluginManagerPage} from "./pages/PluginManagerPage.tsx";
import {AssetManagerPage} from "./pages/AssetManagerPage.tsx";
import {SettingsPage} from "./pages/SettingsPage.tsx";
import {DevicePage} from "./pages/DevicePage.tsx";
import {DevToolsPage} from "./pages/DevToolsPage";
import {DevToolsWebsocketPage} from "./pages/DevToolsPage/DevToolsWebsocketPage.tsx";
import {DevToolsPluginsPage} from "./pages/DevToolsPage/DevToolsPluginsPage.tsx";
import {DevToolsLogsLandingPage, DevToolsLogsPage} from "./pages/DevToolsPage/DevToolsLogPages.tsx";

export const routes = {
    "/": <GridEditorPage/>,
    "/plugins": <PluginManagerPage/>,
    "/assets": <AssetManagerPage/>,
    "/settings": <SettingsPage/>,
    "/device": <DevicePage />,
    "/devtools": <DevToolsPage/>,
    "/devtools/websocket": <DevToolsWebsocketPage/>,
    "/devtools/plugins": <DevToolsPluginsPage />,
    "/devtools/logs": <DevToolsLogsLandingPage/>,
    "/devtools/logs/:source": <DevToolsLogsPage/>,
};
